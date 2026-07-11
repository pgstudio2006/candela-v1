import { prisma } from "@/lib/prisma";
import type { ServerContext } from "@/server/context";
import { ServerActionError } from "@/server/errors";
import { branchScope } from "@/server/tenancy";

export async function requireNurseVisit(ctx: ServerContext, visitId: string) {
  const visit = await prisma.opdVisit.findFirst({
    where: { id: visitId, ...branchScope(ctx) },
  });
  if (!visit) {
    throw new ServerActionError("NOT_FOUND", "Visit not found in your branch.");
  }
  return visit;
}

export async function requireNurseHandoff(ctx: ServerContext, visitId: string) {
  await requireNurseVisit(ctx, visitId);
  const handoff = await prisma.nursingHandoff.findUnique({ where: { visitId } });
  if (!handoff) {
    throw new ServerActionError("NOT_FOUND", "Patient is not in the nursing execution queue.");
  }
  return handoff;
}

export async function requireNurseEpisode(ctx: ServerContext, visitId: string) {
  const episode = await prisma.nursingEpisode.findFirst({
    where: { visitId, branchId: ctx.branchId },
  });
  if (!episode) {
    throw new ServerActionError("NOT_FOUND", "Nursing episode not found. Claim the patient first.");
  }
  return episode;
}

export async function assertNurseOwnsEpisode(ctx: ServerContext, visitId: string, nurseId: string) {
  const episode = await requireNurseEpisode(ctx, visitId);
  if (episode.nurseId !== nurseId && episode.nurseId !== ctx.userId) {
    throw new ServerActionError(
      "FORBIDDEN",
      `Episode claimed by ${episode.nurseName}. Ask them to release or contact a supervisor.`,
    );
  }
  return episode;
}
