"""Admin-only management surface: keys, stats, pipeline cache, queue control, config."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, Request

from ltx_api import cli_bridge
from ltx_api.auth import require_admin
from ltx_api.config import Settings, generate_api_key, hash_api_key
from ltx_api.errors import NotFoundError
from ltx_api.schemas import (
    CreateKeyRequest,
    GPUInfo,
    HealthDetails,
    KeyCreatedResponse,
    KeyResponse,
    MessageResponse,
    PipelineCacheResponse,
    PipelineType,
    PreloadRequest,
    StatsResponse,
)

router = APIRouter(tags=["admin"], dependencies=[Depends(require_admin)])


def _gpu_info() -> list[GPUInfo]:
    try:
        import torch  # noqa: PLC0415

        if not torch.cuda.is_available():
            return [GPUInfo(available=False)]
        infos = []
        for index in range(torch.cuda.device_count()):
            props = torch.cuda.get_device_properties(index)
            free, total = torch.cuda.mem_get_info(index)
            infos.append(
                GPUInfo(
                    available=True,
                    name=props.name,
                    capability=f"{props.major}.{props.minor}",
                    memory_total_mb=total // (1024 * 1024),
                    memory_free_mb=free // (1024 * 1024),
                    memory_used_mb=(total - free) // (1024 * 1024),
                )
            )
        return infos
    except Exception:  # noqa: BLE001 - torch/CUDA may be absent; never break health
        return [GPUInfo(available=False)]


@router.get("/v1/health/details", response_model=HealthDetails, summary="Worker, queue, cache and GPU details")
async def health_details(request: Request) -> HealthDetails:
    manager = request.app.state.jobs
    pipelines = request.app.state.pipelines
    worker = manager.worker_status()
    return HealthDetails(
        status="ok",
        version=request.app.state.version,
        worker=worker,
        queue={"depth": worker["queue_depth"], "paused": manager.paused},
        cache=PipelineCacheResponse(max_entries=pipelines.max_entries, entries=pipelines.list_entries()),
        gpus=_gpu_info(),
    )


# ---------------------------------------------------------------- keys

@router.post("/v1/admin/keys", response_model=KeyCreatedResponse, status_code=201, summary="Issue a new API key")
async def create_key(request: Request, body: CreateKeyRequest) -> KeyCreatedResponse:
    raw = generate_api_key()
    key_id, created_at = request.app.state.store.create_api_key(hash_api_key(raw), body.label, body.role)
    return KeyCreatedResponse(id=key_id, label=body.label, role=body.role, created_at=created_at, key=raw)


@router.get("/v1/admin/keys", response_model=list[KeyResponse], summary="List API keys (hashes never shown)")
async def list_keys(request: Request) -> list[KeyResponse]:
    return [KeyResponse(**row) for row in request.app.state.store.list_api_keys()]


@router.delete("/v1/admin/keys/{key_id}", response_model=MessageResponse, summary="Revoke an API key by row id")
async def revoke_key(request: Request, key_id: int) -> MessageResponse:
    if not request.app.state.store.revoke_api_key_by_id(key_id):
        raise NotFoundError(f"No active API key with id {key_id}")
    return MessageResponse(detail=f"Key {key_id} revoked")


# ---------------------------------------------------------------- stats

@router.get("/v1/admin/stats", response_model=StatsResponse, summary="Job totals, success rates, per-key usage")
async def stats(request: Request) -> StatsResponse:
    data = request.app.state.store.stats()
    return StatsResponse(
        jobs=data,
        per_key=data["per_key"],
        uptime_seconds=request.app.state.jobs.worker_status()["uptime_seconds"],
    )


# ---------------------------------------------------------------- pipeline cache

@router.get("/v1/admin/pipelines", response_model=PipelineCacheResponse, summary="Inspect the warm pipeline cache")
async def list_pipelines(request: Request) -> PipelineCacheResponse:
    pipelines = request.app.state.pipelines
    return PipelineCacheResponse(max_entries=pipelines.max_entries, entries=pipelines.list_entries())


@router.post("/v1/admin/pipelines/preload", response_model=MessageResponse, summary="Warm a pipeline before traffic")
async def preload_pipeline(request: Request, body: PreloadRequest) -> MessageResponse:
    """Parse *params* with the official parser (same as a real submission), then
    construct and cache the pipeline — without running a job."""
    settings: Settings = request.app.state.settings
    defaults = settings.default_distilled if body.pipeline is PipelineType.distilled else settings.default_ti2vid
    data = cli_bridge.validate_paths(cli_bridge.apply_defaults(body.params, defaults), settings)
    parsed = await asyncio.to_thread(cli_bridge.parse_job, body.pipeline, data, str(settings.output_dir / "preload.mp4"))
    request.app.state.pipelines.preload(
        parsed.cache_key, lambda: cli_bridge.CONSTRUCTORS[body.pipeline](parsed.args), body.pipeline
    )
    return MessageResponse(detail=f"Pipeline for {body.pipeline.value} is warm (cache key {parsed.cache_key[:12]})")


@router.delete("/v1/admin/pipelines/{key}", response_model=MessageResponse, summary="Evict one cached pipeline (frees VRAM)")
async def evict_pipeline(request: Request, key: str) -> MessageResponse:
    if not request.app.state.pipelines.evict(key):
        raise NotFoundError(f"No cached pipeline with key {key}")
    return MessageResponse(detail="Pipeline evicted and VRAM released")


@router.delete("/v1/admin/pipelines", response_model=MessageResponse, summary="Evict every cached pipeline")
async def evict_all_pipelines(request: Request) -> MessageResponse:
    count = request.app.state.pipelines.evict_all()
    return MessageResponse(detail=f"Evicted {count} pipeline(s)")


# ---------------------------------------------------------------- queue control

@router.post("/v1/admin/queue/pause", response_model=MessageResponse, summary="Stop dispatching queued jobs")
async def pause_queue(request: Request) -> MessageResponse:
    request.app.state.jobs.pause()
    return MessageResponse(detail="Queue paused — queued jobs will not start until resumed")


@router.post("/v1/admin/queue/resume", response_model=MessageResponse, summary="Resume dispatching queued jobs")
async def resume_queue(request: Request) -> MessageResponse:
    request.app.state.jobs.resume()
    return MessageResponse(detail="Queue resumed")


@router.post("/v1/admin/queue/purge", response_model=MessageResponse, summary="Cancel every queued job")
async def purge_queue(request: Request) -> MessageResponse:
    purged = request.app.state.jobs.purge()
    return MessageResponse(detail=f"Purged {purged} queued job(s)")


# ---------------------------------------------------------------- config

@router.get("/v1/admin/config", summary="Effective server configuration (secrets redacted)")
async def effective_config(request: Request) -> dict:
    settings: Settings = request.app.state.settings
    data = settings.model_dump(mode="json")
    for secret in ("admin_key", "initial_api_keys"):
        if data.get(secret):
            data[secret] = "***redacted***"
    data["allowed_roots_effective"] = [str(p) for p in settings.effective_allowed_roots()]
    return data
