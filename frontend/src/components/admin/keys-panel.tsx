"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { createKey, listKeys, revokeKey } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/client";
import { formatDateTime, timeAgo } from "@/lib/utils";
import type { KeyResponse } from "@/lib/api/types";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function KeysPanel() {
  const queryClient = useQueryClient();
  const [label, setLabel] = React.useState("");
  const [role, setRole] = React.useState<"user" | "admin">("user");
  const [newKey, setNewKey] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const { data: keys, isPending } = useQuery({
    queryKey: ["admin", "keys"],
    queryFn: () => listKeys(),
  });

  const createMutation = useMutation({
    mutationFn: () => createKey({ role, label: label.trim() || undefined }),
    onSuccess: (res) => {
      setNewKey(res.key);
      setCopied(false);
      setLabel("");
      void queryClient.invalidateQueries({ queryKey: ["admin", "keys"] });
    },
    onError: (err) => toast.error("Could not create key", { description: (err as Error).message }),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: number) => revokeKey(id),
    onSuccess: (res) => {
      toast.success(res.detail);
      void queryClient.invalidateQueries({ queryKey: ["admin", "keys"] });
    },
    onError: (err) =>
      toast.error("Could not revoke", {
        description: err instanceof ApiError ? err.detail : (err as Error).message,
      }),
  });

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="text-base">API keys</CardTitle>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setNewKey(null); }}>
          <DialogTrigger asChild>
            <Button size="sm" variant="gradient" className="gap-2">
              <KeyRound /> Issue new key
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Issue a new API key</DialogTitle>
              <DialogDescription>
                The raw key is shown exactly once. Store it securely — only its SHA-256 hash is kept server-side.
              </DialogDescription>
            </DialogHeader>
            {newKey ? (
              <div className="grid gap-3">
                <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3">
                  <p className="mb-2 text-xs font-medium text-emerald-500">Copy this key now:</p>
                  <code className="block break-all rounded bg-background p-2 text-xs">{newKey}</code>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard.writeText(newKey);
                    setCopied(true);
                    toast.success("Copied to clipboard");
                  }}
                >
                  {copied ? "Copied!" : "Copy to clipboard"}
                </Button>
              </div>
            ) : (
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="key-label">Label</Label>
                  <Input id="key-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. studio-laptop" />
                </div>
                <div className="grid gap-2">
                  <Label>Role</Label>
                  <Select value={role} onValueChange={(v) => setRole(v as "user" | "admin")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User — submit &amp; view own jobs</SelectItem>
                      <SelectItem value="admin">Admin — full server control</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <DialogFooter>
              {newKey ? (
                <Button onClick={() => setOpen(false)}>Done</Button>
              ) : (
                <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creating…" : "Create key"}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading keys…</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(keys ?? []).map((key: KeyResponse) => (
                <TableRow key={key.id} className={key.revoked_at ? "opacity-50" : undefined}>
                  <TableCell className="font-mono text-xs">{key.id}</TableCell>
                  <TableCell>{key.label ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={key.role === "admin" ? "default" : "secondary"}>{key.role}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{formatDateTime(key.created_at)}</TableCell>
                  <TableCell className="text-xs">{key.last_used_at ? timeAgo(key.last_used_at) : "never"}</TableCell>
                  <TableCell className="text-right">
                    {!key.revoked_at && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-xs text-destructive hover:text-destructive"
                        onClick={() => revokeMutation.mutate(key.id)}
                        disabled={revokeMutation.isPending && revokeMutation.variables === key.id}
                      >
                        <Trash2 className="size-3" /> Revoke
                      </Button>
                    )}
                    {key.revoked_at && <Badge variant="destructive">revoked</Badge>}
                  </TableCell>
                </TableRow>
              ))}
              {(keys ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No keys issued yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
