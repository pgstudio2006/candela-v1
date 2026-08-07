"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createId } from "@/lib/id";
import { branchScope } from "@/server/tenancy";
import type { ServerContext } from "@/server/context";
import { ServerActionError } from "@/server/errors";
import { serializeForClient } from "@/server/serialize";
import { getApplicableRange, parseNumber } from "@/lib/lab-ranges";
import { buildLabReportPdfBytes, bytesToDataUrl, type LabReportTemplateSpec, type LabReportDoctor } from "./lab-report-pdf";
import { deliverWhatsAppDocument } from "@/server/notification-delivery";
import { getActiveConnection, decryptWhatsAppToken } from "@/server/whatsapp/connection";
import { getDefaultDocumentTemplate } from "@/server/doctor";
import type {
  LabDataType,
  LabFieldMaster,
  LabFieldRange,
  LabOrder,
  LabOrderInput,
  LabReportCatalog,
  LabReportResult,
  LabResultFlag,
  LabResultInput,
  LabReportTemplate,
  LabTemplateOverlayField,
} from "@/design-system/lab-data";
import { DEFAULT_DOCUMENT_TEMPLATES, type DocumentTemplate } from "@/design-system/document-templates";

export type LabSnapshot = {
  fieldMasters: LabFieldMaster[];
  reportCatalogs: LabReportCatalog[];
  orders: LabOrder[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveReportingDoctor(
  ctx: ServerContext,
  reportedByStaffId?: string | null,
  orderedByName?: string | null,
): Promise<LabReportDoctor | undefined> {
  if (reportedByStaffId) {
    const staff = await prisma.adminStaff.findFirst({
      where: { id: reportedByStaffId, branchId: ctx.branchId },
    });
    if (staff) {
      return {
        name: staff.name,
        degree: staff.degree,
        designation: staff.designation,
        licenseNo: staff.licenseNo,
        signature: staff.signature,
      };
    }
  }
  if (orderedByName) return { name: orderedByName };
  return undefined;
}

function evaluateLabResult(
  fieldMaster: LabFieldMaster,
  value: string,
  patient: { gender?: string | null; dateOfBirth?: Date | null; age?: number | null; sampleType?: string; pregnancy?: boolean },
  recordedAt: Date,
): { flag: LabResultFlag | undefined; numericValue: number | null; displayValue: string } {
  const numericValue = parseNumber(value);
  const displayValue = value.trim();

  if (fieldMaster.dataType === "boolean") {
    const text = displayValue.toLowerCase();
    const positive = ["positive", "pos", "+", "yes", "detected", "reactive"];
    const flag: LabResultFlag | undefined = positive.includes(text) ? "high" : "normal";
    return { flag, numericValue: null, displayValue };
  }

  if (fieldMaster.dataType === "select") {
    // Select values are not auto-flagged unless configured in the future.
    return { flag: undefined, numericValue: null, displayValue };
  }

  if (numericValue == null) {
    return { flag: undefined, numericValue: null, displayValue };
  }

  const range = getApplicableRange(fieldMaster, patient, recordedAt, patient.sampleType);
  if (!range) return { flag: undefined, numericValue, displayValue };

  let flag: LabResultFlag | undefined = "normal";
  if (range.criticalLow != null && numericValue <= range.criticalLow) flag = "critical_low";
  else if (range.criticalHigh != null && numericValue >= range.criticalHigh) flag = "critical_high";
  else if (range.low != null && numericValue < range.low) flag = "low";
  else if (range.high != null && numericValue > range.high) flag = "high";

  return { flag, numericValue, displayValue };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

function serializeFieldMaster(row: Record<string, unknown>): LabFieldMaster {
  return {
    id: String(row.id),
    tenantId: String(row.tenantId ?? ""),
    branchId: String(row.branchId ?? ""),
    code: String(row.code),
    name: String(row.name),
    unit: row.unit ? String(row.unit) : undefined,
    dataType: String(row.dataType) as LabDataType,
    sampleTypes: (Array.isArray(row.sampleTypes) ? row.sampleTypes : []).map(String),
    options: row.options ?? undefined,
    defaultNote: row.defaultNote ? String(row.defaultNote) : undefined,
    active: Boolean(row.active),
    ranges: Array.isArray((row as unknown as { ranges?: unknown[] }).ranges)
      ? (row as unknown as { ranges: unknown[] }).ranges.map((r) => serializeFieldRange(r as Record<string, unknown>))
      : [],
    createdAt: row.createdAt ? new Date(String(row.createdAt)).toISOString() : new Date().toISOString(),
    updatedAt: row.updatedAt ? new Date(String(row.updatedAt)).toISOString() : new Date().toISOString(),
  };
}

function serializeFieldRange(row: Record<string, unknown>): LabFieldRange {
  return {
    id: String(row.id),
    fieldMasterId: String(row.fieldMasterId),
    gender: (row.gender ? String(row.gender) : "all") as LabFieldRange["gender"],
    ageMin: row.ageMin != null ? Number(row.ageMin) : undefined,
    ageMax: row.ageMax != null ? Number(row.ageMax) : undefined,
    ageUnit: String(row.ageUnit ?? "years") as LabFieldRange["ageUnit"],
    sampleType: row.sampleType ? String(row.sampleType) : undefined,
    pregnancy: row.pregnancy != null ? Boolean(row.pregnancy) : undefined,
    condition: row.condition ? String(row.condition) : undefined,
    low: row.low != null ? Number(row.low) : undefined,
    high: row.high != null ? Number(row.high) : undefined,
    criticalLow: row.criticalLow != null ? Number(row.criticalLow) : undefined,
    criticalHigh: row.criticalHigh != null ? Number(row.criticalHigh) : undefined,
    displayLabel: row.displayLabel ? String(row.displayLabel) : undefined,
    isDefault: Boolean(row.isDefault),
    createdAt: row.createdAt ? new Date(String(row.createdAt)).toISOString() : new Date().toISOString(),
    updatedAt: row.updatedAt ? new Date(String(row.updatedAt)).toISOString() : new Date().toISOString(),
  };
}

function serializeReportCatalog(row: Record<string, unknown> & { fields?: unknown[] }): LabReportCatalog {
  const service = row.service ? (row.service as Record<string, unknown>) : undefined;
  return {
    id: String(row.id),
    tenantId: String(row.tenantId ?? ""),
    branchId: String(row.branchId ?? ""),
    code: String(row.code),
    name: String(row.name),
    description: row.description ? String(row.description) : undefined,
    sampleType: row.sampleType ? String(row.sampleType) : undefined,
    headerNote: row.headerNote ? String(row.headerNote) : undefined,
    footerNote: row.footerNote ? String(row.footerNote) : undefined,
    serviceId: row.serviceId ? String(row.serviceId) : undefined,
    service: service
      ? {
          id: String(service.id),
          label: String(service.label ?? ""),
          category: String(service.category ?? ""),
          rate: Number(service.rate ?? 0),
          gstPercent: service.gstPercent != null ? Number(service.gstPercent) : undefined,
        }
      : undefined,
    active: Boolean(row.active),
    fields: Array.isArray(row.fields)
      ? row.fields.map((f) => serializeReportCatalogField(f as Record<string, unknown> & { fieldMaster?: unknown }))
      : [],
    createdAt: row.createdAt ? new Date(String(row.createdAt)).toISOString() : new Date().toISOString(),
    updatedAt: row.updatedAt ? new Date(String(row.updatedAt)).toISOString() : new Date().toISOString(),
  };
}

function serializeReportCatalogField(
  row: Record<string, unknown> & { fieldMaster?: unknown },
): LabReportCatalog["fields"][number] {
  const fieldMaster = row.fieldMaster ? serializeFieldMaster(row.fieldMaster as Record<string, unknown>) : undefined;
  return {
    id: String(row.id),
    reportCatalogId: String(row.reportCatalogId),
    fieldMasterId: String(row.fieldMasterId),
    section: row.section ? String(row.section) : undefined,
    sortOrder: Number(row.sortOrder ?? 0),
    isVisible: row.isVisible == null ? true : Boolean(row.isVisible),
    fieldMaster,
    createdAt: row.createdAt ? new Date(String(row.createdAt)).toISOString() : new Date().toISOString(),
    updatedAt: row.updatedAt ? new Date(String(row.updatedAt)).toISOString() : new Date().toISOString(),
  };
}

function serializeReportResult(row: Record<string, unknown> & { fieldMaster?: unknown }): LabReportResult {
  return {
    id: String(row.id),
    labOrderItemId: String(row.labOrderItemId),
    labOrderId: String(row.labOrderId),
    fieldMasterId: String(row.fieldMasterId),
    fieldMaster: row.fieldMaster ? serializeFieldMaster(row.fieldMaster as Record<string, unknown>) : undefined,
    value: String(row.value),
    numericValue: row.numericValue != null ? Number(row.numericValue) : undefined,
    flag: row.flag ? (String(row.flag) as LabResultFlag) : undefined,
    note: row.note ? String(row.note) : undefined,
    recordedAt: row.recordedAt ? new Date(String(row.recordedAt)).toISOString() : new Date().toISOString(),
    recordedBy: row.recordedBy ? String(row.recordedBy) : undefined,
    createdAt: row.createdAt ? new Date(String(row.createdAt)).toISOString() : new Date().toISOString(),
    updatedAt: row.updatedAt ? new Date(String(row.updatedAt)).toISOString() : new Date().toISOString(),
  };
}

function serializeOrderItem(row: Record<string, unknown> & { reportCatalog?: unknown; results?: unknown[] }): LabOrder["items"][number] {
  const service = row.service ? (row.service as Record<string, unknown>) : undefined;
  return {
    id: String(row.id),
    labOrderId: String(row.labOrderId),
    reportCatalogId: String(row.reportCatalogId),
    reportCatalog: row.reportCatalog ? serializeReportCatalog(row.reportCatalog as Record<string, unknown> & { fields?: unknown[] }) : undefined,
    serviceId: row.serviceId ? String(row.serviceId) : undefined,
    serviceName: service ? String(service.label ?? "") : undefined,
    price: row.price != null ? Number(row.price) : undefined,
    gstPercent: row.gstPercent != null ? Number(row.gstPercent) : undefined,
    label: String(row.label),
    sampleType: row.sampleType ? String(row.sampleType) : undefined,
    status: String(row.status) as LabOrder["items"][number]["status"],
    sampleCollectedAt: row.sampleCollectedAt ? new Date(String(row.sampleCollectedAt)).toISOString() : undefined,
    completedAt: row.completedAt ? new Date(String(row.completedAt)).toISOString() : undefined,
    results: Array.isArray(row.results)
      ? row.results.map((r) => serializeReportResult(r as Record<string, unknown> & { fieldMaster?: unknown }))
      : [],
    createdAt: row.createdAt ? new Date(String(row.createdAt)).toISOString() : new Date().toISOString(),
    updatedAt: row.updatedAt ? new Date(String(row.updatedAt)).toISOString() : new Date().toISOString(),
  };
}

function serializeOrder(row: Record<string, unknown> & { patient?: Record<string, unknown>; items?: unknown[] }): LabOrder {
  return {
    id: String(row.id),
    tenantId: String(row.tenantId ?? ""),
    branchId: String(row.branchId ?? ""),
    patientId: String(row.patientId),
    patientName: row.patient ? String(row.patient.fullName ?? row.patient.name ?? "") : undefined,
    patientUhid: row.patient ? String(row.patient.uhid ?? "") : undefined,
    patientGender: row.patient ? (String(row.patient.gender ?? "") || null) : null,
    patientDateOfBirth: row.patient ? (row.patient.dateOfBirth ? new Date(String(row.patient.dateOfBirth)).toISOString() : null) : null,
    patientAge: row.patient
      ? (row.patient.dateOfBirth
          ? Math.floor((Date.now() - new Date(String(row.patient.dateOfBirth)).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
          : row.patient.age != null
            ? Number(row.patient.age)
            : null)
      : null,
    patientBloodGroup: row.patient ? (row.patient.bloodGroup ? String(row.patient.bloodGroup) : null) : null,
    visitId: row.visitId ? String(row.visitId) : undefined,
    admissionId: row.admissionId ? String(row.admissionId) : undefined,
    orderedBy: String(row.orderedBy),
    orderedByName: row.orderedByName ? String(row.orderedByName) : undefined,
    reportedByStaffId: row.reportedByStaffId ? String(row.reportedByStaffId) : null,
    reportedByName: row.reportedByName ? String(row.reportedByName) : null,
    source: String(row.source) as LabOrder["source"],
    pregnancy: row.pregnancy != null ? Boolean(row.pregnancy) : false,
    status: String(row.status) as LabOrder["status"],
    orderedAt: row.orderedAt ? new Date(String(row.orderedAt)).toISOString() : new Date().toISOString(),
    sampleCollectedAt: row.sampleCollectedAt ? new Date(String(row.sampleCollectedAt)).toISOString() : undefined,
    completedAt: row.completedAt ? new Date(String(row.completedAt)).toISOString() : undefined,
    cancelledAt: row.cancelledAt ? new Date(String(row.cancelledAt)).toISOString() : undefined,
    cancelReason: row.cancelReason ? String(row.cancelReason) : undefined,
    items: Array.isArray(row.items)
      ? row.items.map((i) => serializeOrderItem(i as Record<string, unknown> & { reportCatalog?: unknown; results?: unknown[] }))
      : [],
    createdAt: row.createdAt ? new Date(String(row.createdAt)).toISOString() : new Date().toISOString(),
    updatedAt: row.updatedAt ? new Date(String(row.updatedAt)).toISOString() : new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Field Master
// ---------------------------------------------------------------------------

export async function listFieldMasters(ctx: ServerContext): Promise<LabFieldMaster[]> {
  const scope = branchScope(ctx);
  const rows = await prisma.labFieldMaster.findMany({
    where: scope,
    include: { ranges: { orderBy: { isDefault: "desc" } } },
    orderBy: { name: "asc" },
  });
  return serializeForClient(rows.map((r) => serializeFieldMaster(r as unknown as Record<string, unknown>))) as LabFieldMaster[];
}

export async function getFieldMaster(ctx: ServerContext, id: string): Promise<LabFieldMaster | null> {
  const scope = branchScope(ctx);
  const row = await prisma.labFieldMaster.findFirst({
    where: { id, ...scope },
    include: { ranges: { orderBy: { isDefault: "desc" } } },
  });
  if (!row) return null;
  return serializeForClient(serializeFieldMaster(row as unknown as Record<string, unknown>)) as LabFieldMaster;
}

type FieldMasterInput = Omit<Partial<LabFieldMaster>, "ranges" | "createdAt" | "updatedAt"> & {
  ranges?: Omit<Partial<LabFieldRange>, "id" | "fieldMasterId" | "createdAt" | "updatedAt">[];
};

export async function upsertFieldMaster(ctx: ServerContext, input: FieldMasterInput): Promise<LabFieldMaster> {
  const scope = branchScope(ctx);
  const id = input.id;
  const code = String(input.code ?? "").trim();
  const name = String(input.name ?? "").trim();
  if (!code) throw new ServerActionError("VALIDATION", "Field code is required.");
  if (!name) throw new ServerActionError("VALIDATION", "Field name is required.");

  const data = {
    ...scope,
    code,
    name,
    unit: input.unit?.trim() ?? null,
    dataType: input.dataType ?? "numeric",
    sampleTypes: input.sampleTypes ?? [],
    options: input.options === undefined ? Prisma.JsonNull : (input.options as Prisma.InputJsonValue),
    defaultNote: input.defaultNote?.trim() ?? null,
    active: input.active ?? true,
  };

  const upserted = await prisma.$transaction(async (tx) => {
    const master = id
      ? await tx.labFieldMaster.update({
          where: { id },
          data: { ...data, updatedAt: new Date() },
          include: { ranges: true },
        })
      : await tx.labFieldMaster.create({
          data: { ...data, ranges: undefined },
          include: { ranges: true },
        });

    if (input.ranges) {
      await tx.labFieldRange.deleteMany({ where: { fieldMasterId: master.id } });
      if (input.ranges.length > 0) {
        await tx.labFieldRange.createMany({
          data: input.ranges.map((r) => ({
            fieldMasterId: master.id,
            gender: r.gender ?? "all",
            ageMin: r.ageMin ?? null,
            ageMax: r.ageMax ?? null,
            ageUnit: r.ageUnit ?? "years",
            sampleType: r.sampleType?.trim() ?? null,
            pregnancy: r.pregnancy ?? null,
            condition: r.condition?.trim() ?? null,
            low: r.low ?? null,
            high: r.high ?? null,
            criticalLow: r.criticalLow ?? null,
            criticalHigh: r.criticalHigh ?? null,
            displayLabel: r.displayLabel?.trim() ?? null,
            isDefault: r.isDefault ?? false,
          })),
        });
      }
      return tx.labFieldMaster.findFirstOrThrow({
        where: { id: master.id },
        include: { ranges: { orderBy: { isDefault: "desc" } } },
      });
    }
    return master;
  });

  return serializeForClient(serializeFieldMaster(upserted as unknown as Record<string, unknown>)) as LabFieldMaster;
}

export async function deleteFieldMaster(ctx: ServerContext, id: string): Promise<void> {
  const scope = branchScope(ctx);
  await prisma.labFieldMaster.deleteMany({ where: { id, ...scope } });
}

// ---------------------------------------------------------------------------
// Report Catalog
// ---------------------------------------------------------------------------

export async function listReportCatalogs(ctx: ServerContext): Promise<LabReportCatalog[]> {
  const scope = branchScope(ctx);
  const rows = await prisma.labReportCatalog.findMany({
    where: scope,
    include: {
      service: { select: { id: true, label: true, category: true, rate: true, gstPercent: true } },
      fields: { include: { fieldMaster: { include: { ranges: true } } }, orderBy: { sortOrder: "asc" } },
    },
    orderBy: { name: "asc" },
  });
  return serializeForClient(rows.map((r) => serializeReportCatalog(r as unknown as Record<string, unknown> & { fields?: unknown[] }))) as LabReportCatalog[];
}

export async function getReportCatalog(ctx: ServerContext, id: string): Promise<LabReportCatalog | null> {
  const scope = branchScope(ctx);
  const row = await prisma.labReportCatalog.findFirst({
    where: { id, ...scope },
    include: {
      service: { select: { id: true, label: true, category: true, rate: true, gstPercent: true } },
      fields: { include: { fieldMaster: { include: { ranges: true } } }, orderBy: { sortOrder: "asc" } },
    },
  });
  if (!row) return null;
  return serializeForClient(serializeReportCatalog(row as unknown as Record<string, unknown> & { fields?: unknown[] })) as LabReportCatalog;
}

type ReportCatalogFieldInput = {
  id?: string;
  fieldMasterId: string;
  section?: string;
  sortOrder?: number;
  isVisible?: boolean;
};

type ReportCatalogInput = Omit<Partial<LabReportCatalog>, "fields" | "createdAt" | "updatedAt"> & {
  fields?: ReportCatalogFieldInput[];
};

export async function upsertReportCatalog(ctx: ServerContext, input: ReportCatalogInput): Promise<LabReportCatalog> {
  const scope = branchScope(ctx);
  const id = input.id;
  const code = String(input.code ?? "").trim();
  const name = String(input.name ?? "").trim();
  if (!code) throw new ServerActionError("VALIDATION", "Report code is required.");
  if (!name) throw new ServerActionError("VALIDATION", "Report name is required.");

  const data = {
    ...scope,
    code,
    name,
    description: input.description?.trim() ?? null,
    sampleType: input.sampleType?.trim() ?? null,
    headerNote: input.headerNote?.trim() ?? null,
    footerNote: input.footerNote?.trim() ?? null,
    serviceId: input.serviceId?.trim() || null,
    active: input.active ?? true,
  };

  const upserted = await prisma.$transaction(async (tx) => {
    const catalog = id
      ? await tx.labReportCatalog.update({ where: { id }, data: { ...data, updatedAt: new Date() } })
      : await tx.labReportCatalog.create({ data: data as any });

    if (input.fields) {
      await tx.labReportCatalogField.deleteMany({ where: { reportCatalogId: catalog.id } });
      if (input.fields.length > 0) {
        await tx.labReportCatalogField.createMany({
          data: input.fields.map((f, idx) => ({
            reportCatalogId: catalog.id,
            fieldMasterId: f.fieldMasterId,
            section: f.section?.trim() ?? null,
            sortOrder: f.sortOrder ?? idx,
            isVisible: f.isVisible ?? true,
          })),
        });
      }
    }

    return tx.labReportCatalog.findFirstOrThrow({
      where: { id: catalog.id },
      include: {
        service: { select: { id: true, label: true, category: true, rate: true, gstPercent: true } },
        fields: { include: { fieldMaster: { include: { ranges: true } } }, orderBy: { sortOrder: "asc" } },
      },
    });
  });

  return serializeForClient(serializeReportCatalog(upserted as unknown as Record<string, unknown> & { fields?: unknown[] })) as LabReportCatalog;
}

export async function deleteReportCatalog(ctx: ServerContext, id: string): Promise<void> {
  const scope = branchScope(ctx);
  await prisma.labReportCatalog.deleteMany({ where: { id, ...scope } });
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export async function listLabOrders(ctx: ServerContext, patientId?: string): Promise<LabOrder[]> {
  const scope = branchScope(ctx);
  const rows = await prisma.labOrder.findMany({
    where: { ...scope, status: { not: "pending_billing" }, ...(patientId ? { patientId } : {}) },
    include: {
      patient: { select: { name: true, fullName: true, uhid: true, phone: true, gender: true, age: true, dateOfBirth: true, bloodGroup: true } },
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          service: { select: { id: true, label: true, category: true, rate: true, gstPercent: true } },
          reportCatalog: { include: { fields: { include: { fieldMaster: { include: { ranges: true } } }, orderBy: { sortOrder: "asc" } } } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return serializeForClient(rows.map((r) => serializeOrder(r as unknown as Record<string, unknown> & { patient?: Record<string, unknown>; items?: unknown[] }))) as LabOrder[];
}

export async function getLabOrder(ctx: ServerContext, id: string): Promise<LabOrder | null> {
  const scope = branchScope(ctx);
  const row = await prisma.labOrder.findFirst({
    where: { id, ...scope },
    include: {
      patient: { select: { name: true, fullName: true, uhid: true, phone: true, gender: true, age: true, dateOfBirth: true, bloodGroup: true } },
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          service: { select: { id: true, label: true, category: true, rate: true, gstPercent: true } },
          reportCatalog: { include: { fields: { include: { fieldMaster: { include: { ranges: true } } }, orderBy: { sortOrder: "asc" } } } },
          results: { include: { fieldMaster: { include: { ranges: true } } } },
        },
      },
    },
  });
  if (!row) return null;
  return serializeForClient(serializeOrder(row as unknown as Record<string, unknown> & { patient?: Record<string, unknown>; items?: unknown[] })) as LabOrder;
}

export async function createLabOrder(ctx: ServerContext, input: LabOrderInput): Promise<LabOrder> {
  const scope = branchScope(ctx);
  if (!input.patientId) throw new ServerActionError("VALIDATION", "Patient is required.");
  if (!input.items?.length) throw new ServerActionError("VALIDATION", "At least one test is required.");

  const patient = await prisma.patient.findFirst({
    where: { id: input.patientId, ...scope },
    select: { name: true, uhid: true },
  });
  if (!patient) throw new ServerActionError("NOT_FOUND", "Patient not found.");

  const catalogs = await prisma.labReportCatalog.findMany({
    where: { id: { in: input.items.map((i) => i.reportCatalogId) }, ...scope },
    include: { service: { select: { id: true, label: true, category: true, rate: true, gstPercent: true } } },
  });
  const catalogMap = new Map(catalogs.map((c) => [c.id, c]));

  const orderingUser = await prisma.user.findFirst({
    where: { id: ctx.userId },
    select: { name: true },
  });

  const order = await prisma.labOrder.create({
    data: {
      ...scope,
      patientId: input.patientId,
      visitId: input.visitId ?? null,
      admissionId: input.admissionId ?? null,
      orderedBy: ctx.userId,
      orderedByName: orderingUser?.name ?? ctx.userId,
      source: input.source ?? "direct",
      status: "pending_billing",
      items: {
        create: input.items.map((item) => {
          const catalog = catalogMap.get(item.reportCatalogId);
          const service = catalog?.service;
          return {
            reportCatalogId: item.reportCatalogId,
            serviceId: item.serviceId ?? service?.id ?? null,
            label: item.label ?? catalog?.name ?? "Lab test",
            sampleType: item.sampleType ?? catalog?.sampleType ?? null,
            price: service?.rate != null ? Number(service.rate) : 0,
            gstPercent: service?.gstPercent != null ? Number(service.gstPercent) : 0,
            status: "pending_billing",
          };
        }),
      },
    },
    include: {
      patient: { select: { name: true, fullName: true, uhid: true, phone: true, gender: true, age: true, dateOfBirth: true, bloodGroup: true } },
      items: {
        include: {
          service: { select: { id: true, label: true, category: true, rate: true, gstPercent: true } },
          reportCatalog: { include: { fields: { include: { fieldMaster: { include: { ranges: true } } }, orderBy: { sortOrder: "asc" } } } },
        },
      },
    },
  });

  return serializeForClient(serializeOrder(order as unknown as Record<string, unknown> & { patient?: Record<string, unknown>; items?: unknown[] })) as LabOrder;
}

export async function getPendingLabOrdersForVisit(
  ctx: ServerContext,
  visitId: string,
): Promise<LabOrder[]> {
  const scope = branchScope(ctx);
  const rows = await prisma.labOrder.findMany({
    where: { ...scope, visitId, status: "pending_billing" },
    include: {
      patient: { select: { name: true, fullName: true, uhid: true, phone: true, gender: true, age: true, dateOfBirth: true, bloodGroup: true } },
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          service: { select: { id: true, label: true, category: true, rate: true, gstPercent: true } },
          reportCatalog: { include: { fields: { include: { fieldMaster: { include: { ranges: true } } }, orderBy: { sortOrder: "asc" } } } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return serializeForClient(rows.map((r) => serializeOrder(r as unknown as Record<string, unknown> & { patient?: Record<string, unknown>; items?: unknown[] }))) as LabOrder[];
}

export async function collectLabOrderSample(
  ctx: ServerContext,
  orderId: string,
  itemIds?: string[],
): Promise<LabOrder> {
  const scope = branchScope(ctx);
  const now = new Date();
  const order = await getLabOrder(ctx, orderId);
  if (!order) throw new ServerActionError("NOT_FOUND", "Order not found.");

  const itemsToCollect = itemIds?.length
    ? order.items.filter((i) => itemIds.includes(i.id))
    : order.items.filter((i) => i.status === "ordered");

  if (itemsToCollect.length === 0) throw new ServerActionError("VALIDATION", "No samples to collect.");

  await prisma.$transaction(async (tx) => {
    for (const item of itemsToCollect) {
      await tx.labOrderItem.update({
        where: { id: item.id },
        data: { status: "sample_collected", sampleCollectedAt: now },
      });
    }
    const remaining = await tx.labOrderItem.count({
      where: { labOrderId: orderId, status: { not: "sample_collected" } },
    });
    if (remaining === 0 || itemIds == null) {
      await tx.labOrder.update({
        where: { id: orderId },
        data: { status: "sample_collected", sampleCollectedAt: now },
      });
    }
  });

  const updated = await getLabOrder(ctx, orderId);
  if (!updated) throw new ServerActionError("INTERNAL_ERROR", "Failed to reload order.");
  return updated;
}

export async function saveLabResults(
  ctx: ServerContext,
  orderId: string,
  results: LabResultInput[],
): Promise<LabOrder> {
  const scope = branchScope(ctx);
  const order = await getLabOrder(ctx, orderId);
  if (!order) throw new ServerActionError("NOT_FOUND", "Order not found.");

  const patient = await prisma.patient.findFirst({
    where: { id: order.patientId, ...scope },
    select: { name: true, gender: true, age: true, dateOfBirth: true },
  });
  const recordedAt = new Date();

  await prisma.$transaction(async (tx) => {
    for (const r of results) {
      const item = order.items.find((i) => i.id === r.labOrderItemId);
      if (!item) continue;
      const field = item.reportCatalog?.fields.find((f) => f.fieldMasterId === r.fieldMasterId)?.fieldMaster;
      if (!field) continue;

      const { flag, numericValue } = evaluateLabResult(
        field,
        r.value,
        {
          gender: patient?.gender,
          dateOfBirth: patient?.dateOfBirth,
          age: patient?.age ?? undefined,
          sampleType: item.sampleType,
          pregnancy: order.pregnancy,
        },
        recordedAt,
      );

      await tx.labReportResult.upsert({
        where: { id: `${r.labOrderItemId}_${r.fieldMasterId}` },
        create: {
          id: `${r.labOrderItemId}_${r.fieldMasterId}`,
          labOrderItemId: r.labOrderItemId,
          labOrderId: orderId,
          fieldMasterId: r.fieldMasterId,
          value: r.value.trim(),
          numericValue,
          flag,
          note: r.note?.trim() ?? null,
          recordedBy: ctx.userId,
        },
        update: {
          value: r.value.trim(),
          numericValue,
          flag,
          note: r.note?.trim() ?? null,
          recordedAt,
          recordedBy: ctx.userId,
        },
      });
    }
  });

  return (await getLabOrder(ctx, orderId)) ?? order;
}

export async function markLabOrderItemComplete(ctx: ServerContext, itemId: string): Promise<LabOrder> {
  const scope = branchScope(ctx);
  const item = await prisma.labOrderItem.findFirst({
    where: { id: itemId },
    include: { labOrder: true },
  });
  if (!item || !item.labOrder) throw new ServerActionError("NOT_FOUND", "Item not found.");
  assertBranchAccess(ctx, item.labOrder.branchId);

  const now = new Date();
  await prisma.labOrderItem.update({
    where: { id: itemId },
    data: { status: "completed", completedAt: now },
  });

  const orderId = item.labOrderId;
  const remaining = await prisma.labOrderItem.count({
    where: { labOrderId: orderId, status: { not: "completed" } },
  });
  if (remaining === 0) {
    await prisma.labOrder.update({
      where: { id: orderId },
      data: { status: "completed", completedAt: now },
    });
  } else {
    await prisma.labOrder.update({
      where: { id: orderId },
      data: { status: "in_progress" },
    });
  }

  const updated = await getLabOrder(ctx, orderId);
  if (!updated) throw new ServerActionError("INTERNAL_ERROR", "Failed to reload order.");
  return updated;
}

async function attachLabReportToPatientProfile(ctx: ServerContext, order: LabOrder): Promise<void> {
  const scope = branchScope(ctx);
  const patient = await prisma.patient.findFirst({
    where: { id: order.patientId, ...scope },
    select: { name: true, fullName: true, uhid: true, phone: true, gender: true, age: true, dateOfBirth: true, bloodGroup: true },
  });
  if (!patient) return;

  const template = await getDefaultLabReportTemplateForPdf(ctx);
  const reportDoctor = await resolveReportingDoctor(ctx, order.reportedByStaffId, order.orderedByName);
  const pdfBytes = await buildLabReportPdfBytes(
    {
      name: patient.name ?? patient.fullName ?? "Patient",
      uhid: patient.uhid,
      phone: patient.phone,
      gender: patient.gender,
      age: patient.age,
      dateOfBirth: patient.dateOfBirth,
      bloodGroup: patient.bloodGroup,
    },
    [order],
    template,
    reportDoctor,
  );
  const dataUrl = bytesToDataUrl(pdfBytes, `lab-report-${order.id}.pdf`);

  await prisma.patientDocument.create({
    data: {
      id: createId("doc"),
      ...scope,
      patientId: order.patientId,
      visitId: order.visitId ?? null,
      category: "lab_report",
      label: `Lab report · ${order.items.map((i) => i.label).join(", ")}`,
      fileName: `lab-report-${order.id}.pdf`,
      mimeType: "application/pdf",
      size: pdfBytes.length,
      fileUrl: dataUrl,
      uploadedBy: ctx.userId ?? null,
    },
  });
}

export async function markLabOrderComplete(ctx: ServerContext, orderId: string): Promise<LabOrder> {
  const now = new Date();
  await prisma.labOrderItem.updateMany({
    where: { labOrderId: orderId },
    data: { status: "completed", completedAt: now },
  });
  await prisma.labOrder.update({
    where: { id: orderId },
    data: { status: "completed", completedAt: now },
  });
  const updated = await getLabOrder(ctx, orderId);
  if (!updated) throw new ServerActionError("INTERNAL_ERROR", "Failed to reload order.");
  await attachLabReportToPatientProfile(ctx, updated).catch((err) => {
    console.error("[lab:mark-complete] Failed to attach report to patient profile:", err);
  });
  return updated;
}

export async function generateLabOrderReportPdf(
  ctx: ServerContext,
  orderId: string,
  reportedByStaffId?: string | null,
): Promise<Uint8Array> {
  const order = await getLabOrder(ctx, orderId);
  if (!order) throw new ServerActionError("NOT_FOUND", "Order not found.");
  const patient = await prisma.patient.findFirst({
    where: { id: order.patientId, ...branchScope(ctx) },
    select: { name: true, fullName: true, uhid: true, phone: true, gender: true, age: true, dateOfBirth: true, bloodGroup: true },
  });
  if (!patient) throw new ServerActionError("NOT_FOUND", "Patient not found.");

  // Persist reporting doctor selection on the order when provided
  if (reportedByStaffId) {
    const staff = await prisma.adminStaff.findFirst({
      where: { id: reportedByStaffId, branchId: ctx.branchId },
    });
    if (staff) {
      await prisma.labOrder.update({
        where: { id: orderId },
        data: { reportedByStaffId, reportedByName: staff.name },
      });
      order.reportedByStaffId = reportedByStaffId;
      order.reportedByName = staff.name;
    }
  }

  const template = await getDefaultLabReportTemplateForPdf(ctx);
  const reportDoctor = await resolveReportingDoctor(ctx, order.reportedByStaffId, order.orderedByName);
  return buildLabReportPdfBytes(
    { name: patient.name ?? patient.fullName ?? "Patient", uhid: patient.uhid, phone: patient.phone, gender: patient.gender, age: patient.age, dateOfBirth: patient.dateOfBirth, bloodGroup: patient.bloodGroup },
    [order],
    template,
    reportDoctor,
  );
}

export async function generatePatientLabReportPdf(
  ctx: ServerContext,
  patientId: string,
  reportedByStaffId?: string | null,
): Promise<Uint8Array> {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, ...branchScope(ctx) },
    select: { name: true, fullName: true, uhid: true, phone: true, gender: true, age: true, dateOfBirth: true, bloodGroup: true },
  });
  if (!patient) throw new ServerActionError("NOT_FOUND", "Patient not found.");
  const rows = await prisma.labOrder.findMany({
    where: { patientId, ...branchScope(ctx) },
    include: {
      patient: { select: { name: true, fullName: true, uhid: true, phone: true, gender: true, age: true, dateOfBirth: true, bloodGroup: true } },
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          reportCatalog: { include: { fields: { include: { fieldMaster: { include: { ranges: true } } }, orderBy: { sortOrder: "asc" } } } },
          results: { include: { fieldMaster: { include: { ranges: true } } } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const orders = serializeForClient(rows.map((r) => serializeOrder(r as unknown as Record<string, unknown> & { patient?: Record<string, unknown>; items?: unknown[] }))) as LabOrder[];
  const template = await getDefaultLabReportTemplateForPdf(ctx);
  const reportDoctor = reportedByStaffId ? await resolveReportingDoctor(ctx, reportedByStaffId, undefined) : undefined;
  return buildLabReportPdfBytes(
    { name: patient.name ?? patient.fullName ?? "Patient", uhid: patient.uhid, phone: patient.phone, gender: patient.gender, age: patient.age, dateOfBirth: patient.dateOfBirth, bloodGroup: patient.bloodGroup },
    orders,
    template,
    reportDoctor,
  );
}

export async function sendLabReportOnWhatsApp(
  ctx: ServerContext,
  orderId: string,
  recipientPhone?: string,
): Promise<{ ok: boolean; docId: string; detail?: string }> {
  const order = await getLabOrder(ctx, orderId);
  if (!order) throw new ServerActionError("NOT_FOUND", "Order not found.");
  const patient = await prisma.patient.findFirst({
    where: { id: order.patientId, ...branchScope(ctx) },
    select: { name: true, fullName: true, phone: true, gender: true, age: true, dateOfBirth: true, bloodGroup: true },
  });
  if (!patient) throw new ServerActionError("NOT_FOUND", "Patient not found.");
  const phone = recipientPhone?.trim() || patient.phone;
  if (!phone) throw new ServerActionError("VALIDATION", "Patient phone number is missing.");

  const template = await getDefaultLabReportTemplateForPdf(ctx);
  const reportDoctor = await resolveReportingDoctor(ctx, order.reportedByStaffId, order.orderedByName);
  const pdfBytes = await buildLabReportPdfBytes(
    { name: patient.name ?? patient.fullName ?? "Patient", uhid: "", phone, gender: patient.gender, age: patient.age, dateOfBirth: patient.dateOfBirth, bloodGroup: patient.bloodGroup },
    [order],
    template,
    reportDoctor,
  );
  const dataUrl = bytesToDataUrl(pdfBytes, `lab-report-${order.id}.pdf`);
  const docId = createId("doc");
  await prisma.patientDocument.create({
    data: {
      id: docId,
      ...branchScope(ctx),
      patientId: order.patientId,
      visitId: order.visitId ?? null,
      category: "lab_report",
      label: `Lab report · ${order.items.map((i) => i.label).join(", ")}`,
      fileName: `lab-report-${order.id}.pdf`,
      mimeType: "application/pdf",
      size: pdfBytes.length,
      fileUrl: dataUrl,
      uploadedBy: ctx.userId ?? null,
    },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const documentUrl = `${baseUrl}/api/patient-documents/${docId}`;
  const caption = `Your lab report for ${patient.name ?? patient.fullName ?? "Patient"} is ready. Open the attached PDF to view results.`;
  const connection = await getActiveConnection(ctx);
  const connDetails = connection ? {
    accessToken: decryptWhatsAppToken(connection.accessToken),
    phoneNumberId: connection.phoneNumberId,
  } : undefined;

  const result = await deliverWhatsAppDocument(phone, documentUrl, `lab-report-${order.id}.pdf`, caption, connDetails);
  return { ok: result.ok, docId, detail: result.detail };
}

export async function cancelLabOrder(
  ctx: ServerContext,
  orderId: string,
  reason?: string,
): Promise<LabOrder> {
  const now = new Date();
  const order = await prisma.labOrder.findFirst({
    where: { id: orderId, ...branchScope(ctx) },
  });
  if (!order) throw new ServerActionError("NOT_FOUND", "Order not found.");

  if (order.status === "completed") {
    throw new ServerActionError("VALIDATION", "Cannot cancel a completed order.");
  }

  await prisma.labOrder.update({
    where: { id: orderId },
    data: { status: "cancelled", cancelledAt: now, cancelReason: reason?.trim() ?? null },
  });

  const updated = await getLabOrder(ctx, orderId);
  if (!updated) throw new ServerActionError("INTERNAL_ERROR", "Failed to reload order.");
  return updated;
}

function assertBranchAccess(ctx: ServerContext, branchId?: string | null) {
  if (branchId && branchId !== ctx.branchId) {
    throw new ServerActionError("FORBIDDEN", "Cross-branch access denied.");
  }
}

// ---------------------------------------------------------------------------
// Report templates
// ---------------------------------------------------------------------------

function labTemplateSpecFromDocumentTemplate(template: DocumentTemplate | null): LabReportTemplateSpec | undefined {
  if (!template?.fileData) return undefined;
  return {
    fileData: template.fileData,
    mimeType: template.mimeType ?? "application/pdf",
    marginTop: template.marginTop ?? 50,
    marginBottom: template.marginBottom ?? 50,
    marginLeft: template.marginLeft ?? 50,
    marginRight: template.marginRight ?? 50,
    overlayFields: (template.overlayFields ?? []).map((f) => ({ ...f })) as LabTemplateOverlayField[],
  };
}

const PATAUDI_BRANCH_ID = "branch_pataudi";

async function getDefaultLabReportTemplateForPdf(ctx: ServerContext): Promise<LabReportTemplateSpec | undefined> {
  if (ctx.branchId === PATAUDI_BRANCH_ID) {
    const template = DEFAULT_DOCUMENT_TEMPLATES.find((item) => item.kind === "lab_report");
    return labTemplateSpecFromDocumentTemplate(template ?? null);
  }

  const template = await getDefaultDocumentTemplate(ctx, "lab_report");
  return labTemplateSpecFromDocumentTemplate(template);
}

export async function listLabReportTemplates(ctx: ServerContext): Promise<LabReportTemplate[]> {
  const rows = await prisma.labReportTemplate.findMany({
    where: { ...branchScope(ctx), active: true },
    orderBy: { createdAt: "desc" },
  });
  return serializeForClient(rows) as unknown as LabReportTemplate[];
}

export async function getDefaultLabReportTemplate(ctx: ServerContext): Promise<LabReportTemplate | null> {
  const scope = branchScope(ctx);
  const row =
    (await prisma.labReportTemplate.findFirst({ where: { ...scope, isDefault: true, active: true } })) ??
    (await prisma.labReportTemplate.findFirst({ where: { ...scope, active: true }, orderBy: { createdAt: "desc" } }));
  return row ? (serializeForClient(row) as unknown as LabReportTemplate) : null;
}

export async function upsertLabReportTemplate(
  ctx: ServerContext,
  input: {
    name: string;
    fileData: string;
    mimeType: string;
    marginTop?: number;
    marginBottom?: number;
    marginLeft?: number;
    marginRight?: number;
    overlayFields?: unknown;
    isDefault?: boolean;
    active?: boolean;
  },
  id?: string,
): Promise<LabReportTemplate> {
  const scope = branchScope(ctx);
  const data = {
    ...scope,
    name: input.name.trim(),
    fileData: input.fileData,
    mimeType: input.mimeType,
    marginTop: input.marginTop ?? 50,
    marginBottom: input.marginBottom ?? 50,
    marginLeft: input.marginLeft ?? 50,
    marginRight: input.marginRight ?? 50,
    overlayFields: input.overlayFields === undefined ? Prisma.JsonNull : (input.overlayFields as Prisma.InputJsonValue),
    isDefault: input.isDefault ?? false,
    active: input.active ?? true,
  };

  const row = await prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.labReportTemplate.updateMany({ where: scope, data: { isDefault: false } });
    }
    if (id) {
      return tx.labReportTemplate.upsert({
        where: { id },
        update: data,
        create: { id, ...data },
      });
    }
    return tx.labReportTemplate.create({ data });
  });
  return serializeForClient(row) as unknown as LabReportTemplate;
}

export async function deleteLabReportTemplate(ctx: ServerContext, id: string): Promise<void> {
  const scope = branchScope(ctx);
  const count = await prisma.labReportTemplate.deleteMany({ where: { id, ...scope } });
  if (count.count === 0) throw new ServerActionError("NOT_FOUND", "Template not found.");
}

export async function setDefaultLabReportTemplate(ctx: ServerContext, id: string): Promise<LabReportTemplate> {
  const scope = branchScope(ctx);
  const row = await prisma.$transaction(async (tx) => {
    await tx.labReportTemplate.updateMany({ where: scope, data: { isDefault: false } });
    return tx.labReportTemplate.update({
      where: { id },
      data: { isDefault: true },
    });
  });
  assertBranchAccess(ctx, row.branchId);
  return serializeForClient(row) as unknown as LabReportTemplate;
}
