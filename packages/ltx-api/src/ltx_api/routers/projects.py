"""Project endpoints: named workspaces that organize generations.

Projects follow the same ownership model as jobs: users see and manage their
own, admins see and manage all, and open-mode (no keys configured) sees
everything. Deleting a project never destroys renders — its jobs are detached
back to the unsorted library.
"""

from __future__ import annotations

from fastapi import APIRouter, Request

from ltx_api.auth import Principal, authorize_project
from ltx_api.errors import NotFoundError
from ltx_api.job_store import JobStore
from ltx_api.routers.jobs import _serialize as _serialize_job
from ltx_api.schemas import (
    JobListResponse,
    JobResponse,
    JobStatus,
    MessageResponse,
    ProjectCreate,
    ProjectListResponse,
    ProjectResponse,
    ProjectStatus,
    ProjectUpdate,
    Role,
)

router = APIRouter(prefix="/v1/projects", tags=["projects"])


def _serialize(project: dict) -> ProjectResponse:
    return ProjectResponse(
        project_id=project["project_id"],
        name=project["name"],
        description=project.get("description"),
        color=project.get("color", "violet"),
        status=ProjectStatus(project.get("status", "active")),
        pinned=bool(project.get("pinned")),
        owner=project.get("owner_label"),
        job_count=project.get("job_count", 0),
        completed_count=project.get("completed_count", 0),
        failed_count=project.get("failed_count", 0),
        total_render_seconds=project.get("total_render_seconds", 0),
        last_activity_at=project.get("last_activity_at"),
        created_at=project["created_at"],
        updated_at=project["updated_at"],
    )


def _get_owned_project(request: Request, project_id: str, principal: Principal) -> dict:
    project = request.app.state.store.get_project(project_id)
    if project is None:
        raise NotFoundError(f"Unknown project '{project_id}'")
    authorize_project(project, principal)
    return project


def _project_scope(principal: Principal) -> str | None:
    """Owner filter for listings: None = admins + open mode see everything."""
    key_hash, role, _ = principal
    return None if role is Role.admin or key_hash is None else key_hash


@router.get("", response_model=ProjectListResponse, summary="List projects (users see their own; admins see all)")
async def list_projects(
    request: Request,
    principal: Principal,
    status: ProjectStatus | None = None,
    limit: int = 100,
    offset: int = 0,
) -> ProjectListResponse:
    store: JobStore = request.app.state.store
    projects, total = store.list_projects(
        owner_key_hash=_project_scope(principal),
        status=status.value if status is not None else None,
        limit=min(limit, 200),
        offset=offset,
    )
    return ProjectListResponse(
        projects=[_serialize(p) for p in projects],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("", response_model=ProjectResponse, status_code=201, summary="Create a project")
async def create_project(request: Request, body: ProjectCreate, principal: Principal) -> ProjectResponse:
    store: JobStore = request.app.state.store
    project_id = store.create_project(
        name=body.name.strip(),
        description=(body.description or "").strip() or None,
        color=body.color,
        owner_key_hash=principal[0],
        owner_label=principal[2],
    )
    return _serialize(store.get_project(project_id))  # type: ignore[arg-type]


@router.get("/{project_id}", response_model=ProjectResponse, summary="Project details and stats")
async def get_project(request: Request, project_id: str, principal: Principal) -> ProjectResponse:
    project = _get_owned_project(request, project_id, principal)
    return _serialize(project)


@router.patch("/{project_id}", response_model=ProjectResponse, summary="Update a project (rename, recolor, archive, pin)")
async def update_project(request: Request, project_id: str, body: ProjectUpdate, principal: Principal) -> ProjectResponse:
    store: JobStore = request.app.state.store
    _get_owned_project(request, project_id, principal)
    fields = body.model_dump(exclude_none=True)
    if fields.get("status") is not None:
        fields["status"] = ProjectStatus(fields["status"]).value
    store.update_project(project_id, **fields)
    return _serialize(store.get_project(project_id))  # type: ignore[arg-type]


@router.delete("/{project_id}", response_model=MessageResponse, summary="Delete a project (its generations are detached, not deleted)")
async def delete_project(request: Request, project_id: str, principal: Principal) -> MessageResponse:
    store: JobStore = request.app.state.store
    project = _get_owned_project(request, project_id, principal)
    store.delete_project(project_id)
    return MessageResponse(detail=f"Project '{project['name']}' deleted — its generations moved to the unsorted library")


@router.get("/{project_id}/jobs", response_model=JobListResponse, summary="List the generations inside a project")
async def list_project_jobs(
    request: Request,
    project_id: str,
    principal: Principal,
    status: JobStatus | None = None,
    limit: int = 50,
    offset: int = 0,
) -> JobListResponse:
    store: JobStore = request.app.state.store
    _get_owned_project(request, project_id, principal)
    jobs, total = store.list_jobs(
        status=status,
        owner_key_hash=_project_scope(principal),
        limit=min(limit, 200),
        offset=offset,
        project_id=project_id,
    )
    return JobListResponse(
        jobs=[_serialize_job(request, job, principal) for job in jobs],
        total=total,
        limit=limit,
        offset=offset,
    )