"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ListVideo, Pause, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { getHealthDetails, pauseQueue, purgeQueue, resumeQueue } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function QueuePanel() {
  const queryClient = useQueryClient();
  const { data: details } = useQuery({
    queryKey: ["admin", "health-details"],
    queryFn: () => getHealthDetails(),
    refetchInterval: 10_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "health-details"] });
  };

  const pauseMutation = useMutation({
    mutationFn: pauseQueue,
    onSuccess: (res) => { toast.success(res.detail); invalidate(); },
    onError: (err) => toast.error("Failed", { description: (err as Error).message }),
  });
  const resumeMutation = useMutation({
    mutationFn: resumeQueue,
    onSuccess: (res) => { toast.success(res.detail); invalidate(); },
    onError: (err) => toast.error("Failed", { description: (err as Error).message }),
  });
  const purgeMutation = useMutation({
    mutationFn: purgeQueue,
    onSuccess: (res) => { toast.success(res.detail); invalidate(); },
    onError: (err) => toast.error("Failed", { description: (err as Error).message }),
  });

  const paused = details?.queue.paused ?? false;
  const depth = details?.queue.depth ?? 0;

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListVideo className="size-4 text-primary" />
            Job queue
          </CardTitle>
          <CardDescription>
            Depth: <span className="font-medium text-foreground">{depth}</span> ·{" "}
            {paused ? <Badge variant="warning">Paused</Badge> : <Badge variant="success">Dispatching</Badge>}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {paused ? (
            <Button size="sm" variant="gradient" className="gap-2" onClick={() => resumeMutation.mutate()} disabled={resumeMutation.isPending}>
              <Play /> Resume
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="gap-2" onClick={() => pauseMutation.mutate()} disabled={pauseMutation.isPending}>
              <Pause /> Pause
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="gap-2 text-destructive hover:text-destructive"
            onClick={() => purgeMutation.mutate()}
            disabled={purgeMutation.isPending || depth === 0}
          >
            <Trash2 /> Purge queued
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <p className={cn("rounded-lg border px-3 py-2 text-xs", paused ? "border-amber-500/40 bg-amber-500/10 text-amber-500" : "border-border text-muted-foreground")}>
          {paused
            ? "The queue is paused — queued jobs will not start until resumed."
            : "Queued jobs are dispatched one at a time to the single GPU worker."}
        </p>
      </CardContent>
    </Card>
  );
}
