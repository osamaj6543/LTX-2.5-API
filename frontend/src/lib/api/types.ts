/**
 * TypeScript types mirroring the ltx-api Pydantic schemas 1:1.
 * Request bodies use the CLI kebab-case aliases the backend expects.
 */

export type PipelineType = "distilled" | "ti2vid";
export type JobStatus =
  | "queued"
  | "parsing"
  | "loading_model"
  | "running"
  | "encoding"
  | "completed"
  | "failed"
  | "cancelled";
export type Role = "admin" | "user";

export const TERMINAL_STATUSES: JobStatus[] = ["completed", "failed", "cancelled"];
export const ACTIVE_STATUSES: JobStatus[] = ["queued", "parsing", "loading_model", "running", "encoding"];

export const JOB_STAGE_ORDER: JobStatus[] = [
  "queued",
  "parsing",
  "loading_model",
  "running",
  "encoding",
  "completed",
];

export type QuantizationOption = "fp8-cast" | "fp8-scaled-mm" | "nvfp4-cast" | "nvfp4-prequant";
export type OffloadOption = "none" | "cpu" | "disk";
export type DiffVAEOptimization = "chunked_eager" | "chunked_compile" | "combined_compile" | "blackwell_dsl";
export type HDROption = "SRGB_LINEAR" | "ACESCG" | "ACESCCT";

export interface LoraSpec {
  path: string;
  strength?: number;
}

export interface ImageConditioning {
  path: string;
  frame_idx: number;
  strength: number;
  crf?: number;
}

export interface AutoDuration {
  min_seconds: number;
  max_seconds: number;
}

/** Fields shared by both generation endpoints (kebab-case = CLI aliases). */
export interface GenerationRequestBody {
  prompt: string;
  "spatial-upsampler-path"?: string;
  "checkpoint-path"?: string;
  "distilled-checkpoint-path"?: string;
  "gemma-root"?: string;
  "transformer-path"?: string;
  "text-encoder-path"?: string;
  "video-vae-path"?: string;
  "audio-vae-path"?: string;
  "duration-head-path"?: string;
  seed?: number;
  height?: number;
  width?: number;
  "num-frames"?: number;
  "auto-duration"?: AutoDuration;
  "frame-rate"?: number;
  image?: ImageConditioning[];
  "num-generated-keyframes"?: number;
  hdr?: HDROption;
  lora?: LoraSpec[];
  "enhance-prompt"?: boolean;
  "enhance-static-cache"?: boolean;
  "prompt-enhancer-gemma-root"?: string;
  quantization?: QuantizationOption;
  /** Empty list = `--compile` with CLI defaults. */
  compile?: string[];
  offload?: OffloadOption;
  "diffvae-optimization"?: DiffVAEOptimization;
  /** Web-app only: file this generation under a project (not a CLI flag). */
  project_id?: string;
}

export interface DistilledGenerationRequest extends GenerationRequestBody {}

export interface TI2VidGenerationRequest extends GenerationRequestBody {
  "distilled-lora"?: LoraSpec[];
  "num-inference-steps"?: number;
  "negative-prompt"?: string;
  "video-cfg-guidance-scale"?: number;
  "video-stg-guidance-scale"?: number;
  "video-rescale-scale"?: number;
  "video-stg-blocks"?: number[];
  "a2v-guidance-scale"?: number;
  "video-skip-step"?: number;
  "audio-cfg-guidance-scale"?: number;
  "audio-stg-guidance-scale"?: number;
  "audio-rescale-scale"?: number;
  "audio-stg-blocks"?: number[];
  "v2a-guidance-scale"?: number;
  "audio-skip-step"?: number;
  "max-batch-size"?: number;
}

export interface JobSubmitResponse {
  job_id: string;
  status: JobStatus;
  pipeline: PipelineType;
  queue_position: number;
  links: Record<string, string>;
}

export interface JobResponse {
  job_id: string;
  pipeline: PipelineType;
  status: JobStatus;
  detail?: string | null;
  queue_position?: number | null;
  params?: Record<string, unknown> | null;
  output_file?: string | null;
  download_url?: string | null;
  error?: string | null;
  project_id?: string | null;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  duration_seconds?: number | null;
  owner?: string | null;
}

export interface JobListResponse {
  jobs: JobResponse[];
  total: number;
  limit: number;
  offset: number;
}

export interface MessageResponse {
  detail: string;
}

export interface UploadResponse {
  path: string;
  filename: string;
  size_bytes: number;
}

export interface HealthResponse {
  status: string;
  version: string;
}

export interface GPUInfo {
  available: boolean;
  name?: string | null;
  capability?: string | null;
  memory_total_mb?: number | null;
  memory_used_mb?: number | null;
  memory_free_mb?: number | null;
  utilization_percent?: number | null;
}

export interface PipelineCacheEntry {
  key: string;
  pipeline: PipelineType;
  loaded_at?: string | null;
  last_used_at?: string | null;
  jobs_run: number;
}

export interface PipelineCacheResponse {
  max_entries: number;
  entries: PipelineCacheEntry[];
}

export interface HealthDetails {
  status: string;
  version: string;
  worker: Record<string, unknown>;
  queue: { depth: number; paused: boolean };
  cache: PipelineCacheResponse;
  gpus: GPUInfo[];
}

export interface KeyResponse {
  id: number;
  label?: string | null;
  role: Role;
  created_at: string;
  last_used_at?: string | null;
  revoked_at?: string | null;
}

export interface KeyCreatedResponse extends KeyResponse {
  /** The raw API key — shown exactly once. */
  key: string;
}

export interface StatsResponse {
  jobs: Record<string, unknown>;
  per_key: Record<string, unknown>[];
  uptime_seconds: number;
}

/* ------------------------------- projects ------------------------------ */

export type ProjectStatus = "active" | "archived";

export const PROJECT_COLORS = [
  "violet",
  "blue",
  "cyan",
  "emerald",
  "amber",
  "rose",
  "fuchsia",
  "slate",
] as const;

export type ProjectColor = (typeof PROJECT_COLORS)[number];

export interface ProjectResponse {
  project_id: string;
  name: string;
  description?: string | null;
  color: ProjectColor;
  status: ProjectStatus;
  pinned: boolean;
  owner?: string | null;
  job_count: number;
  completed_count: number;
  failed_count: number;
  total_render_seconds: number;
  last_activity_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectListResponse {
  projects: ProjectResponse[];
  total: number;
  limit: number;
  offset: number;
}

export interface ProjectCreatePayload {
  name: string;
  description?: string;
  color?: ProjectColor;
}

export interface ProjectUpdatePayload {
  name?: string;
  description?: string;
  color?: ProjectColor;
  status?: ProjectStatus;
  pinned?: boolean;
}
