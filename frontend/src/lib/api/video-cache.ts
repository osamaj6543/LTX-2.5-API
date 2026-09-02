import { apiFetchBlobUrl } from "./client";

/**
 * Module-level cache of generated MP4 object URLs, keyed by job id.
 * The <video> tag cannot send the X-API-Key header, so clips are fetched as
 * authed blobs and reused across the app (home grid, library, etc.).
 */
const cache = new Map<string, Promise<string>>();

export function getJobVideoUrl(jobId: string): Promise<string> {
  let entry = cache.get(jobId);
  if (!entry) {
    entry = apiFetchBlobUrl(`/v1/jobs/${jobId}/video`);
    entry.catch(() => cache.delete(jobId));
    cache.set(jobId, entry);
  }
  return entry;
}

export function dropJobVideoUrl(jobId: string): void {
  void cache.get(jobId)?.then((url) => URL.revokeObjectURL(url)).catch(() => undefined);
  cache.delete(jobId);
}
