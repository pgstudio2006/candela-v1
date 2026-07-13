import { NurseEpisodeClient } from "@/components/nurse/nurse-episode-client";

export default async function NurseEpisodePage({ params }: { params: Promise<{ visitId: string }> }) {
  const { visitId } = await params;
  return <NurseEpisodeClient visitId={visitId} />;
}
