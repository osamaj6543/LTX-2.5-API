import type { Metadata } from "next";

import { JobDetailClient } from "@/components/jobs/job-detail-client";

export const metadata: Metadata = {
  title: "Job detail",
};

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  return <JobDetailClient jobId={jobId} />;
}
