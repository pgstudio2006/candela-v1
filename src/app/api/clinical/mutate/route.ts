import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireAuth, requireModule } from "@/server/auth";
import { serializeForClient } from "@/server/serialize";
import { throwIfPrismaError } from "@/server/prisma-errors";
import { ServerActionError } from "@/server/errors";
import {
  bookAppointment,
  cancelAppointment,
  checkInVisit,
  clearQueue,
  completeJuniorExam,
  processBilling,
  processCounselBilling,
  registerPatient,
  rescheduleAppointment,
  saveSubmission,
  updatePatient,
} from "@/server/clinical";

type ActionBody = {
  op: string;
  // registerPatient
  data?: Record<string, string | number | boolean>;
  patientId?: string;
  visitId?: string;
  startVisit?: boolean;
  forceDuplicate?: boolean;
  emergency?: boolean;
  // checkInVisit
  existingVisitId?: string;
  newVisitId?: string;
  // processBilling / processCounselBilling
  input?: Record<string, unknown>;
  // completeJuniorExam
  // bookAppointment
  appointmentId?: string;
  // cancelAppointment / rescheduleAppointment
  // updatePatient
  // saveSubmission
  formId?: string;
  ctx?: { patientId?: string; visitId?: string };
  // reschedule
  date?: string;
  time?: string;
  doctorId?: string;
  departmentId?: string;
};

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Please sign in first." }, { status: 401 });
  }

  let body: ActionBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  try {
    const { op } = body;
    let result: unknown;

    switch (op) {
      case "registerPatient": {
        const ctx = await requireModule("frontdesk");
        result = await registerPatient(ctx, {
          data: body.data!,
          patientId: body.patientId!,
          visitId: body.visitId,
          startVisit: body.startVisit,
          forceDuplicate: body.forceDuplicate,
          emergency: body.emergency,
        });
        break;
      }
      case "checkInVisit": {
        const ctx = await requireModule("frontdesk");
        result = await checkInVisit(ctx, {
          data: body.data!,
          existingVisitId: body.existingVisitId,
          newVisitId: body.newVisitId,
        });
        break;
      }
      case "processBilling": {
        const ctx = await requireModule("frontdesk");
        result = await processBilling(ctx, body.visitId!, body.data!);
        break;
      }
      case "processCounselBilling": {
        const ctx = await requireModule("frontdesk");
        result = await processCounselBilling(ctx, body.visitId!, body.input as any);
        break;
      }
      case "completeJuniorExam": {
        const ctx = await requireModule("frontdesk");
        result = await completeJuniorExam(ctx, body.visitId!, body.data);
        break;
      }
      case "bookAppointment": {
        const ctx = await requireModule("frontdesk");
        result = await bookAppointment(ctx, {
          data: body.data!,
          appointmentId: body.appointmentId!,
          visitId: body.visitId!,
        });
        break;
      }
      case "cancelAppointment": {
        const ctx = await requireModule("frontdesk");
        result = await cancelAppointment(ctx, body.appointmentId!);
        break;
      }
      case "rescheduleAppointment": {
        const ctx = await requireModule("frontdesk");
        result = await rescheduleAppointment(ctx, body.appointmentId!, {
          date: body.date!,
          time: body.time!,
          doctorId: body.doctorId,
          departmentId: body.departmentId,
        });
        break;
      }
      case "updatePatient": {
        const ctx = await requireModule("frontdesk");
        result = await updatePatient(ctx, body.patientId!, body.data!);
        break;
      }
      case "saveSubmission": {
        const ctx = await requireModule("frontdesk");
        result = await saveSubmission(ctx, body.formId!, body.data!, body.ctx);
        break;
      }
      case "clearQueue": {
        const ctx = await requireModule("frontdesk");
        result = await clearQueue(ctx);
        break;
      }
      default:
        return NextResponse.json({ ok: false, error: `Unknown operation: ${op}` }, { status: 400 });
    }

    return NextResponse.json({ ok: true, data: serializeForClient(result) });
  } catch (error) {
    try {
      throwIfPrismaError(error);
    } catch (mapped) {
      if (mapped instanceof ServerActionError) {
        return NextResponse.json({ ok: false, error: mapped.message, code: mapped.code }, { status: 400 });
      }
    }
    if (error instanceof ServerActionError) {
      return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: 400 });
    }
    const msg = error instanceof Error ? error.message : "Something went wrong.";
    return NextResponse.json({ ok: false, error: msg, code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
