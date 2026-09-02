"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, PlugZap, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { getHealth, getHealthDetails } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/client";
import { useSettings } from "@/lib/store/settings";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface TestResult {
  reachable: boolean;
  version?: string;
  isAdmin: boolean;
  authOk: boolean;
  message: string;
}

export function ConnectionTesterFields({
  onSaved,
  initialBaseUrl,
  initialApiKey,
  setConnection,
  idPrefix = "settings",
}: {
  onSaved?: (result: TestResult) => void;
  initialBaseUrl: string;
  initialApiKey: string;
  setConnection: (baseUrl: string, apiKey: string) => void;
  showHeader?: boolean;
  idPrefix?: string;
}) {
  const [baseUrl, setBaseUrl] = React.useState(initialBaseUrl);
  const [apiKey, setApiKey] = React.useState(initialApiKey);
  const [result, setResult] = React.useState<TestResult | null>(null);

  const testMutation = useMutation({
    mutationFn: async (): Promise<TestResult> => {
      const cleanBase = baseUrl.replace(/\/+$/, "");
      // Temporarily apply so the shared client uses the new values.
      useSettings.getState().setConnection(cleanBase, apiKey);

      const health = await getHealth();
      const version = health.version;

      let isAdmin = false;
      let authOk = true;
      try {
        await getHealthDetails();
        isAdmin = true;
      } catch (err) {
        if (err instanceof ApiError && err.status === 403) {
          authOk = true; // valid user key, just not admin
        } else {
          authOk = false;
        }
      }

      return {
        reachable: true,
        version,
        isAdmin,
        authOk,
        message: isAdmin
          ? "Connected with admin access."
          : authOk
            ? "Connected with user access."
            : "Server reachable, but the API key was rejected.",
      };
    },
    onSuccess: (data) => setResult(data),
    onError: (err) => {
      const message = err instanceof ApiError ? err.detail : (err as Error).message;
      setResult({ reachable: false, isAdmin: false, authOk: false, message });
    },
  });

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-base-url`}>API server URL</Label>
        <Input
          id={`${idPrefix}-base-url`}
          placeholder="http://localhost:8000"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-api-key`}>API key</Label>
        <Input
          id={`${idPrefix}-api-key`}
          type="password"
          placeholder="ltx_… (leave empty for open servers)"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">
          Sent as the <code className="rounded bg-muted px-1 py-0.5">X-API-Key</code> header. Stored only in this browser.
        </p>
      </div>

      {result && <TestResultView result={result} />}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => testMutation.mutate()}
          disabled={testMutation.isPending || !baseUrl}
        >
          {testMutation.isPending ? <Loader2 className="animate-spin" /> : <PlugZap />}
          Test connection
        </Button>
        <Button
          type="button"
          variant="gradient"
          onClick={() => {
            setConnection(baseUrl, apiKey);
            toast.success("Connection saved");
            onSaved?.(testMutation.data ?? { reachable: false, isAdmin: false, authOk: false, message: "Not tested" });
          }}
          disabled={!baseUrl}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

function TestResultView({ result }: { result: TestResult }) {
  return (
    <div className="rounded-lg border px-3 py-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {result.reachable ? (
          <Badge variant="success" className="gap-1">
            <ShieldCheck className="size-3" />
            {result.version ? `Server v${result.version}` : "Server online"}
          </Badge>
        ) : (
          <Badge variant="destructive">Connection failed</Badge>
        )}
        {result.reachable &&
          (result.isAdmin ? (
            <Badge>Admin key</Badge>
          ) : result.authOk ? (
            <Badge variant="secondary">User key</Badge>
          ) : (
            <Badge variant="warning">Key rejected</Badge>
          ))}
      </div>
      <p className="mt-1.5 text-muted-foreground">{result.message}</p>
    </div>
  );
}
