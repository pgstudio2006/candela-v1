"use server";

import type { Drug, PaymentMode, PharmacyBill, PoLine, Prescription, PurchaseOrder, Supplier } from "@/design-system/pharmacy-data";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/server/auth";
import { runAction, type ActionResult } from "@/server/action-result";
import { ensureRevenueSeeded } from "@/server/revenue/bootstrap";
import { hashPassword, verifyPassword } from "@/server/revenue/password";
import type { PharmacyStateShape } from "@/server/revenue/state-seeds";
import {
  addDrug,
  adjustStock,
  approveReturn,
  createPharmacyBill,
  createPO,
  dispensePrescription,
  fulfillIndent,
  getPharmacySnapshot,
  listPharmacyAuditLogs,
  markBillPaid,
  quarantineBatch,
  receivePO,
  rejectPrescription,
  restockReturn,
  updateDrug,
  updatePOStatus,
  updateSupplier,
  verifyPrescription,
  addSupplier,
} from "@/server/pharmacy/index";
import type { PharmacySnapshot } from "@/server/pharmacy/index";

export type PharmacyLoginResult =
  | { ok: true; operatorId: string; name: string; email: string }
  | { ok: false; error: string };

export async function getPharmacySnapshotAction(
  operatorId: string,
): Promise<ActionResult<PharmacySnapshot>> {
  return runAction(async () => {
    const ctx = await requireModule("pharmacy");
    return getPharmacySnapshot(ctx, operatorId);
  });
}

export async function verifyPrescriptionAction(operatorId: string, rxId: string, counselingNotes?: string) {
  const ctx = await requireModule("pharmacy");
  return verifyPrescription(ctx, operatorId, rxId, counselingNotes);
}

export async function rejectPrescriptionAction(operatorId: string, rxId: string, reason: string) {
  const ctx = await requireModule("pharmacy");
  return rejectPrescription(ctx, operatorId, rxId, reason);
}

export async function dispensePrescriptionAction(
  operatorId: string,
  rxId: string,
  quantities: Record<string, number>,
  witnessName?: string,
  batchIds?: Record<string, string>,
  newLines?: import("@/design-system/pharmacy-data").Prescription["lines"],
) {
  const ctx = await requireModule("pharmacy");
  return dispensePrescription(ctx, operatorId, rxId, quantities, witnessName, batchIds, newLines);
}

export async function markBillPaidAction(operatorId: string, billId: string, mode: PaymentMode) {
  const ctx = await requireModule("pharmacy");
  return markBillPaid(ctx, operatorId, billId, mode);
}

export async function createPharmacyBillAction(
  operatorId: string,
  input: {
    patientName: string;
    uhid?: string;
    lines: { drugId: string; qty: number }[];
    discount?: number;
    discountReason?: string;
    paymentMode?: PaymentMode;
  },
) {
  const ctx = await requireModule("pharmacy");
  return createPharmacyBill(ctx, operatorId, input);
}

export async function adjustStockAction(operatorId: string, batchId: string, delta: number, reason: string) {
  const ctx = await requireModule("pharmacy");
  return adjustStock(ctx, operatorId, batchId, delta, reason);
}

export async function quarantineBatchAction(operatorId: string, batchId: string, quarantined: boolean) {
  const ctx = await requireModule("pharmacy");
  return quarantineBatch(ctx, operatorId, batchId, quarantined);
}

export async function addDrugAction(operatorId: string, drug: Omit<Drug, "id">) {
  const ctx = await requireModule("pharmacy");
  return addDrug(ctx, operatorId, drug);
}

export async function updateDrugAction(operatorId: string, id: string, patch: Partial<Drug>) {
  const ctx = await requireModule("pharmacy");
  return updateDrug(ctx, operatorId, id, patch);
}

export async function addSupplierAction(operatorId: string, supplier: Omit<Supplier, "id">) {
  const ctx = await requireModule("pharmacy");
  return addSupplier(ctx, operatorId, supplier);
}

export async function updateSupplierAction(operatorId: string, id: string, patch: Partial<Supplier>) {
  const ctx = await requireModule("pharmacy");
  return updateSupplier(ctx, operatorId, id, patch);
}

export async function createPOAction(operatorId: string, supplierId: string, lines: PoLine[], notes?: string) {
  const ctx = await requireModule("pharmacy");
  return createPO(ctx, operatorId, supplierId, lines, notes);
}

export async function updatePOStatusAction(operatorId: string, id: string, status: PurchaseOrder["status"]) {
  const ctx = await requireModule("pharmacy");
  return updatePOStatus(ctx, operatorId, id, status);
}

export async function receivePOAction(
  operatorId: string,
  poId: string,
  received: Record<string, { qty: number; batchNo: string; expiry: string }>,
) {
  const ctx = await requireModule("pharmacy");
  return receivePO(ctx, operatorId, poId, received);
}

export async function approveReturnAction(operatorId: string, id: string) {
  const ctx = await requireModule("pharmacy");
  return approveReturn(ctx, operatorId, id);
}

export async function restockReturnAction(operatorId: string, id: string) {
  const ctx = await requireModule("pharmacy");
  return restockReturn(ctx, operatorId, id);
}

export async function fulfillIndentAction(operatorId: string, id: string, qty: number) {
  const ctx = await requireModule("pharmacy");
  return fulfillIndent(ctx, operatorId, id, qty);
}

export async function listPharmacyAuditLogsAction(input?: { limit?: number; cursor?: string }) {
  const ctx = await requireModule("pharmacy");
  return listPharmacyAuditLogs(ctx, input ?? {});
}

/** @deprecated Use granular mutation actions — kept for staff credential sync only */
export async function savePharmacyStateAction(next: PharmacyStateShape): Promise<void> {
  await requireModule("pharmacy");
  await ensureRevenueSeeded();
  await Promise.all(
    next.staff.map(async (member) =>
      prisma.pharmacyOperatorCredential.upsert({
        where: { id: member.id },
        create: {
          id: member.id,
          name: member.name,
          email: member.email.toLowerCase(),
          role: member.role,
          active: member.active,
          licenseNo: member.licenseNo,
          passwordHash: await hashPassword(next.staffPasswords[member.id] ?? "welcome123"),
        },
        update: {
          name: member.name,
          email: member.email.toLowerCase(),
          role: member.role,
          active: member.active,
          licenseNo: member.licenseNo,
          passwordHash: await hashPassword(next.staffPasswords[member.id] ?? "welcome123"),
        },
      }),
    ),
  );
}

export async function validatePharmacyLoginAction(email: string, password: string): Promise<PharmacyLoginResult> {
  await ensureRevenueSeeded();
  const normalized = email.trim().toLowerCase();
  const pwd = password.trim();
  if (!normalized || !pwd) return { ok: false, error: "Enter email and password." };

  const operator = await prisma.pharmacyOperatorCredential.findUnique({
    where: { email: normalized },
  });
  if (!operator) return { ok: false, error: "No pharmacy account for this email." };
  if (!operator.active) return { ok: false, error: "Account inactive." };
  if (!(await verifyPassword(pwd, operator.passwordHash))) {
    return { ok: false, error: "Incorrect password." };
  }
  return { ok: true, operatorId: operator.id, name: operator.name, email: operator.email };
}

export async function upsertPharmacyOperatorAction(input: {
  id: string;
  name: string;
  email: string;
  role: "manager" | "opd" | "purchase";
  active: boolean;
  licenseNo?: string;
  password: string;
}) {
  await requireModule("pharmacy");
  await ensureRevenueSeeded();
  const passwordHash = await hashPassword(input.password);
  await prisma.pharmacyOperatorCredential.upsert({
    where: { id: input.id },
    create: { ...input, email: input.email.trim().toLowerCase(), passwordHash },
    update: { ...input, email: input.email.trim().toLowerCase(), passwordHash },
  });
}

// Legacy list aliases — snapshot includes all data
export async function getPharmacyStateAction(operatorId: string) {
  const result = await getPharmacySnapshotAction(operatorId);
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

export async function listDrugsAction(operatorId: string) {
  const result = await getPharmacySnapshotAction(operatorId);
  if (!result.ok) throw new Error(result.error);
  return result.data.drugs;
}

export async function listPrescriptionsAction(operatorId: string) {
  const result = await getPharmacySnapshotAction(operatorId);
  if (!result.ok) throw new Error(result.error);
  return result.data.prescriptions;
}

export async function listAuditAction(operatorId: string) {
  const result = await getPharmacySnapshotAction(operatorId);
  if (!result.ok) throw new Error(result.error);
  return result.data.activities;
}

export async function listExpiryRiskAction(operatorId: string) {
  const now = Date.now();
  const result = await getPharmacySnapshotAction(operatorId);
  if (!result.ok) throw new Error(result.error);
  const state = result.data;
  return state.stock
    .map((batch) => ({
      batch,
      daysToExpiry: Math.ceil((new Date(batch.expiry).getTime() - now) / (1000 * 60 * 60 * 24)),
    }))
    .sort((a, b) => a.daysToExpiry - b.daysToExpiry);
}
