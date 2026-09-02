"""Shared fixtures: temp settings + a TestClient whose pipelines are fakes.

No GPU / torch required: ``cli_bridge.parse_job`` and ``cli_bridge.execute`` are
monkeypatched, so tests exercise the full HTTP -> store -> queue -> worker flow
without touching the real pipelines.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from ltx_api import cli_bridge
from ltx_api.cli_bridge import ParsedJob
from ltx_api.config import Settings
from ltx_api.schemas import PipelineType
from ltx_api.server import create_app

ADMIN_HEADERS = {"X-API-Key": "admin-test-key"}


@pytest.fixture
def settings(tmp_path):
    return Settings(
        output_dir=tmp_path / "outputs",
        upload_dir=tmp_path / "uploads",
        db_path=tmp_path / "test.db",
        admin_key="admin-test-key",
        allowed_roots=[str(tmp_path)],
    )


@pytest.fixture
def fake_exec(settings, monkeypatch):
    """Monkeypatch the CLI bridge; returns the list of output paths executed."""
    calls: list[str] = []

    def fake_parse_job(ptype, data, output_path):
        return ParsedJob(ptype=ptype, args=None, cache_key="testkey", argv=["--fake"])

    def fake_execute(parsed, pipeline, output_path):
        calls.append(output_path)
        with open(output_path, "wb") as fh:
            fh.write(b"fake mp4 bytes")
        return "log line 1\nlog line 2\n"

    monkeypatch.setattr(cli_bridge, "parse_job", fake_parse_job)
    monkeypatch.setattr(cli_bridge, "execute", fake_execute)
    monkeypatch.setitem(cli_bridge.CONSTRUCTORS, PipelineType.distilled, lambda args: object())
    monkeypatch.setitem(cli_bridge.CONSTRUCTORS, PipelineType.ti2vid, lambda args: object())
    return calls


@pytest.fixture
def client(settings, fake_exec):
    with TestClient(create_app(settings)) as test_client:
        test_client.executed = fake_exec
        yield test_client


@pytest.fixture
def user_key(client):
    """Create a regular user key through the admin API; return its raw value."""
    response = client.post("/v1/admin/keys", json={"role": "user", "label": "tests"}, headers=ADMIN_HEADERS)
    assert response.status_code == 201, response.text
    return {"X-API-Key": response.json()["key"]}
