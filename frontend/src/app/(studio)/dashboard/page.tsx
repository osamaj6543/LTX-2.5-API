"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowRight, Clapperboard, Cpu, Film, Library, Plus, Server, Wand2 } from "lucide-react";

import { getHealthDetails, getStats, listJobs, listProjects } from "@/lib/api/endpoints";
import { VideoPreviewCard } from "@/components/jobs/video-preview-card";
import { ProjectCard } from "@/components/projects/project-card";
import { formatDuration } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function HomePage() {
  const { data: recent } = useQuery({
    queryKey: ["jobs", "home"],
    queryFn: () => listJobs({ limit: 8 }),
    retry: false,
    refetchInterval: (query) => {
      const jobs = query.state.data?.jobs ?? [];
      return jobs.some((j) => !["completed", "failed", "cancelled"].includes(j.status)) ? 2500 : false;
    },
  });

  const { data: projectsData } = useQuery({
    queryKey: ["projects", "list"],
    queryFn: () => listProjects({ status: "active", limit: 4 }),
    staleTime: 30_000,
    retry: false,
  });

  const { data: stats } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => getStats(),
    retry: false,
    refetchInterval: 30_000,
  });

  const { data: details } = useQuery({
    queryKey: ["admin", "health-details"],
    queryFn: () => getHealthDetails(),
    retry: false,
    refetchInterval: 30_000,
  });

  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Working late" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const isAdmin = !!details;
  const gpu = details?.gpus?.find((g) => g.available);
  const jobsDict = (stats?.jobs ?? {}) as Record<string, number>;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
      {/* Welcome hero */}
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <p className="text-sm text-muted-foreground">{greeting}.</p>
        <h1 className="mt-1 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
          What will you <span className="text-gradient">create</span> today?
        </h1>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link href="/studio">
            <Button size="lg" variant="gradient" className="h-11 gap-2 px-5">
              <Plus /> New video
            </Button>
          </Link>
          <Link href="/jobs">
            <Button size="lg" variant="outline" className="h-11 gap-2 px-5">
              <Library /> My library
            </Button>
          </Link>
          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
            Press
            <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Ctrl K</kbd>
            for commands
          </span>
        </div>
      </motion.section>

      {/* Projects */}
      {projectsData && projectsData.projects.length > 0 && (
        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Projects</h2>
              <p className="text-xs text-muted-foreground">Your active workspaces</p>
            </div>
            <Link href="/projects" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              View all <ArrowRight className="size-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {projectsData.projects.map((project, i) => (
              <ProjectCard key={project.project_id} project={project} index={i} />
            ))}
          </div>
        </section>
      )}

      {/* Usage strip */}
      {isAdmin && (
        <section className="mt-8 grid gap-3 sm:grid-cols-4">
          <Stat label="Total videos" value={jobsDict.total != null ? String(jobsDict.total) : undefined} />
          <Stat
            label="Success rate"
            value={jobsDict.success_rate != null ? `${(jobsDict.success_rate * 100).toFixed(1)}%` : undefined}
          />
          <Stat label="Avg render" value={jobsDict.avg_duration_seconds ? formatDuration(jobsDict.avg_duration_seconds) : undefined} />
          <Stat label="GPU" value={gpu?.name ?? undefined} hint={gpu?.memory_total_mb ? `VRAM ${Math.round(((gpu.memory_used_mb ?? 0) / gpu.memory_total_mb) * 100)}% used` : undefined} />
        </section>
      )}
      {/* Recent creations */}
      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Recent creations</h2>
            <p className="text-xs text-muted-foreground">Hover a card to preview the clip</p>
          </div>
          {recent && recent.total > 8 && (
            <Link href="/jobs" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              View library <ArrowRight className="size-3.5" />
            </Link>
          )}
        </div>

        {recent === undefined ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[4/3.4] rounded-xl" />
            ))}
          </div>
        ) : recent.jobs.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Clapperboard className="size-6" />
              </span>
              <div>
                <p className="font-medium">No videos yet</p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                  Describe a shot in the generator — your renders will appear here with live progress and instant playback.
                </p>
              </div>
              <Link href="/studio">
                <Button variant="gradient" className="gap-2">
                  <Wand2 /> Create your first video
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {recent.jobs.map((job) => (
              <VideoPreviewCard key={job.job_id} job={job} aspect="aspect-[4/3.4]" />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value?: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card/70 px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold">
        {value === undefined ? <Skeleton className="h-4 w-16" /> : value}
      </p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
