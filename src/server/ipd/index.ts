import { prisma } from "@/lib/prisma";
import type {
  IpdAdmissionDetail,
  IpdAdmissionInput,
  IpdAdmissionStatus,
  IpdBedRow,
  IpdBedSummary,
  IpdBillingMode,
  IpdCartItem,
  IpdPatientType,
  IpdSnapshot,
  IpdWard,
} from "@/design-system/ipd-data";
import type { ServerContext } from "@/server/context";
import { ServerActionError } from "@/server/errors";
import { branchScope } from "@/server/tenancy";
import { writePlatformAudit } from "@/server/platform-audit";
import { ensureHospitalBootstrap } from "@/server/hospital-bootstrap";
import { syncVisitFromOpdVisit } from "@/server/visit-sync";
import { createId } from "@/lib/id";
import { patientDisplayName } from "@/lib/frontdesk-workflow";
import { resolveDoctorName } from "@/lib/clinical-roster";
import { backfillBranchScope } from "@/server/branch-scope";
import { loadClinicalRoster } from "@/server/clinical/roster";
import { upsertVisitInvoice } from "@/server/invoicing";
import { computeGstInvoice, parseBranchGstSettings } from "@/lib/gst-invoicing";

export type { IpdSnapshot } from "@/design-system/ipd-data";

export async function ensureIpdWardBed(
  tx: any,
  ctx: Pick<ServerContext, "tenantId" | "branchId">,
  wardLabel: string,
  bedLabel: string,
  category: string,
): Promise<{ wardId: string; bedId: string }> {
  let ward = await tx.ipdWard.findFirst({
    where: { tenantId: ctx.tenantId, branchId: ctx.branchId, label: wardLabel },
  });
  if (!ward) {
    ward = await tx.ipdWard.create({
      data: {
        id: createId("ipdward"),
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        label: wardLabel,
        category,
      },
    });
  }
  let bed = await tx.ipdBed.findFirst({
    where: { wardId: ward.id, label: bedLabel },
  });
  if (!bed) {
    bed = await tx.ipdBed.create({
      data: {
        id: createId("ipdbed"),
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        wardId: ward.id,
        label: bedLabel,
      },
    });
  }
  return { wardId: ward.id, bedId: bed.id };
}

type WardWithBeds = {
  id: string;
  label: string;
  category: string;
  active: boolean;
  beds: {
    id: string;
    label: string;
    active: boolean;
  }[];
};

function toWardDto(row: {
  id: string;
  label: string;
  category: string;
  active: boolean;
  beds: { id: string; label: string; active: boolean }[];
}): IpdWard {
  return {
    id: row.id,
    label: row.label,
    category: row.category as IpdWard["category"],
    beds: row.beds.filter((b) => b.active).map((b) => b.label),
  };
}

export async function getIpdWards(ctx: ServerContext): Promise<WardWithBeds[]> {
  await backfillBranchScope(ctx);
  const scope = branchScope(ctx);
  const rows = await prisma.ipdWard.findMany({
    where: { tenantId: scope.tenantId, branchId: scope.branchId },
    orderBy: { createdAt: "asc" },
    include: {
      beds: { orderBy: { createdAt: "asc" } },
    },
  });
  return rows.map((w) => ({
    id: w.id,
    label: w.label,
    category: w.category,
    active: w.active,
    beds: w.beds.map((b) => ({ id: b.id, label: b.label, active: b.active })),
  }));
}

export async function getIpdSnapshot(ctx: ServerContext): Promise<IpdSnapshot> {
  await ensureHospitalBootstrap();
  await backfillBranchScope(ctx);
  const scope = branchScope(ctx);

  const wardRows = await getIpdWards(ctx);
  const wardIds = wardRows.map((w) => w.id);

  const activeAdmissions = await prisma.ipdAdmission.findMany({
    where: {
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      wardId: { in: wardIds },
      status: { in: ["admitted", "discharge_planned"] },
    },
    include: { patient: { select: { id: true, name: true, fullName: true, uhid: true } } },
    orderBy: { createdAt: "desc" },
  });

  const admissionByBedId = new Map(
    activeAdmissions.map((a) => [
      a.bedId,
      {
        id: a.id,
        patientId: a.patientId,
        patientName: patientDisplayName(a.patient) ?? a.patientId,
        doctorName: a.doctorName,
        diagnosis: a.diagnosis,
        status: a.status as IpdAdmissionStatus,
        admittedAt: a.admittedAt.toISOString(),
        expectedDischarge: a.expectedDischarge?.toISOString() ?? undefined,
      },
    ]),
  );

  const allBeds = await prisma.ipdBed.findMany({
    where: { wardId: { in: wardIds } },
    orderBy: { createdAt: "asc" },
  });
  const bedsByWard = new Map<string, typeof allBeds>();
  for (const bed of allBeds) {
    const list = bedsByWard.get(bed.wardId) ?? [];
    list.push(bed);
    bedsByWard.set(bed.wardId, list);
  }

  const wards: IpdBedSummary[] = wardRows.map((ward) => {
    const beds = (bedsByWard.get(ward.id) ?? []).map((bed) => {
      const admission = admissionByBedId.get(bed.id);
      return {
        id: bed.id,
        label: bed.label,
        occupied: Boolean(admission),
        admission,
      };
    });
    return {
      wardId: ward.id,
      ward: ward.label,
      category: ward.category as IpdWard["category"],
      beds,
    };
  });

  const totalBeds = wards.reduce((sum, w) => sum + w.beds.length, 0);
  const occupiedBeds = wards.reduce((sum, w) => sum + w.beds.filter((b) => b.occupied).length, 0);

  const [registeredPatients, roster] = await Promise.all([
    prisma.patient.findMany({
      where: {
        tenantId: scope.tenantId,
        branchId: scope.branchId,
        status: { in: ["active", "emergency"] },
      },
      select: { id: true, name: true, fullName: true, uhid: true, phone: true },
      orderBy: { createdAt: "desc" },
    }),
    loadClinicalRoster(ctx),
  ]);

  const patientOptions = registeredPatients.map((p) => ({
    id: p.id,
    name: patientDisplayName(p),
    uhid: p.uhid,
    phone: p.phone ?? "",
  }));

  const doctorOptions = roster.allDoctors.map((d) => ({ id: d.id, name: d.name }));

  const departmentOptions = roster.departments.map((d) => ({
    id: d.id,
    label: d.label,
  }));

  return {
    wards,
    totalBeds,
    occupiedBeds,
    freeBeds: totalBeds - occupiedBeds,
    patients: patientOptions,
    doctors: doctorOptions,
    departments: departmentOptions,
  };
}

export async function getIpdAdmission(ctx: ServerContext, id: string) {
  const scope = branchScope(ctx);
  const admission = await prisma.ipdAdmission.findFirst({
    where: { id, tenantId: scope.tenantId, branchId: scope.branchId },
    include: {
      patient: { select: { id: true, name: true, fullName: true, uhid: true, phone: true, age: true, gender: true } },
      ward: true,
      bed: true,
    },
  });
  if (!admission) throw new ServerActionError("NOT_FOUND", "IPD admission not found.");

  const detail: IpdAdmissionDetail = {
    id: admission.id,
    visitId: admission.visitId ?? "",
    patientId: admission.patientId,
    patientName: patientDisplayName(admission.patient) ?? admission.patientId,
    uhid: admission.patient.uhid,
    phone: admission.patient.phone,
    age: admission.patient.age,
    gender: admission.patient.gender,
    ward: admission.ward.label,
    bed: admission.bed.label,
    category: admission.ward.category,
    patientType: (admission.patientType ?? "general") as IpdPatientType,
    billingMode: (admission.billingMode ?? "postpaid") as IpdBillingMode,
    expectedDischarge: admission.expectedDischarge?.toISOString() ?? null,
    admittedAt: admission.admittedAt.toISOString(),
    diagnosis: admission.diagnosis,
    attendingDoctorId: admission.attendingDoctorId,
    doctorName: admission.doctorName,
    lastRoundAt: admission.lastRoundAt?.toISOString() ?? null,
    lastRoundNote: admission.lastRoundNote ?? null,
    status: admission.status as IpdAdmissionStatus,
    cart: (admission.cart as unknown as IpdCartItem[] | null) ?? [],
  };
  return detail;
}

export async function admitPatient(ctx: ServerContext, input: IpdAdmissionInput) {
  await ensureHospitalBootstrap();
  const scope = branchScope(ctx);

  if (!input.patientId?.trim()) throw new ServerActionError("VALIDATION", "Select a registered patient.");
  if (!input.doctorId?.trim()) throw new ServerActionError("VALIDATION", "Select an attending doctor.");
  if (!input.departmentId?.trim()) throw new ServerActionError("VALIDATION", "Select a department.");
  if (!input.wardId?.trim()) throw new ServerActionError("VALIDATION", "Select a ward.");
  if (!input.bed?.trim()) throw new ServerActionError("VALIDATION", "Select a bed.");

  const bed = await prisma.ipdBed.findFirst({
    where: { id: input.bed, wardId: input.wardId, branchId: scope.branchId },
    include: { ward: true },
  });
  if (!bed) throw new ServerActionError("VALIDATION", "Selected bed not found.");

  const existingOccupant = await prisma.ipdAdmission.findFirst({
    where: {
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      bedId: bed.id,
      status: { in: ["admitted", "discharge_planned"] },
    },
  });
  if (existingOccupant) {
    throw new ServerActionError("CONFLICT", "Selected bed is already occupied.");
  }

  const patient = await prisma.patient.findFirst({
    where: { id: input.patientId, tenantId: scope.tenantId, branchId: scope.branchId },
    select: { id: true, name: true, fullName: true },
  });
  if (!patient) throw new ServerActionError("NOT_FOUND", "Patient not found in this branch.");
  const patientName = patientDisplayName(patient) ?? input.patientId;

  const roster = await loadClinicalRoster(ctx);
  const doctorName = resolveDoctorName(input.doctorId, roster);
  const departmentLabel = roster.departments.find((d) => d.id === input.departmentId)?.label ?? input.departmentId;

  const visitId = createId("vis");
  const ipdId = `ipd_${visitId}`;
  const now = new Date().toISOString();

  await prisma.$transaction(async (tx) => {
    await tx.opdVisit.create({
      data: {
        id: visitId,
        ...scope,
        patientId: input.patientId,
        stage: "ipd_admitted",
        departmentId: input.departmentId,
        doctorId: input.doctorId,
        doctorName,
        billing: "pending",
        exam: "not_started",
        appointment: false,
        waitMin: 0,
        checkInAt: now,
        treatmentPath: "ipd",
        ipdAdmissionId: ipdId,
        routingNote: `Direct IPD admission from front desk · ${departmentLabel}`,
      },
    });

    await tx.ipdAdmission.create({
      data: {
        id: ipdId,
        ...scope,
        visitId,
        patientId: input.patientId,
        wardId: bed.wardId,
        bedId: bed.id,
        doctorName,
        diagnosis: input.diagnosis,
        patientType: input.patientType,
        billingMode: input.billingMode ?? "postpaid",
        expectedDischarge: input.expectedDischarge ? new Date(input.expectedDischarge) : null,
        admittedAt: new Date(),
        attendingDoctorId: input.doctorId,
        status: "admitted",
      },
    });
  });

  const opd = await prisma.opdVisit.findUnique({ where: { id: visitId } });
  if (opd) await syncVisitFromOpdVisit(ctx, opd);

  await writePlatformAudit({
    ctx,
    module: "frontdesk",
    action: "ipd_admitted",
    entityType: "ipd_admission",
    entityId: ipdId,
    summary: `Admitted ${patientName} to ${bed.ward.label} bed ${bed.label}`,
    payload: {
      ward: bed.ward.label,
      bed: bed.label,
      patientType: input.patientType,
      billingMode: input.billingMode,
    },
  });

  return { id: ipdId, visitId, patientId: input.patientId };
}

export async function updateIpdAdmission(
  ctx: ServerContext,
  id: string,
  patch: {
    status?: IpdAdmissionStatus;
    expectedDischarge?: string;
    diagnosis?: string;
    lastRoundNote?: string;
  },
) {
  const scope = branchScope(ctx);
  const existing = await prisma.ipdAdmission.findFirst({
    where: { id, tenantId: scope.tenantId, branchId: scope.branchId },
  });
  if (!existing) throw new ServerActionError("NOT_FOUND", "IPD admission not found.");

  if (patch.status === "discharged") {
    await assertIpdDischargeAllowed(ctx, existing);
  }

  const data: Record<string, unknown> = {};
  if (patch.status) data.status = patch.status;
  if (patch.expectedDischarge !== undefined) data.expectedDischarge = patch.expectedDischarge ? new Date(patch.expectedDischarge) : null;
  if (patch.diagnosis !== undefined) data.diagnosis = patch.diagnosis;
  if (patch.lastRoundNote !== undefined) {
    data.lastRoundNote = patch.lastRoundNote;
    data.lastRoundAt = new Date();
  }

  await prisma.ipdAdmission.update({ where: { id }, data });

  await writePlatformAudit({
    ctx,
    module: "frontdesk",
    action: "ipd_updated",
    entityType: "ipd_admission",
    entityId: id,
    summary: `Updated IPD admission ${id}`,
    payload: patch,
  });

  return { id };
}

async function assertIpdDischargeAllowed(ctx: ServerContext, admission: { id: string; visitId: string | null; cart: unknown }) {
  if (!admission.visitId) return;
  const scope = branchScope(ctx);
  const visit = await prisma.opdVisit.findFirst({
    where: { id: admission.visitId, tenantId: scope.tenantId, branchId: scope.branchId },
    select: { balanceDue: true, amountPaid: true, billAmount: true },
  });
  const balanceDue = visit?.balanceDue ?? 0;
  const cart = parseCart(admission.cart);
  if (balanceDue > 0 || (visit && (visit.amountPaid ?? 0) < (visit.billAmount ?? 0))) {
    throw new ServerActionError("VALIDATION", "Cannot discharge while IPD bill is unpaid. Complete billing first.");
  }
  if (cart.length > 0) {
    throw new ServerActionError("VALIDATION", "Cannot discharge while services/packages are still in the cart. Clear or bill the cart first.");
  }
}

function parseCart(raw: unknown): IpdCartItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is IpdCartItem =>
      item &&
      typeof item === "object" &&
      typeof (item as IpdCartItem).id === "string" &&
      typeof (item as IpdCartItem).packageId === "string" &&
      typeof (item as IpdCartItem).label === "string" &&
      typeof (item as IpdCartItem).amount === "number" &&
      typeof (item as IpdCartItem).quantity === "number",
  );
}

export async function getIpdCart(ctx: ServerContext, admissionId: string): Promise<IpdCartItem[]> {
  const scope = branchScope(ctx);
  const admission = await prisma.ipdAdmission.findFirst({
    where: { id: admissionId, tenantId: scope.tenantId, branchId: scope.branchId },
    select: { cart: true },
  });
  if (!admission) throw new ServerActionError("NOT_FOUND", "IPD admission not found.");
  return parseCart(admission.cart);
}

export async function addIpdCartItem(
  ctx: ServerContext,
  admissionId: string,
  item: Omit<IpdCartItem, "id" | "addedAt">,
): Promise<IpdCartItem[]> {
  const scope = branchScope(ctx);
  const admission = await prisma.ipdAdmission.findFirst({
    where: { id: admissionId, tenantId: scope.tenantId, branchId: scope.branchId },
  });
  if (!admission) throw new ServerActionError("NOT_FOUND", "IPD admission not found.");

  const newItem: IpdCartItem = {
    ...item,
    id: createId("ipdcart"),
    addedAt: new Date().toISOString(),
  };

  const cart = parseCart(admission.cart);
  const existingIndex = cart.findIndex((c) => c.packageId === item.packageId);
  if (existingIndex >= 0) {
    cart[existingIndex] = { ...cart[existingIndex], quantity: cart[existingIndex].quantity + item.quantity };
  } else {
    cart.push(newItem);
  }

  await prisma.ipdAdmission.update({
    where: { id: admissionId },
    data: { cart: cart as unknown as object },
  });

  await writePlatformAudit({
    ctx,
    module: "frontdesk",
    action: "ipd_cart_item_added",
    entityType: "ipd_admission",
    entityId: admissionId,
    summary: `Added ${item.label} to IPD cart`,
    payload: { item: newItem },
  });

  return cart;
}

export async function updateIpdCartItem(
  ctx: ServerContext,
  admissionId: string,
  itemId: string,
  quantity: number,
): Promise<IpdCartItem[]> {
  const scope = branchScope(ctx);
  const admission = await prisma.ipdAdmission.findFirst({
    where: { id: admissionId, tenantId: scope.tenantId, branchId: scope.branchId },
  });
  if (!admission) throw new ServerActionError("NOT_FOUND", "IPD admission not found.");

  const cart = parseCart(admission.cart).map((c) =>
    c.id === itemId ? { ...c, quantity: Math.max(1, quantity) } : c,
  );
  await prisma.ipdAdmission.update({
    where: { id: admissionId },
    data: { cart: cart as unknown as object },
  });

  return cart;
}

export async function removeIpdCartItem(ctx: ServerContext, admissionId: string, itemId: string): Promise<IpdCartItem[]> {
  const scope = branchScope(ctx);
  const admission = await prisma.ipdAdmission.findFirst({
    where: { id: admissionId, tenantId: scope.tenantId, branchId: scope.branchId },
  });
  if (!admission) throw new ServerActionError("NOT_FOUND", "IPD admission not found.");

  const cart = parseCart(admission.cart).filter((c) => c.id !== itemId);
  await prisma.ipdAdmission.update({
    where: { id: admissionId },
    data: { cart: cart as unknown as object },
  });

  return cart;
}

export async function generateIpdFinalBill(
  ctx: ServerContext,
  admissionId: string,
  input: {
    mode?: string;
    paymentSplits?: { mode: string; amount: number }[];
    discount?: number;
  },
) {
  const scope = branchScope(ctx);
  const admission = await prisma.ipdAdmission.findFirst({
    where: { id: admissionId, tenantId: scope.tenantId, branchId: scope.branchId },
    include: { patient: { select: { id: true, name: true, fullName: true } } },
  });
  if (!admission) throw new ServerActionError("NOT_FOUND", "IPD admission not found.");
  const visitId = admission.visitId;
  if (!visitId) throw new ServerActionError("VALIDATION", "Admission is not linked to a visit.");

  const visit = await prisma.opdVisit.findUnique({ where: { id: visitId } });
  if (!visit) throw new ServerActionError("NOT_FOUND", "Visit not found.");

  const cart = parseCart(admission.cart);
  if (!cart.length) throw new ServerActionError("VALIDATION", "No services or packages in the IPD cart.");

  const packageLines = cart.map((item) => ({
    packageId: item.packageId,
    label: item.label,
    amount: item.amount,
    quantity: item.quantity,
  }));

  const subtotal = packageLines.reduce((s, line) => s + line.amount * line.quantity, 0);
  const branch = await prisma.branch.findUnique({ where: { id: scope.branchId } });
  const gstInvoice = computeGstInvoice({
    settings: parseBranchGstSettings(branch?.meta),
    lines: packageLines.map((line) => ({
      label: line.label,
      quantity: line.quantity,
      taxableAmount: line.amount * line.quantity,
    })),
    discount: input.discount ?? 0,
  });
  const net = gstInvoice.grandTotal;

  const splits = input.paymentSplits?.length
    ? input.paymentSplits
    : [{ mode: input.mode ?? "cash", amount: net }];
  const collected = splits.reduce((s, p) => s + p.amount, 0);

  await prisma.$transaction(async (tx) => {
    await upsertVisitInvoice(
      ctx,
      {
        visitId,
        patientId: visit.patientId,
        label: packageLines.map((l) => l.label).join(" · ") || "IPD services",
        subtotal,
        discount: input.discount ?? 0,
        collected,
        mode: splits.length === 1 ? splits[0].mode : "split",
        paymentScope: "full",
        lines: packageLines.map((line) => ({
          label: line.label,
          quantity: line.quantity,
          taxableAmount: line.amount * line.quantity,
        })),
        paymentSplits: splits,
        packageLines,
      },
      tx,
    );

    await tx.ipdAdmission.update({
      where: { id: admissionId },
      data: { cart: [] as unknown as object },
    });
    await tx.opdVisit.update({
      where: { id: visitId },
      data: {
        billing: collected >= net ? "paid" : "partial",
        billAmount: net,
        amountPaid: collected,
        balanceDue: Math.max(0, net - collected),
      },
    });
  });

  const updated = await prisma.opdVisit.findUnique({ where: { id: visitId } });
  if (updated) await syncVisitFromOpdVisit(ctx, updated);

  const invoice = await prisma.invoice.findUnique({ where: { visitId } });
  const patientName = patientDisplayName(admission.patient) ?? admission.patientId;

  await writePlatformAudit({
    ctx,
    module: "frontdesk",
    action: "ipd_final_bill_generated",
    entityType: "ipd_admission",
    entityId: admissionId,
    summary: `Generated IPD final bill for ${patientName}`,
    payload: { total: net, collected, visitId },
  });

  return {
    visitId,
    invoiceNumber: invoice?.invoiceNumber ?? `NV-${visitId.slice(-8).toUpperCase()}`,
    total: net,
    amountPaid: collected,
    balanceDue: Math.max(0, net - collected),
  };
}

export async function transferIpdAdmission(
  ctx: ServerContext,
  id: string,
  target: { wardId: string; bedId: string },
) {
  const scope = branchScope(ctx);
  const admission = await prisma.ipdAdmission.findFirst({
    where: { id, tenantId: scope.tenantId, branchId: scope.branchId },
    include: { ward: true, bed: true },
  });
  if (!admission) throw new ServerActionError("NOT_FOUND", "IPD admission not found.");

  const targetBed = await prisma.ipdBed.findFirst({
    where: { id: target.bedId, wardId: target.wardId, branchId: scope.branchId },
    include: { ward: true },
  });
  if (!targetBed) throw new ServerActionError("VALIDATION", "Target bed not found.");

  const occupant = await prisma.ipdAdmission.findFirst({
    where: {
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      bedId: targetBed.id,
      status: { in: ["admitted", "discharge_planned"] },
      NOT: { id },
    },
  });
  if (occupant) throw new ServerActionError("CONFLICT", "Target bed is already occupied.");

  await prisma.ipdAdmission.update({
    where: { id },
    data: {
      wardId: targetBed.wardId,
      bedId: targetBed.id,
    },
  });

  await writePlatformAudit({
    ctx,
    module: "frontdesk",
    action: "ipd_transferred",
    entityType: "ipd_admission",
    entityId: id,
    summary: `Transferred IPD admission from ${admission.ward.label} ${admission.bed.label} to ${targetBed.ward.label} ${targetBed.label}`,
    payload: { fromWardId: admission.wardId, fromBedId: admission.bedId, toWardId: targetBed.wardId, toBedId: targetBed.id },
  });

  return { id };
}

export async function createIpdWard(ctx: ServerContext, input: { label: string; category: string }) {
  await backfillBranchScope(ctx);
  const scope = branchScope(ctx);
  const id = createId("ipdward");
  const ward = await prisma.ipdWard.create({
    data: { id, ...scope, label: input.label, category: input.category },
  });
  return { id: ward.id, label: ward.label, category: ward.category };
}

export async function updateIpdWard(ctx: ServerContext, id: string, input: { label?: string; category?: string; active?: boolean }) {
  const scope = branchScope(ctx);
  const existing = await prisma.ipdWard.findFirst({
    where: { id, tenantId: scope.tenantId, branchId: scope.branchId },
  });
  if (!existing) throw new ServerActionError("NOT_FOUND", "Ward not found.");
  const data: Record<string, unknown> = {};
  if (input.label !== undefined) data.label = input.label;
  if (input.category !== undefined) data.category = input.category;
  if (input.active !== undefined) data.active = input.active;
  await prisma.ipdWard.update({ where: { id }, data });
  return { id };
}

export async function deleteIpdWard(ctx: ServerContext, id: string) {
  const scope = branchScope(ctx);
  const existing = await prisma.ipdWard.findFirst({
    where: { id, tenantId: scope.tenantId, branchId: scope.branchId },
    include: { beds: { where: { active: true } }, admissions: { where: { status: { in: ["admitted", "discharge_planned"] } } } },
  });
  if (!existing) throw new ServerActionError("NOT_FOUND", "Ward not found.");
  if (existing.admissions.length > 0) throw new ServerActionError("CONFLICT", "Cannot delete ward with active admissions.");
  await prisma.ipdWard.delete({ where: { id } });
  return { id };
}

export async function createIpdBed(ctx: ServerContext, wardId: string, input: { label: string }) {
  const scope = branchScope(ctx);
  const ward = await prisma.ipdWard.findFirst({
    where: { id: wardId, tenantId: scope.tenantId, branchId: scope.branchId },
  });
  if (!ward) throw new ServerActionError("NOT_FOUND", "Ward not found.");
  const id = createId("ipdbed");
  const bed = await prisma.ipdBed.create({
    data: { id, ...scope, wardId, label: input.label },
  });
  return { id: bed.id, label: bed.label };
}

export async function updateIpdBed(ctx: ServerContext, id: string, input: { label?: string; active?: boolean }) {
  const scope = branchScope(ctx);
  const existing = await prisma.ipdBed.findFirst({
    where: { id, tenantId: scope.tenantId, branchId: scope.branchId },
    include: { admissions: { where: { status: { in: ["admitted", "discharge_planned"] } } } },
  });
  if (!existing) throw new ServerActionError("NOT_FOUND", "Bed not found.");
  if (input.active === false && existing.admissions.length > 0) {
    throw new ServerActionError("CONFLICT", "Cannot deactivate an occupied bed.");
  }
  const data: Record<string, unknown> = {};
  if (input.label !== undefined) data.label = input.label;
  if (input.active !== undefined) data.active = input.active;
  await prisma.ipdBed.update({ where: { id }, data });
  return { id };
}

export async function deleteIpdBed(ctx: ServerContext, id: string) {
  const scope = branchScope(ctx);
  const existing = await prisma.ipdBed.findFirst({
    where: { id, tenantId: scope.tenantId, branchId: scope.branchId },
    include: { admissions: { where: { status: { in: ["admitted", "discharge_planned"] } } } },
  });
  if (!existing) throw new ServerActionError("NOT_FOUND", "Bed not found.");
  if (existing.admissions.length > 0) throw new ServerActionError("CONFLICT", "Cannot delete an occupied bed.");
  await prisma.ipdBed.delete({ where: { id } });
  return { id };
}

export type DischargeSummaryPayload = {
  admissionDate: string;
  dischargeDate: string;
  diagnosis: string;
  procedures: string;
  medications: string;
  followUp: string;
  notes: string;
  preparedBy: string;
  preparedAt: string;
};

export type DeathSummaryPayload = {
  admissionDate: string;
  deathDate: string;
  diagnosis: string;
  causeOfDeath: string;
  contributingConditions: string;
  procedures: string;
  medications: string;
  notes: string;
  preparedBy: string;
  preparedAt: string;
};

async function loadAdmissionForSummary(ctx: ServerContext, id: string) {
  const scope = branchScope(ctx);
  const admission = await prisma.ipdAdmission.findFirst({
    where: { id, tenantId: scope.tenantId, branchId: scope.branchId },
    include: {
      patient: { select: { id: true, name: true, fullName: true, uhid: true, phone: true, age: true, gender: true } },
      ward: true,
      bed: true,
    },
  });
  if (!admission) throw new ServerActionError("NOT_FOUND", "IPD admission not found.");
  return admission;
}

export async function generateDischargeSummary(ctx: ServerContext, id: string): Promise<DischargeSummaryPayload> {
  const admission = await loadAdmissionForSummary(ctx, id);
  const patientName = patientDisplayName(admission.patient) ?? admission.patientId;
  const today = new Date().toISOString();
  return {
    admissionDate: admission.admittedAt.toISOString(),
    dischargeDate: today,
    diagnosis: admission.diagnosis,
    procedures: "",
    medications: "",
    followUp: "",
    notes: `Discharge summary for ${patientName} admitted under ${admission.doctorName} in ${admission.ward.label} bed ${admission.bed.label}.`,
    preparedBy: ctx.userId ?? "",
    preparedAt: today,
  };
}

export async function saveDischargeSummary(
  ctx: ServerContext,
  id: string,
  summary: DischargeSummaryPayload,
): Promise<{ id: string }> {
  const scope = branchScope(ctx);
  const existing = await prisma.ipdAdmission.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId } });
  if (!existing) throw new ServerActionError("NOT_FOUND", "IPD admission not found.");
  await assertIpdDischargeAllowed(ctx, existing);
  const summaryId = createId("dsum");
  await prisma.ipdAdmission.update({
    where: { id },
    data: {
      dischargeSummary: summary as unknown as object,
      dischargeSummaryId: summaryId,
      status: "discharged",
      dischargedAt: new Date(),
      dischargedBy: ctx.userId ?? null,
    },
  });
  await writePlatformAudit({
    ctx,
    module: "ipd",
    action: "discharge_summary_saved",
    entityType: "ipd_admission",
    entityId: id,
    summary: `Discharge summary saved for IPD admission ${id}`,
  });
  return { id: summaryId };
}

export async function generateDeathSummary(ctx: ServerContext, id: string): Promise<DeathSummaryPayload> {
  const admission = await loadAdmissionForSummary(ctx, id);
  const patientName = patientDisplayName(admission.patient) ?? admission.patientId;
  const today = new Date().toISOString();
  return {
    admissionDate: admission.admittedAt.toISOString(),
    deathDate: today,
    diagnosis: admission.diagnosis,
    causeOfDeath: "",
    contributingConditions: "",
    procedures: "",
    medications: "",
    notes: `Death summary for ${patientName} admitted under ${admission.doctorName} in ${admission.ward.label} bed ${admission.bed.label}.`,
    preparedBy: ctx.userId ?? "",
    preparedAt: today,
  };
}

export async function saveDeathSummary(
  ctx: ServerContext,
  id: string,
  summary: DeathSummaryPayload,
): Promise<{ id: string }> {
  const scope = branchScope(ctx);
  const existing = await prisma.ipdAdmission.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId } });
  if (!existing) throw new ServerActionError("NOT_FOUND", "IPD admission not found.");
  const summaryId = createId("dths");
  await prisma.ipdAdmission.update({
    where: { id },
    data: {
      deathSummary: summary as unknown as object,
      deathSummaryId: summaryId,
      status: "deceased",
      deathDeclaredAt: new Date(),
      deathDeclaredBy: ctx.userId ?? null,
    },
  });
  await prisma.patient.update({
    where: { id: existing.patientId },
    data: { status: "deceased" },
  });
  await writePlatformAudit({
    ctx,
    module: "ipd",
    action: "death_summary_saved",
    entityType: "ipd_admission",
    entityId: id,
    summary: `Death summary saved for IPD admission ${id}`,
  });
  return { id: summaryId };
}
