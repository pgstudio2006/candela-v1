"use client";

import { usePharmacyStore } from "@/components/pharmacy/pharmacy-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, DataTable, StatusBadge, Panel } from "@/components/frontdesk/ui";
import { PharmacyDialog, PharmacyInput, PharmacySelect, FormRow } from "@/components/pharmacy/ui";
import type { PharmacyBill } from "@/design-system/pharmacy-data";
import type { PaymentMode } from "@/design-system/pharmacy-data";
import { useState } from "react";

export default function PharmacyBillingPage() {
  const { bills, getDrug, markBillPaid, adjustStock } = usePharmacyStore();
  const [selected, setSelected] = useState<PharmacyBill | null>(null);
  const [payMode, setPayMode] = useState<PaymentMode>("cash");
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountReason, setDiscountReason] = useState("");
  const [applyingDiscount, setApplyingDiscount] = useState(false);

  const handleApplyDiscount = async () => {
    if (!selected || discountPercent <= 0) return;
    setApplyingDiscount(true);
    // Calculate discount amount
    const discountAmount = (selected.subtotal * discountPercent) / 100;
    // Note: This would need a server mutation to update the bill
    // For now, just show the calculation
    setApplyingDiscount(false);
  };

  const calculatedDiscount = selected ? (selected.subtotal * discountPercent) / 100 : 0;
  const discountedTotal = selected ? selected.total - calculatedDiscount : 0;

  return (
    <PageChrome
      breadcrumbs={[{ label: "Pharmacy", href: "/app/pharmacy" }, { label: "Billing" }]}
      title="Counter billing"
      meta="Rx-linked bills · GST · discount · payment collection · print · WhatsApp"
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
          actions: !b.paid ? (
            <div className="flex items-center gap-1">
              <select
                value={payMode}
                onChange={(e) => setPayMode(e.target.value as PaymentMode)}
                className="h-7 rounded border px-1 text-[11px]"
                onClick={(e) => e.stopPropagation()}
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
                <option value="credit_ipd">Credit IPD</option>
              </select>
              <AttioButton variant="primary" className="!h-7 !text-[11px]" onClick={() => void markBillPaid(b.id, payMode)}>
                Mark paid
              </AttioButton>
            </div>
          ) : (
            b.paymentMode
          ),
        }))}
      />
      {bills.length === 0 && (
        <p className="mt-4 text-[13px] text-[var(--attio-text-tertiary)]">Bills appear after dispense from Prescriptions queue.</p>
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
              <AttioButton variant="secondary" onClick={() => window.print()}>
                Print Bill
              </AttioButton>
              <AttioButton variant="secondary">
                WhatsApp PDF
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
    </PageChrome>
  );
}
