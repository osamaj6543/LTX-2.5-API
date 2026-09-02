"use client";

import * as React from "react";
import Link from "next/link";
import { Play, Loader2, Clock } from "lucide-react";

import type { JobResponse } from "@/lib/api/types";
import { TERMINAL_STATUSES } from "@/lib/api/types";
import { getJobVideoUrl } from "@/lib/api/video-cache";
import { JobStatusBadge } from "@/components/status";
import { timeAgo, truncate, cn } from "@/lib/utils";

/**
 * Consumer-grade generation card: hover (or tap) loads the finished MP4 and
 * plays it inline as a muted preview; active jobs shimmer with their live
 * status. Clicking opens the full job view.
 */
export function VideoPreviewCard({ job, aspect = "aspect-video" }: { job: JobResponse; aspect?: string }) {
  const completed = job.status === "completed";
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = React.useState(false);
  const [previewFailed, setPreviewFailed] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);

  const loadPreview = React.useCallback(() => {
    if (!completed || previewUrl || loadingPreview || previewFailed) return;
    setLoadingPreview(true);
    getJobVideoUrl(job.job_id)
      .then((url) => {
        setPreviewUrl(url);
        // autoplay once mounted
        requestAnimationFrame(() => videoRef.current?.play().catch(() => undefined));
      })
      .catch(() => setPreviewFailed(true))
      .finally(() => setLoadingPreview(false));
  }, [completed, previewUrl, loadingPreview, previewFailed, job.job_id]);

  const prompt = String((job.params as Record<string, unknown> | undefined)?.["prompt"] ?? "");

  return (
    <Link
      href={`/jobs/${job.job_id}`}
      onMouseEnter={loadPreview}
      onFocus={loadPreview}
      onClick={loadPreview}
      className="group block overflow-hidden rounded-xl border bg-card transition-all duration-200 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5"
    >
      {/* Media area */}
      <div className={cn("relative w-full overflow-hidden bg-muted/50", aspect)}>
        {completed ? (
          previewUrl ? (
            <video
              ref={videoRef}
              src={previewUrl}
              muted
              loop
              playsInline
              preload="metadata"
              className="size-full object-cover"
            />
          ) : (
            <div className="relative flex size-full items-center justify-center bg-gradient-to-br from-primary/10 via-muted/40 to-fuchsia-500/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <span className="flex size-14 items-center justify-center rounded-full border border-border/60 bg-background/80 text-foreground shadow-lg backdrop-blur transition-transform group-hover:scale-110">
                {loadingPreview ? <Loader2 className="size-5 animate-spin text-primary" /> : <Play className="size-5 fill-current" />}
              </span>
              <span className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_40%,rgba(0,0,0,0.25)_100%)]" />
            </div>
          )
        ) : TERMINAL_STATUSES.includes(job.status) ? (
          <div className="flex size-full flex-col items-center justify-center gap-2 bg-muted/40">
            <p className="text-xs text-muted-foreground">
              {job.status === "failed" ? "Generation failed" : "Cancelled"}
            </p>
          </div>
        ) : (
          <div className="relative flex size-full flex-col items-center justify-center gap-3 overflow-hidden bg-muted/40">
            <div className="shimmer absolute inset-0" />
            <div className="relative flex flex-col items-center gap-2">
              <Loader2 className="size-5 animate-spin text-primary" />
              <p className="text-xs font-medium text-muted-foreground capitalize">{job.status.replace("_", " ")}</p>
            </div>
          </div>
        )}

        {/* Top-left overlay: status while active */}
        {!TERMINAL_STATUSES.includes(job.status) && (
          <div className="absolute top-2 left-2">
            <JobStatusBadge status={job.status} />
          </div>
        )}
        {completed && previewFailed && (
          <div className="absolute top-2 right-2 rounded-md bg-background/80 px-2 py-0.5 text-[10px] text-muted-foreground backdrop-blur">
            preview unavailable
          </div>
        )}
      </div>

      {/* Meta */}
      <div className="p-3.5">
        <p className="line-clamp-2 min-h-10 text-[13px] leading-5 font-medium">{truncate(prompt || "Untitled generation", 96)}</p>
        <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Clock className="size-3" />
            {timeAgo(job.created_at)}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase">{job.pipeline}</span>
            {job.duration_seconds != null && <span>{job.duration_seconds.toFixed(0)}s render</span>}
          </span>
        </div>
      </div>
    </Link>
  );
}
