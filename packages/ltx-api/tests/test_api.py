"""End-to-end API tests (pipelines faked; full HTTP -> worker flow exercised)."""

from __future__ import annotations

import time

from conftest import ADMIN_HEADERS

BODY = {
    "prompt": "a cat surfing a wave",
    "checkpoint-path": "C:/models/diffusion_pytorch_model.safetensors",
    "spatial-upsampler-path": "C:/models/spatial_upsampler.safetensors",
    "seed": 42,
    "num-frames": 121,
}


def test_health_open(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_auth_required_when_keys_exist(client):
    response = client.post("/v1/generations/distilled", json={"prompt": "x"})
    assert response.status_code == 401


def test_invalid_key_rejected(client):
    response = client.post("/v1/generations/distilled", json={"prompt": "x"}, headers={"X-API-Key": "nope"})
    assert response.status_code == 401


def test_submit_and_complete_distilled(client):
    response = client.post("/v1/generations/distilled", json=BODY, headers=ADMIN_HEADERS)
    assert response.status_code == 202, response.text
    data = response.json()
    job_id = data["job_id"]
    assert data["status"] == "queued"
    assert data["pipeline"] == "distilled"

    # Wait for the worker to finish (fake execution is instant).
    for _ in range(50):
        job = client.get(f"/v1/jobs/{job_id}", headers=ADMIN_HEADERS).json()
        if job["status"] == "completed":
            break
        time.sleep(0.1)
    assert job["status"] == "completed", job
    assert job["download_url"] == f"/v1/jobs/{job_id}/video"

    video = client.get(f"/v1/jobs/{job_id}/video", headers=ADMIN_HEADERS)
    assert video.status_code == 200
    assert video.content == b"fake mp4 bytes"

    logs = client.get(f"/v1/jobs/{job_id}/logs", headers=ADMIN_HEADERS).json()
    assert "log line 1" in logs["lines"]


def test_prompt_required(client):
    response = client.post("/v1/generations/distilled", json={}, headers=ADMIN_HEADERS)
    assert response.status_code == 422


def test_path_outside_allowlist_rejected(client):
    response = client.post(
        "/v1/generations/distilled",
        json={"prompt": "x", "checkpoint-path": "C:/elsewhere/model.safetensors"},
        headers=ADMIN_HEADERS,
    )
    assert response.status_code == 422


def test_unknown_job_404(client):
    response = client.get("/v1/jobs/doesnotexist", headers=ADMIN_HEADERS)
    assert response.status_code == 404


def test_user_sees_only_own_jobs(client, user_key):
    made = client.post("/v1/generations/distilled", json=BODY, headers=ADMIN_HEADERS).json()["job_id"]
    listing = client.get("/v1/jobs", headers=user_key).json()
    assert all(job["job_id"] != made for job in listing["jobs"])
    own = client.post("/v1/generations/distilled", json=BODY, headers=user_key).json()["job_id"]
    assert client.get(f"/v1/jobs/{own}", headers=user_key).status_code == 200
    # A user cannot read someone else's job…
    assert client.get(f"/v1/jobs/{made}", headers=user_key).status_code == 403
    # …but an admin can.
    assert client.get(f"/v1/jobs/{own}", headers=ADMIN_HEADERS).status_code == 200


def test_admin_endpoints_rejected_for_user(client, user_key):
    assert client.get("/v1/admin/stats", headers=user_key).status_code == 403
    assert client.post("/v1/admin/queue/pause", headers=user_key).status_code == 403


def test_queue_pause_resume_and_purge(client):
    assert client.post("/v1/admin/queue/pause", headers=ADMIN_HEADERS).status_code == 200
    made = client.post("/v1/generations/distilled", json=BODY, headers=ADMIN_HEADERS).json()["job_id"]
    assert client.post("/v1/admin/queue/purge", headers=ADMIN_HEADERS).json()["detail"].startswith("Purged 1")
    assert client.post("/v1/admin/queue/resume", headers=ADMIN_HEADERS).status_code == 200
    job = client.get(f"/v1/jobs/{made}", headers=ADMIN_HEADERS).json()
    assert job["status"] == "cancelled"


def test_cancel_running_conflicts(client, monkeypatch):
    # Make execution slow enough that the job is 'running' when we try to cancel.
    import ltx_api.cli_bridge as bridge

    def slow_execute(parsed, pipeline, output_path):
        time.sleep(0.6)
        with open(output_path, "wb") as fh:
            fh.write(b"x")
        return ""

    monkeypatch.setattr(bridge, "execute", slow_execute)
    job_id = client.post("/v1/generations/distilled", json=BODY, headers=ADMIN_HEADERS).json()["job_id"]
    time.sleep(0.25)  # parse + load are instant fakes; the job is now running
    response = client.delete(f"/v1/jobs/{job_id}", headers=ADMIN_HEADERS)
    assert response.status_code == 409
    assert "cannot be interrupted" in response.json()["detail"]


def test_health_details_and_config(client):
    details = client.get("/v1/health/details", headers=ADMIN_HEADERS).json()
    assert details["status"] == "ok"
    assert details["worker"]["running"] is True
    cfg = client.get("/v1/admin/config", headers=ADMIN_HEADERS).json()
    assert cfg["admin_key"] == "***redacted***"
