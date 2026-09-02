"""Warm pipeline cache.

Pipelines are expensive to construct (tens of GB of weights), so instances are
cached by a key covering everything that affects construction (model paths,
LoRAs, quantization, compile, offload, DiffVAE mode). The job worker calls
:meth:`get_or_load` under the worker lock; the admin API can inspect, preload
and evict entries.

All public methods are thread-safe. Only the job worker and admin endpoints
touch this object, and the worker serialises GPU access anyway.
"""

from __future__ import annotations

import logging
import threading
from collections import OrderedDict
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from ltx_api.schemas import PipelineCacheEntry, PipelineType

logger = logging.getLogger("ltx_api.pipeline_manager")


@dataclass
class _Entry:
    pipeline: Any
    ptype: PipelineType
    loaded_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    last_used_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    jobs_run: int = 0


def _utcnow() -> str:
    return datetime.now(UTC).isoformat()


class PipelineManager:
    def __init__(self, max_entries: int = 1) -> None:
        self._max_entries = max_entries
        self._entries: OrderedDict[str, _Entry] = OrderedDict()
        self._lock = threading.Lock()
        self._load_failure: str | None = None

    # -- configuration ----------------------------------------------------

    @property
    def max_entries(self) -> int:
        return self._max_entries

    def set_max_entries(self, value: int) -> None:
        with self._lock:
            self._max_entries = value
            self._evict_locked()

    # -- introspection ------------------------------------------------------

    def list_entries(self) -> list[PipelineCacheEntry]:
        with self._lock:
            return [
                PipelineCacheEntry(
                    key=key,
                    pipeline=e.ptype,
                    loaded_at=e.loaded_at.isoformat(),
                    last_used_at=e.last_used_at.isoformat(),
                    jobs_run=e.jobs_run,
                )
                for key, e in self._entries.items()
            ]

    def has(self, key: str) -> bool:
        with self._lock:
            return key in self._entries

    # -- lifecycle ------------------------------------------------------------

    def get_or_load(self, key: str, constructor: Any, ptype: PipelineType) -> Any:
        """Return the cached pipeline for *key*, constructing it on a miss."""
        with self._lock:
            entry = self._entries.get(key)
            if entry is not None:
                self._entries.move_to_end(key)
                entry.last_used_at = datetime.now(UTC)
                entry.jobs_run += 1
                self._load_failure = None
                return entry.pipeline
        # Construct outside the lock would race; construction is serialized by
        # the job worker anyway, so keeping it inside the lock is correct.
        with self._lock:
            logger.info("Loading pipeline %s (cache key %s)", ptype.value, key[:12])
            pipeline = constructor()
            entry = _Entry(pipeline=pipeline, ptype=ptype, jobs_run=1)
            self._entries[key] = entry
            self._evict_locked()
            self._load_failure = None
            return pipeline

    def preload(self, key: str, constructor: Any, ptype: PipelineType) -> None:
        self.get_or_load(key, constructor, ptype)

    def evict(self, key: str) -> bool:
        with self._lock:
            entry = self._entries.pop(key, None)
            if entry is None:
                return False
            self._release(entry)
            return True

    def evict_all(self) -> int:
        with self._lock:
            count = len(self._entries)
            for entry in self._entries.values():
                self._release(entry)
            self._entries.clear()
            return count

    # -- internals -------------------------------------------------------------

    def _evict_locked(self) -> None:
        """Evict least-recently-used entries beyond the configured limit."""
        if self._max_entries < 0:
            return
        while len(self._entries) > self._max_entries:
            key, entry = next(iter(self._entries.items()))
            logger.info("Evicting pipeline %s (cache key %s)", entry.ptype.value, key[:12])
            self._entries.pop(key)
            self._release(entry)

    def _release(self, entry: _Entry) -> None:
        """Best-effort VRAM release for an evicted pipeline."""
        entry.pipeline = None
        try:
            import gc  # noqa: PLC0415

            gc.collect()
            import torch  # noqa: PLC0415

            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:  # noqa: BLE001 - release is best-effort, never fatal
            logger.debug("VRAM release after eviction raised; continuing")
