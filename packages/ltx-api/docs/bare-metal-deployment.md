# Bare-Metal Deployment Guide (ltx-api)

Deploy the LTX-2.5 Generation API directly on a GPU host — no containers, no
orchestrator. This guide covers hardware, OS setup, dependency installation,
model downloads, configuration, process management (systemd), a reverse proxy,
and operational concerns (updates, backups, monitoring, troubleshooting).

For the API surface itself (endpoints, auth model, CLI parity), see the
[ltx-api README](../README.md). For pipeline flags exposed through the API, see
[Common CLI flags](../../ltx-pipelines/docs/installation.md#common-cli-flags).

---

## 1. Architecture on bare metal

A single host runs:

- **uvicorn** (ASGI) serving the FastAPI app (`ltx_api.main:app`);
- **SQLite** for job records and API keys (a single file on local disk);
- one **background GPU worker** inside the API process — exactly one job
  touches the GPU at a time; pipelines (tens of GB of weights) stay warm in an
  in-process cache between jobs.

Because the GPU worker, pipeline cache, and SQLite state all live in one
process on one machine, **run exactly one API process per host** (a single
uvicorn worker). Do not use `--workers N` with uvicorn: multiple processes
would each hold their own pipeline cache and race the GPU and the SQLite file.

State lives entirely in the working directory by default:

| Path          | Purpose                          | Configurable via        |
| ------------- | -------------------------------- | ----------------------- |
| `outputs/`    | generated MP4s (TTL-managed)     | `LTX_API_OUTPUT_DIR`    |
| `uploads/`    | conditioning stills              | `LTX_API_UPLOAD_DIR`    |
| `ltx_api.db`  | SQLite: jobs, keys, usage stats  | `LTX_API_DB_PATH`       |

---

## 2. Hardware requirements

- **GPU**: NVIDIA CUDA GPU. Bare minimum is FP8-capable (Ada or newer, e.g.
  RTX 4090) running the distilled pipeline with `quantization: fp8-cast` and
  `offload: cpu`. Datacenter GPUs (Hopper H100 / Blackwell B200) give the best
  latency and unlock `fp8-scaled-mm` and `blackwell_dsl` VAE decode.
- **System RAM**: ≥ 64 GB recommended. `offload: cpu` holds transformer
  weights in RAM; `offload: disk` streams from disk when RAM is short (slower).
- **Disk**: ≥ 100 GB free — the LTX-2.5 checkpoint set is roughly **66 GiB**,
  plus outputs, uploads, and the SQLite database. Prefer NVMe.
- **Network**: outbound access to Hugging Face for the model download (one
  time) and PyPI for packages.

---

## 3. OS and software prerequisites

Linux is strongly recommended (the fastest VAE path, `natten`, is Linux +
CUDA only; the compiled `ltx-kernels` extra and multi-GPU features are
Linux-only). Windows works but falls back to slower attention/VAE backends.

1. **NVIDIA driver** — recent enough for CUDA 13.2 user-space libraries (the
   pinned torch wheels are `cu132`). A driver from the 570+ series is a safe
   choice. Verify with `nvidia-smi`.
2. **Python 3.11+** — the API declares `requires-python >= 3.10`; the repo's
   tooling targets 3.11. Install via your distro or `uv python install 3.11`.
3. **uv** — the workspace dependency manager:

   ```bash
   curl -LsSf https://astral.sh/uv/install.sh | sh
   ```

4. **Build tools** — `gcc`, `git`, and headers (`build-essential` on Debian/
   Ubuntu), needed by some source distributions.
5. Optional — **compiled kernels** (`ltx-kernels`: blockwise FP8/FP6 GEMM,
   multi-GPU all2all): requires a CUDA 13.2 toolchain (`nvcc`). You do **not**
   need a system CUDA toolkit otherwise — the natten path pulls pinned CUDA
   wheels through pip. Opt in with `uv sync --group kernels` on a CUDA host.

---

## 4. Installation

### 4.1 Get the code

```bash
sudo useradd -m -s /bin/bash ltx
sudo -iu ltx
git clone https://github.com/osamaj6543/LTX-2.5-API.git
cd LTX-2.5-API
```

### 4.2 Sync the Python environment

```bash
uv sync --extra natten          # recommended on Linux+CUDA: fastest diffusion VAE decoder
# or plain, if not on Linux:
uv sync
```

This creates `.venv` in the repo root and installs the whole workspace,
including `ltx-api` and `ltx-pipelines`. Torch resolves to **2.13.0+cu132**
on Linux; the workspace also pins `nvidia-cudnn-cu13==9.24.0.43` on Linux to
avoid a known cuDNN sublibrary mismatch (see Troubleshooting).

Optional speed-ups (install after `uv sync`):

```bash
uv pip install 'flash-attn-4==4.0.0b9'   # datacenter Blackwell (B200) only
# Hopper (H100): install the FlashAttention 3 wheel matching torch 2.13+cu132
```

An installed attention backend is picked up automatically at runtime.

### 4.3 Smoke-test the GPU stack

Before exposing the API, confirm CUDA works end to end:

```bash
uv run python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```

### 4.4 Download the models

~66 GiB from the gated Hugging Face repo (accept the model terms first; a
**Read** token is sufficient):

```bash
uv pip install "huggingface_hub[cli]"    # one-time, into .venv
uv run hf auth login
uv run hf download Lightricks/LTX-2.5 \
    diffusion_models/ltx-2.5-22b-distilled-transformer-bf16.safetensors \
    text_encoders/gemma4-12b-with-proj-ltx-2.5-bf16.safetensors \
    vae/ltx-2.5-video-vae-bf16.safetensors \
    vae/ltx-2.5-audio-vae-bf16.safetensors \
    latent_upscale_models/ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors \
    --local-dir /models/ltx-2.5
```

Put models on a dedicated volume (here `/models`) outside the repo, so code
deploys never touch weights.

---

## 5. Configuration

Every setting is an environment variable prefixed with `LTX_API_`, or a key in
a YAML file pointed to by `LTX_API_CONFIG_FILE`. Precedence: **env vars > YAML
file > defaults**. The API process must be able to read the config file; keep
it out of the repo if it contains secrets.

### 5.1 Recommended production config

`/etc/ltx-api/ltx-api.yaml`:

```yaml
host: 127.0.0.1            # bind loopback; TLS termination happens in nginx
port: 8000

# Pin model paths server-side so clients only send a prompt.
default_distilled:
  transformer_path:       /models/ltx-2.5/diffusion_models/ltx-2.5-22b-distilled-transformer-bf16.safetensors
  text_encoder_path:      /models/ltx-2.5/text_encoders/gemma4-12b-with-proj-ltx-2.5-bf16.safetensors
  video_vae_path:         /models/ltx-2.5/vae/ltx-2.5-video-vae-bf16.safetensors
  audio_vae_path:         /models/ltx-2.5/vae/ltx-2.5-audio-vae-bf16.safetensors
  spatial_upsampler_path: /models/ltx-2.5/latent_upscale_models/ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors
  quantization: fp8-cast        # fp8-scaled-mm on fp8 checkpoints + Hopper+
  offload: cpu                  # use "disk" if RAM is tight

# Same idea for the two-stage pipeline:
default_ti2vid:
  transformer_path:  /models/ltx-2.5/diffusion_models/ltx-2.5-22b-distilled-transformer-bf16.safetensors
  text_encoder_path: /models/ltx-2.5/text_encoders/gemma4-12b-with-proj-ltx-2.5-bf16.safetensors
  video_vae_path:    /models/ltx-2.5/vae/ltx-2.5-video-vae-bf16.safetensors
  audio_vae_path:    /models/ltx-2.5/vae/ltx-2.5-audio-vae-bf16.safetensors

# Confine every request-supplied file path (checkpoints, LoRAs, uploads).
allowed_roots: ["/models", "/data/ltx"]

output_dir: /data/ltx/outputs
upload_dir: /data/ltx/uploads
db_path:    /data/ltx/ltx_api.db

max_cached_pipelines: 1           # keep the warm pipeline loaded between jobs
output_ttl_hours: 24
job_ttl_days: 7
log_level: INFO
```

Notes:

- Pass the bootstrap admin key as the `LTX_API_ADMIN_KEY` **environment
  variable** in the systemd unit (§6) rather than in YAML — it is persisted
  (hashed, SHA-256) on first boot, and additional user keys are minted via
  `POST /v1/admin/keys` (the raw key is shown exactly once).
- With no API keys at all the API runs **open** — acceptable only on a trusted
  network. Always set `LTX_API_ADMIN_KEY` in production.
- `allowed_roots` confines every request-supplied path; the `uploads` and
  `outputs` directories are always allowed. Requests referencing paths outside
  the roots get `403`.

### 5.2 Key environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `LTX_API_CONFIG_FILE` | – | YAML file layered under env vars |
| `LTX_API_ADMIN_KEY` | – | Bootstrap admin key (hashed at rest) |
| `LTX_API_HOST` / `LTX_API_PORT` | `0.0.0.0` / `8000` | Bind address |
| `LTX_API_OUTPUT_DIR` | `outputs` | Generated videos |
| `LTX_API_UPLOAD_DIR` | `uploads` | Uploaded conditioning stills |
| `LTX_API_DB_PATH` | `ltx_api.db` | SQLite database file |
| `LTX_API_ALLOWED_ROOTS` | `[]` | JSON list of path allowlist roots |
| `LTX_API_MAX_QUEUE_SIZE` | `100` | Job queue depth |
| `LTX_API_MAX_QUEUED_PER_KEY` | `10` | Per-API-key queue cap |
| `LTX_API_MAX_UPLOAD_MB` | `50` | Conditioning image upload cap |
| `LTX_API_OUTPUT_TTL_HOURS` | `24` | Output file retention |
| `LTX_API_JOB_TTL_DAYS` | `7` | Job record retention |
| `LTX_API_MAX_CACHED_PIPELINES` | `1` | `-1` unbounded, `0` no cache |
| `LTX_API_CORS_ORIGINS` | `[]` | JSON list of CORS origins |
| `LTX_API_LOG_LEVEL` | `INFO` | Log verbosity |

### 5.3 Directories and permissions

```bash
sudo mkdir -p /etc/ltx-api /data/ltx /models
sudo chown -R ltx:ltx /data/ltx
```

The API creates `output_dir`, `upload_dir` and the DB parent on startup.

---

## 6. Process management with systemd

`/etc/systemd/system/ltx-api.service`:

```ini
[Unit]
Description=LTX-2.5 Generation API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ltx
Group=ltx
WorkingDirectory=/home/ltx/LTX-2.5-API
EnvironmentFile=/etc/ltx-api/env
ExecStart=/home/ltx/LTX-2.5-API/.venv/bin/uvicorn ltx_api.main:app \
    --host 127.0.0.1 --port 8000 \
    --workers 1 --timeout-keep-alive 120
Restart=on-failure
RestartSec=5

# Jobs interrupted mid-flight are re-queued on boot; give shutdown time for
# the in-process CUDA work (which cannot be interrupted safely) to finish.
TimeoutStopSec=1800
KillSignal=SIGTERM

# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=/data/ltx /home/ltx/LTX-2.5-API

[Install]
WantedBy=multi-user.target
```

`/etc/ltx-api/env` (mode `600`):

```bash
LTX_API_CONFIG_FILE=/etc/ltx-api/ltx-api.yaml
# Generate with: python -c "import secrets; print(secrets.token_urlsafe(32))"
LTX_API_ADMIN_KEY=<admin-key>
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ltx-api
sudo systemctl status ltx-api
journalctl -u ltx-api -f          # live logs
```

Interruption semantics worth knowing before writing runbooks: job state
persists in SQLite, and **jobs interrupted mid-flight are re-queued at boot**;
cancellation is queued-only by design (a running job always finishes — a
`DELETE` on it returns `409`).

---

## 7. Reverse proxy (nginx) with TLS

The API serves uploads/downloads and SSE streams. Put nginx in front for TLS
and buffering control:

```nginx
server {
    listen 443 ssl http2;
    server_name ltx.example.com;

    ssl_certificate     /etc/letsencrypt/live/ltx.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ltx.example.com/privkey.pem;

    client_max_body_size 60m;   # above LTX_API_MAX_UPLOAD_MB (default 50)

    location / {
        proxy_pass         http://127.0.0.1:8000;
        proxy_set_header   Host $host;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;

        # SSE: GET /v1/jobs/{id}/events streams progress live
        proxy_buffering    off;
        proxy_read_timeout 3600s;   # long-running job event streams
        proxy_http_version 1.1;
        proxy_set_header   Connection "";
    }
}
```

If you terminate TLS at the proxy, keep `host: 127.0.0.1` in the API config so
the app is not directly reachable on the LAN.

---

## 8. Post-deployment verification

```bash
# 1. Liveness (unauthenticated)
curl -s http://127.0.0.1:8000/health
# -> {"status":"ok","version":"0.1.0"}

# 2. Admin detail check: worker/queue/cache state, GPU name and VRAM
curl -s -H "X-API-Key: $ADMIN_KEY" http://127.0.0.1:8000/v1/health/details

# 3. Mint a user key (raw key is shown exactly once)
curl -s -X POST -H "X-API-Key: $ADMIN_KEY" -H "Content-Type: application/json" \
    -d '{"label":"ci-bot","role":"user"}' http://127.0.0.1:8000/v1/admin/keys

# 4. Submit a generation and poll
curl -s -X POST -H "X-API-Key: $USER_KEY" -H "Content-Type: application/json" \
    -d '{"prompt":"A woman with long brown hair walks along a beach at sunset",
         "auto-duration":{"min_seconds":4,"max_seconds":8}}' \
    http://127.0.0.1:8000/v1/generations/distilled
curl -s -H "X-API-Key: $USER_KEY" http://127.0.0.1:8000/v1/jobs/<job_id>

# 5. Preload the pipeline so the first real request doesn't pay load time
curl -s -X POST -H "X-API-Key: $ADMIN_KEY" http://127.0.0.1:8000/v1/admin/pipelines
```

Interactive OpenAPI docs are served at `/docs` (protect or disable at the proxy
if the host is internet-facing).

---

## 9. Operations

### Updates

```bash
sudo -iu ltx
cd ~/LTX-2.5-API
git pull
uv sync --extra natten
sudo systemctl restart ltx-api
```

Queued/in-flight jobs survive restarts via SQLite; interrupted running jobs are
re-queued automatically at boot.

### Backups

The only durable state is:

- `db_path` — jobs, API keys (hashed), usage stats. Back up with SQLite online
  backup or `cp` while the service is stopped.
- `output_dir` — only if you need outputs beyond `output_ttl_hours`.
- `/etc/ltx-api/` — config and the admin key (treat as a secret).

Model weights are re-downloadable; don't back them up.

### Monitoring

- Scrape `GET /health` (no auth) for liveness; `GET /v1/health/details` (admin)
  for worker/queue/cache state and GPU name/VRAM.
- `nvidia-smi` / DCGM for GPU temperature, memory, and utilization.
- Watch SQLite growth: job records expire after `job_ttl_days`, output files
  after `output_ttl_hours`; the in-process cleanup task runs every
  `cleanup_interval_seconds` (default 900 s).
- The API adds `x-request-id` and `x-process-time-ms` headers to every
  response and logs one line per request — ship `journalctl -u ltx-api` output
  to your log aggregator.

### Capacity notes

- One job owns the GPU at a time; additional requests queue (bounded by
  `max_queue_size` and `max_queued_per_key`). Scale by adding hosts behind the
  proxy, each with its own `db_path` and output volume — this API is not
  multi-host aware.
- The warm pipeline cache (`max_cached_pipelines`) trades VRAM/RAM for latency;
  admins can evict at runtime via `DELETE /v1/admin/pipelines/{id}` to free VRAM.

---

## 10. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `CUDNN_STATUS_SUBLIBRARY_VERSION_MISMATCH` at first attention call | A system cuDNN is shadowing the wheel's cuDNN, or a mismatched wheel got installed. The workspace pins `nvidia-cudnn-cu13==9.24.0.43` (Linux) precisely for this — re-run `uv sync --extra natten --frozen` and don't inject other cuDNN versions. |
| `Cannot load symbol cublasLtGetVersion` (process abort, not exception) | torch/cuDNN wheel version skew. Same fix as above. |
| `torch.cuda.is_available()` is `False` | Driver too old for the cu132 wheels, or a different torch got installed into the venv. Check `nvidia-smi` and re-run `uv sync --extra natten`. |
| 401/403 downloading models | Accept the model terms on Hugging Face and use a Read token (fine-grained tokens need "read gated repos"). |
| First generation is very slow | Pipeline load + (optional) `torch.compile` warm-up. Preload via `POST /v1/admin/pipelines`; keep `max_cached_pipelines: 1` so weights stay warm. |
| OOM on modest GPUs | Set `quantization: fp8-cast` and `offload: cpu` (or `disk`) in `default_distilled` / `default_ti2vid`. |
| `403 ... outside the allowed roots` on a request | Request-supplied path is not under `allowed_roots`. Add the root or send the file via `POST /v1/uploads`. |
| SSE stream closes early behind nginx | Ensure `proxy_buffering off` and a long `proxy_read_timeout` (§7). |
| Job stuck in `queued` after restart | It was re-queued at boot — check worker state via `GET /v1/health/details`; a crash-looping service shows up in `journalctl -u ltx-api`. |
| API returns 422 with argparse error text | The request failed official-CLI parsing (CLI parity by design). The message matches what `python -m ltx_pipelines.distilled --help` would tell you. |





