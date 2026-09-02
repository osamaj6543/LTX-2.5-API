"use client";

import {
  ConnectionTesterFields,
  type TestResult,
} from "@/components/connection-tester";
import { useSettings } from "@/lib/store/settings";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { baseUrl, apiKey, setConnection } = useSettings();

  const handleSaved = (_result: TestResult) => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>API connection</DialogTitle>
          <DialogDescription>
            Point the app at your LTX API server. Values are stored in this browser only.
          </DialogDescription>
        </DialogHeader>
        <ConnectionTesterFields
          initialBaseUrl={baseUrl}
          initialApiKey={apiKey}
          setConnection={setConnection}
          onSaved={handleSaved}
        />
      </DialogContent>
    </Dialog>
  );
}
