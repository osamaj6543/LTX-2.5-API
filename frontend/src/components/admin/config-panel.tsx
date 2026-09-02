"use client";

import { useQuery } from "@tanstack/react-query";
import { Settings } from "lucide-react";

import { getEffectiveConfig } from "@/lib/api/endpoints";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ConfigPanel() {
  const { data, isPending, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["admin", "config"],
    queryFn: () => getEffectiveConfig(),
  });

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings className="size-4 text-primary" />
            Effective configuration
          </CardTitle>
          <CardDescription>Server-side settings — secrets are already redacted by the API.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
          {isRefetching ? "Refreshing…" : "Refresh"}
        </Button>
      </CardHeader>
      <CardContent>
        {isPending && <p className="py-6 text-center text-sm text-muted-foreground">Loading configuration…</p>}
        {isError && <p className="py-6 text-center text-sm text-destructive">{(error as Error).message}</p>}
        {data && (
          <pre className="max-h-[480px] overflow-auto rounded-lg bg-muted/50 p-4 font-mono text-xs leading-relaxed scrollbar-slim">
            {JSON.stringify(data, null, 2)}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}
