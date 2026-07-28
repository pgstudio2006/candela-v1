"use client";

import {
  createIpdRefundVoucherAction,
  directDischargeIpdAdmissionAction,
  issueIpdRefundVoucherAction,
} from "@/app/actions/ipd-actions";
import { AttioButton, DataTable, Panel, StatusBadge } from "@/components/frontdesk/ui";
import { useToast } from "@/components/ui/toast-provider";
import type { IpdAdmissionDetail } from "@/design-system/ipd-data";
import { CheckCircle, Plus, Zap } from "lucide-react";
import { useState } from "react";

const REFUND_MODES = ["cash", "card", "upi", "netbanking", "cheque"];

function fmt(n: number) {
  return `₹${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function IpdRefundPanel({
  admission,
  onChange,
}: {
  admission: IpdAdmissionDetail;
  onChange?: () => void;
}) {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("cash");
  const [notes, setNotes] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    const n = Number(amount) || 0;
    if (n <= 0) return toast("Enter a positive refund amount", "error");
    setSaving(true);
    try {
      const createRes = await createIpdRefundVoucherAction(admission.id, {
        amount: n,
        mode,
        notes: notes.trim() || undefined,
        invoiceId: admission.finalInvoiceId || undefined,
      });
      if (!createRes.ok) throw new Error(createRes.error);
      if (!createRes.data) throw new Error("Failed to create refund voucher");

      const issueRes = await issueIpdRefundVoucherAction(createRes.data.id, {
        referenceNo: referenceNo.trim() || undefined,
      });
      if (!issueRes.ok) throw new Error(issueRes.error);

      toast("Refund issued", "success");
      setAmount("");
      setNotes("");
      setReferenceNo("");
      onChange?.();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to issue refund", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleIssue = async (id: string) => {
    const res = await issueIpdRefundVoucherAction(id);
    if (!res.ok) {
      toast(res.error, "error");
      return;
    }
    toast("Refund issued", "success");
    onChange?.();
  };

  const handleDirectDischarge = async () => {
    if (!window.confirm("Direct discharge will free the bed immediately. Continue?")) return;
    const res = await directDischargeIpdAdmissionAction(admission.id);
    if (!res.ok) {
      toast(res.error, "error");
      return;
    }
    toast("Patient directly discharged", "success");
    onChange?.();
  };

  const columns = [
    { key: "createdAt", label: "Date" },
    { key: "amount", label: "Amount", className: "text-right" },
    { key: "mode", label: "Mode" },
    { key: "status", label: "Status" },
    { key: "actions", label: "" },
  ];

  const rows = admission.refundVouchers.map((v) => ({
    createdAt: new Date(v.createdAt).toLocaleString(),
    amount: fmt(v.amount),
    mode: <span className="capitalize">{v.mode}</span>,
    status: <StatusBadge label={v.status} variant={v.status === "issued" ? "success" : v.status === "approved" ? "info" : v.status === "pending" ? "warning" : "danger"} />,
    actions: (
      <div className="flex items-center justify-end gap-2">
        {v.status !== "issued" && (
          <AttioButton variant="secondary" className="!h-6 !px-2 !text-[11px]" onClick={() => void handleIssue(v.id)}>
            <CheckCircle className="size-3" /> Issue
          </AttioButton>
        )}
      </div>
    ),
  }));

  return (
    <div className="space-y-4">
      <Panel title="Refund / direct discharge" action={
        <AttioButton variant="secondary" className="!h-7 !text-[11px]" onClick={() => void handleDirectDischarge()}>
          <Zap className="size-3" /> PT. Direct discharge
        </AttioButton>
      }>
        <div className="space-y-3">
          {admission.finalInvoiceId && (admission.refundAmount ?? 0) > 0 && (
            <div className="rounded-md bg-emerald-50 p-2 text-[12px] text-emerald-700">
              Final bill refund calculated: {fmt(admission.refundAmount ?? 0)}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-4">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount"
              className="h-8 rounded-md border px-2 text-[12px]"
            />
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="h-8 rounded-md border px-2 text-[12px] capitalize"
            >
              {REFUND_MODES.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes"
              className="h-8 rounded-md border px-2 text-[12px]"
            />
            <input
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
              placeholder="Ref no (for issue)"
              className="h-8 rounded-md border px-2 text-[12px]"
            />
          </div>
          <AttioButton onClick={() => void handleCreate()} disabled={saving}>
            <Plus className="size-3.5" />
            {saving ? "Issuing..." : "Issue refund"}
          </AttioButton>
        </div>
      </Panel>

      <Panel title="Refund vouchers">
        {admission.refundVouchers.length === 0 ? (
          <p className="text-[13px] text-[var(--attio-text-tertiary)]">No refund vouchers yet.</p>
        ) : (
          <DataTable columns={columns} rows={rows} />
        )}
      </Panel>
    </div>
  );
}
