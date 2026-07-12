import type { PrescriptionLine as DoctorPrescriptionLine } from "@/design-system/doctor-data";
export type { DoctorPrescriptionLine };
import type { ServerContext } from "@/server/context";
import { pushPrescriptionFromDoctor } from "@/server/pharmacy/index";
import { queueNotification } from "@/server/notifications";

/** Push doctor Rx into branch-scoped pharmacy queue after consult complete */
export async function pushPrescriptionToPharmacy(
  ctx: ServerContext,
  input: {
    visitId: string;
    patientId: string;
    patientName: string;
    uhid: string;
    doctorId: string;
    doctorName: string;
    lines: DoctorPrescriptionLine[];
    priority?: "routine" | "urgent" | "stat";
  },
) {
  const rxId = await pushPrescriptionFromDoctor(ctx, {
    ...input,
    priority: input.priority,
  });
  if (!rxId) return null;

  await queueNotification(ctx, {
    channel: "in_app",
    recipient: "pharmacy@navayu.in",
    subject: "New prescription to verify",
    body: `${input.patientName} (${input.uhid}) — ${input.lines.length} item(s) from Dr. ${input.doctorName}`,
    module: "pharmacy",
    entityId: rxId,
  });

  return rxId;
}
