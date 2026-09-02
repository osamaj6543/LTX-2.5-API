"""Retention sweeper: deletes expired job records and their output videos.

Runs as a background asyncio task started in the app lifespan. Output files are
governed by ``output_ttl_hours`` (generated videos) and job *records* by
``job_ttl_days``; the uploads directory is intentionally not swept (admins can
prune it themselves since conditioning images may be reused by future jobs).
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from datetime import UTC, datetime, timedelta
from pathlib import Path

from ltx_api.config import Settings
from ltx_api.job_store import JobStore

logger = logging.getLogger("ltx_api.cleanup")


class CleanupTask:
    def __init__(self, store: JobStore, settings: Settings) -> None:
        self._store = store
        self._settings = settings
        self._task: asyncio.Task | None = None

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._run(), name="ltx-api-cleanup")

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None

    async def _run(self) -> None:
        interval = self._settings.cleanup_interval_seconds
        while True:
            await asyncio.sleep(interval)
            try:
                await asyncio.to_thread(self.sweep_once)
            except Exception:  # noqa: BLE001 - the sweeper must never kill the server
                logger.exception("Cleanup sweep failed")

    def sweep_once(self) -> dict[str, int]:
        settings = self._settings
        now = datetime.now(UTC)
        removed_files = 0

        # 1) Expire output videos of finished jobs older than output_ttl_hours.
        cutoff = (now - timedelta(hours=settings.output_ttl_hours)).isoformat()
        jobs = self._store.delete_old_jobs(cutoff)
        for job in jobs:
            output = job.get("output_path")
            if output:
                with contextlib.suppress(OSError):
                    Path(output).unlink(missing_ok=True)
                    removed_files += 1

        # 2) Delete job records older than job_ttl_days.
        record_cutoff = (now - timedelta(days=settings.job_ttl_days)).isoformat()
        purged = len(self._store.delete_old_jobs(record_cutoff))

        if jobs or purged:
            logger.info("Cleanup: expired %d outputs (%d files), purged %d old job records", len(jobs), removed_files, purged)
        return {"expired_outputs": len(jobs), "files_removed": removed_files, "records_purged": purged}
