"use client";

import { PatientSearchField } from "@/components/frontdesk/patient-search-field";
import { useFrontdeskStore } from "@/components/frontdesk/frontdesk-store";
import { usePharmacyStore } from "@/components/pharmacy/pharmacy-store";
import { DrugSearch, PharmacyInput } from "@/components/pharmacy/ui";
import { AttioButton, Panel } from "@/components/frontdesk/ui";
import { addIpdCartItemAction, getIpdAdmissionsByPatientAction } from "@/app/actions/ipd-actions";
import type { Patient } from "@/design-system/frontdesk-data";
import type { PaymentMode } from "@/design-system/pharmacy-data";
import { cn } from "@/lib/utils";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "credit_ipd", label: "Credit / IPD" },
];

type BillLine = { key: string; drugId: string; qty: string };

export function PharmacyBillingForm({ onSuccess }: { onSuccess?: (billId?: string) => void }) {
  const { drugs, createPharmacyBill, markBillPaid } = usePharmacyStore();
  const { patients } = useFrontdeskStore();

  const [patientType, setPatientType] = useState<"registered" | "walk_in">("registered");
  const [patient, setPatient] = useState<Patient | null>(null);
  const [walkInName, setWalkInName] = useState("");
  const [walkInPhone, setWalkInPhone] = useState("");
  const [ipdAdmissionId, setIpdAdmissionId] = useState<string | null>(null);
  const [lines, setLines] = useState<BillLine[]>([{ key: "0", drugId: "", qty: "1" }]);
  const [discountMode, setDiscountMode] = useState<"amount" | "percent">("amount");
  const [discount, setDiscount] = useState(0);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash");
  const [splitAmount, setSplitAmount] = useState(0);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setIpdAdmissionId(null);
    if (!patient) return;
    let cancelled = false;
    void getIpdAdmissionsByPatientAction(patient.id).then((res) => {
      if (cancelled || !res.ok || !res.data) return;
      const active = res.data.find((a: { status: string }) => a.status === "admitted");
      if (active) setIpdAdmissionId(active.id);
    });
    return () => {
      cancelled = true;
    };
  }, [patient?.id]);

  const enrichedLines = useMemo(() => {
    return lines.map((line) => {
      const drug = drugs.find((d) => d.id === line.drugId);
      const qty = Number(line.qty) || 0;
      const rate = drug?.defaultMrp ?? 0;
      const lineSubtotal = qty * rate;
      const gst = (lineSubtotal * (drug?.gstPercent ?? 0)) / 100;
      return { ...line, drug, qty, rate, lineSubtotal, gst };
    });
  }, [lines, drugs]);

  const subtotal = enrichedLines.reduce((s, l) => s + l.lineSubtotal, 0);
  const gstTotal = enrichedLines.reduce((s, l) => s + l.gst, 0);
  const discountAmount =
    discountMode === "percent"
      ? Math.min(subtotal + gstTotal, Math.round(((subtotal + gstTotal) * discountPercent) / 100))
      : Math.min(subtotal + gstTotal, discount);
  const total = Math.max(0, subtotal + gstTotal - discountAmount);

  useEffect(() => {
    setSplitAmount(total);
  }, [total]);

  const addLine = () => setLines((prev) => [...prev, { key: `${Date.now()}_${prev.length}`, drugId: "", qty: "1" }]);
  const updateLine = (key: string, patch: Partial<BillLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: string) => setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));

  const reset = () => {
    setPatientType("registered");
    setPatient(null);
    setWalkInName("");
    setWalkInPhone("");
    setIpdAdmissionId(null);
    setLines([{ key: "0", drugId: "", qty: "1" }]);
    setDiscount(0);
    setDiscountPercent(0);
    setPaymentMode("cash");
    setSplitAmount(0);
    setError("");
  };

  const patientName = patientType === "registered" ? patient?.name : walkInName.trim();
  const patientUhid = patientType === "registered" ? patient?.uhid : undefined;

  const validate = () => {
    if (!patientName) return patientType === "registered" ? "Select a patient." : "Enter patient name.";
    if (enrichedLines.some((l) => !l.drugId || l.qty <= 0)) return "Each line needs a medicine and a valid quantity.";
    if (discount < 0 || (discountMode === "percent" && discountPercent > 100)) return "Invalid discount.";
    return "";
  };

  const handleCollectPayment = async () => {
    const msg = validate();
    if (msg) {
      setError(msg);
      return;
    }
    setSubmitting(true);
    setError("");
    const res = await createPharmacyBill({
      patientName: patientName!,
      uhid: patientUhid,
      lines: enrichedLines.map((l) => ({ drugId: l.drugId, qty: l.qty })),
      discount: discountAmount,
      discountReason: "",
      paymentMode,
    });
    if (!res.ok || !res.billId) {
      setError(res.error ?? "Could not create bill.");
      setSubmitting(false);
      return;
    }
    if (splitAmount >= total) {
      await markBillPaid(res.billId, paymentMode);
    }
    onSuccess?.(res.billId);
    reset();
    setSubmitting(false);
  };

  const handlePostToIpdCart = async () => {
    const msg = validate();
    if (msg) {
      setError(msg);
      return;
    }
    if (!ipdAdmissionId) {
      setError("No active IPD admission found for this patient.");
      return;
    }
    setSubmitting(true);
    setError("");
    let cartOk = true;
    for (const l of enrichedLines) {
      const res = await addIpdCartItemAction(ipdAdmissionId, {
        type: "service",
        packageId: l.drugId,
        label: `${l.drug?.brandName ?? "Medicine"} ${l.drug?.strength ?? ""}`.trim(),
        amount: l.lineSubtotal + l.gst,
        quantity: l.qty,
      });
      if (!res.ok) cartOk = false;
    }
    const res = await createPharmacyBill({
      patientName: patientName!,
      uhid: patientUhid,
      lines: enrichedLines.map((l) => ({ drugId: l.drugId, qty: l.qty })),
      discount: discountAmount,
      discountReason: "IPD cart",
      paymentMode: "credit_ipd",
    });
    if (!cartOk || !res.ok) {
      setError(res.error ?? "Could not post all items to IPD cart.");
      setSubmitting(false);
      return;
    }
    onSuccess?.(res.billId);
    reset();
    setSubmitting(false);
  };

  return (
    <div className="space-y-4">
      <Panel title="Patient">
        <div className="space-y-3">
          <div className="flex gap-2">
            {[
              { id: "registered" as const, label: "Registered patient" },
              { id: "walk_in" as const, label: "Walk-in patient" },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPatientType(opt.id)}
                className={cn(
                  "h-8 rounded-md border px-3 text-[12px] font-medium",
                  patientType === opt.id
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-[var(--attio-border)] bg-white",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {patientType === "registered" ? (
            <>
              <PatientSearchField
                value={patient?.uhid ?? ""}
                patients={patients}
                placeholder="Search by UHID, name, or mobile…"
                onChange={(_, selected) => {
                  if (selected) setPatient(selected);
                }}
              />
              {patients.length === 0 && (
                <p className="flex items-center gap-2 text-[12px] text-[var(--attio-text-tertiary)]">
                  <Loader2 className="size-3.5 animate-spin" /> Loading patients…
                </p>
              )}
              {patient && (
                <div className="flex items-start justify-between gap-3 rounded-lg border border-[var(--attio-border-subtle)] bg-[var(--attio-surface)] p-3">
                  <div>
                    <p className="text-[14px] font-semibold">{patient.name}</p>
                    <p className="text-[12px] text-[var(--attio-text-tertiary)]">
                      {patient.uhid} · {patient.phone}
                      {ipdAdmissionId && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">IPD</span>}
                    </p>
                  </div>
                  <button type="button" onClick={() => setPatient(null)} className="rounded-md p-1 text-[var(--attio-text-tertiary)] hover:bg-white">
                    <X className="size-4" />
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-[var(--attio-text-secondary)]">Patient name</label>
                <PharmacyInput
                  value={walkInName}
                  onChange={(e) => setWalkInName(e.target.value)}
                  placeholder="Enter patient name"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-[var(--attio-text-secondary)]">Mobile</label>
                <PharmacyInput
                  value={walkInPhone}
                  onChange={(e) => setWalkInPhone(e.target.value)}
                  placeholder="Mobile number"
                />
              </div>
            </div>
          )}
        </div>
      </Panel>

      {(patientType === "registered" && !patient) ? null : patientName ? (
        <>
          <Panel title="Bill items">
            <div className="space-y-3">
              {enrichedLines.map((line) => (
                <div key={line.key} className="grid grid-cols-1 items-end gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_80px_110px_40px]">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-[var(--attio-text-secondary)]">Medicine</label>
                    <DrugSearch drugs={drugs} value={line.drugId} placeholder="Search medicine…" onChange={(id) => updateLine(line.key, { drugId: id })} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-[var(--attio-text-secondary)]">Qty</label>
                    <PharmacyInput type="number" min={1} value={line.qty} onChange={(e) => updateLine(line.key, { qty: e.target.value })} />
                  </div>
                  <div className="flex h-9 items-center text-[13px] font-medium text-[var(--attio-text-secondary)]">
                    ₹{(line.lineSubtotal + line.gst).toFixed(2)}
                  </div>
                  <button type="button" className="flex h-9 items-center justify-center text-red-600 hover:text-red-700" onClick={() => removeLine(line.key)}>
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
              <AttioButton variant="secondary" onClick={addLine}>
                <Plus className="mr-1 size-3.5" />
                Add medicine
              </AttioButton>
            </div>
          </Panel>

          <div className="grid gap-4 sm:grid-cols-2">
            <Panel title="Discount">
              <div className="mb-2 flex flex-wrap gap-2">
                {[
                  { id: "amount" as const, label: "₹ Amount" },
                  { id: "percent" as const, label: "% Percent" },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setDiscountMode(opt.id)}
                    className={`h-8 rounded-md border px-3 text-[12px] font-medium ${
                      discountMode === opt.id ? "border-zinc-900 bg-zinc-900 text-white" : "border-[var(--attio-border)] bg-white"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {discountMode === "percent" ? (
                <PharmacyInput type="number" min={0} max={100} value={discountPercent} onChange={(e) => setDiscountPercent(Math.max(0, Number(e.target.value) || 0))} />
              ) : (
                <PharmacyInput type="number" min={0} value={discount} onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))} />
              )}
            </Panel>

            <Panel title="Totals">
              <div className="space-y-1 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-[var(--attio-text-secondary)]">Subtotal</span>
                  <span>₹{subtotal.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--attio-text-secondary)]">GST</span>
                  <span>₹{gstTotal.toLocaleString("en-IN")}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-[var(--attio-text-secondary)]">Discount</span>
                    <span>−₹{discountAmount.toLocaleString("en-IN")}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-2 text-[15px] font-semibold">
                  <span>Total</span>
                  <span>₹{total.toLocaleString("en-IN")}</span>
                </div>
              </div>
            </Panel>
          </div>

          <Panel title="Payment">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[12px] font-medium text-[var(--attio-text-secondary)]">Payment mode</label>
                <select
                  className="h-9 w-full rounded-md border border-[var(--attio-border)] bg-white px-2 text-[13px] outline-none focus:border-[var(--attio-text)]"
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                >
                  {PAYMENT_MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[12px] font-medium text-[var(--attio-text-secondary)]">Amount collected</label>
                <PharmacyInput type="number" min={0} value={splitAmount} onChange={(e) => setSplitAmount(Math.max(0, Number(e.target.value) || 0))} />
              </div>
            </div>
            <p className="mt-2 text-[12px] text-[var(--attio-text-tertiary)]">
              Collecting ₹{splitAmount.toLocaleString("en-IN")} of ₹{total.toLocaleString("en-IN")}
              {splitAmount < total && splitAmount > 0 && " · bill will remain partially unpaid"}
            </p>
          </Panel>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</p>}

          <div className="flex flex-wrap gap-2">
            <AttioButton variant="primary" disabled={submitting} onClick={handleCollectPayment}>
              {submitting ? "Saving…" : splitAmount >= total ? "Collect payment & create bill" : "Create bill (payment logged later)"}
            </AttioButton>
            {ipdAdmissionId && (
              <AttioButton variant="secondary" disabled={submitting} onClick={handlePostToIpdCart}>
                Post to IPD running bill
              </AttioButton>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
