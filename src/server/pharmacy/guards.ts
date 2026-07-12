import { PHARMACY_MANAGER_ID } from "@/design-system/pharmacy-data";
import type { PharmacyStaff } from "@/design-system/pharmacy-data";
import type { PharmacyStateShape } from "@/server/revenue/state-seeds";
import { ServerActionError } from "@/server/errors";

export function requirePrescription(state: PharmacyStateShape, rxId: string) {
  const rx = state.prescriptions.find((r) => r.id === rxId);
  if (!rx) throw new ServerActionError("NOT_FOUND", "Prescription not found.");
  return rx;
}

export function assertManager(operator: PharmacyStaff) {
  if (operator.id !== PHARMACY_MANAGER_ID && operator.role !== "manager") {
    throw new ServerActionError("FORBIDDEN", "Pharmacy manager access required.");
  }
}

export function assertPurchaseOrManager(operator: PharmacyStaff) {
  if (operator.role !== "purchase" && operator.id !== PHARMACY_MANAGER_ID && operator.role !== "manager") {
    throw new ServerActionError("FORBIDDEN", "Purchase or manager access required.");
  }
}

export function assertPharmacyStaff(operator: PharmacyStaff) {
  if (!operator.active) {
    throw new ServerActionError("FORBIDDEN", "Pharmacy staff account is inactive.");
  }
}
