# LTX Studio — Frontend

Professional web UI for the **LTX-2.5 Generation API** (`packages/ltx-api`), built with
**Next.js 15 (App Router) · Tailwind CSS v4 · shadcn/ui · TanStack Query · React Hook Form**.

## Features

- **Generation Studio** (`/studio`) — full CLI-parity forms for both pipelines:
  - Distilled (fast) and TI2Vid (guided) with negative prompt, guidance/STG/rescale/skip controls
  - Image conditioning with drag-and-drop upload (`POST /v1/uploads`) and per-slot frame index / strength / CRF
  - Resolution presets + custom size, auto-duration vs fixed frames, frame rate, seed with randomize
  - LoRA adapters (incl. distilled LoRAs), quantization, offload, DiffVAE optimization, torch.compile, HDR
  - Model path overrides (normally pinned server-side by the operator)
- **Live job view** (`/jobs/[id]`) — SSE streaming of pipeline logs (custom fetch-based SSE
  consumer, since `EventSource` can't send the `X-API-Key` header), animated stage stepper,
  inline MP4 player (authed blob fetch), download, queued-job cancellation, failure reasons
- **Jobs gallery** (`/jobs`) — status/pipeline filters, pagination, auto-refresh while jobs are
  active, cancel queued jobs inline
- **Admin dashboard** (`/admin`) — role-gated: server overview + GPU VRAM bars, stats,
  API key issue/revoke (raw key shown once), warm pipeline cache preload/evict, queue
  pause/resume/purge, effective config viewer
- **Setup / connection** (`/setup`) + settings dialog — server URL + `X-API-Key`, stored in
  `localStorage` only (this app is fully client-side; there is no Next.js server session)
- Dark-first theming (light/dark/system), fully responsive, glassmorphic header, toasts,
  skeletons, empty states

## Getting started

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
```

Open `http://localhost:3000`, click the gear icon (or visit `/setup`) and point the app at your
API server (default `http://localhost:8000`). Provide an `X-API-Key` if the server has keys
configured; leave empty for open-mode servers.

### CORS (required)

The browser calls the API directly, so the FastAPI server must allow the frontend origin:

```bash
# environment variable on the API server
LTX_API_CORS_ORIGINS=["http://localhost:3000"]
```

(or add `cors_origins: ["http://localhost:3000"]` to the YAML config — see
`packages/ltx-api/README.md`).

### Production build

```bash
npm run build
npm start
```

## Project layout

```
src/
  app/                     # App Router pages: /, /setup, /studio, /jobs, /jobs/[jobId], /admin
  components/
    ui/                    # shadcn/ui primitives (hand-authored, Tailwind v4)
    studio/                # Generation studio form + image conditioning + advanced params
    jobs/                  # Job detail live view
    admin/                 # Admin panels (keys, cache, queue, config)
  lib/
    api/                  # Typed API client, endpoints, SSE consumer, types (mirrors Pydantic schemas)
    store/                # zustand persisted settings (base URL + API key)
```

## Security notes

- API keys live only in the browser's `localStorage` and are sent as the `X-API-Key` header.
- The MP4 download/video uses an authenticated `fetch` → object URL (the `<video>` tag cannot
  send custom headers).
- Admin pages call admin-only endpoints and gracefully show an "Admin access required" state
  for user keys.
