"use client";

import {
  generateIpdFinalBillAction,
  generateIpdFinalBillPdfAction,
  previewIpdFinalBillAction,
  sendIpdFinalBillWhatsAppAction,
} from "@/app/actions/ipd-actions";
import { AttioButton, DataTable } from "@/components/frontdesk/ui";
import { useToast } from "@/components/ui/toast-provider";
import type { IpdAdmissionDetail } from "@/design-system/ipd-data";
import { Download, MessageCircle, Printer, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const PAYMENT_MODES = ["cash", "card", "upi", "netbanking", "cheque", "wallet", "other", "due", "pending", "advance"];
const PENDING_MODES = new Set(["due", "pending"]);

function fmt(n: number) {
  return `₹${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function IpdFinalBillModal({
  admission,
  onClose,
  onGenerated,
}: {
  admission: IpdAdmissionDetail;
  onClose: () => void;
  onGenerated: () => void;
}) {
  const { toast } = useToast();
  const [discount, setDiscount] = useState(0);
  const [preview, setPreview] = useState<{ subtotal: number; discount: number; taxAmount: number; total: number } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [splits, setSplits] = useState<{ mode: string; amount: string }[]>([]);
  const [splitsInitialized, setSplitsInitialized] = useState(false);
  const [generated, setGenerated] = useState<{ invoiceId: string; invoiceNumber: string } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [sending, setSending] = useState(false);

  const loadPreview = async () => {
    setLoadingPreview(true);
    const res = await previewIpdFinalBillAction(admission.id, discount);
    setLoadingPreview(false);
    if (!res.ok) {
      toast(res.error, "error");
      return;
    }
    if (!res.data) {
      toast("Failed to preview final bill", "error");
      return;
    }
    const data = res.data;
    setPreview(data);

    if (!splitsInitialized) {
      const wallet = admission.walletBalance ?? 0;
      const net = data.total;
      if (wallet > 0) {
        const advanceAmount = Math.min(wallet, net);
        const rest = Math.max(0, net - wallet);
        const base = [{ mode: "advance", amount: String(advanceAmount) }];
        if (rest > 0) base.push({ mode: "cash", amount: String(rest) });
        setSplits(base);
      } else {
        setSplits([{ mode: "cash", amount: String(net) }]);
      }
      setSplitsInitialized(true);
    }
  };

  useEffect(() => {
    void loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discount, admission.id]);

  const net = preview?.total ?? 0;
  const wallet = admission.walletBalance ?? 0;

  const { amountPaid, balanceDue, refundAmount, appliedCredit } = useMemo(() => {
    const parsed = splits.map((s) => ({ mode: s.mode, amount: Number(s.amount) || 0 }));
    const actual = parsed.filter((p) => !PENDING_MODES.has(p.mode));
    const advanceSplit = actual.find((p) => p.mode === "advance");
    const nonAdvance = actual.filter((p) => p.mode !== "advance").reduce((s, p) => s + p.amount, 0);
    const walletUsed = advanceSplit ? Math.min(advanceSplit.amount, wallet) : Math.min(wallet, Math.max(0, net - nonAdvance));
    const paid = nonAdvance + walletUsed;
    const balance = Math.max(0, net - paid);
    const refund = Math.max(0, wallet - walletUsed);
    return { amountPaid: paid, balanceDue: balance, refundAmount: refund, appliedCredit: walletUsed };
  }, [splits, net, wallet]);

  const applyAvailableCredit = () => {
    const creditToApply = Math.min(wallet, net);
    const remaining = Math.max(0, net - creditToApply);
    setSplits([
      { mode: "advance", amount: String(creditToApply) },
      ...(remaining > 0 ? [{ mode: "cash", amount: String(remaining) }] : []),
    ]);
  };

  const addSplit = () => setSplits((prev) => [...prev, { mode: "cash", amount: "" }]);
  const removeSplit = (i: number) => setSplits((prev) => prev.filter((_, idx) => idx !== i));
  const updateSplit = (i: number, patch: Partial<{ mode: string; amount: string }>) =>
    setSplits((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const handleGenerate = async () => {
    if (!preview) return;
    setSaving(true);
    try {
      const paymentSplits = splits
        .map((s) => ({ mode: s.mode, amount: Number(s.amount) || 0 }))
        .filter((s) => s.amount > 0);
      const res = await generateIpdFinalBillAction(admission.id, { discount, paymentSplits });
      if (!res.ok) throw new Error(res.error);
      const data = res.data;
      setGenerated({ invoiceId: data.invoiceId, invoiceNumber: data.invoiceNumber });
      toast(`Final bill ${data.invoiceNumber} generated. Refund ${fmt(data.refundAmount ?? 0)}`, "success");
      onGenerated();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to generate final bill", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async (invoiceId: string) => {
    setDownloading(true);
    try {
      const res = await generateIpdFinalBillPdfAction(invoiceId);
      if (!res.ok) throw new Error(res.error);
      const { dataUrl, invoiceNumber } = res.data;
      const anchor = document.createElement("a");
      anchor.href = dataUrl;
      anchor.download = `ipd-final-bill-${invoiceNumber}.pdf`;
      anchor.click();
      toast("PDF downloaded", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to download PDF", "error");
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = async (invoiceId: string) => {
    try {
      const res = await generateIpdFinalBillPdfAction(invoiceId);
      if (!res.ok) throw new Error(res.error);
      const { dataUrl, invoiceNumber } = res.data;
      const printWindow = window.open(dataUrl, "_blank");
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.document.title = `IPD Final Bill ${invoiceNumber}`;
          printWindow.print();
        };
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to open PDF for print", "error");
    }
  };

  const handleSendWhatsApp = async (invoiceId: string) => {
    setSending(true);
    try {
      const res = await sendIpdFinalBillWhatsAppAction(invoiceId, admission.phone ?? undefined);
      if (!res.ok) throw new Error(res.error);
      const { ok, detail } = res.data;
      toast(ok ? "WhatsApp sent" : `WhatsApp failed: ${detail ?? ""}`, ok ? "success" : "error");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to send WhatsApp", "error");
    } finally {
      setSending(false);
    }
  };

  const columns = [
    { key: "label", label: "Item" },
    { key: "quantity", label: "Qty", className: "text-right" },
    { key: "rate", label: "Rate", className: "text-right" },
    { key: "total", label: "Total", className: "text-right" },
  ];

  const rows = admission.cart.map((item) => ({
    label: item.label,
    quantity: item.quantity,
    rate: fmt(item.amount),
    total: fmt(item.amount * item.quantity),
  }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[var(--attio-border)] bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold">Generate final IPD bill</h3>
          <button onClick={onClose} className="text-[var(--attio-text-tertiary)] hover:text-[var(--attio-text)]">
            <X className="size-4" />
          </button>
        </div>

        {admission.cart.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-[var(--attio-text-tertiary)]">The service cart is empty.</p>
        ) : (
          <div className="space-y-4">
            <DataTable columns={columns} rows={rows} />

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-[11px] text-[var(--attio-text-tertiary)]">Discount amount</label>
                <input
                  type="number"
                  value={discount}
                  min={0}
                  onChange={(e) => setDiscount(Number(e.target.value))}
                  className="mt-1 h-8 w-full rounded-md border px-2 text-[12px]"
                />
              </div>
              <div className="rounded-md bg-[var(--attio-surface)] p-3 text-[12px]">
                <p className="text-[var(--attio-text-tertiary)]">Preview</p>
                <p>Subtotal: {fmt(preview?.subtotal ?? 0)}</p>
                <p>Tax: {fmt(preview?.taxAmount ?? 0)}</p>
                <p className="font-medium">Net: {fmt(net)}</p>
                <p>Wallet available: {fmt(wallet)}</p>
              </div>
            </div>

            {wallet > 0 && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-[12px]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-emerald-900">IPD advance available: {fmt(wallet)}</p>
                    <p className="mt-0.5 text-emerald-800">
                      {appliedCredit > 0
                        ? `${fmt(appliedCredit)} is deducted from this bill.`
                        : "Apply this credit to reduce the amount collected now."}
                    </p>
                  </div>
                  <AttioButton
                    variant={appliedCredit > 0 ? "secondary" : "primary"}
                    className="!h-8 !text-[11px]"
                    onClick={applyAvailableCredit}
                  >
                    {appliedCredit > 0 ? `Applied ${fmt(appliedCredit)}` : `Apply ${fmt(Math.min(wallet, net))}`}
                  </AttioButton>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[11px] text-[var(--attio-text-tertiary)]">Payment splits</label>
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
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <AttioButton variant="secondary" className="!h-7 !text-[11px]" onClick={addSplit}>
                Add payment mode
              </AttioButton>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-md border p-2">
                <p className="text-[10px] text-[var(--attio-text-tertiary)]">Amount paid</p>
                <p className="text-[13px] font-semibold tabular-nums">{fmt(amountPaid)}</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-[10px] text-[var(--attio-text-tertiary)]">Balance due</p>
                <p className="text-[13px] font-semibold tabular-nums">{fmt(balanceDue)}</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-[10px] text-[var(--attio-text-tertiary)]">Refund due</p>
                <p className="text-[13px] font-semibold tabular-nums text-emerald-600">{fmt(refundAmount)}</p>
              </div>
            </div>

            {generated ? (
              <div className="space-y-3 rounded-md border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-[12px] font-medium text-emerald-800">
                  Final bill {generated.invoiceNumber} generated.
                </p>
                <div className="flex flex-wrap gap-2">
                  <AttioButton
                    variant="secondary"
                    className="gap-1.5"
                    onClick={() => void handleDownload(generated.invoiceId)}
                    disabled={downloading}
                  >
                    <Download className="size-3.5" />
                    {downloading ? "Downloading..." : "Download PDF"}
                  </AttioButton>
                  <AttioButton
                    variant="secondary"
                    className="gap-1.5"
                    onClick={() => void handlePrint(generated.invoiceId)}
                  >
                    <Printer className="size-3.5" />
                    Print
                  </AttioButton>
                  <AttioButton
                    variant="primary"
                    className="gap-1.5"
                    onClick={() => void handleSendWhatsApp(generated.invoiceId)}
                    disabled={sending}
                  >
                    <MessageCircle className="size-3.5" />
                    {sending ? "Sending..." : "Send on WhatsApp"}
                  </AttioButton>
                  <AttioButton variant="secondary" onClick={onClose}>
                    Close
                  </AttioButton>
                </div>
              </div>
            ) : (
              <div className="flex justify-end gap-2 pt-2">
                <AttioButton variant="secondary" onClick={onClose}>
                  Cancel
                </AttioButton>
                <AttioButton onClick={() => void handleGenerate()} disabled={saving || loadingPreview}>
                  {saving ? "Generating..." : "Generate final bill"}
                </AttioButton>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
