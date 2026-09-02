"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Clapperboard, FolderKanban, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { cancelJob, listJobs, listProjects, updateJob } from "@/lib/api/endpoints";
import { VideoPreviewCard } from "@/components/jobs/video-preview-card";
import { ProjectChip } from "@/components/projects/project-chip";
import { statusLabel } from "@/components/status";
import { TERMINAL_STATUSES } from "@/lib/api/types";
import type { JobStatus, PipelineType } from "@/lib/api/types";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const PAGE_SIZE = 12;
const STATUS_FILTERS: (JobStatus | "all")[] = ["all", "queued", "running", "completed", "failed", "cancelled"];

export default function LibraryPage() {
  const [status, setStatus] = React.useState<JobStatus | "all">("all");
  const [pipeline, setPipeline] = React.useState<PipelineType | "all">("all");
  const [projectFilter, setProjectFilter] = React.useState<string>("all");
  const [page, setPage] = React.useState(0);
  const queryClient = useQueryClient();

  const { data: projectsData } = useQuery({
    queryKey: ["projects", "list"],
    queryFn: () => listProjects(),
    staleTime: 30_000,
    retry: false,
  });

  const { data, isPending, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["jobs", "list", status, pipeline, projectFilter, page],
    queryFn: () =>
      listJobs({
        status: status === "all" ? undefined : status,
        projectId: projectFilter === "all" ? undefined : projectFilter,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    refetchInterval: (query) => {
      const jobs = query.state.data?.jobs ?? [];
      return jobs.some((j) => !TERMINAL_STATUSES.includes(j.status)) ? 2500 : false;
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (jobId: string) => cancelJob(jobId),
    onSuccess: (res) => {
      toast.success(res.detail);
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (err) => toast.error("Could not cancel", { description: (err as Error).message }),
  });

  const moveMutation = useMutation({
    mutationFn: ({ jobId, projectId }: { jobId: string; projectId: string | null }) =>
      updateJob(jobId, { project_id: projectId }),
    onSuccess: () => {
      toast.success("Generation moved");
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (err) => toast.error("Could not move generation", { description: (err as Error).message }),
  });

  const jobs = data?.jobs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const shown = jobs.filter((j) => pipeline === "all" || j.pipeline === pipeline);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Library</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {total > 0 ? `${total} generation${total === 1 ? "" : "s"}` : "Your renders live here"} · hover to preview
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={status} onValueChange={(v) => { setStatus(v as JobStatus | "all"); setPage(0); }}>
            <SelectTrigger className="w-36" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s === "all" ? "All statuses" : statusLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={pipeline} onValueChange={(v) => setPipeline(v as PipelineType | "all")}>
            <SelectTrigger className="w-32" aria-label="Filter by mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modes</SelectItem>
              <SelectItem value="distilled">Fast</SelectItem>
              <SelectItem value="ti2vid">Pro</SelectItem>
            </SelectContent>
          </Select>
          <Select value={projectFilter} onValueChange={(v) => { setProjectFilter(v); setPage(0); }}>
            <SelectTrigger className="w-40" aria-label="Filter by project">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {(projectsData?.projects ?? []).map((p) => (
                <SelectItem key={p.project_id} value={p.project_id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" aria-label="Refresh" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={isRefetching ? "size-4 animate-spin" : "size-4"} />
          </Button>
          <Link href="/studio" className="hidden sm:block">
            <Button variant="gradient" size="sm" className="gap-1.5">
              <Plus /> New video
            </Button>
          </Link>
        </div>
      </div>
      {/* Content */}
      {isError ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <p className="font-medium text-destructive">Could not load your library</p>
            <p className="max-w-md text-sm text-muted-foreground">{(error as Error).message}</p>
          </CardContent>
        </Card>
      ) : isPending ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[4/3.4] rounded-xl" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Clapperboard className="size-6" />
            </span>
            <div>
              <p className="font-medium">Nothing here yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                {total === 0
                  ? "Your finished videos will appear here — create your first one."
                  : "No generations match the current filters."}
              </p>
            </div>
            <Link href="/studio">
              <Button variant="gradient" size="sm" className="gap-1.5">
                <Plus /> New video
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {shown.map((job) => (
              <div key={job.job_id} className="group relative">
                <VideoPreviewCard job={job} aspect="aspect-[4/3.4]" />
                {job.project_id && (
                  <div className="absolute bottom-2 left-2 z-10">
                    <ProjectChip projectId={job.project_id} className="bg-background/80 backdrop-blur" />
                  </div>
                )}
                <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  {job.status === "queued" && (
                    <button
                      type="button"
                      onClick={() => cancelMutation.mutate(job.job_id)}
                      className="rounded-md border border-border/60 bg-background/80 px-2 py-1 text-[10px] font-medium text-muted-foreground backdrop-blur transition-colors hover:text-destructive"
                    >
                      Cancel
                    </button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label="Generation actions"
                        className="rounded-md border border-border/60 bg-background/80 px-1.5 py-1 text-[10px] font-medium text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
                      >
                        ···
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
                      {(projectsData?.projects ?? []).length === 0 ? (
                        <DropdownMenuItem disabled>
                          <FolderKanban /> No projects yet
                        </DropdownMenuItem>
                      ) : (
                        (projectsData?.projects ?? []).map((p) => (
                          <DropdownMenuItem
                            key={p.project_id}
                            disabled={job.project_id === p.project_id}
                            onClick={() => moveMutation.mutate({ jobId: job.job_id, projectId: p.project_id })}
                          >
                            <FolderKanban /> Move to “{p.name}”
                          </DropdownMenuItem>
                        ))
                      )}
                      {job.project_id && (
                        <DropdownMenuItem onClick={() => moveMutation.mutate({ jobId: job.job_id, projectId: null })}>
                          <FolderKanban /> Remove from project
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-3">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft /> Prev
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page + 1} of {totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                Next <ChevronRight />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

