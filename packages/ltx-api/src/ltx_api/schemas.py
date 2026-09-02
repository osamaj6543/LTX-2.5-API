"""Pydantic request/response schemas.

Field names mirror the official pipeline CLI flags 1:1 (kebab-case aliases such as
``checkpoint-path``) so every flag of ``python -m ltx_pipelines.distilled`` and
``python -m ltx_pipelines.ti2vid_two_stages`` maps to a JSON field with identical
semantics. Omitted fields are *not* defaulted here — they fall through to the
official argparse parser defaults, exactly like the CLI.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, field_validator


class QuantizationOption(str, Enum):
    fp8_cast = "fp8-cast"
    fp8_scaled_mm = "fp8-scaled-mm"
    nvfp4_cast = "nvfp4-cast"
    nvfp4_prequant = "nvfp4-prequant"


class OffloadOption(str, Enum):
    none = "none"
    cpu = "cpu"
    disk = "disk"


class DiffVAEOptimization(str, Enum):
    chunked_eager = "chunked_eager"
    chunked_compile = "chunked_compile"
    combined_compile = "combined_compile"
    blackwell_dsl = "blackwell_dsl"


class HDROption(str, Enum):
    srgb_linear = "SRGB_LINEAR"
    acescg = "ACESCG"
    acescct = "ACESCCT"


class PipelineType(str, Enum):
    distilled = "distilled"
    ti2vid = "ti2vid"


class JobStatus(str, Enum):
    queued = "queued"
    parsing = "parsing"
    loading_model = "loading_model"
    running = "running"
    encoding = "encoding"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


TERMINAL_STATUSES = frozenset({JobStatus.completed, JobStatus.failed, JobStatus.cancelled})


class Role(str, Enum):
    admin = "admin"
    user = "user"


class ProjectStatus(str, Enum):
    active = "active"
    archived = "archived"


# Presentation palette for project covers (frontend maps tokens to gradients).
PROJECT_COLORS = frozenset({"violet", "blue", "cyan", "emerald", "amber", "rose", "fuchsia", "slate"})


def _validate_project_color(value: str | None) -> str | None:
    if value is not None and value not in PROJECT_COLORS:
        raise ValueError(f"color must be one of: {', '.join(sorted(PROJECT_COLORS))}")
    return value


class LoraSpec(BaseModel):
    """One ``--lora PATH [STRENGTH]`` / ``--distilled-lora PATH [STRENGTH]`` occurrence."""

    path: str = Field(description="Path to the LoRA safetensors file.")
    strength: float | None = Field(default=None, description="LoRA strength. Omit to use the CLI default.")


class ImageConditioning(BaseModel):
    """One ``--image PATH FRAME_IDX STRENGTH [CRF]`` occurrence."""

    path: str = Field(description="Still image file (PNG/JPEG for SDR, .exr for HDR).")
    frame_idx: int = Field(ge=0, description="Target frame index the image conditions.")
    strength: float = Field(ge=0.0, le=1.0, description="Conditioning strength.")
    crf: int | None = Field(
        default=None, ge=0, le=51,
        description="H.264 CRF re-compression for SDR stills (0 = lossless). Omit for the model default.",
    )


class AutoDuration(BaseModel):
    """``--auto-duration MIN_SECONDS MAX_SECONDS``."""

    min_seconds: float = Field(gt=0)
    max_seconds: float = Field(gt=0)



class GenerationRequest(BaseModel):
    """Fields common to both pipelines; subclasses add pipeline-specific ones.

    Every field corresponds to a CLI flag of the same name. Anything left ``None``
    is not passed, so the official parser applies its own default.
    """

    model_config = ConfigDict(populate_by_name=True)

    prompt: str = Field(min_length=1, description="Text prompt (CLI: --prompt).")
    spatial_upsampler_path: str | None = Field(
        default=None,
        alias="spatial-upsampler-path",
        description="Spatial upsampler model (CLI: --spatial-upsampler-path). May also be pinned by the operator via LTX_API defaults.",
    )

    # Model paths — monolith XOR split layout, exactly like the CLI
    checkpoint_path: str | None = Field(default=None, alias="checkpoint-path")
    distilled_checkpoint_path: str | None = Field(default=None, alias="distilled-checkpoint-path")
    gemma_root: str | None = Field(default=None, alias="gemma-root")
    transformer_path: str | None = Field(default=None, alias="transformer-path")
    text_encoder_path: str | None = Field(default=None, alias="text-encoder-path")
    video_vae_path: str | None = Field(default=None, alias="video-vae-path")
    audio_vae_path: str | None = Field(default=None, alias="audio-vae-path")
    duration_head_path: str | None = Field(default=None, alias="duration-head-path")

    # Generation shape. All optional: the CLI defaults (auto-detected from the
    # checkpoint) apply when omitted.
    seed: int | None = Field(default=None, ge=0)
    height: int | None = Field(default=None, ge=64)
    width: int | None = Field(default=None, ge=64)
    num_frames: int | None = Field(default=None, alias="num-frames", ge=9)
    auto_duration: AutoDuration | None = Field(default=None, alias="auto-duration")
    frame_rate: float | None = Field(default=None, alias="frame-rate", gt=0)

    # Conditioning
    images: list[ImageConditioning] | None = Field(default=None, alias="image")
    num_generated_keyframes: int | None = Field(default=None, alias="num-generated-keyframes", ge=0)
    hdr: HDROption | None = None

    # Adapters / enhancement
    lora: list[LoraSpec] | None = None
    enhance_prompt: bool | None = Field(default=None, alias="enhance-prompt")
    enhance_static_cache: bool | None = Field(default=None, alias="enhance-static-cache")
    prompt_enhancer_gemma_root: str | None = Field(default=None, alias="prompt-enhancer-gemma-root")

    # Performance / loading
    quantization: QuantizationOption | None = None
    compile: list[str] | None = Field(
        default=None,
        description='torch.compile overrides, e.g. ["mode=reduce-overhead"]. Empty list = "--compile" with defaults.',
    )
    offload: OffloadOption | None = None
    diffvae_optimization: DiffVAEOptimization | None = Field(default=None, alias="diffvae-optimization")

    # Web-app project tagging — NOT a CLI flag; stripped before argv parsing.
    project_id: str | None = Field(
        default=None,
        description="Optional project to file this generation under (web app only; not a CLI flag).",
    )


class DistilledGenerationRequest(GenerationRequest):
    """``python -m ltx_pipelines.distilled`` — two-stage distilled pipeline.

    Uses ``distilled-checkpoint-path`` (monolith) or split paths, like the CLI.
    """


class TI2VidGenerationRequest(GenerationRequest):
    """``python -m ltx_pipelines.ti2vid_two_stages`` — guided two-stage pipeline."""

    distilled_lora: list[LoraSpec] | None = Field(
        default=None,
        alias="distilled-lora",
        description="Distilled LoRA(s) for stage-2 refinement (CLI: --distilled-lora).",
    )
    num_inference_steps: int | None = Field(default=None, alias="num-inference-steps", ge=1)
    negative_prompt: str | None = Field(default=None, alias="negative-prompt")
    video_cfg_guidance_scale: float | None = Field(default=None, alias="video-cfg-guidance-scale")
    video_stg_guidance_scale: float | None = Field(default=None, alias="video-stg-guidance-scale")
    video_rescale_scale: float | None = Field(default=None, alias="video-rescale-scale")
    video_stg_blocks: list[int] | None = Field(default=None, alias="video-stg-blocks")
    a2v_guidance_scale: float | None = Field(default=None, alias="a2v-guidance-scale")
    video_skip_step: int | None = Field(default=None, alias="video-skip-step", ge=0)
    audio_cfg_guidance_scale: float | None = Field(default=None, alias="audio-cfg-guidance-scale")
    audio_stg_guidance_scale: float | None = Field(default=None, alias="audio-stg-guidance-scale")
    audio_rescale_scale: float | None = Field(default=None, alias="audio-rescale-scale")
    audio_stg_blocks: list[int] | None = Field(default=None, alias="audio-stg-blocks")
    v2a_guidance_scale: float | None = Field(default=None, alias="v2a-guidance-scale")
    audio_skip_step: int | None = Field(default=None, alias="audio-skip-step", ge=0)
    max_batch_size: int | None = Field(default=None, alias="max-batch-size", ge=1)


class JobSubmitResponse(BaseModel):
    job_id: str
    status: JobStatus
    pipeline: PipelineType
    queue_position: int
    links: dict[str, str]


class JobResponse(BaseModel):
    job_id: str
    pipeline: PipelineType
    status: JobStatus
    detail: str | None = None
    queue_position: int | None = None
    params: dict | None = None
    output_file: str | None = None
    download_url: str | None = None
    error: str | None = None
    project_id: str | None = None
    created_at: str
    started_at: str | None = None
    finished_at: str | None = None
    duration_seconds: float | None = None
    owner: str | None = None


class JobListResponse(BaseModel):
    jobs: list[JobResponse]
    total: int
    limit: int
    offset: int


class MessageResponse(BaseModel):
    detail: str


class ErrorResponse(BaseModel):
    detail: str
    request_id: str | None = None
    argv: list[str] | None = None


class UploadResponse(BaseModel):
    path: str = Field(description="Server-side path usable in --image / conditioning arguments.")
    filename: str
    size_bytes: int


class CreateKeyRequest(BaseModel):
    role: Role = Role.user
    label: str | None = Field(default=None, max_length=128)


class KeyResponse(BaseModel):
    id: int
    label: str | None
    role: Role
    created_at: str
    last_used_at: str | None = None
    revoked_at: str | None = None


class KeyCreatedResponse(KeyResponse):
    key: str = Field(description="The raw API key. Shown exactly once — store it securely.")


class PreloadRequest(BaseModel):
    pipeline: PipelineType
    params: dict = Field(description="Same body as the corresponding /v1/generations/* request.")


class PipelineCacheEntry(BaseModel):
    key: str
    pipeline: PipelineType
    loaded_at: str | None = None
    last_used_at: str | None = None
    jobs_run: int = 0


class PipelineCacheResponse(BaseModel):
    max_entries: int
    entries: list[PipelineCacheEntry]


class GPUInfo(BaseModel):
    available: bool
    name: str | None = None
    capability: str | None = None
    memory_total_mb: int | None = None
    memory_used_mb: int | None = None
    memory_free_mb: int | None = None
    utilization_percent: int | None = None


class HealthDetails(BaseModel):
    status: str
    version: str
    worker: dict
    queue: dict
    cache: PipelineCacheResponse
    gpus: list[GPUInfo]


class StatsResponse(BaseModel):
    jobs: dict
    per_key: list[dict]
    uptime_seconds: float


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120, description="Display name of the project.")
    description: str | None = Field(default=None, max_length=2000)
    color: str = Field(default="violet", max_length=32, description=f"Cover color token. One of: {', '.join(sorted(PROJECT_COLORS))}.")

    @field_validator("color")
    @classmethod
    def _check_color(cls, value: str) -> str:
        return _validate_project_color(value)  # type: ignore[return-value]


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    color: str | None = Field(default=None, max_length=32)
    status: ProjectStatus | None = None
    pinned: bool | None = Field(default=None, description="Pinned projects sort first in listings.")

    @field_validator("color")
    @classmethod
    def _check_color(cls, value: str | None) -> str | None:
        return _validate_project_color(value)


class ProjectResponse(BaseModel):
    project_id: str
    name: str
    description: str | None = None
    color: str
    status: ProjectStatus
    pinned: bool
    owner: str | None = None
    job_count: int = 0
    completed_count: int = 0
    failed_count: int = 0
    total_render_seconds: float = 0
    last_activity_at: str | None = None
    created_at: str
    updated_at: str


class ProjectListResponse(BaseModel):
    projects: list[ProjectResponse]
    total: int
    limit: int
    offset: int


class JobUpdateRequest(BaseModel):
    """Partial job update — currently used to move a job between projects."""

    project_id: str | None = Field(
        default=None,
        description="Target project id, or null to detach the job from any project.",
    )

