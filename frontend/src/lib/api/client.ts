import { useSettings } from "@/lib/store/settings";

/** Error thrown for any non-2xx API response. */
export class ApiError extends Error {
  status: number;
  detail: string;
  requestId?: string | null;
  argv?: string[] | null;

  constructor(status: number, detail: string, requestId?: string | null, argv?: string[] | null) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.requestId = requestId ?? null;
    this.argv = argv ?? null;
  }
}

export class NotConfiguredError extends Error {
  constructor() {
    super("API is not configured — set the server URL (and API key if required) first.");
    this.name = "NotConfiguredError";
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Override auth (e.g. omit the key when testing open-mode servers). */
  auth?: "auto" | "skip";
  signal?: AbortSignal;
}

/** Build the absolute URL for a backend path using the stored base URL. */
export function apiUrl(path: string): string {
  const base = useSettings.getState().baseUrl.replace(/\/+$/, "");
  return `${base}${path}`;
}

/** Authenticated JSON fetch against the LTX API. */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { baseUrl, apiKey } = useSettings.getState();
  if (!baseUrl) throw new NotConfiguredError();

  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.auth !== "skip" && apiKey) headers["X-API-Key"] = apiKey;

  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
      cache: "no-store",
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError(0, `Could not reach the LTX API server at ${baseUrl}. Is it running, and is CORS configured?`);
  }

  if (!res.ok) {
    let detail = `Request failed with status ${res.status}`;
    let requestId: string | null = null;
    let argv: string[] | null = null;
    try {
      const data = (await res.json()) as {
        detail?: string;
        request_id?: string | null;
        argv?: string[] | null;
      };
      if (typeof data.detail === "string") {
        detail = data.detail;
        requestId = data.request_id ?? null;
        argv = data.argv ?? null;
      }
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail, requestId, argv);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Fetch a binary blob (e.g. the generated MP4) with auth, as an object URL. */
export async function apiFetchBlobUrl(path: string, signal?: AbortSignal): Promise<string> {
  const { baseUrl, apiKey } = useSettings.getState();
  if (!baseUrl) throw new NotConfiguredError();

  const headers: Record<string, string> = {};
  if (apiKey) headers["X-API-Key"] = apiKey;

  const res = await fetch(apiUrl(path), { headers, signal, cache: "no-store" });
  if (!res.ok) {
    let detail = `Download failed with status ${res.status}`;
    try {
      const data = (await res.json()) as { detail?: string };
      if (data.detail) detail = data.detail;
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, detail);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
