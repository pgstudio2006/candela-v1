import type {
  Drug,
  PharmacyBill,
  Prescription,
  PurchaseOrder,
  ScheduleHEntry,
  StockBatch,
} from "@/design-system/pharmacy-data";

export type PharmacyKpis = {
  label: string;
  value: string;
  delta: string;
  trend: "up" | "down" | "neutral";
}[];

export function daysToExpiry(expiry: string): number {
  return Math.floor((new Date(expiry).getTime() - Date.now()) / 86400000);
}

export function pickFefoBatch(drugId: string, stock: StockBatch[], qty: number): StockBatch | null {
  const batches = stock
    .filter((s) => s.drugId === drugId && !s.quarantined && s.qtyOnHand - s.reserved >= qty)
    .sort((a, b) => a.expiry.localeCompare(b.expiry));
  return batches[0] ?? null;
}

export function computePharmacyKpis(
  prescriptions: Prescription[],
  stock: StockBatch[],
  drugs: Drug[],
  bills: PharmacyBill[],
  purchaseOrders: PurchaseOrder[],
): PharmacyKpis {
  const today = new Date().toISOString().slice(0, 10);
  const pending = prescriptions.filter((r) => r.status === "pending").length;
  const verified = prescriptions.filter((r) => r.status === "verified").length;
  const dispensedToday = prescriptions.filter(
    (r) => r.status === "dispensed" && r.dispensedAt?.startsWith(today),
  ).length;
  const lowStock = drugs.filter((d) => {
    const onHand = stock.filter((s) => s.drugId === d.id && !s.quarantined).reduce((n, s) => n + s.qtyOnHand, 0);
    return onHand <= d.reorderLevel;
  }).length;
  const nearExpiry = stock.filter((s) => {
    const d = daysToExpiry(s.expiry);
    return d >= 0 && d <= 30 && !s.quarantined;
  }).length;
  const outOfStock = drugs.filter((d) => {
    const onHand = stock.filter((s) => s.drugId === d.id && !s.quarantined).reduce((n, s) => n + s.qtyOnHand, 0);
    return onHand === 0;
  }).length;
  const revenueToday = bills
    .filter((b) => b.createdAt.startsWith(today) && b.paid)
    .reduce((s, b) => s + b.total, 0);
  const billsToday = bills.filter((b) => b.createdAt.startsWith(today)).length;
  const salesToday = bills
    .filter((b) => b.createdAt.startsWith(today))
    .reduce((s, b) => s + b.lines.reduce((ls, l) => ls + l.qty, 0), 0);
  const profitToday = bills
    .filter((b) => b.createdAt.startsWith(today) && b.paid)
    .reduce((s, b) => s + b.lines.reduce((ls, l) => ls + l.qty * (l.rate - (l.purchaseRate ?? 0)), 0), 0);
  const openPo = purchaseOrders.filter((p) => ["submitted", "approved", "partial"].includes(p.status)).length;
  const pendingReturns = bills.filter((b) => b.createdAt.startsWith(today) && !b.paid).length;

  return [
    { label: "Today's Sales", value: String(salesToday), delta: "Units dispensed", trend: "up" },
    { label: "Today's Bills", value: String(billsToday), delta: "Counter transactions", trend: "up" },
    { label: "Today's Revenue", value: `₹${revenueToday.toLocaleString("en-IN")}`, delta: "Gross collection", trend: "up" },
    { label: "Today's Profit", value: `₹${profitToday.toLocaleString("en-IN")}`, delta: "Selling - purchase", trend: profitToday >= 0 ? "up" : "down" },
    { label: "Pending Orders", value: String(pending), delta: "Awaiting verify", trend: pending ? "down" : "neutral" },
    { label: "Pending Returns", value: String(pendingReturns), delta: "Unpaid bills", trend: pendingReturns ? "down" : "neutral" },
    { label: "Low Stock", value: String(lowStock), delta: "At/below reorder", trend: lowStock ? "down" : "neutral" },
    { label: "Near Expiry", value: String(nearExpiry), delta: "≤30 days", trend: nearExpiry ? "down" : "neutral" },
    { label: "Out of Stock", value: String(outOfStock), delta: "Zero inventory", trend: outOfStock ? "down" : "neutral" },
    { label: "Open POs", value: String(openPo), delta: "Procurement pending", trend: "neutral" },
    { label: "Supplier Payments", value: "₹0", delta: "Finance module", trend: "neutral" },
  ];
}

export function isControlledSchedule(schedule: Drug["schedule"]): boolean {
  return schedule === "H" || schedule === "H1" || schedule === "X";
}

export function computeScheduleBalance(entries: ScheduleHEntry[], drugId: string): number {
  return entries.filter((e) => e.drugId === drugId).reduce((_, e) => e.balanceAfter, 0) || 0;
}

export function calcBillTotals(lines: { qty: number; rate: number; gstPercent: number }[], discount = 0) {
  const subtotal = lines.reduce((s, l) => s + l.qty * l.rate, 0);
  const gstTotal = lines.reduce((s, l) => s + (l.qty * l.rate * l.gstPercent) / 100, 0);
  const total = subtotal + gstTotal - discount;
  return { subtotal, gstTotal, total };
}
