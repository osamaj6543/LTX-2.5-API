"""Store + job manager lifecycle tests (no HTTP, no GPU)."""

from __future__ import annotations

import pytest

from ltx_api.job_store import JobStore
from ltx_api.schemas import JobStatus, PipelineType, Role


def test_job_roundtrip(tmp_path):
    store = JobStore(tmp_path / "t.db")
    job_id = store.create_job(PipelineType.distilled, {"prompt": "x"}, "hash", "label")
    job = store.get_job(job_id)
    assert job["status"] == JobStatus.queued.value
    assert job["params"] == {"prompt": "x"}
    assert store.queue_position(job_id) == 1

    store.set_status(job_id, JobStatus.completed, "done")
    assert store.get_job(job_id)["status"] == "completed"

    jobs, total = store.list_jobs(status=JobStatus.completed)
    assert total == 1 and jobs[0]["job_id"] == job_id


def test_requeue_interrupted(tmp_path):
    store = JobStore(tmp_path / "t.db")
    job_id = store.create_job(PipelineType.ti2vid, {}, None, None)
    store.set_status(job_id, JobStatus.running)
    assert store.requeue_interrupted() == 1
    assert store.get_job(job_id)["status"] == "queued"


def test_api_keys(tmp_path):
    store = JobStore(tmp_path / "t.db")
    key_id, _ = store.create_api_key("h1", "svc", Role.user)
    record = store.get_api_key("h1")
    assert record["role"] == "user"
    store.touch_api_key("h1")
    assert store.get_api_key("h1")["last_used_at"] is not None
    assert store.revoke_api_key_by_id(key_id) is True
    assert store.get_api_key("h1") is None
    assert store.revoke_api_key_by_id(key_id) is False


def test_stats(tmp_path):
    store = JobStore(tmp_path / "t.db")
    store.create_job(PipelineType.distilled, {}, "h", "svc-a")
    store.create_job(PipelineType.distilled, {}, "h", "svc-a")
    data = store.stats()
    assert data["total"] == 2
    assert data["per_key"][0]["owner_label"] == "svc-a"


@pytest.mark.asyncio
async def test_worker_completes_fake_job(tmp_path, monkeypatch):
    from ltx_api import cli_bridge
    from ltx_api.cli_bridge import ParsedJob
    from ltx_api.config import Settings
    from ltx_api.job_manager import JobManager
    from ltx_api.pipeline_manager import PipelineManager
    from ltx_api.progress import EventBus, JobProgress

    monkeypatch.setattr(cli_bridge, "parse_job", lambda p, d, o: ParsedJob(ptype=p, args=None, cache_key="k", argv=[]))
    monkeypatch.setattr(cli_bridge, "execute", lambda parsed, pipeline, out: ("ok"))

    settings = Settings(output_dir=tmp_path / "o", db_path=tmp_path / "db.sqlite", admin_key="k")
    settings.ensured_dirs()
    store = JobStore(settings.db_path)
    manager = JobManager(store, settings, PipelineManager(max_entries=1), JobProgress(), EventBus())
    manager.start()
    try:
        job_id = await manager.submit(PipelineType.distilled, {"prompt": "x"}, (None, None))
        import anyio

        for _ in range(50):
            if store.get_job(job_id)["status"] == "completed":
                break
            await anyio.sleep(0.05)
        assert store.get_job(job_id)["status"] == "completed"
    finally:
        await manager.stop()
