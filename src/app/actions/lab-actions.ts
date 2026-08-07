"use server";

import { prisma } from "@/lib/prisma";
import { runAction, type ActionResult } from "@/server/action-result";
import { requireAnyModule, requireModule } from "@/server/auth";
import { branchScope } from "@/server/tenancy";
import { ServerActionError } from "@/server/errors";
import {
  cancelLabOrder,
  collectLabOrderSample,
  createLabOrder,
  deleteFieldMaster,
  deleteReportCatalog,
  generateLabOrderReportPdf,
  generatePatientLabReportPdf,
  getFieldMaster,
  getLabOrder,
  getPendingLabOrdersForVisit,
  getReportCatalog,
  listFieldMasters,
  listLabOrders,
  listReportCatalogs,
  markLabOrderComplete,
  markLabOrderItemComplete,
  saveLabResults,
  sendLabReportOnWhatsApp,
  upsertFieldMaster,
  upsertReportCatalog,
  listLabReportTemplates,
  getDefaultLabReportTemplate,
  upsertLabReportTemplate,
  deleteLabReportTemplate,
  setDefaultLabReportTemplate,
  type LabSnapshot,
} from "@/server/lab";
import type {
  LabFieldMaster,
  LabOrder,
  LabOrderInput,
  LabReportCatalog,
  LabReportTemplate,
  LabResultInput,
} from "@/design-system/lab-data";

export async function listFieldMastersAction(): Promise<ActionResult<LabFieldMaster[]>> {
  return runAction(async () => {
    const ctx = await requireModule("laboratory");
    return listFieldMasters(ctx);
  });
}

export async function getFieldMasterAction(id: string): Promise<ActionResult<LabFieldMaster | null>> {
  return runAction(async () => {
    const ctx = await requireModule("laboratory");
    return getFieldMaster(ctx, id);
  });
}

export async function upsertFieldMasterAction(
  input: Parameters<typeof upsertFieldMaster>[1],
): Promise<ActionResult<LabFieldMaster>> {
  return runAction(async () => {
    const ctx = await requireModule("laboratory");
    return upsertFieldMaster(ctx, input);
  });
}

export async function deleteFieldMasterAction(id: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await requireModule("laboratory");
    return deleteFieldMaster(ctx, id);
  });
}

export async function listReportCatalogsAction(): Promise<ActionResult<LabReportCatalog[]>> {
  return runAction(async () => {
    const ctx = await requireModule("laboratory");
    return listReportCatalogs(ctx);
  });
}

export async function getReportCatalogAction(id: string): Promise<ActionResult<LabReportCatalog | null>> {
  return runAction(async () => {
    const ctx = await requireModule("laboratory");
    return getReportCatalog(ctx, id);
  });
}

export async function upsertReportCatalogAction(
  input: Parameters<typeof upsertReportCatalog>[1],
): Promise<ActionResult<LabReportCatalog>> {
  return runAction(async () => {
    const ctx = await requireModule("laboratory");
    return upsertReportCatalog(ctx, input);
  });
}

export async function deleteReportCatalogAction(id: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await requireModule("laboratory");
    return deleteReportCatalog(ctx, id);
  });
}

export async function listLabOrdersAction(patientId?: string): Promise<ActionResult<LabOrder[]>> {
  return runAction(async () => {
    const ctx = await requireModule("laboratory");
    return listLabOrders(ctx, patientId);
  });
}

export async function listPatientLabOrdersAction(patientId: string): Promise<ActionResult<LabOrder[]>> {
  return runAction(async () => {
    const ctx = await requireAnyModule("laboratory", "doctor", "frontdesk", "admin");
    return listLabOrders(ctx, patientId);
  });
}

export async function getLabOrderAction(id: string): Promise<ActionResult<LabOrder | null>> {
  return runAction(async () => {
    const ctx = await requireModule("laboratory");
    return getLabOrder(ctx, id);
  });
}

export async function getPendingLabOrdersForVisitAction(visitId: string): Promise<ActionResult<LabOrder[]>> {
  return runAction(async () => {
    const ctx = await requireAnyModule("frontdesk", "doctor", "laboratory", "admin");
    return getPendingLabOrdersForVisit(ctx, visitId);
  });
}

export async function createLabOrderAction(input: LabOrderInput): Promise<ActionResult<LabOrder>> {
  return runAction(async () => {
    const ctx = await requireModule("laboratory");
    return createLabOrder(ctx, input);
  });
}

export async function collectLabOrderSampleAction(
  orderId: string,
  itemIds?: string[],
): Promise<ActionResult<LabOrder>> {
  return runAction(async () => {
    const ctx = await requireModule("laboratory");
    return collectLabOrderSample(ctx, orderId, itemIds);
  });
}

export async function saveLabResultsAction(
  orderId: string,
  results: LabResultInput[],
): Promise<ActionResult<LabOrder>> {
  return runAction(async () => {
    const ctx = await requireModule("laboratory");
    return saveLabResults(ctx, orderId, results);
  });
}

export async function saveLabOrderMetadataAction(
  orderId: string,
  input: { pregnancy?: boolean; bloodGroup?: string },
): Promise<ActionResult<LabOrder>> {
  return runAction(async () => {
    const ctx = await requireModule("laboratory");
    const order = await getLabOrder(ctx, orderId);
    if (!order) throw new ServerActionError("NOT_FOUND", "Order not found.");
    await prisma.$transaction(async (tx) => {
      await tx.labOrder.update({
        where: { id: orderId },
        data: { pregnancy: input.pregnancy ?? false },
      });
      if (input.bloodGroup !== undefined) {
        await tx.patient.update({
          where: { id: order.patientId },
          data: { bloodGroup: input.bloodGroup.trim() || null },
        });
      }
    });
    const updated = await getLabOrder(ctx, orderId);
    if (!updated) throw new ServerActionError("INTERNAL_ERROR", "Failed to reload order.");
    return updated;
  });
}

export async function markLabOrderItemCompleteAction(itemId: string): Promise<ActionResult<LabOrder>> {
  return runAction(async () => {
    const ctx = await requireModule("laboratory");
    return markLabOrderItemComplete(ctx, itemId);
  });
}

export async function markLabOrderCompleteAction(orderId: string): Promise<ActionResult<LabOrder>> {
  return runAction(async () => {
    const ctx = await requireModule("laboratory");
    return markLabOrderComplete(ctx, orderId);
  });
}

export async function cancelLabOrderAction(orderId: string, reason?: string): Promise<ActionResult<LabOrder>> {
  return runAction(async () => {
    const ctx = await requireModule("laboratory");
    return cancelLabOrder(ctx, orderId, reason);
  });
}

export async function getLabSnapshotAction(): Promise<ActionResult<LabSnapshot>> {
  return runAction(async () => {
    const ctx = await requireModule("laboratory");
    const [fieldMasters, reportCatalogs, orders] = await Promise.all([
      listFieldMasters(ctx),
      listReportCatalogs(ctx),
      listLabOrders(ctx),
    ]);
    return { fieldMasters, reportCatalogs, orders };
  });
}

export async function listActiveLabCatalogsAction(): Promise<ActionResult<LabReportCatalog[]>> {
  return runAction(async () => {
    const ctx = await requireAnyModule("frontdesk", "doctor", "laboratory", "admin");
    return listReportCatalogs(ctx).then((rows) => rows.filter((c) => c.active));
  });
}

export async function createLabOrderFromModuleAction(
  input: LabOrderInput,
): Promise<ActionResult<LabOrder>> {
  return runAction(async () => {
    const ctx = await requireAnyModule("frontdesk", "doctor", "laboratory", "admin");
    return createLabOrder(ctx, input);
  });
}

export async function generateLabReportPdfAction(
  orderId: string,
  reportedByStaffId?: string | null,
): Promise<ActionResult<{ dataUrl: string }>> {
  return runAction(async () => {
    const ctx = await requireAnyModule("laboratory", "doctor", "frontdesk", "admin");
    const bytes = await generateLabOrderReportPdf(ctx, orderId, reportedByStaffId);
    const dataUrl = `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`;
    return { dataUrl };
  });
}

export async function generatePatientLabReportPdfAction(
  patientId: string,
  reportedByStaffId?: string | null,
): Promise<ActionResult<{ dataUrl: string }>> {
  return runAction(async () => {
    const ctx = await requireAnyModule("laboratory", "doctor", "frontdesk", "admin");
    const bytes = await generatePatientLabReportPdf(ctx, patientId, reportedByStaffId);
    const dataUrl = `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`;
    return { dataUrl };
  });
}

export async function listLabReportingDoctorsAction(): Promise<
  ActionResult<{ id: string; name: string; degree?: string | null; designation?: string | null }[]>
> {
  return runAction(async () => {
    const ctx = await requireAnyModule("laboratory", "doctor", "frontdesk", "admin");
    const rows = await prisma.adminStaff.findMany({
      where: { branchId: ctx.branchId },
      select: { id: true, name: true, degree: true, designation: true },
      orderBy: { name: "asc" },
    });
    return rows;
  });
}

export async function sendLabReportOnWhatsAppAction(
  orderId: string,
  phone?: string,
): Promise<ActionResult<{ ok: boolean; docId: string; detail?: string }>> {
  return runAction(async () => {
    const ctx = await requireAnyModule("laboratory", "doctor", "frontdesk", "admin");
    return sendLabReportOnWhatsApp(ctx, orderId, phone);
  });
}

export async function searchLabPatientsAction(query: string): Promise<
  ActionResult<{ id: string; name: string; uhid: string; phone: string; age?: number; gender?: string }[]>
> {
  return runAction(async () => {
    const ctx = await requireModule("laboratory");
    const q = query.trim();
    const rows = await prisma.patient.findMany({
      where: {
        ...branchScope(ctx),
        OR: [
          { fullName: { contains: q, mode: "insensitive" } },
          { uhid: { contains: q, mode: "insensitive" } },
          { phone: { contains: q } },
        ],
      },
      take: 20,
      orderBy: { fullName: "asc" },
      select: { id: true, name: true, uhid: true, phone: true, age: true, dateOfBirth: true, gender: true },
    });
    return rows.map((r) => {
      let age = r.age ?? undefined;
      if (age == null && r.dateOfBirth) {
        age = Math.floor((Date.now() - new Date(r.dateOfBirth).getTime()) / (1000 * 60 * 60 * 24 * 365.25));
      }
      return {
        id: r.id,
        name: r.name ?? "",
        uhid: r.uhid,
        phone: r.phone,
        age,
        dateOfBirth: r.dateOfBirth ? r.dateOfBirth.toISOString() : undefined,
        gender: r.gender ?? undefined,
      };
    });
  });
}

export async function listLabReportTemplatesAction(): Promise<ActionResult<LabReportTemplate[]>> {
  return runAction(async () => {
    const ctx = await requireModule("laboratory");
    return listLabReportTemplates(ctx);
  });
}

export async function getDefaultLabReportTemplateAction(): Promise<ActionResult<LabReportTemplate | null>> {
  return runAction(async () => {
    const ctx = await requireModule("laboratory");
    return getDefaultLabReportTemplate(ctx);
  });
}

export async function upsertLabReportTemplateAction(
  input: Parameters<typeof upsertLabReportTemplate>[1],
  id?: string,
): Promise<ActionResult<LabReportTemplate>> {
  return runAction(async () => {
    const ctx = await requireModule("laboratory");
    return upsertLabReportTemplate(ctx, input, id);
  });
}

export async function deleteLabReportTemplateAction(id: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await requireModule("laboratory");
    return deleteLabReportTemplate(ctx, id);
  });
}

export async function setDefaultLabReportTemplateAction(id: string): Promise<ActionResult<LabReportTemplate>> {
  return runAction(async () => {
    const ctx = await requireModule("laboratory");
    return setDefaultLabReportTemplate(ctx, id);
  });
}
