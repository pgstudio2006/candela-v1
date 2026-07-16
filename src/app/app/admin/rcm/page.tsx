"use client";

import { useAdminStore } from "@/components/admin/admin-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, DataTable, MetricStrip, Panel, StatusBadge } from "@/components/frontdesk/ui";
import { getAdminRevenueCollectionAction } from "@/app/actions/admin-actions";
import type { RevenueCollectionResult } from "@/server/admin/revenue";
import { SimpleBarChart } from "@/components/doctor/analytics-charts";
import { Sparkles, Calendar } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const MODE_COLORS: Record<string, string> = {
  cash: "#1b1b1b",
  upi: "#4263eb",
  card: "#5c5c5a",
  online: "#8a8a88",
  other: "#b8b8b6",
};

function formatDateInput(date: Date) {
  return date.toISOString().split("T")[0];
}

export default function AdminRcmPage() {
  const { getActiveLeakageFlags, visits, resolveLeakageFlag, canManageFinance } = useAdminStore();
  const flags = getActiveLeakageFlags();
  const [selectedDate, setSelectedDate] = useState(formatDateInput(new Date()));
  const [data, setData] = useState<RevenueCollectionResult | null>(null);
  const [loading, setLoading] = useState(false);

  const partialTotal = visits.filter((v) => v.balanceDue).reduce((s, v) => s + (v.balanceDue ?? 0), 0);
  const deferred = visits.filter((v) => v.billing === "deferred").length;
  const collectionRate = useMemo(() => {
    const billed = visits.reduce((s, v) => s + (v.billAmount ?? 0), 0);
    const paid = visits.reduce((s, v) => s + (v.amountPaid ?? 0), 0);
    if (!billed) return 0;
    return Math.round((paid / billed) * 100);
  }, [visits]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getAdminRevenueCollectionAction(selectedDate)
      .then((res) => {
        if (!cancelled && res.ok) setData(res.data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  const aiNarrative = `Revenue cycle analysis: ₹${(partialTotal / 1000).toFixed(0)}K in partial balances across ${flags.filter((f) => f.type === "partial_uncollected").length} accounts. ${deferred} deferred packages need CRM follow-up. Nursing consent delays may block ${flags.filter((f) => f.type === "consent_delay").length} treatment starts — prioritize intake SLA. Recommended: desk collection calls for balances >₹20K, counsellor callback for deferred >14d.`;

  const dailyBars = useMemo(() => {
    if (!data?.daily) return [];
    return data.daily.map((d: RevenueCollectionResult["daily"][0]) => ({ label: d.date.slice(5), value: d.paid }));
  }, [data]);

  const modeSegments = useMemo(() => {
    if (!data?.byMode) return [];
    return Object.entries(data.byMode).map(([label, value]) => ({
      label: label.toUpperCase(),
      value: Number(value),
      color: MODE_COLORS[label] || "#1b1b1b",
    }));
  }, [data]);

  const billRows = useMemo(() => {
    return data?.bills?.map((b: RevenueCollectionResult["bills"][0]) => ({
      invoice: b.invoiceNumber,
      patient: b.patientName,
      uhid: b.uhid || "—",
      total: `₹${b.totalAmount.toLocaleString("en-IN")}`,
      paid: `₹${b.amountPaid.toLocaleString("en-IN")}`,
      balance: `₹${b.balanceAmount.toLocaleString("en-IN")}`,
      mode: b.paymentMode,
      status: <StatusBadge label={b.status} variant={b.status === "paid" ? "success" : b.status === "partial" ? "warning" : "info"} />,
    })) ?? [];
  }, [data]);

  return (
    <PageChrome breadcrumbs={[{ label: "Admin", href: "/app/admin" }, { label: "RCM" }]} title="Revenue cycle intelligence" meta="AI-driven leakage · collection optimization">
      <MetricStrip metrics={[
        { label: "Leakage flags", value: String(flags.length), delta: "Active issues", trend: flags.length > 3 ? "down" : "neutral" },
        { label: "Partial balance", value: `₹${(partialTotal / 1000).toFixed(0)}K`, delta: "Uncollected", trend: "down" },
        { label: "Deferred packages", value: String(deferred), delta: "Follow-up queue", trend: "neutral" },
        { label: "Collection rate", value: `${collectionRate}%`, delta: "From live visits", trend: collectionRate >= 85 ? "up" : "neutral" },
      ]} />
      <Panel title="Copilot RCM briefing" action={<Sparkles className="size-4 text-[var(--attio-accent)]" />}>
        <p className="text-[13px] leading-relaxed text-[var(--attio-text-secondary)]">{aiNarrative}</p>
      </Panel>

      <Panel title="Revenue collection by date" className="mt-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-[var(--attio-border-subtle)] px-3 py-2">
            <Calendar className="size-4 text-[var(--attio-text-tertiary)]" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-[13px] text-[var(--attio-text)] outline-none"
            />
          </div>
          {loading && <span className="text-[12px] text-[var(--attio-text-tertiary)]">Loading...</span>}
        </div>

        {data && (
          <>
            <MetricStrip
              className="mt-4"
              metrics={[
                { label: "Bills generated", value: String(data.totals.billCount), delta: selectedDate, trend: "neutral" },
                { label: "Total billed", value: `₹${data.totals.totalAmount.toLocaleString("en-IN")}`, delta: "On selected date", trend: "neutral" },
                { label: "Amount collected", value: `₹${data.totals.amountPaid.toLocaleString("en-IN")}`, delta: "On selected date", trend: data.totals.amountPaid >= data.totals.totalAmount * 0.85 ? "up" : "neutral" },
                { label: "Balance due", value: `₹${data.totals.balanceAmount.toLocaleString("en-IN")}`, delta: "On selected date", trend: data.totals.balanceAmount > 0 ? "down" : "neutral" },
              ]}
            />

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Panel title="Daily collection trend (30 days)">
                <p className="mb-2 text-[12px] text-[var(--attio-text-tertiary)]">Amount collected per day</p>
                {dailyBars.length > 0 ? (
                  <SimpleBarChart bars={dailyBars} />
                ) : (
                  <p className="py-10 text-center text-[13px] text-[var(--attio-text-tertiary)]">No collection data</p>
                )}
              </Panel>
              <Panel title="Payment mode collection">
                <p className="mb-2 text-[12px] text-[var(--attio-text-tertiary)]">Collection split for selected date</p>
                {modeSegments.length > 0 ? (
                  <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="relative size-[148px] shrink-0">
                      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
                        <circle cx="50" cy="50" r="38" fill="none" stroke="var(--attio-border-subtle)" strokeWidth="14" />
                        {(() => {
                          const total = modeSegments.reduce((s, x) => s + x.value, 0);
                          const c = 2 * Math.PI * 38;
                          let offset = 0;
                          return modeSegments.map((seg) => {
                            const len = total > 0 ? (seg.value / total) * c : 0;
                            const dash = `${len} ${c - len}`;
                            const el = (
                              <circle
                                key={seg.label}
                                cx="50"
                                cy="50"
                                r="38"
                                fill="none"
                                stroke={seg.color}
                                strokeWidth="14"
                                strokeDasharray={dash}
                                strokeDashoffset={-offset}
                              />
                            );
                            offset += len;
                            return el;
                          });
                        })()}
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-[20px] font-semibold tabular-nums text-[var(--attio-text)]">₹{(modeSegments.reduce((s, x) => s + x.value, 0) / 1000).toFixed(0)}K</span>
                        <span className="text-[10px] text-[var(--attio-text-tertiary)]">collected</span>
                      </div>
                    </div>
                    <ul className="min-w-0 flex-1 space-y-2">
                      {modeSegments.map((seg) => (
                        <li key={seg.label} className="flex items-center justify-between gap-2 text-[12px]">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="size-2 shrink-0 rounded-full" style={{ background: seg.color }} />
                            <span className="truncate text-[var(--attio-text-secondary)]">{seg.label}</span>
                          </span>
                          <span className="shrink-0 font-medium tabular-nums text-[var(--attio-text)]">₹{seg.value.toLocaleString("en-IN")}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="py-10 text-center text-[13px] text-[var(--attio-text-tertiary)]">No payment mode data</p>
                )}
              </Panel>
            </div>

            <Panel title={`Bills generated on ${selectedDate}`} className="mt-4">
              {billRows.length > 0 ? (
                <DataTable
                  columns={[
                    { key: "invoice", label: "Invoice #" },
                    { key: "patient", label: "Patient" },
                    { key: "uhid", label: "UHID" },
                    { key: "total", label: "Total", className: "text-right" },
                    { key: "paid", label: "Paid", className: "text-right" },
                    { key: "balance", label: "Balance", className: "text-right" },
                    { key: "mode", label: "Mode" },
                    { key: "status", label: "Status" },
                  ]}
                  rows={billRows}
                />
              ) : (
                <p className="py-10 text-center text-[13px] text-[var(--attio-text-tertiary)]">No bills generated on this date</p>
              )}
            </Panel>
          </>
        )}
      </Panel>

      <Panel title="Leakage register" className="mt-4">
        <ul className="space-y-3">
          {flags.length === 0 ? (
            <li className="py-6 text-center text-[13px] text-[var(--attio-text-tertiary)]">No active leakage flags</li>
          ) : flags.map((f) => (
            <li key={f.id} className="rounded-lg border border-[var(--attio-border-subtle)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{f.patientName}</p>
                <div className="flex gap-1">
                  <StatusBadge label={f.type.replace(/_/g, " ")} variant="info" />
                  <StatusBadge label={f.priority} variant={f.priority === "high" ? "danger" : "warning"} />
                </div>
              </div>
              <p className="mt-2 text-[13px] text-[var(--attio-text-secondary)]">{f.suggestion}</p>
              <p className="mt-1 text-[12px] text-[var(--attio-text-tertiary)]">{f.daysOpen}d open · visit {f.visitId}{f.amount ? ` · ₹${f.amount.toLocaleString("en-IN")}` : ""}</p>
              {canManageFinance && (
                <AttioButton variant="secondary" className="mt-3 !h-8 !text-[12px]" onClick={() => void resolveLeakageFlag(f.id)}>
                  Mark resolved
                </AttioButton>
              )}
            </li>
          ))}
        </ul>
      </Panel>
    </PageChrome>
  );
}
