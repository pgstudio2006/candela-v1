"use client";

import dynamic from "next/dynamic";

const ExecutionWorkspace = dynamic(
  () => import("@/components/nurse/execution-workspace").then((mod) => mod.ExecutionWorkspace),
  { ssr: false },
);

export function NurseEpisodeClient({ visitId }: { visitId: string }) {
  return <ExecutionWorkspace visitId={visitId} />;
}
