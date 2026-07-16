import { prisma } from "@/lib/prisma";
import type { ServerContext } from "@/server/context";
import { branchScope } from "@/server/tenancy";

const PAYMENT_MODES = ["cash", "upi", "card", "online", "bank", "other"] as const;

type PaymentMode = (typeof PAYMENT_MODES)[number];

export type RevenueBill = {
  id: string;
  invoiceNumber: string;
  patientName: string;
  uhid?: string;
  totalAmount: number;
  amountPaid: number;
  balanceAmount: number;
  paymentMode: string;
  status: string;
  createdAt: string;
};

export type DailyRevenue = {
  date: string;
  total: number;
  paid: number;
  balance: number;
  byMode: Record<string, number>;
};

export type RevenueCollectionResult = {
  selectedDate: string;
  bills: RevenueBill[];
  totals: {
    totalAmount: number;
    amountPaid: number;
    balanceAmount: number;
    billCount: number;
  };
  byMode: Record<string, number>;
  daily: DailyRevenue[];
};

function normalizeMode(mode: string): PaymentMode {
  const m = mode.toLowerCase().trim();
  if (m.includes("cash")) return "cash";
  if (m.includes("upi")) return "upi";
  if (m.includes("card") || m.includes("credit") || m.includes("debit")) return "card";
  if (m.includes("online") || m.includes("net banking") || m.includes("bank")) return "online";
  return "other";
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function formatDateKey(d: Date) {
  return d.toISOString().split("T")[0];
}

export async function getAdminRevenueCollection(
  ctx: ServerContext,
  selectedDate: Date,
  rangeDays = 30,
): Promise<RevenueCollectionResult> {
  const scope = branchScope(ctx);
  const selectedStart = startOfDay(selectedDate);
  const selectedEnd = endOfDay(selectedDate);

  const rangeEnd = endOfDay(selectedDate);
  const rangeStart = startOfDay(new Date(rangeEnd.getTime() - (rangeDays - 1) * 24 * 60 * 60 * 1000));

  const [selectedInvoices, rangeInvoices, rangePayments] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        ...scope,
        createdAt: { gte: selectedStart, lte: selectedEnd },
      },
      orderBy: { createdAt: "desc" },
      include: {
        patient: { select: { id: true, name: true, fullName: true, uhid: true } },
        payments: { select: { mode: true, amount: true } },
      },
    }),
    prisma.invoice.findMany({
      where: {
        ...scope,
        createdAt: { gte: rangeStart, lte: rangeEnd },
      },
      select: {
        id: true,
        totalAmount: true,
        amountPaid: true,
        balanceAmount: true,
        createdAt: true,
      },
    }),
    prisma.payment.findMany({
      where: {
        ...scope,
        paidAt: { gte: rangeStart, lte: rangeEnd },
        status: { not: "cancelled" },
      },
      select: { mode: true, amount: true, paidAt: true },
    }),
  ]);

  const bills: RevenueBill[] = selectedInvoices.map((inv) => {
    const patientName = inv.patient?.name ?? inv.patient?.fullName ?? "Unknown";
    const paymentMode = inv.payments[0]?.mode ?? "—";
    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      patientName,
      uhid: inv.patient?.uhid ?? undefined,
      totalAmount: Number(inv.totalAmount),
      amountPaid: Number(inv.amountPaid),
      balanceAmount: Number(inv.balanceAmount),
      paymentMode,
      status: inv.status,
      createdAt: inv.createdAt.toISOString(),
    };
  });

  const totals = bills.reduce(
    (acc, b) => {
      acc.totalAmount += b.totalAmount;
      acc.amountPaid += b.amountPaid;
      acc.balanceAmount += b.balanceAmount;
      return acc;
    },
    { totalAmount: 0, amountPaid: 0, balanceAmount: 0, billCount: bills.length },
  );

  const byMode = selectedInvoices.reduce<Record<string, number>>((acc, inv) => {
    for (const payment of inv.payments) {
      const mode = normalizeMode(payment.mode ?? "other");
      acc[mode] = (acc[mode] ?? 0) + Number(payment.amount);
    }
    return acc;
  }, {});

  const dailyMap = new Map<string, DailyRevenue>();

  for (let i = 0; i < rangeDays; i++) {
    const d = new Date(rangeStart.getTime() + i * 24 * 60 * 60 * 1000);
    const key = formatDateKey(d);
    dailyMap.set(key, { date: key, total: 0, paid: 0, balance: 0, byMode: {} });
  }

  for (const inv of rangeInvoices) {
    const key = formatDateKey(inv.createdAt);
    const entry = dailyMap.get(key);
    if (entry) {
      entry.total += Number(inv.totalAmount);
      entry.paid += Number(inv.amountPaid);
      entry.balance += Number(inv.balanceAmount);
    }
  }

  for (const payment of rangePayments) {
    const key = formatDateKey(payment.paidAt);
    const entry = dailyMap.get(key);
    if (entry) {
      const mode = normalizeMode(payment.mode);
      entry.byMode[mode] = (entry.byMode[mode] ?? 0) + Number(payment.amount);
    }
  }

  const daily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  return {
    selectedDate: formatDateKey(selectedDate),
    bills,
    totals,
    byMode,
    daily,
  };
}
