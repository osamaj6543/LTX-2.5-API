"""FastAPI application: lifespan, middleware, error handling, routers.

Run with ``python -m ltx_api`` or ``uvicorn ltx_api.main:app``.
"""

from __future__ import annotations

import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from ltx_api import __version__
from ltx_api.cleanup import CleanupTask
from ltx_api.config import Settings, hash_api_key, load_settings
from ltx_api.errors import APIError
from ltx_api.job_manager import JobManager
from ltx_api.job_store import JobStore
from ltx_api.pipeline_manager import PipelineManager
from ltx_api.progress import EventBus, JobProgress
from ltx_api.routers import admin, generations, jobs, projects
from ltx_api.schemas import Role

logger = logging.getLogger("ltx_api")


def _seed_keys(settings: Settings, store: JobStore) -> None:
    """Persist the bootstrap admin key and any declaratively seeded keys."""
    if settings.admin_key:
        # Remember the digest so auth can match it without storing the raw key.
        settings._admin_key_hash = hash_api_key(settings.admin_key)
        existing = {row["label"] for row in store.list_api_keys()}
        if "bootstrap-admin" not in existing:
            store.create_api_key(hash_api_key(settings.admin_key), "bootstrap-admin", Role.admin)
            logger.info("Bootstrap admin API key registered")
    if settings.initial_api_keys:
        for entry in settings.initial_api_keys.get("keys", []):
            if isinstance(entry, dict) and entry.get("key"):
                if store.get_api_key(hash_api_key(entry["key"])) is None:
                    store.create_api_key(
                        hash_api_key(entry["key"]), entry.get("label"), Role(entry.get("role", "user"))
                    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings: Settings = app.state.settings
    settings.ensured_dirs()
    logging.basicConfig(level=settings.log_level.upper())

    store = JobStore(settings.db_path)
    pipelines = PipelineManager(max_entries=settings.max_cached_pipelines)
    bus = EventBus()
    progress = JobProgress()
    manager = JobManager(store, settings, pipelines, progress, bus)
    cleanup = CleanupTask(store, settings)

    _seed_keys(settings, store)
    app.state.store = store
    app.state.pipelines = pipelines
    app.state.bus = bus
    app.state.progress = progress
    app.state.jobs = manager
    app.state.cleanup = cleanup
    app.state.version = __version__

    manager.start()
    cleanup.start()
    logger.info("LTX API %s ready — outputs in %s", __version__, settings.output_dir)
    try:
        yield
    finally:
        await cleanup.stop()
        await manager.stop()
        store.close()


def create_app(settings: Settings | None = None) -> FastAPI:
    app = FastAPI(
        title="LTX-2.5 Generation API",
        version=__version__,
        description=(
            "Professional FastAPI wrapper around the official LTX pipelines "
            "(`DistilledPipeline`, `TI2VidTwoStagesPipeline`). Every generation request is "
            "translated into the exact CLI argv and parsed by the official argparse parsers, "
            "so validation, defaults and error messages match `python -m ltx_pipelines.distilled` "
            "and `python -m ltx_pipelines.ti2vid_two_stages` one-for-one."
        ),
        lifespan=lifespan,
    )
    app.state.settings = settings or load_settings()

    if app.state.settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=app.state.settings.cors_origins,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        request_id = request.headers.get("x-request-id", uuid.uuid4().hex[:12])
        request.state.request_id = request_id
        started = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - started) * 1000
        response.headers["x-request-id"] = request_id
        response.headers["x-process-time-ms"] = f"{elapsed_ms:.1f}"
        logger.info("%s %s -> %s (%.1f ms)", request.method, request.url.path, response.status_code, elapsed_ms)
        return response

    @app.exception_handler(APIError)
    async def api_error_handler(request: Request, exc: APIError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail, "request_id": getattr(request.state, "request_id", None), "argv": exc.argv},
        )

    @app.get("/health", tags=["health"], summary="Liveness probe (unauthenticated)")
    async def health() -> dict:
        return {"status": "ok", "version": __version__}

    app.include_router(generations.router)
    app.include_router(jobs.router)
    app.include_router(projects.router)
    app.include_router(admin.router)
    return app


def main() -> None:
    import uvicorn  # noqa: PLC0415

    settings = load_settings()
    uvicorn.run(
        "ltx_api.server:create_app",
        factory=True,
        host=settings.host,
        port=settings.port,
        log_level=settings.log_level.lower(),
    )
