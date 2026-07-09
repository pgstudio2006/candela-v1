import type {
  Drug,
  PharmacyActivity,
  PharmacyBill,
  PharmacyBillLine,
  PharmacyStaff,
  PoLine,
  Prescription,
  PurchaseOrder,
  ReturnRecord,
  ScheduleHEntry,
  StockBatch,
  Supplier,
  SupplierCatalogueItem,
  WardIndent,
} from "@/design-system/pharmacy-data";
import type { PharmacyStateShape } from "@/server/revenue/state-seeds";
import { calcBillTotals, daysToExpiry, isControlledSchedule, pickFefoBatch } from "@/lib/pharmacy-platform";
import { ServerActionError } from "@/server/errors";

export function appendPharmacyActivity(
  activities: PharmacyActivity[],
  actor: string,
  type: string,
  summary: string,
  refId?: string,
): PharmacyActivity[] {
  return [
    { id: `pha_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, at: new Date().toISOString(), actor, type, summary, refId },
    ...activities,
  ].slice(0, 200);
}

export function resolveStaffOperator(state: PharmacyStateShape, operatorId: string): PharmacyStaff {
  const staff = state.staff.find((s) => s.id === operatorId && s.active);
  if (!staff) {
    throw new ServerActionError("FORBIDDEN", "Invalid or inactive pharmacy operator.");
  }
  return staff;
}

export function mutateVerifyPrescription(
  state: PharmacyStateShape,
  rxId: string,
  operator: PharmacyStaff,
  counselingNotes?: string,
): PharmacyStateShape {
  const rx = state.prescriptions.find((r) => r.id === rxId);
  if (!rx) throw new ServerActionError("NOT_FOUND", "Prescription not found.");
  if (rx.status !== "pending") {
    throw new ServerActionError("VALIDATION", "Only pending prescriptions can be verified.");
  }
  if (rx.assigneeId && rx.assigneeId !== operator.id) {
    throw new ServerActionError("FORBIDDEN", "Prescription is assigned to another pharmacist.");
  }
  const now = new Date().toISOString();
  return {
    ...state,
    prescriptions: state.prescriptions.map((r) =>
      r.id === rxId
        ? {
            ...r,
            status: "verified" as const,
            verifiedAt: now,
            updatedAt: now,
            counselingNotes,
            assigneeId: operator.id,
          }
        : r,
    ),
    activities: appendPharmacyActivity(state.activities, operator.name, "verify", `Verified Rx ${rxId}`, rxId),
  };
}

export function mutateRejectPrescription(
  state: PharmacyStateShape,
  rxId: string,
  operator: PharmacyStaff,
  reason: string,
): PharmacyStateShape {
  const rx = state.prescriptions.find((r) => r.id === rxId);
  if (!rx) throw new ServerActionError("NOT_FOUND", "Prescription not found.");
  if (!["pending", "verified"].includes(rx.status)) {
    throw new ServerActionError("VALIDATION", "Cannot reject this prescription.");
  }
  const now = new Date().toISOString();
  return {
    ...state,
    prescriptions: state.prescriptions.map((r) =>
      r.id === rxId ? { ...r, status: "rejected" as const, rejectReason: reason, updatedAt: now, assigneeId: undefined } : r,
    ),
    activities: appendPharmacyActivity(state.activities, operator.name, "reject", `Rejected Rx: ${reason}`, rxId),
  };
}

export type DispenseResult = { billId: string; total: number; allDone: boolean; visitId?: string; patientName: string };

export function mutateDispensePrescription(
  state: PharmacyStateShape,
  rxId: string,
  operator: PharmacyStaff,
  quantities: Record<string, number>,
  witnessName?: string,
  batchIds?: Record<string, string>,
  newLines?: Prescription["lines"],
): { state: PharmacyStateShape; result: DispenseResult } {
  const rx = state.prescriptions.find((r) => r.id === rxId);
  if (!rx) throw new ServerActionError("NOT_FOUND", "Prescription not found.");
  if (!["verified", "partially_dispensed"].includes(rx.status)) {
    throw new ServerActionError("VALIDATION", "Prescription must be verified before dispense.");
  }
  if (rx.assigneeId && rx.assigneeId !== operator.id && operator.role !== "manager") {
    throw new ServerActionError("FORBIDDEN", "Prescription is assigned to another pharmacist.");
  }

  const addedLines: Prescription["lines"] = (newLines ?? []).map((l, i) => ({
    ...l,
    id: l.id || `rxl_${rxId}_${Date.now()}_${i}`,
    qtyDispensed: 0,
  }));
  const allLines = [...rx.lines, ...addedLines];

  let stock = [...state.stock];
  const lines: PharmacyBillLine[] = [];
  let scheduleEntries = [...state.scheduleH];

  const updatedLines = allLines.map((line) => {
    const qty = quantities[line.id] ?? line.qtyPrescribed - line.qtyDispensed;
    if (qty <= 0) return line;
    const remaining = line.qtyPrescribed - line.qtyDispensed;
    if (qty > remaining) {
      throw new ServerActionError("VALIDATION", `Quantity exceeds remaining for line ${line.id}.`);
    }

    const drugId = line.substituteDrugId ?? line.drugId;
    const drug = state.drugs.find((d) => d.id === drugId);

    const selectedBatchId = batchIds?.[line.id];
    const pickedBatch = selectedBatchId ? stock.find((s) => s.id === selectedBatchId && s.drugId === drugId) : undefined;
    const batch = pickedBatch ?? pickFefoBatch(drugId, stock, qty);
    if (!batch) throw new ServerActionError("VALIDATION", `Insufficient stock for ${drug?.brandName ?? drugId}.`);
    if (daysToExpiry(batch.expiry) < 0) {
      throw new ServerActionError("VALIDATION", `Batch ${batch.batchNo} is expired.`);
    }

    if (drug && (drug.schedule === "H1" || drug.schedule === "X") && !witnessName?.trim()) {
      throw new ServerActionError("VALIDATION", "Witness pharmacist name is required for Schedule H1/X drugs.");
    }

    stock = stock.map((s) =>
      s.id === batch.id ? { ...s, qtyOnHand: s.qtyOnHand - qty, reserved: Math.max(0, s.reserved - qty) } : s,
    );
    lines.push({ drugId, batchId: batch.id, qty, rate: batch.mrp, purchaseRate: batch.purchaseRate, gstPercent: drug?.gstPercent ?? 12 });

    if (drug && isControlledSchedule(drug.schedule)) {
      const bal = (scheduleEntries.filter((e) => e.drugId === drugId).at(-1)?.balanceAfter ?? 0) + qty;
      scheduleEntries.push({
        id: `sh_${Date.now()}_${line.id}`,
        prescriptionId: rxId,
        patientName: rx.patientName,
        uhid: rx.uhid,
        doctorName: rx.doctorName,
        drugId,
        batchId: batch.id,
        qty,
        balanceAfter: bal,
        pharmacistId: operator.id,
        witnessName: drug.schedule === "H1" || drug.schedule === "X" ? witnessName : undefined,
        at: new Date().toISOString(),
      });
    }

    return { ...line, qtyDispensed: line.qtyDispensed + qty, batchId: batch.id, dispenseRate: batch.mrp };
  });

  if (!lines.length) {
    throw new ServerActionError("VALIDATION", "No items to dispense — check stock and quantities.");
  }

  const allDone = updatedLines.every((l) => l.qtyDispensed >= l.qtyPrescribed);
  const partial = updatedLines.some((l) => l.qtyDispensed > 0 && l.qtyDispensed < l.qtyPrescribed);
  const newStatus = allDone ? "dispensed" : partial ? "partially_dispensed" : rx.status;
  const now = new Date().toISOString();
  const totals = calcBillTotals(lines);

  // For IPD, don't create a pharmacy bill - charges go to IPD cart
  if (rx.source === "ipd") {
    const nextState: PharmacyStateShape = {
      ...state,
      stock,
      scheduleH: scheduleEntries,
      prescriptions: state.prescriptions.map((r) =>
        r.id === rxId
          ? {
              ...r,
              lines: updatedLines,
              status: newStatus,
              dispensedAt: allDone ? now : r.dispensedAt,
              updatedAt: now,
              witnessName,
              assigneeId: operator.id,
            }
          : r,
      ),
      activities: appendPharmacyActivity(
        state.activities,
        operator.name,
        "dispense_ipd",
        `IPD dispensed for ${rx.patientName} — ${rx.encounterId} — ₹${totals.total.toFixed(0)}`,
        rxId,
      ),
    };
    return {
      state: nextState,
      result: {
        billId: `IPD_CART_${rx.encounterId}`,
        total: totals.total,
        allDone,
        visitId: rx.encounterId,
        patientName: rx.patientName,
      },
    };
  }

  // For OPD/Walk-in, create pharmacy bill
  const billId = `bill_${Date.now()}`;

  const bill: PharmacyBill = {
    id: billId,
    prescriptionId: rxId,
    patientName: rx.patientName,
    uhid: rx.uhid,
    lines,
    subtotal: totals.subtotal,
    gstTotal: totals.gstTotal,
    discount: 0,
    total: totals.total,
    paymentMode: "cash",
    paid: false,
    createdAt: now,
    createdBy: operator.name,
  };

  const nextState: PharmacyStateShape = {
    ...state,
    stock,
    scheduleH: scheduleEntries,
    prescriptions: state.prescriptions.map((r) =>
      r.id === rxId
        ? {
            ...r,
            lines: updatedLines,
            status: newStatus,
            dispensedAt: allDone ? now : r.dispensedAt,
            updatedAt: now,
            witnessName,
            assigneeId: operator.id,
          }
        : r,
    ),
    bills: [bill, ...state.bills],
    activities: appendPharmacyActivity(
      state.activities,
      operator.name,
      "dispense",
      `Dispensed ${rx.patientName} — ₹${totals.total.toFixed(0)}`,
      rxId,
    ),
  };

  return {
    state: nextState,
    result: {
      billId,
      total: totals.total,
      allDone,
      visitId: rx.encounterId,
      patientName: rx.patientName,
    },
  };
}

export function mutateMarkBillPaid(
  state: PharmacyStateShape,
  billId: string,
  operator: PharmacyStaff,
  mode: PharmacyBill["paymentMode"],
): PharmacyStateShape {
  const bill = state.bills.find((b) => b.id === billId);
  if (!bill) throw new ServerActionError("NOT_FOUND", "Bill not found.");
  if (bill.paid) throw new ServerActionError("VALIDATION", "Bill is already paid.");
  return {
    ...state,
    bills: state.bills.map((b) => (b.id === billId ? { ...b, paid: true, paymentMode: mode } : b)),
    activities: appendPharmacyActivity(state.activities, operator.name, "payment", `Bill ${billId} marked paid (${mode})`, billId),
  };
}

export function mutateAdjustStock(
  state: PharmacyStateShape,
  batchId: string,
  operator: PharmacyStaff,
  delta: number,
  reason: string,
): PharmacyStateShape {
  const batch = state.stock.find((s) => s.id === batchId);
  if (!batch) throw new ServerActionError("NOT_FOUND", "Batch not found.");
  return {
    ...state,
    stock: state.stock.map((s) =>
      s.id === batchId ? { ...s, qtyOnHand: Math.max(0, s.qtyOnHand + delta) } : s,
    ),
    activities: appendPharmacyActivity(state.activities, operator.name, "adjust", `Stock adjust ${delta}: ${reason}`, batchId),
  };
}

export function mutateQuarantineBatch(
  state: PharmacyStateShape,
  batchId: string,
  operator: PharmacyStaff,
  quarantined: boolean,
): PharmacyStateShape {
  const batch = state.stock.find((s) => s.id === batchId);
  if (!batch) throw new ServerActionError("NOT_FOUND", "Batch not found.");
  return {
    ...state,
    stock: state.stock.map((s) => (s.id === batchId ? { ...s, quarantined } : s)),
    activities: appendPharmacyActivity(
      state.activities,
      operator.name,
      "quarantine",
      `${quarantined ? "Quarantined" : "Released"} batch ${batch.batchNo}`,
      batchId,
    ),
  };
}

export function mutateAddDrug(
  state: PharmacyStateShape,
  operator: PharmacyStaff,
  drug: Omit<Drug, "id">,
): PharmacyStateShape {
  return {
    ...state,
    drugs: [...state.drugs, { ...drug, id: `dr_${Date.now().toString(36)}` }],
    activities: appendPharmacyActivity(state.activities, operator.name, "drug", `Added drug ${drug.brandName}`),
  };
}

export function mutateUpdateDrug(state: PharmacyStateShape, id: string, patch: Partial<Drug>): PharmacyStateShape {
  if (!state.drugs.some((d) => d.id === id)) throw new ServerActionError("NOT_FOUND", "Drug not found.");
  return { ...state, drugs: state.drugs.map((d) => (d.id === id ? { ...d, ...patch } : d)) };
}

export function mutateAddSupplier(state: PharmacyStateShape, s: Omit<Supplier, "id">): PharmacyStateShape {
  return { ...state, suppliers: [...state.suppliers, { ...s, id: `sup_${Date.now().toString(36)}` }] };
}

export function mutateUpdateSupplier(state: PharmacyStateShape, id: string, patch: Partial<Supplier>): PharmacyStateShape {
  if (!state.suppliers.some((s) => s.id === id)) throw new ServerActionError("NOT_FOUND", "Supplier not found.");
  return { ...state, suppliers: state.suppliers.map((s) => (s.id === id ? { ...s, ...patch } : s)) };
}

export function mutateCreatePO(
  state: PharmacyStateShape,
  operator: PharmacyStaff,
  supplierId: string,
  lines: PoLine[],
  notes?: string,
): PharmacyStateShape {
  if (!lines.length) throw new ServerActionError("VALIDATION", "PO must have at least one line.");
  return {
    ...state,
    purchaseOrders: [
      {
        id: `po_${Date.now()}`,
        supplierId,
        status: "draft",
        createdAt: new Date().toISOString(),
        billPaid: false,
        lines,
        notes,
      },
      ...state.purchaseOrders,
    ],
    activities: appendPharmacyActivity(state.activities, operator.name, "po", "Created purchase order"),
  };
}

export function mutateUpdatePOStatus(
  state: PharmacyStateShape,
  id: string,
  status: PurchaseOrder["status"],
): PharmacyStateShape {
  if (!state.purchaseOrders.some((p) => p.id === id)) throw new ServerActionError("NOT_FOUND", "PO not found.");
  return { ...state, purchaseOrders: state.purchaseOrders.map((p) => (p.id === id ? { ...p, status } : p)) };
}

export function mutateReceivePO(
  state: PharmacyStateShape,
  operator: PharmacyStaff,
  poId: string,
  received: Record<string, { qty: number; batchNo: string; expiry: string; shelf?: string; box?: string }>,
): PharmacyStateShape {
  const po = state.purchaseOrders.find((p) => p.id === poId);
  if (!po) throw new ServerActionError("NOT_FOUND", "PO not found.");
  const newStock = [...state.stock];
  const newLines = po.lines.map((l) => {
    const r = received[l.drugId];
    if (!r || r.qty <= 0) return l;
    const drug = state.drugs.find((d) => d.id === l.drugId);
    newStock.push({
      id: `stk_${Date.now()}_${l.drugId}`,
      drugId: l.drugId,
      batchNo: r.batchNo,
      expiry: r.expiry,
      qtyOnHand: r.qty,
      reserved: 0,
      purchaseRate: l.rate,
      mrp: drug?.defaultMrp ?? l.rate * 1.3,
      rack: r.shelf || "RECV",
      shelf: r.shelf,
      box: r.box,
      supplierId: po.supplierId,
      quarantined: false,
    });
    return { ...l, qtyReceived: l.qtyReceived + r.qty };
  });
  const allReceived = newLines.every((l) => l.qtyReceived >= l.qtyOrdered);
  const anyReceived = newLines.some((l) => l.qtyReceived > 0);
  const status = allReceived ? "received" : anyReceived ? "partial" : po.status;
  return {
    ...state,
    stock: newStock,
    purchaseOrders: state.purchaseOrders.map((p) => (p.id === poId ? { ...p, lines: newLines, status } : p)),
    activities: appendPharmacyActivity(state.activities, operator.name, "grn", `GRN for ${poId}`, poId),
  };
}

export function mutateApplyBillDiscount(
  state: PharmacyStateShape,
  operator: PharmacyStaff,
  billId: string,
  discount: number,
  discountReason: string,
): PharmacyStateShape {
  const bill = state.bills.find((b) => b.id === billId);
  if (!bill) throw new ServerActionError("NOT_FOUND", "Bill not found.");
  if (bill.paid) throw new ServerActionError("VALIDATION", "Cannot discount an already paid bill.");
  if (discount < 0 || discount > bill.total) throw new ServerActionError("VALIDATION", "Invalid discount amount.");
  const total = Math.max(0, bill.subtotal + bill.gstTotal - discount);
  return {
    ...state,
    bills: state.bills.map((b) =>
      b.id === billId
        ? { ...b, discount, discountReason, total }
        : b,
    ),
    activities: appendPharmacyActivity(
      state.activities,
      operator.name,
      "discount",
      `Discount ₹${discount.toFixed(0)} applied to bill ${billId}: ${discountReason}`,
      billId,
    ),
  };
}

export function mutateCreateReturn(
  state: PharmacyStateShape,
  operator: PharmacyStaff,
  input: {
    type: "patient" | "ipd" | "walk_in";
    billId: string;
    lineIndex: number;
    qty: number;
    reason: string;
  },
): PharmacyStateShape {
  const bill = state.bills.find((b) => b.id === input.billId);
  if (!bill) throw new ServerActionError("NOT_FOUND", "Bill not found.");
  const line = bill.lines[input.lineIndex];
  if (!line) throw new ServerActionError("NOT_FOUND", "Bill line not found.");
  if (input.qty <= 0 || input.qty > line.qty) {
    throw new ServerActionError("VALIDATION", "Invalid return quantity.");
  }
  const ret: ReturnRecord = {
    id: `ret_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: input.type,
    drugId: line.drugId,
    batchId: line.batchId,
    qty: input.qty,
    reason: input.reason,
    patientName: bill.patientName,
    billId: bill.id,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  return {
    ...state,
    returns: [ret, ...state.returns],
    activities: appendPharmacyActivity(
      state.activities,
      operator.name,
      "return_create",
      `Return created for ${bill.patientName} — ${line.drugId} × ${input.qty}`,
      ret.id,
    ),
  };
}

export function mutateApproveReturn(state: PharmacyStateShape, id: string): PharmacyStateShape {
  if (!state.returns.some((r) => r.id === id)) throw new ServerActionError("NOT_FOUND", "Return not found.");
  return {
    ...state,
    returns: state.returns.map((r) => (r.id === id ? { ...r, status: "approved" as const } : r)),
  };
}

export function mutateRestockReturn(state: PharmacyStateShape, operator: PharmacyStaff, id: string): PharmacyStateShape {
  const ret = state.returns.find((r) => r.id === id);
  if (!ret) throw new ServerActionError("NOT_FOUND", "Return not found.");
  if (!ret.batchId) throw new ServerActionError("VALIDATION", "Return has no batch to restock.");
  return {
    ...state,
    returns: state.returns.map((r) => (r.id === id ? { ...r, status: "restocked" as const } : r)),
    stock: state.stock.map((s) => (s.id === ret.batchId ? { ...s, qtyOnHand: s.qtyOnHand + ret.qty } : s)),
    activities: appendPharmacyActivity(state.activities, operator.name, "return", `Restocked return ${id}`, id),
  };
}

export function mutatePayPOBill(
  state: PharmacyStateShape,
  operator: PharmacyStaff,
  poId: string,
  amount: number,
  mode: "cash" | "upi" | "transfer" | "credit",
  billUrl?: string,
): PharmacyStateShape {
  const po = state.purchaseOrders.find((p) => p.id === poId);
  if (!po) throw new ServerActionError("NOT_FOUND", "PO not found.");
  if (po.billPaid && amount <= 0) throw new ServerActionError("VALIDATION", "Bill is already paid.");
  return {
    ...state,
    purchaseOrders: state.purchaseOrders.map((p) =>
      p.id === poId
        ? {
            ...p,
            billPaid: true,
            lastPayDate: new Date().toISOString(),
            uploadedBillUrl: billUrl ?? p.uploadedBillUrl,
            status: p.status === "received" ? "bill_paid" : p.status,
          }
        : p,
    ),
    activities: appendPharmacyActivity(
      state.activities,
      operator.name,
      "po_payment",
      `Paid ₹${amount.toFixed(0)} (${mode}) to supplier for ${poId}`,
      poId,
    ),
  };
}

export function mutateAddSupplierCatalogueItem(
  state: PharmacyStateShape,
  operator: PharmacyStaff,
  item: Omit<SupplierCatalogueItem, "id">,
): PharmacyStateShape {
  return {
    ...state,
    supplierCatalogue: [
      ...state.supplierCatalogue,
      { ...item, id: `sc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` },
    ],
    activities: appendPharmacyActivity(
      state.activities,
      operator.name,
      "catalogue",
      `Added catalogue item ${item.name} for supplier`,
      item.supplierId,
    ),
  };
}

export function mutateUpdateSupplierCatalogueItem(
  state: PharmacyStateShape,
  id: string,
  patch: Partial<SupplierCatalogueItem>,
): PharmacyStateShape {
  if (!state.supplierCatalogue.some((i) => i.id === id)) throw new ServerActionError("NOT_FOUND", "Catalogue item not found.");
  return { ...state, supplierCatalogue: state.supplierCatalogue.map((i) => (i.id === id ? { ...i, ...patch } : i)) };
}

export function mutateFulfillIndent(
  state: PharmacyStateShape,
  operator: PharmacyStaff,
  id: string,
  qty: number,
): PharmacyStateShape {
  const indent = state.indents.find((i) => i.id === id);
  if (!indent) throw new ServerActionError("NOT_FOUND", "Indent not found.");
  if (qty <= 0 || qty > indent.qtyRequested) {
    throw new ServerActionError("VALIDATION", "Invalid issue quantity.");
  }
  return {
    ...state,
    indents: state.indents.map((i) =>
      i.id === id ? { ...i, qtyIssued: qty, status: qty >= i.qtyRequested ? ("issued" as const) : i.status } : i,
    ),
    activities: appendPharmacyActivity(state.activities, operator.name, "indent", `Issued ${qty} units to ${indent.ward}`, id),
  };
}

export function getFilteredPrescriptions(prescriptions: Prescription[]) {
  return [...prescriptions].sort((a, b) => {
    const pri = (p: Prescription) => (p.priority === "stat" ? 0 : p.priority === "urgent" ? 1 : 2);
    const d = pri(a) - pri(b);
    if (d !== 0) return d;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}
