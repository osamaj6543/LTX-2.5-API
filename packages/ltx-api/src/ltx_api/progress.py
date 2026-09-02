"""Per-job log storage and a tiny SSE event bus.

The worker publishes state transitions; ``GET /v1/jobs/{id}/events`` streams them
as Server-Sent Events. Log tails are kept in memory per job (bounded) and written
to SQLite for the full transcript.
"""

from __future__ import annotations

import asyncio
import json
from collections import deque
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

MAX_TAIL_LINES = 200


@dataclass
class JobEvent:
    job_id: str
    kind: str  # status | log
    data: dict[str, Any] = field(default_factory=dict)

    def sse(self) -> str:
        payload = {"job_id": self.job_id, "kind": self.kind, **self.data}
        return f"event: {self.kind}\ndata: {json.dumps(payload)}\n\n"


class EventBus:
    """Fan-out of job events to any number of SSE subscribers."""

    def __init__(self) -> None:
        self._queues: set[asyncio.Queue[JobEvent]] = set()

    def subscribe(self) -> asyncio.Queue[JobEvent]:
        q: asyncio.Queue[JobEvent] = asyncio.Queue(maxsize=1000)
        self._queues.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue[JobEvent]) -> None:
        self._queues.discard(q)

    def publish(self, event: JobEvent) -> None:
        for q in tuple(self._queues):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:  # slow consumer: drop rather than block the worker
                pass


class JobProgress:
    """In-memory per-job state: status cache for SSE replays + bounded log tails."""

    def __init__(self) -> None:
        self._tails: dict[str, deque[str]] = {}
        self._statuses: dict[str, str] = {}
        self._lock = asyncio.Lock()

    async def record_status(self, bus: EventBus, job_id: str, status: str, detail: str | None = None) -> None:
        async with self._lock:
            self._statuses[job_id] = status
        bus.publish(JobEvent(job_id=job_id, kind="status", data={"status": status, "detail": detail}))

    async def record_log(self, bus: EventBus, job_id: str, lines: list[str]) -> None:
        if not lines:
            return
        async with self._lock:
            tail = self._tails.setdefault(job_id, deque(maxlen=MAX_TAIL_LINES))
            tail.extend(lines)
        for chunk in lines:
            bus.publish(JobEvent(job_id=job_id, kind="log", data={"line": chunk.rstrip("\n")}))

    async def snapshot(self, job_id: str) -> tuple[str | None, list[str]]:
        async with self._lock:
            status = self._statuses.get(job_id)
            tail = list(self._tails.get(job_id, ()))
        return status, tail

    async def drop(self, job_id: str) -> None:
        async with self._lock:
            self._tails.pop(job_id, None)
            self._statuses.pop(job_id, None)


def utcnow_iso() -> str:
    return datetime.now(UTC).isoformat()
