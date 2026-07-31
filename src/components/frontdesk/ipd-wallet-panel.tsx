"use client";

import {
  recordIpdAdvancePaymentAction,
} from "@/app/actions/ipd-actions";
import { useToast } from "@/components/ui/toast-provider";
import { AttioButton, DataTable, MetricStrip, Panel, StatusBadge } from "@/components/frontdesk/ui";
import type { IpdAdmissionDetail, IpdAdvancePayment } from "@/design-system/ipd-data";
import { IndianRupee, Plus, Printer, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

type Split = { mode: string; amount: string };

const PAYMENT_MODES = ["cash", "card", "upi", "netbanking", "cheque", "wallet", "other", "due", "pending"];

export function IpdWalletPanel({
  admission,
  onChange,
}: {
  admission: IpdAdmissionDetail;
  onChange?: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [splits, setSplits] = useState<Split[]>([{ mode: "cash", amount: "" }]);
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");

  const totalAmount = useMemo(
    () => splits.reduce((s, sp) => s + (Number(sp.amount) || 0), 0),
    [splits],
  );

  const received = useMemo(
    () => admission.advancePayments.filter((a) => a.status === "received").reduce((s, a) => s + a.receivedAmount, 0),
    [admission.advancePayments],
  );
  const pending = useMemo(
    () =>
      admission.advancePayments
        .filter((a) => a.status !== "cancelled" && a.status !== "refunded")
        .reduce((s, a) => s + a.pendingAmount, 0),
    [admission.advancePayments],
  );
  const issuedRefunds = useMemo(
    () => admission.refundVouchers.filter((v) => v.status === "issued").reduce((s, v) => s + v.amount, 0),
    [admission.refundVouchers],
  );
  const walletBalance = (admission.walletBalance ?? 0);

  const addSplit = () => setSplits((prev) => [...prev, { mode: "cash", amount: "" }]);
  const removeSplit = (i: number) => setSplits((prev) => prev.filter((_, idx) => idx !== i));
  const updateSplit = (i: number, patch: Partial<Split>) => setSplits((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const handleSubmit = async () => {
    if (totalAmount <= 0) return toast("Enter a positive amount", "error");
    setSaving(true);
    try {
      const res = await recordIpdAdvancePaymentAction(admission.id, {
        amount: totalAmount,
        mode: splits.length === 1 ? splits[0].mode : "split",
        splits: splits.map((s) => ({ mode: s.mode, amount: Number(s.amount) || 0 })),
        referenceNo: referenceNo.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      if (!res.ok) throw new Error(res.error);
      if (!res.data) throw new Error("Failed to record advance");
      toast("Advance recorded", "success");
      setSplits([{ mode: "cash", amount: "" }]);
      setReferenceNo("");
      setNotes("");
      onChange?.();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to record advance", "error");
    } finally {
      setSaving(false);
    }
  };

  const handlePrintReceipt = (payment: IpdAdvancePayment) => {
    const w = window.open("", "_blank", "width=600,height=500");
    if (!w) return;
    const date = new Date(payment.receivedAt).toLocaleString();
    const splits = payment.splits?.length
      ? payment.splits.map((s) => `<tr><td>${s.mode.toUpperCase()}</td><td style="text-align:right">₹${s.amount.toLocaleString()}</td></tr>`).join("")
      : `<tr><td>${payment.mode.toUpperCase()}</td><td style="text-align:right">₹${payment.amount.toLocaleString()}</td></tr>`;
    w.document.write(`
      <html>
        <head><title>Advance Receipt</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; font-size: 13px; }
            h2 { margin: 0 0 8px; font-size: 16px; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            td { padding: 6px 0; border-bottom: 1px solid #ddd; }
            .total { font-weight: bold; }
          </style>
        </head>
        <body>
          <h2>Advance Receipt</h2>
          <p><strong>Patient:</strong> ${admission.patientName} (${admission.uhid ?? "—"})</p>
          <p><strong>Date:</strong> ${date}</p>
          <p><strong>Reference:</strong> ${payment.referenceNo ?? "—"}</p>
          <table>${splits}</table>
          <p class="total">Total: ₹${payment.amount.toLocaleString()}</p>
          <p><strong>Notes:</strong> ${payment.notes ?? "—"}</p>
        </body>
      </html>
    `);
    w.document.close();
    w.focus();
    w.print();
  };

  const columns = [
    { key: "receivedAt", label: "Date" },
    { key: "mode", label: "Mode" },
    { key: "amount", label: "Amount", className: "text-right" },
    { key: "status", label: "Status" },
    { key: "actions", label: "", className: "text-right" },
  ];

  const rows = admission.advancePayments.map((a) => ({
    receivedAt: new Date(a.receivedAt).toLocaleString(),
    mode: <span className="capitalize">{a.mode}</span>,
    amount: (
      <div className="text-right tabular-nums">
        ₹{a.amount.toLocaleString()}
        {a.pendingAmount > 0 && <span className="ml-1 text-[10px] text-amber-600">(P: ₹{a.pendingAmount})</span>}
      </div>
    ),
    status: <StatusBadge label={a.status} variant={a.status === "received" ? "success" : a.status === "pending" ? "warning" : a.status === "cancelled" ? "danger" : "neutral"} />,
    actions: (
      <button
        type="button"
        onClick={() => handlePrintReceipt(a)}
        className="inline-flex items-center text-[var(--attio-text-secondary)] hover:text-[var(--attio-text)]"
        title="Print receipt"
      >
        <Printer className="size-3.5" />
      </button>
    ),
  }));

  return (
    <div className="space-y-4">
      <MetricStrip
        metrics={[
          { label: "Wallet balance", value: `₹${walletBalance.toLocaleString()}`, delta: "", trend: "neutral" },
          { label: "Received", value: `₹${received.toLocaleString()}`, delta: "", trend: "up" },
          { label: "Pending", value: `₹${pending.toLocaleString()}`, delta: "", trend: "down" as const },
          { label: "Issued refunds", value: `₹${issuedRefunds.toLocaleString()}`, delta: "", trend: "down" as const },
        ]}
      />

      <Panel
        title="Record advance payment"
        action={
          <div className="text-[12px] font-medium">
            Total: <span className="tabular-nums">₹{totalAmount.toLocaleString()}</span>
          </div>
        }
      >
        <div className="space-y-3">
          {splits.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                value={s.mode}
                onChange={(e) => updateSplit(i, { mode: e.target.value })}
                className="h-8 rounded-md border px-2 text-[12px] capitalize"
              >
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                step="0.01"
                value={s.amount}
                onChange={(e) => updateSplit(i, { amount: e.target.value })}
                placeholder="Amount"
                className="h-8 flex-1 rounded-md border px-2 text-[12px]"
              />
              {splits.length > 1 && (
                <button type="button" onClick={() => removeSplit(i)} className="text-red-500 hover:text-red-700">
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          ))}
          <AttioButton variant="secondary" className="!h-7 !text-[11px]" onClick={addSplit}>
            <Plus className="size-3" />
            Add split
          </AttioButton>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
              placeholder="Reference / cheque no"
              className="h-8 rounded-md border px-2 text-[12px]"
            />
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes"
              className="h-8 rounded-md border px-2 text-[12px]"
            />
          </div>
          <AttioButton onClick={() => void handleSubmit()} disabled={saving} className="w-full sm:w-auto">
            <IndianRupee className="size-3.5" />
            {saving ? "Saving..." : "Record advance"}
          </AttioButton>
        </div>
      </Panel>

      <Panel title="Advance receipts">
        {admission.advancePayments.length === 0 ? (
          <p className="text-[13px] text-[var(--attio-text-tertiary)]">No advance payments recorded.</p>
        ) : (
          <DataTable columns={columns} rows={rows} />
        )}
      </Panel>
    </div>
  );
}
