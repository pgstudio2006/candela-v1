import { prisma } from "@/lib/prisma";
import type { ServerContext } from "@/server/context";

/**
 * When an OPD visit is completed, mark any linked CRM lead as "visit_done"
 * so the counselor pipeline reflects the actual patient journey.
 */
export async function updateLeadStatusWhenVisitCompleted(
  ctx: ServerContext,
  visitId: string,
): Promise<void> {
  const visit = await prisma.opdVisit.findUnique({
    where: { id: visitId },
    select: { patientId: true, stage: true },
  });
  if (visit?.stage !== "completed") return;
  if (!visit?.patientId) return;

  const patient = await prisma.patient.findUnique({
    where: { id: visit.patientId },
    select: { phone: true, leadSourceId: true },
  });
  if (!patient) return;

  const leads = await prisma.lead.findMany({
    where: {
      branchId: ctx.branchId,
      OR: [
        ...(patient.leadSourceId ? [{ id: patient.leadSourceId }] : []),
        { phone: patient.phone ?? "" },
        { alternatePhone: patient.phone ?? "" },
      ],
    },
  });

  for (const lead of leads) {
    if (lead.leadStatus === "converted" || lead.leadStatus === "patient") continue;
    await prisma.lead.update({
      where: { id: lead.id },
      data: { leadStatus: "visit_done", lastContactAt: new Date() },
    });
  }
}
