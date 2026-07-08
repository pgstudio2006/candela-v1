import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireModule } from "@/server/auth";
import { serializeForClient } from "@/server/serialize";
import { throwIfPrismaError } from "@/server/prisma-errors";
import { ServerActionError } from "@/server/errors";
import {
  addDocumentTemplate,
  completeConsultation,
  createDoctorTemplate,
  deleteDoctorTemplate,
  saveConsultSection,
  saveDocumentTemplate,
  saveIpdRound,
  setPrescription,
  skipConsultation,
  startConsultation,
  updateConsultation,
  updateDoctorTemplate,
} from "@/server/doctor";
import type { DoctorTemplate, PrescriptionLine, TreatmentMode } from "@/design-system/doctor-data";
import type { DocumentTemplate } from "@/design-system/document-templates";

type ActionBody = {
  op: string;
  visitId?: string;
  patch?: Record<string, unknown>;
  section?: "examination" | "diagnosis" | "treatment";
  data?: Record<string, string | number | boolean>;
  lines?: PrescriptionLine[];
  opts?: {
    treatmentMode: TreatmentMode;
    recommendCounsellor: boolean;
    skipCounsellor: boolean;
    handoff: Record<string, string | number | boolean>;
    sendWhatsapp: boolean;
  };
  // template ops
  doctorId?: string;
  tpl?: Omit<DoctorTemplate, "id" | "doctorId">;
  id?: string;
  templatePatch?: Partial<DoctorTemplate>;
  // ipd round
  ipdId?: string;
  note?: Record<string, string | number | boolean>;
  // document template
  kind?: DocumentTemplate["kind"];
  label?: string;
  description?: string;
  template?: DocumentTemplate;
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
    const ctx = await requireModule("doctor");
    const { op } = body;
    let result: unknown;

    switch (op) {
      case "startConsultation":
        result = await startConsultation(ctx, body.visitId!);
        break;
      case "skipConsultation":
        result = await skipConsultation(ctx, body.visitId!);
        break;
      case "updateConsultation":
        result = await updateConsultation(ctx, body.visitId!, body.patch as Parameters<typeof updateConsultation>[2]);
        break;
      case "saveConsultSection":
        result = await saveConsultSection(ctx, body.visitId!, body.section!, body.data!);
        break;
      case "setPrescription":
        result = await setPrescription(ctx, body.visitId!, body.lines!);
        break;
      case "completeConsultation":
        await completeConsultation(ctx, body.visitId!, body.opts!);
        result = { visitId: body.visitId };
        break;
      case "saveIpdRound":
        result = await saveIpdRound(ctx, body.ipdId!, body.note!);
        break;
      case "createDoctorTemplate":
        result = await createDoctorTemplate(ctx, body.doctorId!, body.tpl!);
        break;
      case "updateDoctorTemplate":
        result = await updateDoctorTemplate(ctx, body.id!, body.templatePatch!);
        break;
      case "deleteDoctorTemplate":
        result = await deleteDoctorTemplate(ctx, body.id!);
        break;
      case "addDocumentTemplate":
        result = await addDocumentTemplate(ctx, body.kind!, body.label!, body.description!);
        break;
      case "saveDocumentTemplate":
        result = await saveDocumentTemplate(ctx, body.template!);
        break;
      default:
        return NextResponse.json({ ok: false, error: `Unknown operation: ${op}` }, { status: 400 });
    }

    return NextResponse.json({ ok: true, data: serializeForClient(result) });
  } catch (error) {
    try {
      throwIfPrismaError(error);
    } catch (mapped) {
      if (mapped instanceof ServerActionError) {
        return NextResponse.json({ ok: false, error: mapped.message }, { status: 400 });
      }
    }
    if (error instanceof ServerActionError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    const msg = error instanceof Error ? error.message : "Something went wrong.";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
