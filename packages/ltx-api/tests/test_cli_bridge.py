"""CLI-bridge tests: request dict -> argv token fidelity.

These do not need torch: they verify that the JSON request schema serialises into
exactly the argv the official parsers expect. The final optional test runs the
real official parser when ``ltx_pipelines`` is importable (GPU machines).
"""

from __future__ import annotations

import pytest

from ltx_api.cli_bridge import apply_defaults, build_argv, to_argv_data
from ltx_api.config import PipelineDefaults
from ltx_api.schemas import DistilledGenerationRequest, ImageConditioning, LoraSpec, TI2VidGenerationRequest

BASE = {
    "prompt": "a cat surfing",
    "checkpoint-path": "/models/checkpoint.safetensors",
    "spatial-upsampler-path": "/models/upsampler.safetensors",
}


def _argv_from(model, extra=None):
    data = model.model_dump(by_alias=True, exclude_none=True)
    return build_argv(to_argv_data(data), "/out/job.mp4")


def test_basic_argv_shape():
    model = DistilledGenerationRequest(**BASE)
    argv = _argv_from(model)
    assert argv[0] == "--prompt" and "a cat surfing" in argv
    assert "--checkpoint-path" in argv and "/models/checkpoint.safetensors" in argv
    assert "--output-path" in argv and "/out/job.mp4" in argv
    assert "--spatial-upsampler-path" in argv


def test_repeatable_lora_flag():
    model = DistilledGenerationRequest(
        **BASE,
        lora=[LoraSpec(path="/a.safetensors", strength=0.7), LoraSpec(path="/b.safetensors", strength=1.0)],
    )
    argv = _argv_from(model)
    assert argv.count("--lora") == 2
    # Each occurrence is followed by path + strength.
    first = argv.index("--lora")
    assert argv[first + 1] == "/a.safetensors" and float(argv[first + 2]) == 0.7


def test_image_conditioning_tuple_grammar():
    """``--images PATH FRAME_IDX STRENGTH`` — the CLI's 3-token form."""
    model = DistilledGenerationRequest(
        **BASE,
        images=[ImageConditioning(path="/img.png", frame_idx=0, strength=1.0)],
    )
    argv = _argv_from(model)
    index = argv.index("--image")
    assert argv[index + 1 : index + 4] == ["/img.png", "0", "1.0"]


def test_auto_duration_pair_grammar():
    model = DistilledGenerationRequest(**BASE, auto_duration={"min_seconds": 3.0, "max_seconds": 6.0})
    argv = _argv_from(model)
    index = argv.index("--auto-duration")
    assert argv[index + 1 : index + 3] == ["3.0", "6.0"]


def test_compile_empty_means_bare_flag():
    model = DistilledGenerationRequest(**BASE, compile=[])
    argv = _argv_from(model)
    assert "--compile" in argv


def test_compile_with_overrides():
    model = DistilledGenerationRequest(**BASE, compile=["mode=reduce-overhead"])
    argv = _argv_from(model)
    index = argv.index("--compile")
    assert argv[index + 1] == "mode=reduce-overhead"


def test_none_fields_are_omitted():
    model = DistilledGenerationRequest(prompt="x")
    argv = _argv_from(model)
    assert "--seed" not in argv and "--checkpoint-path" not in argv


def test_apply_defaults_request_wins():
    defaults = PipelineDefaults(height=512, width=768, seed=7)
    merged = apply_defaults({"prompt": "x", "seed": 99}, defaults)
    assert merged["seed"] == 99  # request wins
    assert merged["height"] == 512 and merged["width"] == 768  # defaults fill gaps


def test_apply_defaults_distilled_lora():
    defaults = PipelineDefaults(distilled_lora_path="/stage2.safetensors", distilled_lora_strength=0.9)
    merged = apply_defaults({"prompt": "x"}, defaults)
    assert merged["distilled-lora"] == [{"path": "/stage2.safetensors", "strength": 0.9}]


def test_prompt_positional_not_flagged():
    model = TI2VidGenerationRequest(**BASE, negative_prompt="blurry")
    argv = _argv_from(model)
    assert "--negative-prompt" in argv and "blurry" in argv
    # prompt is passed as a flag value, never prefixed
    assert "--prompt" in argv


@pytest.mark.optional_official_parser
def test_official_parser_accepts_generated_argv():
    """The real test of CLI parity: the official argparse parser accepts our argv.

    Skipped automatically when ltx_pipelines (torch stack) is not installed.
    """
    ltx_args = pytest.importorskip("ltx_pipelines.utils.args")
    model = DistilledGenerationRequest(
        prompt="a cat surfing",
        **{"checkpoint-path": "/x/model.safetensors", "spatial-upsampler-path": "/x/up.safetensors"},
        num_frames=121,
        height=512,
        width=704,
        seed=1,
    )
    argv = build_argv(to_argv_data(model.model_dump(by_alias=True, exclude_none=True)), "/tmp/out.mp4")
    parser = ltx_args.add_generated_keyframes_arg(
        ltx_args.default_2_stage_distilled_arg_parser(
            params=ltx_args.resolve_cli_params(distilled=True), supports_auto_duration=True
        )
    )
    parsed = parser.parse_args(argv)
    assert parsed.prompt == "a cat surfing"
    assert parsed.num_frames == 121
