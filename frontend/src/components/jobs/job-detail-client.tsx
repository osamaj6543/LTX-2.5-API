"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Ban, Download, Loader2, Terminal } from "lucide-react";
import { toast } from "sonner";

import { cancelJob, getJob } from "@/lib/api/endpoints";
import { apiFetchBlobUrl, ApiError } from "@/lib/api/client";
import { subscribeToJobEvents } from "@/lib/api/sse";
import { JobStatusBadge, statusLabel } from "@/components/status";
import { cn, formatDateTime, formatDuration, timeAgo, truncate } from "@/lib/utils";
import { TERMINAL_STATUSES } from "@/lib/api/types";
import type { JobResponse, JobStatus } from "@/lib/api/types";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

export function JobDetailClient({ jobId }: { jobId: string }) {
  const queryClient = useQueryClient();
  const [liveStatus, setLiveStatus] = React.useState<JobStatus | null>(null);
  const [logs, setLogs] = React.useState<string[]>([]);
  const [videoUrl, setVideoUrl] = React.useState<string | null>(null);
  const [videoError, setVideoError] = React.useState<string | null>(null);
  const [autoscroll, setAutoscroll] = React.useState(true);
  const logRef = React.useRef<HTMLDivElement>(null);

  const { data: job, isPending, isError, error } = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => getJob(jobId),
    refetchInterval: (query) => {
      const s = (query.state.data as JobResponse | undefined)?.status;
      return s && TERMINAL_STATUSES.includes(s) ? false : 2500;
    },
  });

  const status: JobStatus | undefined = liveStatus ?? job?.status;

  /* Live SSE stream while the job is running. */
  React.useEffect(() => {
    if (!status || TERMINAL_STATUSES.includes(status)) return;
    const stream = subscribeToJobEvents(jobId, {
      onStatus: (s) => {
        setLiveStatus(s);
        void queryClient.invalidateQueries({ queryKey: ["job", jobId] });
      },
      onLog: (line) => setLogs((prev) => [...prev.slice(-2000), line]),
      onError: () => void queryClient.invalidateQueries({ queryKey: ["job", jobId] }),
    });
    return () => stream.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, status === undefined]);

  /* Fetch the finished MP4 as an authed blob. */
  React.useEffect(() => {
    if (status !== "completed" || videoUrl || videoError) return;
    let cancelled = false;
    let url: string | null = null;
    (async () => {
      try {
        url = await apiFetchBlobUrl(`/v1/jobs/${jobId}/video`);
        if (!cancelled) setVideoUrl(url);
      } catch (err) {
        if (!cancelled) setVideoError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, jobId]);

  React.useEffect(() => {
    if (autoscroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs, autoscroll]);

  const cancelMutation = useMutation({
    mutationFn: () => cancelJob(jobId),
    onSuccess: (res) => {
      toast.success(res.detail);
      void queryClient.invalidateQueries({ queryKey: ["job", jobId] });
    },
    onError: (err) =>
      toast.error("Could not cancel", {
        description: err instanceof ApiError ? err.detail : (err as Error).message,
      }),
  });

  if (isError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-lg font-semibold text-destructive">Job unavailable</p>
        <p className="mt-2 text-sm text-muted-foreground">{(error as Error).message}</p>
        <Link href="/jobs" className="mt-6 inline-block">
          <Button variant="outline" className="gap-2"><ArrowLeft /> Back to jobs</Button>
        </Link>
      </div>
    );
  }

  if (isPending || !job || !status) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-6 h-64 w-full rounded-xl" />
        <Skeleton className="mt-6 h-48 w-full rounded-xl" />
      </div>
    );
  }

  const prompt = String((job.params as Record<string, unknown> | undefined)?.["prompt"] ?? "—");
  const negative = (job.params as Record<string, unknown> | undefined)?.["negative-prompt"];
  const terminal = TERMINAL_STATUSES.includes(status);
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/jobs">
            <Button variant="ghost" size="icon" aria-label="Back"><ArrowLeft /></Button>
          </Link>
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
              <JobStatusBadge status={status} />
              <span className="font-mono text-sm text-muted-foreground">{job.job_id.slice(0, 12)}</span>
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {job.pipeline} pipeline · created {formatDateTime(job.created_at)} ({timeAgo(job.created_at)})
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status === "queued" && (
            <Button variant="outline" size="sm" className="gap-2" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>
              <Ban /> {cancelMutation.isPending ? "Cancelling…" : "Cancel job"}
            </Button>
          )}
          {status === "completed" && videoUrl && (
            <a href={videoUrl} download={`${job.job_id}.mp4`}>
              <Button variant="outline" size="sm" className="gap-2"><Download /> Download MP4</Button>
            </a>
          )}
        </div>
      </div>

      <StageStepper status={status} />

      {status === "completed" && (
        <Card className="mt-6 overflow-hidden py-0">
          <CardContent className="p-0">
            {videoUrl ? (
              <video src={videoUrl} controls autoPlay loop playsInline className="aspect-video w-full bg-black" />
            ) : videoError ? (
              <div className="flex aspect-video items-center justify-center text-sm text-muted-foreground">{videoError}</div>
            ) : (
              <div className="flex aspect-video items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="animate-spin" /> Loading video…
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {status === "failed" && job.error && (
        <Card className="mt-6 border-destructive/40">
          <CardHeader><CardTitle className="text-sm text-destructive">Failure reason</CardTitle></CardHeader>
          <CardContent className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
            {job.error}
          </CardContent>
        </Card>
      )}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Terminal className="size-4 text-primary" />
              Pipeline output
            </CardTitle>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={autoscroll} onChange={(e) => setAutoscroll(e.target.checked)} className="accent-primary" />
              Auto-scroll
            </label>
          </CardHeader>
          <CardContent>
            <div ref={logRef} className="terminal h-80 overflow-y-auto rounded-lg border p-3 scrollbar-slim">
              {logs.length === 0 && (
                <span className="text-zinc-500">{terminal ? "No live log was captured for this job." : "Waiting for pipeline output…"}</span>
              )}
              {logs.map((line, i) => (
                <div key={i} className={cn("log-line", logLevel(line))}>
                  <span className="mr-2 select-none text-zinc-600">{String(i + 1).padStart(3, "0")}</span>
                  {line}
                </div>
              ))}
              {!terminal && <span className="inline-block h-4 w-2 animate-pulse-soft bg-violet-400 align-middle" />}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Prompt</p>
              <p className="mt-1 whitespace-pre-wrap rounded-lg bg-muted/50 p-2 text-xs leading-relaxed">{prompt}</p>
            </div>
            {typeof negative === "string" && negative.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">Negative prompt</p>
                <p className="mt-1 whitespace-pre-wrap rounded-lg bg-muted/50 p-2 text-xs leading-relaxed">{negative}</p>
              </div>
            )}
            <Separator />
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <Detail label="Status" value={statusLabel(status)} />
              <Detail label="Queue position" value={job.queue_position != null ? String(job.queue_position) : "—"} />
              <Detail label="Started" value={job.started_at ? formatDateTime(job.started_at) : "—"} />
              <Detail label="Finished" value={job.finished_at ? formatDateTime(job.finished_at) : "—"} />
              <Detail label="Duration" value={job.duration_seconds != null ? formatDuration(job.duration_seconds) : "—"} />
              <Detail label="Owner" value={job.owner ?? "—"} />
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StageStepper({ status }: { status: JobStatus }) {
  const order: JobStatus[] = ["queued", "parsing", "loading_model", "running", "encoding", "completed"];
  const failed = status === "failed";
  const cancelled = status === "cancelled";
  const activeIndex = order.indexOf(status);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card/60 px-4 py-3">
      {order.map((stage, i) => {
        const done = !failed && !cancelled && activeIndex > i;
        const active = status === stage;
        const isLast = i === order.length - 1;
        return (
          <React.Fragment key={stage}>
            {i > 0 && <span className="h-px min-w-4 flex-1 bg-border" />}
            <span
              className={cn(
                "flex items-center gap-1.5 text-xs font-medium",
                done || (active && isLast && status === "completed")
                  ? "text-emerald-500"
                  : active
                    ? "text-primary"
                    : "text-muted-foreground/60"
              )}
            >
              <span
                className={cn(
                  "flex size-4 items-center justify-center rounded-full border text-[9px]",
                  done ? "border-emerald-500 bg-emerald-500/15" : active ? "border-primary bg-primary/15" : "border-border"
                )}
              >
                {active && !done ? <span className="size-1.5 animate-pulse-soft rounded-full bg-primary" /> : null}
              </span>
              {statusLabel(stage)}
            </span>
          </React.Fragment>
        );
      })}
      {(failed || cancelled) && (
        <span className={cn("ml-2 flex items-center gap-1.5 text-xs font-medium", failed ? "text-destructive" : "text-muted-foreground")}>
          <Ban className="size-3.5" /> {failed ? "Failed" : "Cancelled"}
        </span>
      )}
    </div>
  );
}

function logLevel(line: string): string {
  const lower = line.toLowerCase();
  if (lower.includes("error") || lower.includes("traceback")) return "log-line-error";
  if (lower.includes("warn")) return "log-line-warn";
  if (lower.includes("info") || lower.includes("it/s") || lower.includes("%")) return "log-line-info";
  return "";
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{truncate(value, 18)}</dd>
    </div>
  );
}


