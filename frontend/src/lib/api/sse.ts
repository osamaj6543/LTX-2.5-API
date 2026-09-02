import { useSettings } from "@/lib/store/settings";
import type { JobStatus } from "./types";

/**
 * Fetch-based SSE consumer for `GET /v1/jobs/{id}/events`.
 *
 * The browser EventSource API cannot send the X-API-Key header, so this
 * implements the SSE protocol manually over fetch + ReadableStream.
 * Wire format produced by the backend:
 *   event: status \n data: {"job_id": ..., "status": ...} \n\n
 *   event: log    \n data: {"job_id": ..., "line": ...}   \n\n
 *   : keepalive   \n\n
 */
export interface JobEventHandlers {
  onStatus?: (status: JobStatus) => void;
  onLog?: (line: string) => void;
  onError?: (err: Error) => void;
  onClose?: () => void;
}

export interface JobEventStream {
  close: () => void;
}

export function subscribeToJobEvents(
  jobId: string,
  handlers: JobEventHandlers,
  options: { signal?: AbortSignal } = {}
): JobEventStream {
  const controller = new AbortController();
  const cleanupFns: Array<() => void> = [];

  (options.signal as AbortSignal | undefined)?.addEventListener("abort", () => controller.abort());
  if (options.signal?.aborted) controller.abort();

  const run = async () => {
    const { baseUrl, apiKey } = useSettings.getState();
    try {
      const headers: Record<string, string> = { Accept: "text/event-stream" };
      if (apiKey) headers["X-API-Key"] = apiKey;

      const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/v1/jobs/${jobId}/events`, {
        headers,
        signal: controller.signal,
        cache: "no-store",
      });

      if (!res.ok || !res.body) {
        let detail = `Event stream failed with status ${res.status}`;
        try {
          const data = (await res.json()) as { detail?: string };
          if (data.detail) detail = data.detail;
        } catch {
          /* not JSON */
        }
        throw new Error(detail);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are delimited by a blank line.
        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          handleFrame(frame, handlers);
        }
      }
      handlers.onClose?.();
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        handlers.onClose?.();
      } else {
        handlers.onError?.(err as Error);
      }
    }
  };

  void run();

  return {
    close: () => {
      controller.abort();
      cleanupFns.forEach((fn) => fn());
    },
  };
}

function handleFrame(frame: string, handlers: JobEventHandlers) {
  let event = "message";
  let data = "";
  for (const rawLine of frame.split("\n")) {
    if (rawLine.startsWith(":")) continue; // keepalive comment
    if (rawLine.startsWith("event:")) {
      event = rawLine.slice(6).trim();
    } else if (rawLine.startsWith("data:")) {
      data += rawLine.slice(5).trim();
    }
  }
  if (!data) return;
  try {
    const parsed = JSON.parse(data) as { status?: JobStatus; line?: string };
    if (event === "status" && parsed.status) handlers.onStatus?.(parsed.status);
    else if (event === "log" && typeof parsed.line === "string") handlers.onLog?.(parsed.line);
  } catch {
    /* malformed frame — ignore */
  }
}
