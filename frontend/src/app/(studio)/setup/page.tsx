"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Clapperboard, Info } from "lucide-react";

import { ConnectionTesterFields, type TestResult } from "@/components/connection-tester";
import { useSettings } from "@/lib/store/settings";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function SetupPage() {
  const router = useRouter();
  const { baseUrl, apiKey, setConnection } = useSettings();

  const handleSaved = React.useCallback(
    (result: TestResult) => {
      // Wait a moment so the user sees the test result, then head to the Studio.
      setTimeout(() => router.push("/studio"), 900);
      void result;
    },
    [router]
  );

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col px-4 py-12 sm:py-20">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <Card>
          <CardHeader className="items-center text-center">
            <span className="bg-brand-gradient glow-primary mx-auto flex size-12 items-center justify-center rounded-xl text-white">
              <Clapperboard className="size-6" />
            </span>
            <CardTitle className="text-xl">Connect to your LTX API server</CardTitle>
            <CardDescription>
              Enter the base URL of your FastAPI server and an API key if one is configured.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <ConnectionTesterFields
              idPrefix="setup"
              initialBaseUrl={baseUrl}
              initialApiKey={apiKey}
              setConnection={setConnection}
              onSaved={handleSaved}
            />
            <Separator />
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" />
              <p>
                The browser talks to the API directly, so the server must allow this origin via
                CORS — set <code className="rounded bg-muted px-1 py-0.5">LTX_API_CORS_ORIGINS</code> (e.g.
                <code className="rounded bg-muted px-1 py-0.5">[&quot;http://localhost:3000&quot;]</code>) in the
                server config. If the server runs with no API keys, leave the key empty.
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
