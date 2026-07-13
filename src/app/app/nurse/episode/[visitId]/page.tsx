import { Suspense } from "react";
import dynamic from "next/dynamic";

const ExecutionWorkspace = dynamic(
  () => import("@/components/nurse/execution-workspace").then((mod) => mod.ExecutionWorkspace),
  { ssr: false },
);

export default async function NurseEpisodePage({ params }: { params: Promise<{ visitId: string }> }) {
  const { visitId } = await params;
  return (
    <Suspense fallback={null}>
      <ExecutionWorkspace visitId={visitId} />
    </Suspense>
  );
}
