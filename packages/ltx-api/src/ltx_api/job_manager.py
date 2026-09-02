"""Job queue and single-GPU worker.

Jobs flow: ``submit`` → SQLite (queued) → asyncio queue → worker coroutine →
``parse_job`` (official CLI parser) → pipeline cache lookup/construction →
``execute`` (pipeline ``__call__`` + ``encode_video``) → completed.

GPU access is serialised by construction: exactly one worker coroutine runs jobs
one at a time, each blocking call dispatched with ``asyncio.to_thread`` so the
event loop (health, SSE, admin endpoints) stays responsive. Cancellation is
queued-only by design: a job that owns the GPU always runs to completion.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from typing import Any

from ltx_api import cli_bridge
from ltx_api.config import Settings
from ltx_api.errors import ConflictError, NotFoundError, UnavailableError
from ltx_api.job_store import JobStore
from ltx_api.pipeline_manager import PipelineManager
from ltx_api.progress import EventBus, JobProgress
from ltx_api.schemas import TERMINAL_STATUSES, JobStatus, PipelineType

logger = logging.getLogger("ltx_api.job_manager")


class JobManager:
    def __init__(
        self,
        store: JobStore,
        settings: Settings,
        pipelines: PipelineManager,
        progress: JobProgress,
        bus: EventBus,
    ) -> None:
        self._store = store
        self._settings = settings
        self._pipelines = pipelines
        self._progress = progress
        self._bus = bus
        self._queue: asyncio.Queue[str] = asyncio.Queue(maxsize=settings.max_queue_size)
        self._worker: asyncio.Task | None = None
        self._paused = asyncio.Event()
        self._paused.set()  # set = running
        self._cancelled: set[str] = set()
        self._current_job_id: str | None = None
        self._started_at: float = time.monotonic()

    # ------------------------------------------------------------ lifecycle

    def start(self) -> None:
        if self._worker is None:
            restored = self._store.requeue_interrupted()
            if restored:
                logger.info("Re-queued %d job(s) interrupted by a previous shutdown", restored)
            for job in self._store.queued_jobs():
                with contextlib.suppress(asyncio.QueueFull):
                    self._queue.put_nowait(job["job_id"])
            self._worker = asyncio.create_task(self._worker_loop(), name="ltx-api-worker")

    async def stop(self) -> None:
        if self._worker is not None:
            self._worker.cancel()
            await asyncio.gather(self._worker, return_exceptions=True)
            self._worker = None


    # ------------------------------------------------------------ submission

    async def submit(
        self,
        ptype: PipelineType,
        data: dict[str, Any],
        owner: tuple[str | None, str | None],
        project_id: str | None = None,
    ) -> str:
        if self._queue.full() or not self._worker or self._worker.done():
            raise UnavailableError(
                "Job queue is full or the worker is not running. Retry later or ask an admin to purge the queue."
            )
        key_hash, label = owner
        if key_hash and self._store.count_queued_for_owner(key_hash) >= self._settings.max_queued_per_key:
            raise ConflictError(
                f"Per-key queue limit reached ({self._settings.max_queued_per_key} queued jobs). Wait for them to finish."
            )
        job_id = self._store.create_job(ptype, data, key_hash, label, project_id=project_id)
        await self._queue.put(job_id)
        await self._progress.record_status(self._bus, job_id, JobStatus.queued.value)
        return job_id

    # ------------------------------------------------------------ job ops

    def cancel(self, job_id: str) -> dict[str, Any]:
        job = self._require(job_id)
        status = JobStatus(job["status"])
        if status in TERMINAL_STATUSES:
            raise ConflictError(f"Job already finished with status '{status.value}' and cannot be cancelled")
        if status is not JobStatus.queued:
            # queued-only cancellation: a job owning the GPU always completes
            raise ConflictError(
                f"Job is currently executing on the GPU (status '{status.value}'); "
                "in-process generation cannot be interrupted. The job will run to completion."
            )
        self._cancelled.add(job_id)
        self._store.set_status(job_id, JobStatus.cancelled, "Cancelled while queued")
        return job

    def get_job(self, job_id: str) -> dict[str, Any]:
        return self._require(job_id)

    def queue_position(self, job_id: str) -> int:
        return self._store.queue_position(job_id)

    # ------------------------------------------------------------ admin ops

    def pause(self) -> None:
        self._paused.clear()

    def resume(self) -> None:
        self._paused.set()

    @property
    def paused(self) -> bool:
        return not self._paused.is_set()

    def purge(self) -> int:
        # Mark every queued-status job cancelled (covers jobs already dequeued by
        # a paused worker, which re-checks the cancel set after resuming), then
        # drain the asyncio queue.
        job_ids = [job["job_id"] for job in self._store.queued_jobs()]
        for job_id in job_ids:
            self._cancelled.add(job_id)
            self._store.set_status(job_id, JobStatus.cancelled, "Purged from queue by an admin")
        while True:
            try:
                job_id = self._queue.get_nowait()
            except asyncio.QueueEmpty:
                break
            self._cancelled.add(job_id)  # also covers a submit racing the snapshot above
        return len(job_ids)

    def worker_status(self) -> dict[str, Any]:
        return {
            "running": bool(self._worker and not self._worker.done()),
            "paused": self.paused,
            "queue_depth": self._queue.qsize(),
            "current_job_id": self._current_job_id,
            "uptime_seconds": round(time.monotonic() - self._started_at, 1),
        }

    # ------------------------------------------------------------ worker loop

    async def _worker_loop(self) -> None:
        while True:
            job_id = await self._queue.get()
            await self._paused.wait()
            if job_id in self._cancelled:
                self._cancelled.discard(job_id)
                continue
            try:
                await self._run_job(job_id)
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001 - the worker must survive any job failure
                logger.exception("Unexpected error while processing job %s", job_id)

    async def _run_job(self, job_id: str) -> None:
        job = self._store.get_job(job_id)
        if job is None or job["status"] in TERMINAL_STATUSES:
            return
        ptype = PipelineType(job["pipeline"])
        data = job["params"]
        output_path = str(self._settings.output_dir / f"{job_id}.mp4")
        self._current_job_id = job_id
        started = time.monotonic()
        started_iso = self._now()
        cache_hit = False

        try:
            self._store.set_status(job_id, JobStatus.parsing)
            await self._progress.record_status(self._bus, job_id, JobStatus.parsing.value)
            parsed = await asyncio.to_thread(cli_bridge.parse_job, ptype, data, output_path)

            cache_hit = self._pipelines.has(parsed.cache_key)
            if not cache_hit:
                detail = "Pipeline cache miss — loading weights"
                self._store.set_status(job_id, JobStatus.loading_model, detail)
                await self._progress.record_status(self._bus, job_id, JobStatus.loading_model.value, detail)
            constructor = lambda: cli_bridge.CONSTRUCTORS[ptype](parsed.args)  # noqa: E731
            pipeline = await asyncio.to_thread(self._pipelines.get_or_load, parsed.cache_key, constructor, ptype)

            self._store.set_status(job_id, JobStatus.running)
            await self._progress.record_status(self._bus, job_id, JobStatus.running.value)
            log = await asyncio.to_thread(cli_bridge.execute, parsed, pipeline, output_path)

            duration = time.monotonic() - started
            self._store.update_job(
                job_id,
                status=JobStatus.completed.value,
                detail=f"Completed via {'warm' if cache_hit else 'cold'} pipeline",
                output_path=output_path,
                started_at=started_iso,
                finished_at=self._now(),
                duration_seconds=round(duration, 2),
            )
            await self._progress.record_log(self._bus, job_id, log.splitlines())
            await self._progress.record_status(self._bus, job_id, JobStatus.completed.value)
        except Exception as exc:  # noqa: BLE001
            duration = time.monotonic() - started
            detail = getattr(exc, "detail", None) or f"{type(exc).__name__}: {exc}"
            logger.error("Job %s failed after %.1fs: %s", job_id, duration, detail)
            self._store.update_job(
                job_id,
                status=JobStatus.failed.value,
                error=detail,
                started_at=started_iso,
                finished_at=self._now(),
                duration_seconds=round(duration, 2),
            )
            await self._progress.record_status(self._bus, job_id, JobStatus.failed.value, detail)
        finally:
            self._current_job_id = None

    def _require(self, job_id: str) -> dict[str, Any]:
        job = self._store.get_job(job_id)
        if job is None:
            raise NotFoundError(f"Unknown job '{job_id}'")
        return job

    @staticmethod
    def _now() -> str:
        from datetime import UTC, datetime  # noqa: PLC0415

        return datetime.now(UTC).isoformat()
