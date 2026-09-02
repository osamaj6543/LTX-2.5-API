"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Flame, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";

import { evictAllPipelines, evictPipeline, getPipelineCache, preloadPipeline } from "@/lib/api/endpoints";
import { timeAgo } from "@/lib/utils";
import type { PipelineType } from "@/lib/api/types";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

export function CachePanel() {
  const queryClient = useQueryClient();
  const [pipeline, setPipeline] = React.useState<PipelineType>("distilled");
  const [paramsJson, setParamsJson] = React.useState("{}");

  const { data: cache, isPending } = useQuery({
    queryKey: ["admin", "cache"],
    queryFn: () => getPipelineCache(),
    refetchInterval: 15_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "cache"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "health-details"] });
  };

  const preloadMutation = useMutation({
    mutationFn: async () => {
      let params: Record<string, unknown>;
      try {
        params = JSON.parse(paramsJson) as Record<string, unknown>;
      } catch {
        throw new Error("Params must be valid JSON");
      }
      return preloadPipeline(pipeline, params);
    },
    onSuccess: (res) => {
      toast.success("Pipeline warm", { description: res.detail });
      invalidate();
    },
    onError: (err) => toast.error("Preload failed", { description: (err as Error).message }),
  });

  const evictMutation = useMutation({
    mutationFn: (key: string) => evictPipeline(key),
    onSuccess: (res) => {
      toast.success(res.detail);
      invalidate();
    },
    onError: (err) => toast.error("Evict failed", { description: (err as Error).message }),
  });

  const evictAllMutation = useMutation({
    mutationFn: () => evictAllPipelines(),
    onSuccess: (res) => {
      toast.success(res.detail);
      invalidate();
    },
    onError: (err) => toast.error("Evict failed", { description: (err as Error).message }),
  });

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Flame className="size-4 text-primary" />
            Warm pipeline cache
          </CardTitle>
          <CardDescription>
            Preloaded pipelines stay in VRAM between jobs. Max entries: {cache?.max_entries ?? "…"}
          </CardDescription>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-2"
          onClick={() => evictAllMutation.mutate()}
          disabled={evictAllMutation.isPending || (cache?.entries.length ?? 0) === 0}
        >
          <Trash2 /> Evict all
        </Button>
      </CardHeader>
      <CardContent className="grid gap-6">
        {isPending ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading cache state…</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cache key</TableHead>
                <TableHead>Pipeline</TableHead>
                <TableHead>Loaded</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Jobs run</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(cache?.entries ?? []).map((entry) => (
                <TableRow key={entry.key}>
                  <TableCell className="max-w-48 truncate font-mono text-xs">{entry.key}</TableCell>
                  <TableCell><Badge variant="outline" className="uppercase">{entry.pipeline}</Badge></TableCell>
                  <TableCell className="text-xs">{entry.loaded_at ? timeAgo(entry.loaded_at) : "—"}</TableCell>
                  <TableCell className="text-xs">{entry.last_used_at ? timeAgo(entry.last_used_at) : "never"}</TableCell>
                  <TableCell>{entry.jobs_run}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-xs text-destructive"
                      onClick={() => evictMutation.mutate(entry.key)}
                      disabled={evictMutation.isPending && evictMutation.variables === entry.key}
                    >
                      <Trash2 className="size-3" /> Evict
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {(cache?.entries.length ?? 0) === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No warm pipelines — preload one below before traffic, or just run a job.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}

        <div className="grid gap-3 rounded-xl border p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Zap className="size-4 text-primary" /> Preload a pipeline
          </div>
          <div className="grid gap-2 sm:max-w-xs">
            <Label className="text-xs text-muted-foreground">Pipeline</Label>
            <Select value={pipeline} onValueChange={(v) => setPipeline(v as PipelineType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="distilled">Distilled</SelectItem>
                <SelectItem value="ti2vid">TI2Vid</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label className="text-xs text-muted-foreground">Params (JSON — same body as a generation request)</Label>
            <Textarea
              value={paramsJson}
              onChange={(e) => setParamsJson(e.target.value)}
              className="min-h-20 font-mono text-xs"
              spellCheck={false}
            />
          </div>
          <div>
            <Button size="sm" variant="gradient" onClick={() => preloadMutation.mutate()} disabled={preloadMutation.isPending}>
              {preloadMutation.isPending ? "Warming…" : "Warm pipeline"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
