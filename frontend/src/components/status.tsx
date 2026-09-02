"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";

import type { JobStatus } from "@/lib/api/types";
import { useSettings } from "@/lib/store/settings";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const STATUS_CONFIG: Record<
  JobStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "success" | "warning" | "info"; pulse?: boolean }
> = {
  queued: { label: "Queued", variant: "secondary", pulse: true },
  parsing: { label: "Parsing", variant: "info", pulse: true },
  loading_model: { label: "Loading model", variant: "info", pulse: true },
  running: { label: "Running", variant: "info", pulse: true },
  encoding: { label: "Encoding", variant: "warning", pulse: true },
  completed: { label: "Completed", variant: "success" },
  failed: { label: "Failed", variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "secondary" },
};

export function JobStatusBadge({ status, className }: { status: JobStatus; className?: string }) {
  const config = STATUS_CONFIG[status] ?? { label: status, variant: "secondary" as const };
  return (
    <Badge variant={config.variant} className={cn("gap-1.5", className)}>
      {config.pulse && (
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
        </span>
      )}
      {config.label}
    </Badge>
  );
}

export function statusLabel(status: JobStatus): string {
  return STATUS_CONFIG[status]?.label ?? status;
}

/** Live connection pill — pings the unauthenticated /health endpoint. */
export function ConnectionPill({ className }: { className?: string }) {
  const baseUrl = useSettings((s) => s.baseUrl);
  const { data, isPending, isError } = useQuery({
    queryKey: ["health", baseUrl],
    queryFn: () =>
      fetch(`${baseUrl.replace(/\/+$/, "")}/health`, { cache: "no-store" }).then(
        (r) => r.json() as Promise<{ status: string; version: string }>
      ),
    refetchInterval: 15_000,
    retry: false,
  });

  const state = isPending ? "checking" : isError ? "down" : "up";

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
        state === "up" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
        state === "down" && "border-red-500/30 bg-red-500/10 text-red-500",
        state === "checking" && "border-border bg-muted text-muted-foreground",
        className
      )}
    >
      <Activity className="size-3" />
      <span className="hidden sm:inline">
        {state === "up" ? `Online${data?.version ? ` · v${data.version}` : ""}` : state === "down" ? "Server unreachable" : "Checking…"}
      </span>
      <span className="sm:hidden">{state === "up" ? "Online" : state === "down" ? "Offline" : "…"}</span>
    </div>
  );
}

