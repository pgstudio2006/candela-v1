"use client";

import { listPharmacyAuditLogsAction } from "@/server/pharmacy/actions";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, Panel, StatusBadge, DataTable } from "@/components/frontdesk/ui";
import { PharmacySelect, FormRow } from "@/components/pharmacy/ui";
import { usePharmacyStore } from "@/components/pharmacy/pharmacy-store";
import { usePharmacyPoll } from "@/hooks/use-pharmacy-poll";
import { useCallback, useEffect, useState } from "react";
import { PharmacyDialog } from "@/components/pharmacy/ui";
import type { PharmacyBill } from "@/design-system/pharmacy-data";

type AuditRow = Awaited<ReturnType<typeof listPharmacyAuditLogsAction>>[number];

export default function PharmacyAuditPage() {
  usePharmacyPoll(30_000);
  const { activities, bills, getDrug, isManager, stock } = usePharmacyStore();
  const [platformLogs, setPlatformLogs] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"activity" | "bills" | "analytics">("analytics");
  const [dateFilter, setDateFilter] = useState<"today" | "week" | "month" | "all">("month");
  const [selectedBill, setSelectedBill] = useState<PharmacyBill | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const rows = await listPharmacyAuditLogsAction({ limit: 80 });
    setPlatformLogs(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Filter bills based on date selection
  const filteredBills = bills.filter((bill) => {
    const billDate = new Date(bill.createdAt);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    if (dateFilter === "today") {
      return billDate >= today;
    }
    if (dateFilter === "week") {
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return billDate >= weekAgo;
    }
    if (dateFilter === "month") {
      const monthAgo = new Date(today);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      return billDate >= monthAgo;
    }
    return true;
  });

  // Calculate analytics
  const totalRevenue = filteredBills.reduce((acc, bill) => acc + bill.total, 0);
  const totalGST = filteredBills.reduce((acc, bill) => acc + bill.gstTotal, 0);
  const totalDiscount = filteredBills.reduce((acc, bill) => acc + bill.discount, 0);
  const paidBills = filteredBills.filter((b) => b.paid).length;
  const pendingBills = filteredBills.filter((b) => !b.paid).length;
  const avgBillValue = filteredBills.length > 0 ? totalRevenue / filteredBills.length : 0;

  const totalCost = filteredBills.reduce((acc, bill) =>
    acc + bill.lines.reduce((lineAcc, line) => lineAcc + (line.purchaseRate ?? 0) * line.qty, 0), 0);
  const grossProfit = totalRevenue - totalCost;
  const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

  if (!isManager()) {
    return (
      <PageChrome breadcrumbs={[{ label: "Pharmacy", href: "/app/pharmacy" }, { label: "Audit" }]} title="Audit trail" meta="Manager only">
        <p className="text-[13px]">Full audit trail available to pharmacy manager.</p>
      </PageChrome>
    );
  }

  return (
    <PageChrome
      breadcrumbs={[{ label: "Pharmacy", href: "/app/pharmacy" }, { label: "Audit" }]}
      title="Pharmacy audit & analytics"
      meta="Bills · revenue · sales analytics · billing statistics · financial analysis"
      actions={
        <AttioButton variant="secondary" onClick={() => void load()}>
          Refresh
        </AttioButton>
      }
      tabs={[
        { id: "analytics", label: "Analytics" },
        { id: "bills", label: "Bills" },
        { id: "activity", label: "Activity Log" },
      ]}
      activeTab={tab}
      onTabChange={(id) => setTab(id as typeof tab)}
    >
      {tab === "analytics" && (
        <div className="space-y-4">
          <Panel title="Date Filter">
            <FormRow label="Period">
              <PharmacySelect value={dateFilter} onChange={(e) => setDateFilter(e.target.value as any)}>
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="all">All Time</option>
              </PharmacySelect>
            </FormRow>
          </Panel>

          <Panel title="Revenue Summary">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-[11px] text-[var(--attio-text-tertiary)]">Total Revenue</p>
                <p className="text-xl font-medium">₹{totalRevenue.toLocaleString("en-IN")}</p>
              </div>
              <div>
                <p className="text-[11px] text-[var(--attio-text-tertiary)]">Total GST</p>
                <p className="text-xl font-medium">₹{totalGST.toLocaleString("en-IN")}</p>
              </div>
              <div>
                <p className="text-[11px] text-[var(--attio-text-tertiary)]">Total Discount</p>
                <p className="text-xl font-medium">₹{totalDiscount.toLocaleString("en-IN")}</p>
              </div>
              <div>
                <p className="text-[11px] text-[var(--attio-text-tertiary)]">Net Revenue</p>
                <p className="text-xl font-medium">₹{(totalRevenue - totalGST - totalDiscount).toLocaleString("en-IN")}</p>
              </div>
            </div>
          </Panel>

          <Panel title="Billing Statistics">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-[11px] text-[var(--attio-text-tertiary)]">Total Bills</p>
                <p className="text-xl font-medium">{filteredBills.length}</p>
              </div>
              <div>
                <p className="text-[11px] text-[var(--attio-text-tertiary)]">Paid Bills</p>
                <p className="text-xl font-medium text-green-600">{paidBills}</p>
              </div>
              <div>
                <p className="text-[11px] text-[var(--attio-text-tertiary)]">Pending Bills</p>
                <p className="text-xl font-medium text-amber-600">{pendingBills}</p>
              </div>
              <div>
                <p className="text-[11px] text-[var(--attio-text-tertiary)]">Avg Bill Value</p>
                <p className="text-xl font-medium">₹{avgBillValue.toFixed(2)}</p>
              </div>
            </div>
          </Panel>

          <Panel title="Payment Mode Breakdown">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {["cash", "upi", "card", "credit_ipd"].map((mode) => {
                const count = filteredBills.filter((b) => b.paymentMode === mode).length;
                const amount = filteredBills.filter((b) => b.paymentMode === mode).reduce((acc, b) => acc + b.total, 0);
                return (
                  <div key={mode}>
                    <p className="text-[11px] text-[var(--attio-text-tertiary)] capitalize">{mode.replace("_", " ")}</p>
                    <p className="font-medium">{count} bills</p>
                    <p className="text-[11px] text-[var(--attio-text-tertiary)]">₹{amount.toLocaleString("en-IN")}</p>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel title="Finance Analysis">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-[11px] text-[var(--attio-text-tertiary)]">Total Cost</p>
                <p className="text-xl font-medium">₹{totalCost.toLocaleString("en-IN")}</p>
              </div>
              <div>
                <p className="text-[11px] text-[var(--attio-text-tertiary)]">Gross Profit</p>
                <p className="text-xl font-medium text-green-600">₹{grossProfit.toLocaleString("en-IN")}</p>
              </div>
              <div>
                <p className="text-[11px] text-[var(--attio-text-tertiary)]">Gross Margin</p>
                <p className="text-xl font-medium">{grossMargin.toFixed(1)}%</p>
              </div>
              <div>
                <p className="text-[11px] text-[var(--attio-text-tertiary)]">Net Revenue</p>
                <p className="text-xl font-medium">₹{(totalRevenue - totalGST - totalDiscount).toLocaleString("en-IN")}</p>
              </div>
            </div>
          </Panel>
        </div>
      )}

      {tab === "bills" && (
        <DataTable
          columns={[
            { key: "id", label: "Bill #" },
            { key: "patient", label: "Patient" },
            { key: "date", label: "Date" },
            { key: "total", label: "Total" },
            { key: "discount", label: "Discount" },
            { key: "gst", label: "GST" },
            { key: "status", label: "Status" },
            { key: "mode", label: "Payment" },
            { key: "actions", label: "" },
          ]}
          rows={filteredBills.map((bill) => ({
            id: bill.id,
            patient: bill.patientName,
            date: new Date(bill.createdAt).toLocaleDateString("en-IN"),
            total: `₹${bill.total.toLocaleString("en-IN")}`,
            discount: bill.discount ? `₹${bill.discount}` : "—",
            gst: bill.gstTotal ? `₹${bill.gstTotal}` : "—",
            status: <StatusBadge label={bill.paid ? "Paid" : "Pending"} variant={bill.paid ? "success" : "warning"} />,
            mode: bill.paymentMode.replace("_", " ").toUpperCase(),
            actions: (
              <AttioButton variant="secondary" className="!h-7 !text-[11px]" onClick={() => setSelectedBill(bill)}>
                View details
              </AttioButton>
            ),
          }))}
        />
      )}

      {selectedBill && (
        <PharmacyDialog open title={`Bill details — ${selectedBill.id}`} onClose={() => setSelectedBill(null)} width="max-w-2xl">
          <div className="space-y-4 text-[13px]">
            <div className="grid grid-cols-2 gap-3">
              <div><p className="text-[11px] text-[var(--attio-text-tertiary)]">Patient</p><p className="font-medium">{selectedBill.patientName}</p></div>
              <div><p className="text-[11px] text-[var(--attio-text-tertiary)]">UHID</p><p>{selectedBill.uhid ?? "—"}</p></div>
              <div><p className="text-[11px] text-[var(--attio-text-tertiary)]">Date</p><p>{new Date(selectedBill.createdAt).toLocaleString("en-IN")}</p></div>
              <div><p className="text-[11px] text-[var(--attio-text-tertiary)]">Created by</p><p>{selectedBill.createdBy}</p></div>
            </div>
            <div className="rounded border">
              <table className="w-full text-[12px]">
                <thead className="bg-[var(--attio-hover)]">
                  <tr>
                    <th className="px-3 py-2 text-left">Drug</th>
                    <th className="px-3 py-2 text-left">Batch</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Rate</th>
                    <th className="px-3 py-2 text-right">GST %</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {selectedBill.lines.map((line, idx) => {
                    const drug = getDrug(line.drugId);
                    const batch = stock.find((s) => s.id === line.batchId);
                    const lineTotal = line.qty * line.rate;
                    return (
                      <tr key={idx}>
                        <td className="px-3 py-2">{drug?.brandName ?? line.drugId}</td>
                        <td className="px-3 py-2">{batch?.batchNo ?? line.batchId}</td>
                        <td className="px-3 py-2 text-right">{line.qty}</td>
                        <td className="px-3 py-2 text-right">₹{line.rate.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">{line.gstPercent}%</td>
                        <td className="px-3 py-2 text-right">₹{lineTotal.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between border-t pt-3 text-[13px]">
              <div className="space-y-1">
                <p className="text-[var(--attio-text-tertiary)]">Subtotal: ₹{selectedBill.subtotal.toFixed(2)}</p>
                <p className="text-[var(--attio-text-tertiary)]">GST: ₹{selectedBill.gstTotal.toFixed(2)}</p>
                {selectedBill.discount > 0 && <p className="text-[var(--attio-text-tertiary)]">Discount: ₹{selectedBill.discount.toFixed(2)}</p>}
              </div>
              <div className="text-right">
                <p className="text-[11px] text-[var(--attio-text-tertiary)]">Total</p>
                <p className="text-xl font-medium">₹{selectedBill.total.toFixed(2)}</p>
                <p className="text-[11px] text-[var(--attio-text-tertiary)]">Status: {selectedBill.paid ? "Paid" : "Pending"} · {selectedBill.paymentMode.replace("_", " ").toUpperCase()}</p>
              </div>
            </div>
          </div>
        </PharmacyDialog>
      )}

      {tab === "activity" && (
        <>
          <Panel title="Platform audit (immutable)">
            {loading && platformLogs.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-[var(--attio-text-tertiary)]">Loading…</p>
            ) : platformLogs.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-[var(--attio-text-tertiary)]">No platform audit entries yet</p>
            ) : (
              <ul className="divide-y divide-[var(--attio-border-subtle)]">
                {platformLogs.map((log) => (
                  <li key={log.id} className="py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-[13px] font-medium">{log.summary}</p>
                        <p className="mt-0.5 text-[11px] text-[var(--attio-text-tertiary)]">
                          {log.actor} · {log.action} · {log.entityType} {log.entityId}
                        </p>
                      </div>
                      <div className="text-right">
                        <StatusBadge
                          label={log.severity}
                          variant={log.severity === "critical" || log.severity === "warning" ? "warning" : "neutral"}
                        />
                        <p className="mt-1 text-[10px] text-[var(--attio-text-tertiary)]">
                          {new Date(log.at).toLocaleString("en-IN")}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Workspace activity (recent)" className="mt-4">
            <ul className="divide-y divide-[var(--attio-border-subtle)]">
              {activities.slice(0, 40).map((a) => (
                <li key={a.id} className="py-2 text-[12px]">
                  <p>{a.summary}</p>
                  <p className="text-[var(--attio-text-tertiary)]">
                    {a.actor} · {a.type} · {new Date(a.at).toLocaleString("en-IN")}
                  </p>
                </li>
              ))}
              {activities.length === 0 && (
                <li className="py-4 text-[13px] text-[var(--attio-text-tertiary)]">Activity appears on verify, dispense, PO receive</li>
              )}
            </ul>
          </Panel>
        </>
      )}
    </PageChrome>
  );
}
