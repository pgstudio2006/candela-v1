"use client";

import { usePharmacyStore } from "@/components/pharmacy/pharmacy-store";
import { useFrontdeskPoll } from "@/hooks/use-frontdesk-poll";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, DataTable, StatusBadge, Panel } from "@/components/frontdesk/ui";
import { PharmacyDialog, PharmacyInput, PharmacySelect, FormRow } from "@/components/pharmacy/ui";
import { PharmacyBillingForm } from "@/components/pharmacy/pharmacy-billing-form";
import { PharmacyInvoiceModal } from "@/components/pharmacy/pharmacy-invoice-modal";
import type { PharmacyBill } from "@/design-system/pharmacy-data";
import type { PaymentMode } from "@/design-system/pharmacy-data";
import { Loader2, Plus, Printer } from "lucide-react";
import { useMemo, useState } from "react";

export default function PharmacyBillingPage() {
  useFrontdeskPoll();
  const { bills, getDrug, markBillPaid, applyBillDiscount } = usePharmacyStore();
  const [selected, setSelected] = useState<PharmacyBill | null>(null);
  const [payMode, setPayMode] = useState<PaymentMode>("cash");
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountReason, setDiscountReason] = useState("");
  const [applyingDiscount, setApplyingDiscount] = useState(false);
  const [whatsappSending, setWhatsappSending] = useState(false);
  const [cartUhid, setCartUhid] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [invoiceBill, setInvoiceBill] = useState<PharmacyBill | null>(null);

  const cartBills = useMemo(() => {
    if (!cartUhid) return [];
    return bills.filter((b) => b.uhid === cartUhid);
  }, [bills, cartUhid]);

  const handleWhatsAppBill = async (bill: PharmacyBill) => {
    if (!bill.uhid) return;
    setWhatsappSending(true);
    try {
      const res = await fetch("/api/pharmacy/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type: "bill",
          billId: bill.id,
          uhid: bill.uhid,
          patientName: bill.patientName,
          total: bill.total,
          paymentStatus: bill.paid ? `Paid (${bill.paymentMode})` : "Pending",
        }),
      });
      const json = await res.json();
      if (json.ok) {
        alert("Bill sent on WhatsApp.");
      } else {
        alert(json.error ?? "Failed to send WhatsApp.");
      }
    } catch {
      alert("Network error.");
    } finally {
      setWhatsappSending(false);
    }
  };

  const handleApplyDiscount = async () => {
    if (!selected || discountPercent <= 0 || !discountReason.trim()) return;
    setApplyingDiscount(true);
    const discountAmount = (selected.subtotal * discountPercent) / 100;
    await applyBillDiscount(selected.id, discountAmount, discountReason.trim());
    setApplyingDiscount(false);
  };

  const calculatedDiscount = selected ? (selected.subtotal * discountPercent) / 100 : 0;
  const discountedTotal = selected ? selected.subtotal + selected.gstTotal - calculatedDiscount : 0;

  return (
    <PageChrome
      breadcrumbs={[{ label: "Pharmacy", href: "/app/pharmacy" }, { label: "Billing" }]}
      title="Counter billing"
      meta="Rx-linked bills · GST · discount · payment collection · print · WhatsApp"
      actions={
        <AttioButton variant="primary" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 size-4" />
          New counter bill
        </AttioButton>
      }
    >
      <DataTable
        columns={[
          { key: "id", label: "Bill #" },
          { key: "patient", label: "Patient" },
          { key: "lines", label: "Items" },
          { key: "total", label: "Total" },
          { key: "gst", label: "GST" },
          { key: "status", label: "Payment" },
          { key: "actions", label: "" },
        ]}
        rows={bills.map((b) => ({
          id: b.id,
          patient: (
            <button type="button" className="text-left hover:underline" onClick={() => setSelected(b)}>
              {b.patientName}
            </button>
          ),
          lines: b.lines.map((l) => getDrug(l.drugId)?.brandName ?? l.drugId).join(", "),
          total: `₹${b.total.toLocaleString("en-IN")}`,
          gst: `₹${b.gstTotal.toFixed(0)}`,
          status: <StatusBadge label={b.paid ? "Paid" : "Pending"} variant={b.paid ? "success" : "danger"} />,
          actions: (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              {!b.paid ? (
                <>
                  <select
                    value={payMode}
                    onChange={(e) => setPayMode(e.target.value as PaymentMode)}
                    className="h-7 rounded border px-1 text-[11px]"
                  >
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="card">Card</option>
                    <option value="credit_ipd">Credit IPD</option>
                  </select>
                  <AttioButton variant="primary" className="!h-7 !text-[11px]" onClick={() => void markBillPaid(b.id, payMode)}>
                    Mark paid
                  </AttioButton>
                </>
              ) : (
                <span className="text-[12px] capitalize text-[var(--attio-text-secondary)]">{b.paymentMode}</span>
              )}
              <button
                type="button"
                onClick={() => setInvoiceBill(b)}
                className="rounded p-1.5 text-[var(--attio-text-tertiary)] hover:bg-[var(--attio-hover)]"
                title="Print invoice"
              >
                <Printer className="size-3.5" />
              </button>
            </div>
          ),
        }))}
      />
      {bills.length === 0 && (
        <p className="mt-4 text-[13px] text-[var(--attio-text-tertiary)]">Bills appear after dispense from Prescriptions queue.</p>
      )}

      {bills.length > 0 && (
        <Panel title="Finance analysis" className="mt-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-[var(--attio-border-subtle)] p-3">
              <p className="text-[11px] text-[var(--attio-text-tertiary)]">Total revenue</p>
              <p className="text-[16px] font-semibold tabular-nums">₹{bills.reduce((s, b) => s + b.total, 0).toLocaleString("en-IN")}</p>
            </div>
            <div className="rounded-lg border border-[var(--attio-border-subtle)] p-3">
              <p className="text-[11px] text-[var(--attio-text-tertiary)]">Total GST</p>
              <p className="text-[16px] font-semibold tabular-nums">₹{bills.reduce((s, b) => s + b.gstTotal, 0).toLocaleString("en-IN")}</p>
            </div>
            <div className="rounded-lg border border-[var(--attio-border-subtle)] p-3">
              <p className="text-[11px] text-[var(--attio-text-tertiary)]">Total discount</p>
              <p className="text-[16px] font-semibold tabular-nums">₹{bills.reduce((s, b) => s + b.discount, 0).toLocaleString("en-IN")}</p>
            </div>
            <div className="rounded-lg border border-[var(--attio-border-subtle)] p-3">
              <p className="text-[11px] text-[var(--attio-text-tertiary)]">Paid / Pending</p>
              <p className="text-[16px] font-semibold tabular-nums">
                ₹{bills.filter((b) => b.paid).reduce((s, b) => s + b.total, 0).toLocaleString("en-IN")}
                {" / "}
                ₹{bills.filter((b) => !b.paid).reduce((s, b) => s + b.total, 0).toLocaleString("en-IN")}
              </p>
            </div>
          </div>
          <div className="mt-4">
            <p className="mb-2 text-[12px] font-medium">Payment mode breakdown</p>
            <div className="space-y-2">
              {Array.from(
                bills
                  .filter((b) => b.paid)
                  .reduce((map, b) => map.set(b.paymentMode, (map.get(b.paymentMode) ?? 0) + b.total), new Map<PaymentMode, number>()),
              ).map(([mode, amount]) => (
                <div key={mode} className="flex items-center justify-between text-[13px]">
                  <span className="capitalize">{mode.replace("_", " ")}</span>
                  <span className="tabular-nums font-medium">₹{amount.toLocaleString("en-IN")}</span>
                </div>
              ))}
              {bills.filter((b) => b.paid).length === 0 && (
                <p className="text-[13px] text-[var(--attio-text-tertiary)]">No paid bills yet.</p>
              )}
            </div>
          </div>
        </Panel>
      )}

      {selected && (
        <PharmacyDialog
          open={!!selected}
          title={`Bill ${selected.id}`}
          subtitle={`${selected.patientName} · ${selected.uhid ?? "No UHID"}`}
          onClose={() => {
            setSelected(null);
            setDiscountPercent(0);
            setDiscountReason("");
          }}
          width="max-w-xl"
        >
          <div className="space-y-4 text-[13px]">
            <Panel title="Bill Summary">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] text-[var(--attio-text-tertiary)]">Subtotal</p>
                  <p>₹{selected.subtotal.toLocaleString("en-IN")}</p>
                </div>
                <div>
                  <p className="text-[11px] text-[var(--attio-text-tertiary)]">GST</p>
                  <p>₹{selected.gstTotal.toLocaleString("en-IN")}</p>
                </div>
                {!selected.paid && (
                  <>
                    <div>
                      <p className="text-[11px] text-[var(--attio-text-tertiary)]">Discount %</p>
                      <PharmacyInput
                        type="number"
                        min={0}
                        max={100}
                        value={discountPercent}
                        onChange={(e) => setDiscountPercent(Number(e.target.value))}
                        className="w-20"
                      />
                    </div>
                    <div>
                      <p className="text-[11px] text-[var(--attio-text-tertiary)]">Discount Amount</p>
                      <p className="text-red-600">-₹{calculatedDiscount.toFixed(0)}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-[11px] text-[var(--attio-text-tertiary)]">Discount Reason</p>
                      <PharmacyInput
                        placeholder="Reason for discount"
                        value={discountReason}
                        onChange={(e) => setDiscountReason(e.target.value)}
                      />
                    </div>
                  </>
                )}
                <div>
                  <p className="text-[11px] text-[var(--attio-text-tertiary)]">Total</p>
                  <p className="font-semibold text-[16px]">
                    ₹{(!selected.paid ? discountedTotal : selected.total).toLocaleString("en-IN")}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-[var(--attio-text-tertiary)]">Payment Mode</p>
                  <p>{selected.paid ? selected.paymentMode : "Pending"}</p>
                </div>
              </div>
            </Panel>

            <Panel title="Bill Items">
              <ul className="divide-y">
                {selected.lines.map((l, i) => {
                  const drug = getDrug(l.drugId);
                  return (
                    <li key={i} className="flex justify-between py-2">
                      <div>
                        <p className="font-medium">{drug?.brandName ?? l.drugId}</p>
                        <p className="text-[11px] text-[var(--attio-text-tertiary)]">
                          Qty: {l.qty} × ₹{l.rate} · GST {l.gstPercent}%
                        </p>
                      </div>
                      <span>₹{(l.qty * l.rate).toLocaleString("en-IN")}</span>
                    </li>
                  );
                })}
              </ul>
            </Panel>

            <p className="text-[11px] text-[var(--attio-text-tertiary)]">
              Created by {selected.createdBy} · {new Date(selected.createdAt).toLocaleString("en-IN")}
            </p>

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              {selected.uhid && (
                <AttioButton variant="secondary" onClick={() => setCartUhid(selected.uhid!)}>
                  View patient cart
                </AttioButton>
              )}
              <AttioButton variant="secondary" onClick={() => setInvoiceBill(selected)}>
                <Printer className="mr-1 size-4" />
                Print Bill
              </AttioButton>
              <AttioButton
                variant="secondary"
                disabled={whatsappSending || !selected.uhid}
                onClick={() => selected && void handleWhatsAppBill(selected)}
              >
                {whatsappSending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                WhatsApp Bill
              </AttioButton>
              {!selected.paid && (
                <AttioButton
                  variant="primary"
                  disabled={applyingDiscount}
                  onClick={handleApplyDiscount}
                >
                  {applyingDiscount ? "Applying..." : "Apply Discount"}
                </AttioButton>
              )}
            </div>
          </div>
        </PharmacyDialog>
      )}

      {cartUhid && (
        <PharmacyDialog
          open={!!cartUhid}
          title="Patient medicine cart"
          subtitle={`UHID: ${cartUhid}`}
          onClose={() => setCartUhid(null)}
          width="max-w-xl"
        >
          <div className="space-y-4 text-[13px]">
            {cartBills.length === 0 ? (
              <p className="text-[var(--attio-text-tertiary)]">No bills found for this patient.</p>
            ) : (
              <>
                <Panel title="Dispensed medicines">
                  <ul className="divide-y">
                    {cartBills.flatMap((b) => b.lines).map((line, idx) => {
                      const drug = getDrug(line.drugId);
                      return (
                        <li key={idx} className="flex justify-between py-2">
                          <div>
                            <p className="font-medium">{drug?.brandName ?? line.drugId}</p>
                            <p className="text-[11px] text-[var(--attio-text-tertiary)]">Qty: {line.qty}</p>
                          </div>
                          <span>₹{(line.qty * line.rate).toLocaleString("en-IN")}</span>
                        </li>
                      );
                    })}
                  </ul>
                </Panel>
                <Panel title="Bill history">
                  <ul className="divide-y">
                    {cartBills.map((b) => (
                      <li key={b.id} className="flex justify-between py-2">
                        <span>{b.id} · {new Date(b.createdAt).toLocaleDateString("en-IN")}</span>
                        <span className="tabular-nums">₹{b.total.toLocaleString("en-IN")}</span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              </>
            )}
            <div className="flex justify-end">
              <AttioButton variant="secondary" onClick={() => setCartUhid(null)}>
                Close
              </AttioButton>
            </div>
          </div>
        </PharmacyDialog>
      )}

      {createOpen && (
        <PharmacyDialog
          open={createOpen}
          title="New counter bill"
          subtitle="Search patient, add medicines, apply discount and collect payment"
          onClose={() => setCreateOpen(false)}
          width="max-w-2xl"
        >
          <PharmacyBillingForm onSuccess={(billId) => { setCreateOpen(false); const created = bills.find((b) => b.id === billId); if (created) setInvoiceBill(created); }} />
        </PharmacyDialog>
      )}

      <PharmacyInvoiceModal
        open={!!invoiceBill}
        bill={invoiceBill}
        onClose={() => setInvoiceBill(null)}
      />
    </PageChrome>
  );
}
