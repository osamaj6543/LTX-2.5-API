"""Generation endpoints: submit distilled / ti2vid jobs and upload conditioning images.

Submission mirrors the CLI exactly: the JSON body is dumped with CLI-flag aliases,
operator defaults are merged underneath, file paths are allowlist-checked, and the
resulting dict is what the worker feeds through the *official* argparse parsers.
"""

from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, Request, UploadFile

from ltx_api.auth import Principal, authorize_project
from ltx_api.cli_bridge import apply_defaults, validate_paths
from ltx_api.config import Settings
from ltx_api.errors import ConflictError, NotFoundError, PathNotAllowedError, PayloadTooLargeError
from ltx_api.schemas import (
    DistilledGenerationRequest,
    JobSubmitResponse,
    PipelineType,
    TI2VidGenerationRequest,
    UploadResponse,
)

router = APIRouter(tags=["generations"])

_ALLOWED_UPLOAD_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".exr"}


def _prepare(ptype: PipelineType, request: Request, body: dict) -> dict:
    settings: Settings = request.app.state.settings
    defaults = settings.default_distilled if ptype is PipelineType.distilled else settings.default_ti2vid
    merged = apply_defaults(body, defaults)
    prepared = validate_paths(merged, settings)
    # Web-only field: never reaches the CLI argv parsers (validated separately).
    prepared.pop("project_id", None)
    return prepared


def _resolve_project(request: Request, project_id: str | None, principal: Principal) -> str | None:
    """Validate an optional project tag: must exist, be owned by the caller and be active."""
    if project_id is None:
        return None
    store = request.app.state.store
    project = store.get_project(project_id)
    if project is None:
        raise NotFoundError(f"Unknown project '{project_id}'")
    authorize_project(project, principal)
    if project.get("status") == "archived":
        raise ConflictError(f"Project '{project['name']}' is archived — restore it before generating into it.")
    return project_id


def _submit(request: Request, ptype: PipelineType, data: dict, principal: Principal) -> JobSubmitResponse:
    manager = request.app.state.jobs
    job_id = manager.submit(ptype, data, owner=(principal[0], principal[2]), project_id=data.get("project_id"))
    return JobSubmitResponse(
        job_id=job_id,
        status="queued",
        pipeline=ptype,
        queue_position=manager.queue_position(job_id),
        links={
            "self": f"/v1/jobs/{job_id}",
            "download": f"/v1/jobs/{job_id}/video",
            "logs": f"/v1/jobs/{job_id}/logs",
            "events": f"/v1/jobs/{job_id}/events",
        },
    )


@router.post(
    "/v1/generations/distilled",
    response_model=JobSubmitResponse,
    status_code=202,
    summary="Generate with DistilledPipeline (same flags as python -m ltx_pipelines.distilled)",
)
async def generate_distilled(request: Request, body: DistilledGenerationRequest, principal: Principal) -> JobSubmitResponse:
    data = _prepare(PipelineType.distilled, request, body.model_dump(by_alias=True, exclude_none=True))
    data["project_id"] = _resolve_project(request, body.project_id, principal)
    return _submit(request, PipelineType.distilled, data, principal)


@router.post(
    "/v1/generations/ti2vid",
    response_model=JobSubmitResponse,
    status_code=202,
    summary="Generate with TI2VidTwoStagesPipeline (same flags as python -m ltx_pipelines.ti2vid_two_stages)",
)
async def generate_ti2vid(request: Request, body: TI2VidGenerationRequest, principal: Principal) -> JobSubmitResponse:
    data = _prepare(PipelineType.ti2vid, request, body.model_dump(by_alias=True, exclude_none=True))
    data["project_id"] = _resolve_project(request, body.project_id, principal)
    return _submit(request, PipelineType.ti2vid, data, principal)


@router.post(
    "/v1/uploads",
    response_model=UploadResponse,
    status_code=201,
    summary="Upload a still image (PNG/JPEG for SDR, .exr for HDR) for --image conditioning",
)
async def upload_image(request: Request, file: UploadFile) -> UploadResponse:
    settings: Settings = request.app.state.settings
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in _ALLOWED_UPLOAD_SUFFIXES:
        raise PathNotAllowedError(f"Unsupported file type '{suffix}'. Allowed: {', '.join(sorted(_ALLOWED_UPLOAD_SUFFIXES))}")

    max_bytes = settings.max_upload_mb * 1024 * 1024
    payload = await file.read()
    if len(payload) > max_bytes:
        raise PayloadTooLargeError(f"File exceeds the {settings.max_upload_mb} MB upload limit")

    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    safe_name = f"{uuid.uuid4().hex[:8]}_{Path(file.filename or 'image').name}"[:180]
    target = settings.upload_dir / safe_name
    target.write_bytes(payload)
    return UploadResponse(path=str(target.resolve()), filename=target.name, size_bytes=len(payload))
