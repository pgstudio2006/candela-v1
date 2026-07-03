"use client";

import { useAdminStore } from "@/components/admin/admin-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, DataTable, MetricStrip, Panel, StatusBadge } from "@/components/frontdesk/ui";
import { useState } from "react";

export default function AdminFinancePage() {
  const { expenses, addExpense, approveExpense, getCommandKpis } = useAdminStore();
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState(0);
  const pending = expenses.filter((e) => e.status === "pending");
  const approved = expenses.filter((e) => e.status === "approved");
  const totalApproved = approved.reduce((s, e) => s + e.amount, 0);

  return (
    <PageChrome breadcrumbs={[{ label: "Admin", href: "/app/admin" }, { label: "Finance" }]} title="Finance & expense control" meta="Budget vs actual · approval queue · ledger">
      <MetricStrip metrics={[
        { label: "Expenses MTD", value: `₹${(totalApproved / 100000).toFixed(1)}L`, delta: `${approved.length} approved`, trend: "neutral" },
        { label: "Pending approval", value: String(pending.length), delta: "Action required", trend: pending.length ? "down" : "neutral" },
        { label: "Revenue (live)", value: getCommandKpis()[0]?.value ?? "—", delta: "From billing", trend: "up" },
        { label: "Net indicator", value: "On budget", delta: "This branch", trend: "neutral" },
      ]} />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Panel title="Expense ledger">
          <DataTable
            columns={[
              { key: "date", label: "Date" },
              { key: "vendor", label: "Vendor" },
              { key: "cat", label: "Category" },
              { key: "amt", label: "Amount" },
              { key: "st", label: "Status" },
            ]}
            rows={expenses.map((e) => ({
              date: e.date,
              vendor: e.vendor,
              cat: e.category,
              amt: `₹${e.amount.toLocaleString("en-IN")}`,
              st: <StatusBadge label={e.status} variant={e.status === "approved" ? "success" : e.status === "pending" ? "warning" : "danger"} />,
            }))}
          />
        </Panel>
        <Panel title="New expense">
          <div className="space-y-3">
            <input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Vendor" className="h-9 w-full rounded-lg border px-3 text-[13px]" />
            <input type="number" value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} placeholder="Amount" className="h-9 w-full rounded-lg border px-3 text-[13px]" />
            <AttioButton variant="primary" className="w-full" onClick={() => { addExpense({ date: new Date().toISOString().slice(0, 10), vendor: vendor || "Vendor", category: "Operations", amount, status: "pending" }); setVendor(""); setAmount(0); }}>
              Submit for approval
            </AttioButton>
          </div>
          {pending.length > 0 && (
            <div className="mt-4 border-t pt-4">
              <p className="mb-2 text-[12px] font-medium">Approval queue</p>
              {pending.map((e) => (
                <div key={e.id} className="mb-2 flex items-center justify-between text-[12px]">
                  <span>{e.vendor} · ₹{e.amount.toLocaleString("en-IN")}</span>
                  <div className="flex gap-1">
                    <AttioButton variant="primary" className="!h-7 !text-[11px]" onClick={() => approveExpense(e.id, true)}>Approve</AttioButton>
                    <AttioButton variant="secondary" className="!h-7 !text-[11px]" onClick={() => approveExpense(e.id, false)}>Reject</AttioButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </PageChrome>
  );
}
