"""Persistent store (SQLite): jobs and API keys.

Job state survives restarts: at boot the job manager re-queues any jobs left in a
non-terminal status. All methods are synchronous; SQLite is fast enough for this
control-plane workload and ``check_same_thread=False`` + a lock keeps it safe
across the asyncio loop and the worker thread.
"""

from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from ltx_api.schemas import JobStatus, PipelineType, Role

_SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
    job_id TEXT PRIMARY KEY,
    pipeline TEXT NOT NULL,
    status TEXT NOT NULL,
    detail TEXT,
    params TEXT NOT NULL,
    output_path TEXT,
    error TEXT,
    owner_key_hash TEXT,
    owner_label TEXT,
    created_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT,
    duration_seconds REAL
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_owner ON jobs(owner_key_hash);

CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_hash TEXT UNIQUE NOT NULL,
    label TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL,
    last_used_at TEXT,
    revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS projects (
    project_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT NOT NULL DEFAULT 'violet',
    status TEXT NOT NULL DEFAULT 'active',
    pinned INTEGER NOT NULL DEFAULT 0,
    owner_key_hash TEXT,
    owner_label TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_key_hash);
"""

# Aggregate join used by every project read: per-project job counts, failure
# counts, accumulated render time and the latest job timestamp (activity).
_PROJECT_AGGREGATE = """
SELECT p.*, COUNT(j.job_id) AS job_count,
       COALESCE(SUM(CASE WHEN j.status = 'completed' THEN 1 ELSE 0 END), 0) AS completed_count,
       COALESCE(SUM(CASE WHEN j.status = 'failed' THEN 1 ELSE 0 END), 0) AS failed_count,
       COALESCE(SUM(j.duration_seconds), 0) AS total_render_seconds,
       MAX(j.created_at) AS last_activity_at
FROM projects p LEFT JOIN jobs j ON j.project_id = p.project_id
"""


def _utcnow() -> str:
    return datetime.now(UTC).isoformat()


class JobStore:
    def __init__(self, db_path: Path | str) -> None:
        self._conn = sqlite3.connect(str(db_path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        with self._lock, self._conn:
            self._conn.executescript(_SCHEMA)
        self._migrate()

    def _migrate(self) -> None:
        """Idempotent column migrations for databases created before projects existed."""
        columns = {row["name"] for row in self._conn.execute("PRAGMA table_info(jobs)").fetchall()}
        with self._lock, self._conn:
            if "project_id" not in columns:
                self._conn.execute("ALTER TABLE jobs ADD COLUMN project_id TEXT")
            self._conn.execute("CREATE INDEX IF NOT EXISTS idx_jobs_project ON jobs(project_id)")

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    # ---------------------------------------------------------------- jobs

    def create_job(
        self,
        pipeline: PipelineType,
        params: dict[str, Any],
        owner_key_hash: str | None,
        owner_label: str | None,
        project_id: str | None = None,
    ) -> str:
        job_id = uuid.uuid4().hex[:12]
        with self._lock, self._conn:
            self._conn.execute(
                "INSERT INTO jobs (job_id, pipeline, status, params, owner_key_hash, owner_label, project_id, created_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (job_id, pipeline.value, JobStatus.queued.value, json.dumps(params),
                 owner_key_hash, owner_label, project_id, _utcnow()),
            )
        return job_id

    def update_job(self, job_id: str, **fields: Any) -> None:
        if not fields:
            return
        columns = ", ".join(f"{name} = ?" for name in fields)
        values = [json.dumps(v) if name == "params" and not isinstance(v, str) else v for name, v in fields.items()]
        values.append(job_id)
        with self._lock, self._conn:
            self._conn.execute(f"UPDATE jobs SET {columns} WHERE job_id = ?", values)

    def set_status(self, job_id: str, status: JobStatus, detail: str | None = None) -> None:
        self.update_job(job_id, status=status.value, detail=detail)

    def get_job(self, job_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
        return self._row_to_job(row) if row else None

    def list_jobs(
        self,
        status: JobStatus | None = None,
        owner_key_hash: str | None = None,
        limit: int = 50,
        offset: int = 0,
        project_id: str | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        clauses, values = [], []
        if status is not None:
            clauses.append("status = ?")
            values.append(status.value)
        if owner_key_hash is not None:
            clauses.append("owner_key_hash = ?")
            values.append(owner_key_hash)
        if project_id is not None:
            clauses.append("project_id = ?")
            values.append(project_id)
        where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
        with self._lock:
            total = self._conn.execute(f"SELECT COUNT(*) AS c FROM jobs{where}", values).fetchone()["c"]
            rows = self._conn.execute(
                f"SELECT * FROM jobs{where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
                (*values, limit, offset),
            ).fetchall()
        return [self._row_to_job(r) for r in rows], total

    def queued_jobs(self) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM jobs WHERE status = ? ORDER BY created_at ASC", (JobStatus.queued.value,)
            ).fetchall()
        return [self._row_to_job(r) for r in rows]

    def count_queued_for_owner(self, owner_key_hash: str) -> int:
        with self._lock:
            row = self._conn.execute(
                "SELECT COUNT(*) AS c FROM jobs WHERE owner_key_hash = ? AND status = ?",
                (owner_key_hash, JobStatus.queued.value),
            ).fetchone()
        return row["c"]

    def queue_position(self, job_id: str) -> int:
        with self._lock:
            rows = self._conn.execute(
                "SELECT job_id FROM jobs WHERE status = ? ORDER BY created_at ASC", (JobStatus.queued.value,)
            ).fetchall()
        for index, row in enumerate(rows):
            if row["job_id"] == job_id:
                return index + 1
        return 0

    def requeue_interrupted(self) -> int:
        """Mark jobs that were mid-flight at shutdown as queued again."""
        with self._lock, self._conn:
            cursor = self._conn.execute(
                "UPDATE jobs SET status = ?, detail = ? WHERE status IN (?, ?, ?, ?)",
                (JobStatus.queued.value, "Re-queued after server restart",
                 JobStatus.parsing.value, JobStatus.loading_model.value,
                 JobStatus.running.value, JobStatus.encoding.value),
            )
            return cursor.rowcount

    def delete_old_jobs(self, older_than_iso: str) -> list[dict[str, Any]]:
        with self._lock, self._conn:
            rows = self._conn.execute(
                "SELECT * FROM jobs WHERE finished_at IS NOT NULL AND finished_at < ?", (older_than_iso,)
            ).fetchall()
            jobs = [self._row_to_job(r) for r in rows]
            self._conn.execute("DELETE FROM jobs WHERE finished_at IS NOT NULL AND finished_at < ?", (older_than_iso,))
        return jobs

    def stats(self) -> dict[str, Any]:
        with self._lock:
            by_status = {
                row["status"]: row["c"]
                for row in self._conn.execute("SELECT status, COUNT(*) AS c FROM jobs GROUP BY status").fetchall()
            }
            avg = self._conn.execute(
                "SELECT AVG(duration_seconds) AS a FROM jobs WHERE duration_seconds IS NOT NULL"
            ).fetchone()["a"]
            per_key = [
                {"owner_label": r["owner_label"] or "(anonymous)", "jobs": r["c"]}
                for r in self._conn.execute(
                    "SELECT owner_label, COUNT(*) AS c FROM jobs GROUP BY owner_label ORDER BY c DESC"
                ).fetchall()
            ]
        return {"by_status": by_status, "avg_duration_seconds": avg, "total": sum(by_status.values()), "per_key": per_key}

    def _row_to_job(self, row: sqlite3.Row) -> dict[str, Any]:
        job = dict(row)
        job["params"] = json.loads(job["params"])
        return job

    # ------------------------------------------------------------ projects

    @staticmethod
    def _row_to_project(row: sqlite3.Row) -> dict[str, Any]:
        project = dict(row)
        project["pinned"] = bool(project["pinned"])
        return project

    def create_project(
        self,
        name: str,
        description: str | None,
        color: str,
        owner_key_hash: str | None,
        owner_label: str | None,
    ) -> str:
        project_id = uuid.uuid4().hex[:12]
        now = _utcnow()
        with self._lock, self._conn:
            self._conn.execute(
                "INSERT INTO projects (project_id, name, description, color, status, pinned, owner_key_hash, owner_label, created_at, updated_at)"
                " VALUES (?, ?, ?, ?, 'active', 0, ?, ?, ?, ?)",
                (project_id, name, description, color, owner_key_hash, owner_label, now, now),
            )
        return project_id

    def get_project(self, project_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._conn.execute(
                f"{_PROJECT_AGGREGATE} WHERE p.project_id = ? GROUP BY p.project_id", (project_id,)
            ).fetchone()
        return self._row_to_project(row) if row else None

    def list_projects(
        self,
        owner_key_hash: str | None = None,
        status: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[dict[str, Any]], int]:
        clauses, values = [], []
        if owner_key_hash is not None:
            clauses.append("p.owner_key_hash = ?")
            values.append(owner_key_hash)
        if status is not None:
            clauses.append("p.status = ?")
            values.append(status)
        where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
        order = " GROUP BY p.project_id ORDER BY p.pinned DESC, COALESCE(MAX(j.created_at), p.created_at) DESC"
        with self._lock:
            total = self._conn.execute(
                f"SELECT COUNT(*) AS c FROM projects p{where}", values
            ).fetchone()["c"]
            rows = self._conn.execute(
                f"{_PROJECT_AGGREGATE}{where}{order} LIMIT ? OFFSET ?",
                (*values, limit, offset),
            ).fetchall()
        return [self._row_to_project(r) for r in rows], total

    def update_project(self, project_id: str, **fields: Any) -> None:
        if not fields:
            return
        fields = dict(fields)
        fields["updated_at"] = _utcnow()
        if "pinned" in fields:
            fields["pinned"] = int(bool(fields["pinned"]))
        columns = ", ".join(f"{name} = ?" for name in fields)
        values = [*fields.values(), project_id]
        with self._lock, self._conn:
            self._conn.execute(f"UPDATE projects SET {columns} WHERE project_id = ?", values)

    def delete_project(self, project_id: str) -> bool:
        """Delete a project and detach its jobs (renders are never destroyed)."""
        with self._lock, self._conn:
            self._conn.execute("UPDATE jobs SET project_id = NULL WHERE project_id = ?", (project_id,))
            cursor = self._conn.execute("DELETE FROM projects WHERE project_id = ?", (project_id,))
            return cursor.rowcount > 0

    def set_job_project(self, job_id: str, project_id: str | None) -> None:
        with self._lock, self._conn:
            self._conn.execute("UPDATE jobs SET project_id = ? WHERE job_id = ?", (project_id, job_id))

    # ------------------------------------------------------------ api keys

    def create_api_key(self, key_hash: str, label: str | None, role: Role) -> tuple[int, str]:
        """Insert a key; returns ``(row_id, created_at)``."""
        created = _utcnow()
        with self._lock, self._conn:
            cursor = self._conn.execute(
                "INSERT INTO api_keys (key_hash, label, role, created_at) VALUES (?, ?, ?, ?)",
                (key_hash, label, role.value, created),
            )
            return cursor.lastrowid, created

    def get_api_key(self, key_hash: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL", (key_hash,)
            ).fetchone()
        if row is None:
            return None
        return {"key_hash": row["key_hash"], "label": row["label"], "role": row["role"], "id": row["id"]}

    def touch_api_key(self, key_hash: str) -> None:
        with self._lock, self._conn:
            self._conn.execute("UPDATE api_keys SET last_used_at = ? WHERE key_hash = ?", (_utcnow(), key_hash))

    def list_api_keys(self) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT id, label, role, created_at, last_used_at, revoked_at FROM api_keys ORDER BY id"
            ).fetchall()
        return [dict(r) for r in rows]

    def revoke_api_key(self, key_hash: str) -> bool:
        with self._lock, self._conn:
            cursor = self._conn.execute(
                "UPDATE api_keys SET revoked_at = ? WHERE key_hash = ? AND revoked_at IS NULL", (_utcnow(), key_hash)
            )
            return cursor.rowcount > 0

    def revoke_api_key_by_id(self, key_id: int) -> bool:
        with self._lock, self._conn:
            cursor = self._conn.execute(
                "UPDATE api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL", (_utcnow(), key_id)
            )
            return cursor.rowcount > 0
