"""CLI bridge: JSON request -> argv -> official parser -> pipeline run.

This module is what makes the API behave *identically* to the command line.
A request is serialised into the exact argv tokens a CLI user would type, then
parsed by the *same* argparse parsers used by ``ltx_pipelines.distilled.main``
and ``ltx_pipelines.ti2vid_two_stages.main``, and finally executed with the same
constructor / ``__call__`` / ``encode_video`` sequence as those ``main()``
functions. Validation, defaults and error messages therefore match the CLI.

``execute`` must be called with the job worker's lock held: it temporarily stages
``sys.argv`` (``resolve_cli_params`` sniffs it for the checkpoint path) and
installs a temporary root-logging handler to capture per-job logs.
"""

from __future__ import annotations

import argparse
import contextlib
import io
import logging
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ltx_api.config import PipelineDefaults, Settings
from ltx_api.errors import CLIValidationError, PathNotAllowedError
from ltx_api.schemas import PipelineType

logger = logging.getLogger("ltx_api.worker")


def apply_defaults(data: dict[str, Any], defaults: PipelineDefaults) -> dict[str, Any]:
    """Merge operator-pinned defaults *under* the request (request always wins)."""
    merged = dict(data)
    for field, value in defaults.model_dump().items():
        if value is None:
            continue
        key = field.replace("_", "-")
        if key in ("distilled-lora-path", "distilled-lora-strength"):
            if not merged.get("distilled-lora") and key == "distilled-lora-path":
                merged["distilled-lora"] = [{"path": value, "strength": defaults.distilled_lora_strength}]
            continue
        if key not in merged or merged[key] is None:
            merged[key] = value
    return merged



def to_argv_data(data: dict[str, Any]) -> dict[str, Any]:
    """Convert an unprefixed, alias-keyed request dict into the ``--flag``-keyed
    form ``build_argv`` consumes.

    The router layer dumps the request with ``by_alias=True, exclude_none=True``
    (keys like ``checkpoint-path``), which is also the form ``validate_paths`` and
    ``cache_key_for`` use. This adapter adds the ``--`` prefix for every field
    except ``prompt``.
    """
    return {("--" + key if key != "prompt" else key): value for key, value in data.items()}


def build_argv(data: dict[str, Any], output_path: str) -> list[str]:
    """Serialise a request dict into CLI argv tokens.

    Only keys with non-None values are emitted, so omitted options inherit the
    official parser defaults. Repeatable flags (``--lora``, ``--distilled-lora``,
    ``--image``) and tuple flags (``--auto-duration``, ``--compile``) follow the
    exact CLI grammar.
    """
    argv: list[str] = []

    def flag(name: str, value: Any) -> None:
        argv.extend([name, str(value)])

    def opt(name: str) -> None:
        value = data.get(name)
        if value is not None:
            flag(name, value.value if hasattr(value, "value") else value)

    # Required
    flag("--prompt", data["prompt"])
    flag("--output-path", output_path)
    opt("--spatial-upsampler-path")

    # Model paths
    for name in (
        "--checkpoint-path", "--distilled-checkpoint-path", "--gemma-root",
        "--transformer-path", "--text-encoder-path", "--video-vae-path",
        "--audio-vae-path", "--duration-head-path",
    ):
        opt(name)

    # Scalars
    for name in (
        "--seed", "--height", "--width", "--num-frames", "--frame-rate",
        "--num-inference-steps", "--num-generated-keyframes", "--max-batch-size",
        "--video-cfg-guidance-scale", "--video-stg-guidance-scale", "--video-rescale-scale",
        "--a2v-guidance-scale", "--video-skip-step",
        "--audio-cfg-guidance-scale", "--audio-stg-guidance-scale", "--audio-rescale-scale",
        "--v2a-guidance-scale", "--audio-skip-step",
    ):
        opt(name)

    opt("--negative-prompt")
    opt("--hdr")
    opt("--quantization")
    opt("--offload")
    opt("--diffvae-optimization")
    opt("--prompt-enhancer-gemma-root")

    if data.get("--auto-duration") is not None:
        ad = data["--auto-duration"]
        flag("--auto-duration", ad["min_seconds"])
        argv.append(str(ad["max_seconds"]))

    # Boolean store_true flags: only emitted when truthy (absent = CLI default False)
    for name in ("--enhance-prompt", "--enhance-static-cache"):
        if data.get(name):
            argv.append(name)

    # Repeatable loras
    for name in ("--lora", "--distilled-lora"):
        for spec in data.get(name) or []:
            argv.append(name)
            argv.append(str(spec["path"]))
            if spec.get("strength") is not None:
                argv.append(str(spec["strength"]))

    # Repeatable image conditioning
    for img in data.get("--image") or []:
        argv.append("--image")
        argv.append(str(img["path"]))
        argv.append(str(img["frame_idx"]))
        argv.append(str(img["strength"]))
        if img.get("crf") is not None:
            argv.append(str(img["crf"]))

    # STG block lists: --video-stg-blocks 0 1 2
    for name in ("--video-stg-blocks", "--audio-stg-blocks"):
        blocks = data.get(name)
        if blocks is not None:
            argv.append(name)
            argv.extend(str(b) for b in blocks)

    # torch.compile: None = off, [] = bare --compile, [...] = KEY=VALUE overrides
    compile_overrides = data.get("--compile")
    if compile_overrides is not None:
        argv.append("--compile")
        argv.extend(str(item) for item in compile_overrides)



    return argv


_PATH_FIELDS = (
    "checkpoint-path", "distilled-checkpoint-path", "gemma-root",
    "transformer-path", "text-encoder-path", "video-vae-path",
    "audio-vae-path", "duration-head-path", "spatial-upsampler-path",
    "prompt-enhancer-gemma-root",
)


def validate_paths(data: dict[str, Any], settings: Settings) -> dict[str, Any]:
    """Resolve and allowlist-check every file path referenced by the request.

    Runs at submission time (not in the worker) so bad paths fail fast with 422.
    A no-op when ``settings.allowed_roots`` is empty (checks disabled).
    """
    if not settings.allowed_roots:
        return data
    checked = dict(data)
    for field in _PATH_FIELDS:
        value = checked.get(field)
        if value is None:
            continue
        try:
            checked[field] = settings.validate_path(str(value), what=f"--{field}")
        except ValueError as exc:
            raise PathNotAllowedError(str(exc)) from exc
    for field in ("lora", "distilled-lora"):
        for spec in checked.get(field) or []:
            try:
                spec["path"] = settings.validate_path(str(spec["path"]), what=f"--{field}")
            except ValueError as exc:
                raise PathNotAllowedError(str(exc)) from exc
    for img in checked.get("image") or []:
        try:
            img["path"] = settings.validate_path(str(img["path"]), what="--image")
        except ValueError as exc:
            raise PathNotAllowedError(str(exc)) from exc
    return checked


def cache_key_for(ptype: PipelineType, data: dict[str, Any]) -> str:
    """Stable fingerprint of everything that affects pipeline *construction*.

    Two jobs with the same cache key share one warm pipeline instance.
    """
    import hashlib
    import json as _json

    fields = {k: data.get(k) for k in (
        *_PATH_FIELDS, "lora", "distilled-lora", "quantization",
        "compile", "offload", "diffvae-optimization",
    )}
    return hashlib.sha256(_json.dumps([ptype.value, fields], sort_keys=True, default=str).encode()).hexdigest()


@dataclass
class ParsedJob:
    """A job that survived the official CLI parser, ready for the pipeline."""

    ptype: PipelineType
    args: argparse.Namespace
    cache_key: str
    argv: list[str]


@contextlib.contextmanager
def _staged_sys_argv(argv: list[str]):
    """Temporarily point ``sys.argv`` at the job's argv.

    ``resolve_cli_params`` / ``detect_checkpoint_path`` pre-parse ``sys.argv`` to
    locate the checkpoint for version-dependent defaults, so the API stages it
    exactly as if the process had been launched with these arguments.
    """
    original = sys.argv
    sys.argv = ["ltx_pipelines.job", *argv]
    try:
        yield
    finally:
        sys.argv = original


def build_parser(ptype: PipelineType, distilled: bool) -> argparse.ArgumentParser:
    """Build exactly the parser the pipeline's ``main()`` builds."""
    from ltx_pipelines.utils.args import (  # noqa: PLC0415 - heavy import, worker-only
        add_generated_keyframes_arg,
        default_2_stage_arg_parser,
        default_2_stage_distilled_arg_parser,
        resolve_cli_params,
    )

    params = resolve_cli_params(distilled=distilled)
    if ptype is PipelineType.distilled:
        return add_generated_keyframes_arg(
            default_2_stage_distilled_arg_parser(params=params, supports_auto_duration=True)
        )
    return add_generated_keyframes_arg(default_2_stage_arg_parser(params=params, supports_auto_duration=True))



def parse_job(ptype: PipelineType, data: dict[str, Any], output_path: str) -> ParsedJob:
    """Build the job argv and parse it with the official CLI parser.

    Raises :class:`CLIValidationError` (HTTP 422) with the exact CLI message when
    argparse rejects the request.
    """
    argv = build_argv(to_argv_data(data), output_path)
    cache_key = cache_key_for(ptype, data)
    try:
        with _staged_sys_argv(argv):
            parser = build_parser(ptype, distilled=ptype is PipelineType.distilled)
            args = parser.parse_args(argv)
    except SystemExit as exc:
        raise CLIValidationError(
            f"Invalid parameters (exit {exc.code}). This matches the CLI error for the same flags.", argv=argv
        ) from exc
    except argparse.ArgumentError as exc:
        raise CLIValidationError(str(exc), argv=argv) from exc
    return ParsedJob(ptype=ptype, args=args, cache_key=cache_key, argv=argv)


class _JobLogCapture:
    """Attach a temporary handler to the root logger for the duration of a job.

    The pipelines use module-level ``logging`` after ``main()``-style
    ``basicConfig``; capturing at the root gathers every pipeline record for this
    job without interfering with the server's own loggers.
    """

    def __init__(self) -> None:
        self._buffer = io.StringIO()
        self._handler = logging.StreamHandler(self._buffer)
        self._handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))

    def __enter__(self) -> _JobLogCapture:
        logging.getLogger().addHandler(self._handler)
        return self

    def __exit__(self, *exc_info: object) -> None:
        logging.getLogger().removeHandler(self._handler)

    def getvalue(self) -> str:
        return self._buffer.getvalue()


def _hdr_and_dtype(images: Any, hdr_arg: Any) -> tuple[Any, Any]:
    import torch  # noqa: PLC0415

    from ltx_pipelines.utils.media_io import resolve_hdr_color_space, vae_dtype_for_hdr  # noqa: PLC0415

    hdr = resolve_hdr_color_space(images=images, hdr=hdr_arg)
    return hdr, vae_dtype_for_hdr(hdr, torch.bfloat16)


def _encode(result: Any, frame_rate: float, hdr: Any, output_path: str) -> None:
    from ltx_core.model.video_vae import get_video_chunks_number  # noqa: PLC0415
    from ltx_pipelines.utils.media_io import encode_video  # noqa: PLC0415

    encode_video(
        video=result.video,
        fps=frame_rate,
        audio=result.audio,
        output_path=output_path,
        video_chunks_number=get_video_chunks_number(result.num_frames, result.tiling_config),
        color_space=hdr,
    )



def _construct_distilled(args: argparse.Namespace) -> Any:
    """Mirror ``ltx_pipelines.distilled.main`` construction exactly."""
    from ltx_pipelines.distilled import DistilledPipeline  # noqa: PLC0415

    return DistilledPipeline(
        model_paths=args.model_paths,
        spatial_upsampler_path=args.spatial_upsampler_path,
        loras=tuple(args.lora) if args.lora else (),
        quantization=args.quantization,
        compilation_config=args.compile,
        offload_mode=args.offload_mode,
        prompt_enhancer_gemma_root=args.prompt_enhancer_gemma_root,
        diffvae_optimization=args.diffvae_optimization,
    )


def _construct_ti2vid(args: argparse.Namespace) -> Any:
    """Mirror ``ltx_pipelines.ti2vid_two_stages.main`` construction exactly."""
    from ltx_pipelines.ti2vid_two_stages import TI2VidTwoStagesPipeline  # noqa: PLC0415

    return TI2VidTwoStagesPipeline(
        model_paths=args.model_paths,
        distilled_lora=args.distilled_lora,
        spatial_upsampler_path=args.spatial_upsampler_path,
        loras=tuple(args.lora) if args.lora else (),
        quantization=args.quantization,
        compilation_config=args.compile,
        offload_mode=args.offload_mode,
        prompt_enhancer_gemma_root=args.prompt_enhancer_gemma_root,
        diffvae_optimization=args.diffvae_optimization,
    )


def _run_distilled(pipeline: Any, args: argparse.Namespace) -> Any:
    """Mirror the ``pipeline(...)`` call of ``ltx_pipelines.distilled.main``."""
    from ltx_core.model.video_vae import AUTO_TILING  # noqa: PLC0415

    hdr, vae_dtype = _hdr_and_dtype(args.images, args.hdr)
    result = pipeline(
        prompt=args.prompt,
        seed=args.seed,
        height=args.height,
        width=args.width,
        num_frames=args.num_frames,
        frame_rate=args.frame_rate,
        images=args.images,
        vae_dtype=vae_dtype,
        color_space=hdr,
        enhance_prompt=args.enhance_prompt,
        enhance_static_cache=args.enhance_static_cache,
        tiling_config=AUTO_TILING,
        generated_keyframes=args.num_generated_keyframes,
    )
    return result, hdr


def _run_ti2vid(pipeline: Any, args: argparse.Namespace) -> Any:
    """Mirror the ``pipeline(...)`` call of ``ltx_pipelines.ti2vid_two_stages.main``."""
    from ltx_core.components.guiders import MultiModalGuiderParams  # noqa: PLC0415
    from ltx_core.model.video_vae import AUTO_TILING  # noqa: PLC0415

    hdr, vae_dtype = _hdr_and_dtype(args.images, args.hdr)
    result = pipeline(
        prompt=args.prompt,
        negative_prompt=args.negative_prompt,
        seed=args.seed,
        height=args.height,
        width=args.width,
        num_frames=args.num_frames,
        frame_rate=args.frame_rate,
        num_inference_steps=args.num_inference_steps,
        video_guider_params=MultiModalGuiderParams(
            cfg_scale=args.video_cfg_guidance_scale,
            stg_scale=args.video_stg_guidance_scale,
            rescale_scale=args.video_rescale_scale,
            modality_scale=args.a2v_guidance_scale,
            skip_step=args.video_skip_step,
            stg_blocks=args.video_stg_blocks,
        ),
        audio_guider_params=MultiModalGuiderParams(
            cfg_scale=args.audio_cfg_guidance_scale,
            stg_scale=args.audio_stg_guidance_scale,
            rescale_scale=args.audio_rescale_scale,
            modality_scale=args.v2a_guidance_scale,
            skip_step=args.audio_skip_step,
            stg_blocks=args.audio_stg_blocks,
        ),
        images=args.images,
        vae_dtype=vae_dtype,
        color_space=hdr,
        enhance_prompt=args.enhance_prompt,
        enhance_static_cache=args.enhance_static_cache,
        max_batch_size=args.max_batch_size,
        tiling_config=AUTO_TILING,
        generated_keyframes=args.num_generated_keyframes,
    )
    return result, hdr


CONSTRUCTORS = {
    PipelineType.distilled: _construct_distilled,
    PipelineType.ti2vid: _construct_ti2vid,
}
RUNNERS = {
    PipelineType.distilled: _run_distilled,
    PipelineType.ti2vid: _run_ti2vid,
}


def execute(parsed: ParsedJob, pipeline: Any, output_path: str) -> str:
    """Run a parsed job on a warm (or freshly constructed) pipeline.

    Returns the captured pipeline log for the job. Any exception propagates to
    the caller (the job worker) which records it on the job.
    """
    import torch  # noqa: PLC0415

    runner = RUNNERS[parsed.ptype]
    with _JobLogCapture() as capture, torch.inference_mode():
        result, hdr = runner(pipeline, parsed.args)
        _encode(result, parsed.args.frame_rate, hdr, output_path)
    return capture.getvalue()
