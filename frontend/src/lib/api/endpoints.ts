import { apiFetch } from "./client";
import type {
  DistilledGenerationRequest,
  HealthDetails,
  HealthResponse,
  JobListResponse,
  JobResponse,
  JobStatus,
  JobSubmitResponse,
  KeyCreatedResponse,
  KeyResponse,
  MessageResponse,
  PipelineCacheResponse,
  PipelineType,
  ProjectCreatePayload,
  ProjectListResponse,
  ProjectResponse,
  ProjectUpdatePayload,
  StatsResponse,
  TI2VidGenerationRequest,
  UploadResponse,
} from "./types";

/* ------------------------------- health ------------------------------- */

export const getHealth = (signal?: AbortSignal) =>
  apiFetch<HealthResponse>("/health", { auth: "skip", signal });

export const getHealthDetails = (signal?: AbortSignal) =>
  apiFetch<HealthDetails>("/v1/health/details", { signal });

/* ----------------------------- generations ---------------------------- */

export const submitDistilled = (body: DistilledGenerationRequest) =>
  apiFetch<JobSubmitResponse>("/v1/generations/distilled", { method: "POST", body });

export const submitTi2vid = (body: TI2VidGenerationRequest) =>
  apiFetch<JobSubmitResponse>("/v1/generations/ti2vid", { method: "POST", body });

export const uploadImage = async (file: File, signal?: AbortSignal): Promise<UploadResponse> => {
  const form = new FormData();
  form.append("file", file);
  const { baseUrl, apiKey } = (await import("@/lib/store/settings")).useSettings.getState();
  if (!baseUrl) {
    const { NotConfiguredError } = await import("./client");
    throw new NotConfiguredError();
  }
  const headers: Record<string, string> = {};
  if (apiKey) headers["X-API-Key"] = apiKey;
  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/v1/uploads`, {
    method: "POST",
    headers,
    body: form,
    signal,
  });
  if (!res.ok) {
    let detail = `Upload failed with status ${res.status}`;
    try {
      const data = (await res.json()) as { detail?: string };
      if (data.detail) detail = data.detail;
    } catch {
      /* not JSON */
    }
    const { ApiError } = await import("./client");
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as UploadResponse;
};

/* -------------------------------- jobs -------------------------------- */

export interface ListJobsParams {
  status?: JobStatus;
  projectId?: string;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}

export const listJobs = ({ status, projectId, limit = 50, offset = 0, signal }: ListJobsParams = {}) => {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (projectId) params.set("project_id", projectId);
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  return apiFetch<JobListResponse>(`/v1/jobs?${params.toString()}`, { signal });
};

/** Partial job update — currently used to move a job between projects. */
export const updateJob = (jobId: string, body: { project_id?: string | null }) =>
  apiFetch<JobResponse>(`/v1/jobs/${jobId}`, { method: "PATCH", body });

export const getJob = (jobId: string, signal?: AbortSignal) =>
  apiFetch<JobResponse>(`/v1/jobs/${jobId}`, { signal });

export const cancelJob = (jobId: string) =>
  apiFetch<MessageResponse>(`/v1/jobs/${jobId}`, { method: "DELETE" });

export const getJobLogs = async (jobId: string, signal?: AbortSignal): Promise<string[]> => {
  const data = await apiFetch<{ job_id: string; lines: string[] }>(`/v1/jobs/${jobId}/logs`, { signal });
  return data.lines;
};

/* -------------------------------- admin -------------------------------- */

export interface CreateKeyPayload {
  role: "admin" | "user";
  label?: string;
}

export const createKey = (body: CreateKeyPayload) =>
  apiFetch<KeyCreatedResponse>("/v1/admin/keys", { method: "POST", body });

export const listKeys = (signal?: AbortSignal) =>
  apiFetch<KeyResponse[]>("/v1/admin/keys", { signal });

export const revokeKey = (keyId: number) =>
  apiFetch<MessageResponse>(`/v1/admin/keys/${keyId}`, { method: "DELETE" });

export const getStats = (signal?: AbortSignal) =>
  apiFetch<StatsResponse>("/v1/admin/stats", { signal });

export const getPipelineCache = (signal?: AbortSignal) =>
  apiFetch<PipelineCacheResponse>("/v1/admin/pipelines", { signal });

export const preloadPipeline = (pipeline: PipelineType, params: Record<string, unknown>) =>
  apiFetch<MessageResponse>("/v1/admin/pipelines/preload", {
    method: "POST",
    body: { pipeline, params },
  });

export const evictPipeline = (key: string) =>
  apiFetch<MessageResponse>(`/v1/admin/pipelines/${encodeURIComponent(key)}`, { method: "DELETE" });

export const evictAllPipelines = () =>
  apiFetch<MessageResponse>("/v1/admin/pipelines", { method: "DELETE" });

export const pauseQueue = () =>
  apiFetch<MessageResponse>("/v1/admin/queue/pause", { method: "POST" });

export const resumeQueue = () =>
  apiFetch<MessageResponse>("/v1/admin/queue/resume", { method: "POST" });

export const purgeQueue = () =>
  apiFetch<MessageResponse>("/v1/admin/queue/purge", { method: "POST" });

export const getEffectiveConfig = (signal?: AbortSignal) =>
  apiFetch<Record<string, unknown>>("/v1/admin/config", { signal });

/* ------------------------------- projects ------------------------------ */

export interface ListProjectsParams {
  status?: "active" | "archived";
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}

export const listProjects = ({ status, limit = 100, offset = 0, signal }: ListProjectsParams = {}) => {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  return apiFetch<ProjectListResponse>(`/v1/projects?${params.toString()}`, { signal });
};

export const getProject = (projectId: string, signal?: AbortSignal) =>
  apiFetch<ProjectResponse>(`/v1/projects/${projectId}`, { signal });

export const createProject = (body: ProjectCreatePayload) =>
  apiFetch<ProjectResponse>("/v1/projects", { method: "POST", body });

export const updateProject = (projectId: string, body: ProjectUpdatePayload) =>
  apiFetch<ProjectResponse>(`/v1/projects/${projectId}`, { method: "PATCH", body });

export const deleteProject = (projectId: string) =>
  apiFetch<MessageResponse>(`/v1/projects/${projectId}`, { method: "DELETE" });

export const listProjectJobs = (
  projectId: string,
  { status, limit = 50, offset = 0, signal }: Omit<ListJobsParams, "projectId"> = {}
) => {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  return apiFetch<JobListResponse>(`/v1/projects/${projectId}/jobs?${params.toString()}`, { signal });
};
