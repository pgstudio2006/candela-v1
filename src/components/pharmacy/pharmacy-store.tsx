"use client";

import {
  PHARMACY_MANAGER_ID,
  type Drug,
  type PharmacyBill,
  type PharmacyStaff,
  type PoLine,
  type Prescription,
  type PurchaseOrder,
  type Supplier,
} from "@/design-system/pharmacy-data";
import type { PharmacySnapshot } from "@/server/pharmacy/index";
import { useSession } from "@/components/candela/session-provider";
import { getFilteredPrescriptions } from "@/lib/pharmacy-state-mutations";
import { computePharmacyKpis } from "@/lib/pharmacy-platform";
import { isTransientSessionError, sleep } from "@/lib/session-retry";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type Store = PharmacySnapshot & {
  ready: boolean;
  error: string | null;
  refresh: (opts?: { silent?: boolean }) => Promise<void>;
  isManager: () => boolean;
  isPurchase: () => boolean;
  getOperator: () => PharmacyStaff | undefined;
  getStaffRole: () => "manager" | "opd" | "purchase";
  getKpis: () => ReturnType<typeof computePharmacyKpis>;
  getDrug: (id: string) => Drug | undefined;
  getSupplier: (id: string) => Supplier | undefined;
  getActivePrescriptions: () => Prescription[];
  verifyPrescription: (id: string, counselingNotes?: string) => Promise<void>;
  rejectPrescription: (id: string, reason: string) => Promise<void>;
  dispensePrescription: (
    id: string,
    quantities: Record<string, number>,
    witnessName?: string,
    batchIds?: Record<string, string>,
    newLines?: Prescription["lines"],
  ) => Promise<{ ok: boolean; error?: string; billId?: string }>;
  createManualPrescription: (input: {
    patientName: string;
    uhid: string;
    mobile?: string;
    age?: number;
    priority?: "routine" | "urgent" | "stat";
    patientType?: "registered" | "other_doctor" | "without_prescription";
    referral?: { doctorName?: string; hospital?: string; clinicDetails?: string; address?: string };
    lines: Array<{ drug: string; dose: string; frequency: string; duration: string; instructions?: string }>;
  }) => Promise<{ ok: boolean; error?: string }>;
  addDrug: (drug: Omit<Drug, "id">) => Promise<void>;
  updateDrug: (id: string, patch: Partial<Drug>) => Promise<void>;
  addSupplier: (s: Omit<Supplier, "id">) => Promise<void>;
  updateSupplier: (id: string, patch: Partial<Supplier>) => Promise<void>;
  createPO: (supplierId: string, lines: PoLine[], notes?: string) => Promise<void>;
  updatePOStatus: (id: string, status: PurchaseOrder["status"]) => Promise<void>;
  receivePO: (poId: string, received: Record<string, { qty: number; batchNo: string; expiry: string; shelf?: string; box?: string }>) => Promise<void>;
  adjustStock: (batchId: string, delta: number, reason: string) => Promise<void>;
  quarantineBatch: (batchId: string, quarantined: boolean) => Promise<void>;
  markBillPaid: (id: string, mode: PharmacyBill["paymentMode"]) => Promise<void>;
  applyBillDiscount: (billId: string, discount: number, discountReason: string) => Promise<{ ok: boolean; error?: string }>;
  approveReturn: (id: string) => Promise<void>;
  restockReturn: (id: string) => Promise<void>;
  createReturn: (input: {
    type: "patient" | "ipd" | "walk_in";
    billId: string;
    lineIndex: number;
    qty: number;
    reason: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  payPOBill: (poId: string, amount: number, mode: "cash" | "upi" | "transfer" | "credit", billUrl?: string) => Promise<{ ok: boolean; error?: string }>;
  fulfillIndent: (id: string, qty: number) => Promise<void>;
  addSupplierCatalogueItem: (item: Omit<import("@/design-system/pharmacy-data").SupplierCatalogueItem, "id">) => Promise<void>;
  updateSupplierCatalogueItem: (id: string, patch: Partial<import("@/design-system/pharmacy-data").SupplierCatalogueItem>) => Promise<void>;
  resetWorkspace: () => Promise<void>;
};

const Ctx = createContext<Store | null>(null);

function requireOperatorId(operatorId: string) {
  if (!operatorId) throw new Error("Pharmacy operator not selected. Return to workspace login.");
  return operatorId;
}

type PharmacySnapshotResult = { ok: true; data: PharmacySnapshot } | { ok: false; code: string; error: string };

async function loadPharmacySnapshot(operatorId: string): Promise<PharmacySnapshotResult> {
  try {
    const res = await fetch(`/api/pharmacy/snapshot?operatorId=${encodeURIComponent(operatorId)}`, { cache: "no-store" });
    if (res.ok) {
      return (await res.json()) as PharmacySnapshotResult;
    }
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, code: "INTERNAL_ERROR", error: body?.error ?? "Failed to load pharmacy workspace." };
  } catch {
    return { ok: false, code: "INTERNAL_ERROR", error: "Failed to load pharmacy workspace." };
  }
}

async function pharmacyMutate(body: Record<string, unknown>): Promise<{ ok: boolean; data?: any; error?: string }> {
  try {
    const res = await fetch("/api/pharmacy/mutate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Something went wrong.";
    return { ok: false, error: msg };
  }
}

export function PharmacyStoreProvider({ children }: { children: ReactNode }) {
  const { authReady, session } = useSession();
  const operatorId = session?.pharmacyOperatorId ?? "";
  const [state, setState] = useState<PharmacySnapshot | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!operatorId) return;
      const silent = opts?.silent ?? false;
      if (!silent) setReady(false);
      try {
        const result = await loadPharmacySnapshot(operatorId);
        if (result.ok) {
          setState(result.data);
          setError(null);
        } else {
          setError(result.error);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Something went wrong.";
        setError(msg);
      } finally {
        setReady(true);
      }
    },
    [operatorId],
  );

  useEffect(() => {
    if (!authReady || !session?.pharmacyOperatorId) return;
    let cancelled = false;

    const load = async (attempt = 0) => {
      if (cancelled) return;
      try {
        const result = await loadPharmacySnapshot(session.pharmacyOperatorId!);
        if (cancelled) return;
        if (result.ok) {
          setState(result.data);
          setError(null);
        } else {
          setError(result.error);
        }
        setReady(true);
      } catch (err) {
        if (cancelled) return;
        if (attempt < 2 && isTransientSessionError(err)) {
          await sleep(400 * (attempt + 1));
          await load(attempt + 1);
          return;
        }
        const msg = err instanceof Error ? err.message : "Something went wrong.";
        setError(msg);
        setReady(true);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [authReady, session?.pharmacyOperatorId]);

  const value = useMemo<Store>(() => {
    const data = state ?? {
      staff: [],
      staffPasswords: {},
      drugs: [],
      stock: [],
      suppliers: [],
      supplierCatalogue: [],
      purchaseOrders: [],
      prescriptions: [],
      bills: [],
      returns: [],
      indents: [],
      scheduleH: [],
      activities: [],
      operatorId: "",
      activeOperatorId: operatorId,
      activeOperatorName: "Pharmacist",
      activeOperatorRole: "opd" as const,
    };

    const getOperator = () => data.staff.find((s) => s.id === data.activeOperatorId);
    const getStaffRole = (): "manager" | "opd" | "purchase" => {
      if (data.activeOperatorRole) return data.activeOperatorRole;
      const op = getOperator();
      if (!op) return "opd";
      if (op.id === PHARMACY_MANAGER_ID || op.role === "manager") return "manager";
      return op.role;
    };

    const opId = () => requireOperatorId(data.activeOperatorId || operatorId);

    return {
      ...data,
      ready,
      error,
      refresh,
      isManager: () => getStaffRole() === "manager",
      isPurchase: () => getStaffRole() === "purchase",
      getOperator,
      getStaffRole,
      getKpis: () =>
        computePharmacyKpis(data.prescriptions, data.stock, data.drugs, data.bills, data.purchaseOrders),
      getDrug: (id) => data.drugs.find((d) => d.id === id),
      getSupplier: (id) => data.suppliers.find((s) => s.id === id),
      getActivePrescriptions: () =>
        getFilteredPrescriptions(
          data.prescriptions.filter((r) => !["dispensed", "cancelled", "rejected"].includes(r.status)),
        ),
      verifyPrescription: async (id, counselingNotes) => {
        const res = await pharmacyMutate({ op: "verifyPrescription", operatorId: opId(), rxId: id, counselingNotes });
        if (!res.ok) throw new Error(res.error ?? "Failed to verify prescription");
        await refresh({ silent: true });
      },
      rejectPrescription: async (id, reason) => {
        const res = await pharmacyMutate({ op: "rejectPrescription", operatorId: opId(), rxId: id, reason });
        if (!res.ok) throw new Error(res.error ?? "Failed to reject prescription");
        await refresh({ silent: true });
      },
      dispensePrescription: async (id, quantities, witnessName, batchIds, newLines) => {
        try {
          const res = await pharmacyMutate({
            op: "dispensePrescription",
            operatorId: opId(),
            rxId: id,
            quantities,
            witnessName,
            batchIds,
            newLines,
          });
          if (!res.ok) return { ok: false, error: res.error };
          await refresh({ silent: true });
          return { ok: true, billId: res.data?.billId };
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Something went wrong.";
          return { ok: false, error: msg };
        }
      },
      createManualPrescription: async (input) => {
        try {
          const res = await pharmacyMutate({ op: "createManualPrescription", operatorId: opId(), ...input });
          if (!res.ok) return { ok: false, error: res.error };
          await refresh({ silent: true });
          return { ok: true };
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Something went wrong.";
          return { ok: false, error: msg };
        }
      },
      addDrug: async (drug) => {
        const res = await pharmacyMutate({ op: "addDrug", operatorId: opId(), drug });
        if (!res.ok) throw new Error(res.error ?? "Failed to add drug");
        await refresh({ silent: true });
      },
      updateDrug: async (id, patch) => {
        const res = await pharmacyMutate({ op: "updateDrug", operatorId: opId(), id, patch });
        if (!res.ok) throw new Error(res.error ?? "Failed to update drug");
        await refresh({ silent: true });
      },
      addSupplier: async (s) => {
        await pharmacyMutate({ op: "addSupplier", operatorId: opId(), supplier: s });
        await refresh({ silent: true });
      },
      updateSupplier: async (id, patch) => {
        await pharmacyMutate({ op: "updateSupplier", operatorId: opId(), id, patch });
        await refresh({ silent: true });
      },
      createPO: async (supplierId, lines, notes) => {
        await pharmacyMutate({ op: "createPO", operatorId: opId(), supplierId, lines, notes });
        await refresh({ silent: true });
      },
      updatePOStatus: async (id, status) => {
        await pharmacyMutate({ op: "updatePOStatus", operatorId: opId(), id, status });
        await refresh({ silent: true });
      },
      receivePO: async (poId, received) => {
        await pharmacyMutate({ op: "receivePO", operatorId: opId(), poId, received });
        await refresh({ silent: true });
      },
      adjustStock: async (batchId, delta, reason) => {
        await pharmacyMutate({ op: "adjustStock", operatorId: opId(), batchId, delta, reason });
        await refresh({ silent: true });
      },
      quarantineBatch: async (batchId, quarantined) => {
        await pharmacyMutate({ op: "quarantineBatch", operatorId: opId(), batchId, quarantined });
        await refresh({ silent: true });
      },
      markBillPaid: async (id, mode) => {
        await pharmacyMutate({ op: "markBillPaid", operatorId: opId(), billId: id, mode });
        await refresh({ silent: true });
      },
      applyBillDiscount: async (billId, discount, discountReason) => {
        try {
          const res = await pharmacyMutate({ op: "applyBillDiscount", operatorId: opId(), billId, discount, discountReason });
          if (!res.ok) return { ok: false, error: res.error };
          await refresh({ silent: true });
          return { ok: true };
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Something went wrong.";
          return { ok: false, error: msg };
        }
      },
      approveReturn: async (id) => {
        await pharmacyMutate({ op: "approveReturn", operatorId: opId(), id });
        await refresh({ silent: true });
      },
      restockReturn: async (id) => {
        await pharmacyMutate({ op: "restockReturn", operatorId: opId(), id });
        await refresh({ silent: true });
      },
      createReturn: async (input) => {
        try {
          const res = await pharmacyMutate({
            op: "createReturn",
            operatorId: opId(),
            returnType: input.type,
            billId: input.billId,
            lineIndex: input.lineIndex,
            qty: input.qty,
            reason: input.reason,
          });
          if (!res.ok) return { ok: false, error: res.error };
          await refresh({ silent: true });
          return { ok: true };
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Something went wrong.";
          return { ok: false, error: msg };
        }
      },
      payPOBill: async (poId, amount, mode, billUrl) => {
        try {
          const res = await pharmacyMutate({ op: "payPOBill", operatorId: opId(), poId, amount, paymentMode: mode, billUrl });
          if (!res.ok) return { ok: false, error: res.error };
          await refresh({ silent: true });
          return { ok: true };
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Something went wrong.";
          return { ok: false, error: msg };
        }
      },
      fulfillIndent: async (id, qty) => {
        await pharmacyMutate({ op: "fulfillIndent", operatorId: opId(), id, qty });
        await refresh({ silent: true });
      },
      addSupplierCatalogueItem: async (item) => {
        await pharmacyMutate({ op: "addSupplierCatalogueItem", operatorId: opId(), catalogueItem: item });
        await refresh({ silent: true });
      },
      updateSupplierCatalogueItem: async (id, patch) => {
        await pharmacyMutate({ op: "updateSupplierCatalogueItem", operatorId: opId(), id, patch });
        await refresh({ silent: true });
      },
      resetWorkspace: async () => {
        const res = await pharmacyMutate({ op: "resetWorkspace", operatorId: opId() });
        if (!res.ok) throw new Error(res.error ?? "Failed to reset pharmacy workspace.");
        await refresh({ silent: true });
      },
    };
  }, [state, ready, error, refresh, operatorId]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePharmacyStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePharmacyStore must be used within PharmacyStoreProvider");
  return ctx;
}

export { PHARMACY_MANAGER_ID };
