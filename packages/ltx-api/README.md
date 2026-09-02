# ltx-api

Professional FastAPI wrapper around the **official** LTX pipelines —
`DistilledPipeline` (`python -m ltx_pipelines.distilled`) and
`TI2VidTwoStagesPipeline` (`python -m ltx_pipelines.ti2vid_two_stages`) — **only**.

## CLI parity — how it works

The API does not re-implement the pipelines or their argument handling. Every
generation request is:

1. serialised into the **exact argv tokens** a CLI user would type
   (`--prompt`, `--checkpoint-path`, `--lora PATH STRENGTH`, `--image PATH FRAME_IDX STRENGTH [CRF]`,
   `--auto-duration MIN MAX`, bare `--compile` vs `--compile KEY=VALUE ...`, …);
2. parsed by the **official argparse parsers** (`default_2_stage_distilled_arg_parser` /
   `default_2_stage_arg_parser` + `add_generated_keyframes_arg` + `resolve_cli_params`),
   with `sys.argv` staged the same way the CLIs see it;
3. executed with the same constructor / `pipeline(...)` / `encode_video` sequence
   the pipelines' own `main()` functions use.

Consequences: identical defaults, identical post-parse resolution (ModelPaths,
quantization policies, auto-duration frame snapping, HDR/VAE dtype) and identical
error messages. An invalid request fails with **422** carrying the CLI's own
argparse error text.

### CLI → API examples

CLI:

```bash
python -m ltx_pipelines.distilled \
  --prompt "A woman with long brown hair walks along a beach at sunset" \
  --checkpoint-path ltx-2.5/checkpoints/diffusion_pytorch_model.safetensors \
  --spatial-upsampler-path ltx-2.5/spatial_upsampler.safetensors \
  --auto-duration 4 8
```

API (equivalent):

```bash
curl -X POST http://localhost:8000/v1/generations/distilled \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{
    "prompt": "A woman with long brown hair walks along a beach at sunset",
    "checkpoint-path": "ltx-2.5/checkpoints/diffusion_pytorch_model.safetensors",
    "spatial-upsampler-path": "ltx-2.5/spatial_upsampler.safetensors",
    "auto-duration": {"min_seconds": 4, "max_seconds": 8}
  }'
```

The response is `202` with a `job_id`; poll `GET /v1/jobs/{job_id}`, download via
`GET /v1/jobs/{job_id}/video`, or stream live progress from
`GET /v1/jobs/{job_id}/events` (SSE). `POST /v1/generations/ti2vid` mirrors
`python -m ltx_pipelines.ti2vid_two_stages` the same way (guidance scales,
`--distilled-lora`, audio guider params, etc.).

## Endpoints

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/health` | open | Liveness probe |
| POST | `/v1/generations/distilled` | user | Submit a DistilledPipeline job |
| POST | `/v1/generations/ti2vid` | user | Submit a TI2VidTwoStagesPipeline job |
| POST | `/v1/uploads` | user | Upload a conditioning still (PNG/JPEG/WebP/EXR) |
| GET | `/v1/jobs` | user/admin | List jobs (users see their own) |
| GET | `/v1/jobs/{id}` | owner/admin | Status, timings, params echo |
| DELETE | `/v1/jobs/{id}` | owner/admin | **Cancel a queued job** (running jobs → `409`) |
| GET | `/v1/jobs/{id}/video` | owner/admin | Download the generated MP4 |
| GET | `/v1/jobs/{id}/logs` | owner/admin | Captured pipeline log (same output as the CLI console) |
| GET | `/v1/jobs/{id}/events` | owner/admin | SSE: state changes + log lines |
| GET | `/v1/health/details` | admin | Worker/queue/cache state + GPU name/VRAM |
| POST/GET/DELETE | `/v1/admin/keys` | admin | Issue / list / revoke API keys |
| GET | `/v1/admin/stats` | admin | Totals, success rate, avg duration, per-key usage |
| GET/POST/DELETE | `/v1/admin/pipelines` | admin | Inspect / preload / evict the warm pipeline cache |
| POST | `/v1/admin/queue/pause|resume|purge` | admin | Queue control |
| GET | `/v1/admin/config` | admin | Effective config (secrets redacted) |

## Administration

### Auth

API keys go in the `X-API-Key` header; they are stored **hashed** (SHA-256) in
SQLite. Bootstrap an admin key with the `LTX_API_ADMIN_KEY` env var, then mint
user keys via `POST /v1/admin/keys` (the raw key is shown exactly once). If no
keys exist at all the API runs open (trusted networks only).

### Operator defaults

Pin model paths server-side so clients only send a prompt (CLI flags still
override):

```yaml
# ltx-api.yaml
default_distilled:
  checkpoint_path: /models/ltx-2.5/checkpoints/diffusion_pytorch_model.safetensors
  spatial_upsampler_path: /models/ltx-2.5/spatial_upsampler.safetensors
allowed_roots: ["/models", "/data/uploads"]
admin_key: ${LTX_API_ADMIN_KEY}
```

`allowed_roots` confines every request-supplied file path (checkpoints, LoRAs,
conditioning images) — requests referencing paths outside them get `403`.

### Warm pipeline cache

Pipelines (tens of GB of weights) stay loaded between jobs; the cache key covers
everything that affects construction. Admins can `preload` a pipeline before
traffic, inspect usage, or `evict` to free VRAM. Exactly one job touches the GPU
at a time (single background worker).

### Job lifecycle & retention

`queued → parsing → loading_model → running → completed | failed | cancelled`.
State persists in SQLite across restarts; jobs interrupted mid-flight are
re-queued at boot. Finished outputs expire after `output_ttl_hours`, records
after `job_ttl_days`. Cancellation is queued-only by design — a job that owns
the GPU always runs to completion (in-process CUDA work cannot be interrupted
safely); `DELETE` on a running job returns `409` with an explanation.

## Running

```bash
uv sync                        # workspace-wide, includes ltx-api
uvicorn ltx_api.main:app --host 0.0.0.0 --port 8000
# or
python -m ltx_api
```

Interactive OpenAPI docs at `/docs`.

> **Deploying?** See the [Bare-Metal Deployment Guide](docs/bare-metal-deployment.md)
> for hardware requirements, systemd/nginx setup, config reference, and troubleshooting.

### Tests

```bash
uv run --package ltx-api pytest packages/ltx-api/tests
```

The suite runs without a GPU: the HTTP/job-manager tests monkeypatch the CLI
bridge; the one optional test that exercises the real official parser is skipped
automatically when the torch stack is unavailable.
