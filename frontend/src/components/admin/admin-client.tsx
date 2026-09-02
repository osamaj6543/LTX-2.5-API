"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Cpu, Gauge, KeyRound, ListVideo, Server, Settings, Shield, ShieldX } from "lucide-react";

import { getHealthDetails, getStats } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/client";
import { formatDuration } from "@/lib/utils";
import { KeysPanel } from "./keys-panel";
import { CachePanel } from "./cache-panel";
import { QueuePanel } from "./queue-panel";
import { ConfigPanel } from "./config-panel";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function AdminClient() {
  const { data: details, isError, error, isPending } = useQuery({
    queryKey: ["admin", "health-details"],
    queryFn: () => getHealthDetails(),
    retry: false,
    refetchInterval: 15_000,
  });

  const { data: stats } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => getStats(),
    retry: false,
    refetchInterval: 30_000,
  });

  if (isPending) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-6 h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (isError) {
    const status = error instanceof ApiError ? error.status : 0;
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-20 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <ShieldX className="size-7" />
        </span>
        <h1 className="mt-4 text-xl font-semibold">Admin access required</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {status === 401 || status === 403
            ? "Your API key does not have admin privileges. Set an admin key via the connection settings."
            : (error as Error).message}
        </p>
      </div>
    );
  }

  const jobsDict = (stats?.jobs ?? {}) as Record<string, number>;
  const perKey = stats?.per_key ?? [];

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Shield className="size-6 text-primary" />
          Server administration
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          LTX API v{details?.version} · uptime {formatDuration(stats?.uptime_seconds ?? 0)}
        </p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview" className="gap-1.5"><Server className="size-4" /> Overview</TabsTrigger>
          <TabsTrigger value="keys" className="gap-1.5"><KeyRound className="size-4" /> Keys</TabsTrigger>
          <TabsTrigger value="queue" className="gap-1.5"><ListVideo className="size-4" /> Queue</TabsTrigger>
          <TabsTrigger value="cache" className="gap-1.5"><Gauge className="size-4" /> Cache</TabsTrigger>
          <TabsTrigger value="config" className="gap-1.5"><Settings className="size-4" /> Config</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 grid gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile label="Total jobs" value={jobsDict.total != null ? String(jobsDict.total) : undefined} />
            <StatTile
              label="Success rate"
              value={jobsDict.success_rate != null ? `${(jobsDict.success_rate * 100).toFixed(1)}%` : undefined}
            />
            <StatTile
              label="Avg generation"
              value={jobsDict.avg_duration_seconds != null ? formatDuration(jobsDict.avg_duration_seconds) : undefined}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Cpu className="size-4 text-primary" /> GPUs
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {(details?.gpus ?? []).map((gpu, i) =>
                gpu.available ? (
                  <div key={i} className="rounded-xl border p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{gpu.name ?? "GPU"}</p>
                      <Badge variant="outline">SM {gpu.capability ?? "—"}</Badge>
                    </div>
                    <div className="mt-3">
                      <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                        <span>VRAM</span>
                        <span>{gpu.memory_used_mb ?? 0} / {gpu.memory_total_mb ?? 0} MB</span>
                      </div>
                      <Progress
                        value={gpu.memory_total_mb ? ((gpu.memory_used_mb ?? 0) / gpu.memory_total_mb) * 100 : 0}
                      />
                    </div>
                  </div>
                ) : (
                  <div key={i} className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                    No CUDA device visible to the server.
                  </div>
                )
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Worker &amp; queue</CardTitle>
                <CardDescription>Single background worker owns the GPU.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm">
                <Row label="Queue depth" value={String(details?.queue.depth ?? "—")} />
                <Row label="Dispatching" value={details?.queue.paused ? "paused" : "active"} />
                <Row label="Warm pipelines" value={`${details?.cache.entries.length ?? 0} / ${details?.cache.max_entries ?? "—"}`} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Per-key usage</CardTitle>
                <CardDescription>Jobs submitted per API key.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm">
                {perKey.length === 0 && <p className="text-muted-foreground">No usage recorded yet.</p>}
                {perKey.slice(0, 6).map((row, i) => {
                  const rec = row as Record<string, unknown>;
                  return (
                    <Row
                      key={i}
                      label={String(rec.label ?? rec.role ?? "key")}
                      value={String(rec.jobs ?? rec.count ?? "—")}
                    />
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="keys" className="mt-4"><KeysPanel /></TabsContent>
        <TabsContent value="queue" className="mt-4"><QueuePanel /></TabsContent>
        <TabsContent value="cache" className="mt-4"><CachePanel /></TabsContent>
        <TabsContent value="config" className="mt-4"><ConfigPanel /></TabsContent>
      </Tabs>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value?: string }) {
  return (
    <Card className="gap-2 py-5">
      <CardHeader className="px-5">
        <CardDescription className="text-xs">{label}</CardDescription>
        <CardTitle className="text-2xl">{value === undefined ? <Skeleton className="h-7 w-16" /> : value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
