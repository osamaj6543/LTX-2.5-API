"""Job endpoints: status, listing, queued-only cancellation, download, logs, SSE events."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, StreamingResponse

from ltx_api.auth import Principal, authorize_project
from ltx_api.errors import ConflictError, ForbiddenError, NotFoundError
from ltx_api.job_store import JobStore
from ltx_api.progress import JobEvent
from ltx_api.schemas import (
    JobListResponse,
    JobResponse,
    JobStatus,
    JobUpdateRequest,
    MessageResponse,
    Role,
)

router = APIRouter(prefix="/v1/jobs", tags=["jobs"])


def _serialize(request: Request, job: dict, principal: Principal) -> JobResponse:
    manager = request.app.state.jobs
    status = JobStatus(job["status"])
    queue_position = manager.queue_position(job["job_id"]) if status is JobStatus.queued else None
    return JobResponse(
        job_id=job["job_id"],
        pipeline=job["pipeline"],
        status=status,
        detail=job.get("detail"),
        queue_position=queue_position,
        params=job.get("params"),
        output_file=job.get("output_path"),
        download_url=f"/v1/jobs/{job['job_id']}/video" if job.get("output_path") else None,
        error=job.get("error"),
        project_id=job.get("project_id"),
        created_at=job["created_at"],
        started_at=job.get("started_at"),
        finished_at=job.get("finished_at"),
        duration_seconds=job.get("duration_seconds"),
        owner=job.get("owner_label"),
    )


def _authorize(request: Request, job: dict, principal: Principal) -> None:
    key_hash, role, _ = principal
    if role is Role.admin:
        return
    if key_hash is None and role is None:
        return  # open mode (no keys configured)
    if job.get("owner_key_hash") != key_hash:
        raise ForbiddenError("You do not own this job")


@router.get("", response_model=JobListResponse, summary="List jobs (users see their own; admins see all)")
async def list_jobs(
    request: Request,
    principal: Principal,
    status: JobStatus | None = None,
    project_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> JobListResponse:
    store = request.app.state.store
    key_hash, role, _ = principal
    scope = None if role is Role.admin or key_hash is None else key_hash
    jobs, total = store.list_jobs(
        status=status, owner_key_hash=scope, limit=min(limit, 200), offset=offset, project_id=project_id
    )
    return JobListResponse(
        jobs=[_serialize(request, job, principal) for job in jobs],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{job_id}", response_model=JobResponse, summary="Job status and metadata")
async def get_job(request: Request, job_id: str, principal: Principal) -> JobResponse:
    job = request.app.state.jobs.get_job(job_id)
    _authorize(request, job, principal)
    return _serialize(request, job, principal)


@router.delete("/{job_id}", response_model=MessageResponse, summary="Cancel a queued job")
async def cancel_job(request: Request, job_id: str, principal: Principal) -> MessageResponse:
    _authorize(request, request.app.state.jobs.get_job(job_id), principal)
    request.app.state.jobs.cancel(job_id)
    return MessageResponse(detail=f"Job {job_id} cancelled while queued")


@router.patch("/{job_id}", response_model=JobResponse, summary="Update a job (move it between projects)")
async def update_job(request: Request, job_id: str, body: JobUpdateRequest, principal: Principal) -> JobResponse:
    store: JobStore = request.app.state.store
    job = request.app.state.jobs.get_job(job_id)
    _authorize(request, job, principal)
    if body.project_id is not None:
        project = store.get_project(body.project_id)
        if project is None:
            raise NotFoundError(f"Unknown project '{body.project_id}'")
        authorize_project(project, principal)
        if project.get("status") == "archived":
            raise ConflictError(f"Project '{project['name']}' is archived — restore it first.")
    store.set_job_project(job_id, body.project_id)
    return _serialize(request, store.get_job(job_id), principal)


@router.get("/{job_id}/video", summary="Download the generated video")
async def download_video(request: Request, job_id: str, principal: Principal) -> FileResponse:
    job = request.app.state.jobs.get_job(job_id)
    _authorize(request, job, principal)
    output = job.get("output_path")
    if job["status"] != JobStatus.completed.value or not output or not Path(output).is_file():
        raise NotFoundError(f"Job {job_id} has no completed video yet (status: {job['status']})")
    return FileResponse(output, media_type="video/mp4", filename=Path(output).name)


@router.get("/{job_id}/logs", summary="Captured pipeline log (identical to the CLI console output)")
async def job_logs(request: Request, job_id: str, principal: Principal) -> dict:
    job = request.app.state.jobs.get_job(job_id)
    _authorize(request, job, principal)
    _, tail = await request.app.state.progress.snapshot(job_id)
    return {"job_id": job_id, "lines": tail}


@router.get("/{job_id}/events", summary="Server-Sent Events stream of job state changes and log lines")
async def job_events(request: Request, job_id: str, principal: Principal) -> StreamingResponse:
    job = request.app.state.jobs.get_job(job_id)
    _authorize(request, job, principal)
    progress = request.app.state.progress
    bus = request.app.state.bus
    queue = bus.subscribe()

    async def stream():
        try:
            # Replay current state so late subscribers catch up.
            snapshot_status, tail = await progress.snapshot(job_id)
            status_now = snapshot_status or job["status"]
            yield f"event: status\ndata: {json.dumps({'job_id': job_id, 'status': status_now})}\n\n"
            for line in tail:
                yield f"event: log\ndata: {json.dumps({'job_id': job_id, 'line': line})}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event: JobEvent = await asyncio.wait_for(queue.get(), timeout=15)
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"  # comment ping keeps proxies from closing the stream
                    continue
                if event.job_id != job_id:
                    continue
                yield event.sse()
        finally:
            bus.unsubscribe(queue)

    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})
