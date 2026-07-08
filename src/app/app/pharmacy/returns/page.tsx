"use client";

import { usePharmacyStore } from "@/components/pharmacy/pharmacy-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, DataTable, StatusBadge, Panel } from "@/components/frontdesk/ui";
import { PharmacyDialog, PharmacyInput, PharmacySelect, FormRow } from "@/components/pharmacy/ui";
import type { PharmacyBill } from "@/design-system/pharmacy-data";
import { useState } from "react";

export default function PharmacyReturnsPage() {
  const { returns, bills, getDrug, approveReturn, restockReturn } = usePharmacyStore();
  const [open, setOpen] = useState(false);
  const [selectedBill, setSelectedBill] = useState<PharmacyBill | null>(null);
  const [selectedLineIndex, setSelectedLineIndex] = useState<number | null>(null);
  const [returnQty, setReturnQty] = useState("");
  const [returnReason, setReturnReason] = useState("");

  const handleCreateReturn = async () => {
    if (!selectedBill || selectedLineIndex === null || !returnQty || !returnReason) return;
    const qty = Number(returnQty);
    const line = selectedBill.lines[selectedLineIndex];
    if (qty > line.qty) {
      alert("Return quantity cannot exceed dispensed quantity");
      return;
    }
    // Create return record - this would need a server mutation
    // For now, just close the dialog
    setOpen(false);
    setSelectedBill(null);
    setSelectedLineIndex(null);
    setReturnQty("");
    setReturnReason("");
  };

  return (
    <PageChrome 
      breadcrumbs={[{ label: "Pharmacy", href: "/app/pharmacy" }, { label: "Returns" }]} 
      title="Medicine Returns" 
      meta="Select bill · select medicines · enter quantity · return stock · adjust bill · refresh inventory"
      actions={
        <AttioButton variant="primary" onClick={() => setOpen(true)}>
          New Return
        </AttioButton>
      }
    >
      <DataTable
        columns={[
          { key: "bill", label: "Bill #" },
          { key: "patient", label: "Patient" },
          { key: "drug", label: "Medicine" },
          { key: "qty", label: "Qty Returned" },
          { key: "reason", label: "Reason" },
          { key: "status", label: "Status" },
          { key: "actions", label: "" },
        ]}
        rows={returns.map((r) => ({
          bill: r.billId,
          patient: r.patientName,
          drug: getDrug(r.drugId)?.brandName ?? r.drugId,
          qty: r.qty,
          reason: r.reason,
          status: <StatusBadge label={r.status} variant="info" />,
          actions: (
            <div className="flex gap-1">
              {r.status === "pending" && (
                <AttioButton variant="ghost" className="!h-7 !text-[11px]" onClick={() => void approveReturn(r.id)}>
                  Approve
                </AttioButton>
              )}
              {r.status === "approved" && (
                <AttioButton variant="primary" className="!h-7 !text-[11px]" onClick={() => void restockReturn(r.id)}>
                  Restock
                </AttioButton>
              )}
            </div>
          ),
        }))}
      />
      {returns.length === 0 && (
        <p className="mt-4 text-[13px] text-[var(--attio-text-tertiary)]">No return records. Click "New Return" to process a medicine return.</p>
      )}

      {open && (
        <PharmacyDialog 
          open={open} 
          title="New Medicine Return" 
          onClose={() => { 
            setOpen(false); 
            setSelectedBill(null); 
            setSelectedLineIndex(null); 
            setReturnQty(""); 
            setReturnReason(""); 
          }}
          width="max-w-xl"
        >
          <div className="space-y-4 text-[13px]">
            <Panel title="Select Bill">
              <div className="space-y-2">
                {bills.filter(b => b.paid).map((bill) => (
                  <button
                    key={bill.id}
                    type="button"
                    onClick={() => setSelectedBill(bill)}
                    className={`w-full rounded border p-3 text-left ${selectedBill?.id === bill.id ? "border-[var(--attio-accent)] bg-[var(--attio-hover)]" : ""}`}
                  >
                    <p className="font-medium">{bill.id}</p>
                    <p className="text-[11px] text-[var(--attio-text-tertiary)]">{bill.patientName} · ₹{bill.total.toLocaleString("en-IN")}</p>
                  </button>
                ))}
                {bills.filter(b => b.paid).length === 0 && (
                  <p className="text-[var(--attio-text-tertiary)]">No paid bills available for return.</p>
                )}
              </div>
            </Panel>

            {selectedBill && (
              <Panel title="Select Medicine">
                <div className="space-y-2">
                  {selectedBill.lines.map((line, idx) => {
                    const drug = getDrug(line.drugId);
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedLineIndex(idx)}
                        className={`w-full rounded border p-3 text-left ${selectedLineIndex === idx ? "border-[var(--attio-accent)] bg-[var(--attio-hover)]" : ""}`}
                      >
                        <p className="font-medium">{drug?.brandName ?? line.drugId}</p>
                        <p className="text-[11px] text-[var(--attio-text-tertiary)]">Dispensed: {line.qty} units</p>
                      </button>
                    );
                  })}
                </div>
              </Panel>
            )}

            {selectedBill && selectedLineIndex !== null && (
              <>
                <Panel title="Return Details">
                  <div className="space-y-3">
                    <FormRow label="Return Quantity *" required>
                      <PharmacyInput 
                        type="number" 
                        max={selectedBill.lines[selectedLineIndex].qty}
                        value={returnQty} 
                        onChange={(e) => setReturnQty(e.target.value)} 
                        placeholder={`Max ${selectedBill.lines[selectedLineIndex].qty}`} 
                      />
                    </FormRow>
                    <FormRow label="Return Reason *" required>
                      <PharmacySelect value={returnReason} onChange={(e) => setReturnReason(e.target.value)}>
                        <option value="">Select reason</option>
                        <option value="wrong_medicine">Wrong medicine dispensed</option>
                        <option value="expiry">Near expiry / expired</option>
                        <option value="damage">Damaged packaging</option>
                        <option value="patient_refusal">Patient refused</option>
                        <option value="other">Other</option>
                      </PharmacySelect>
                    </FormRow>
                  </div>
                </Panel>

                <div className="flex justify-end gap-2">
                  <AttioButton variant="secondary" onClick={() => { 
                    setOpen(false); 
                    setSelectedBill(null); 
                    setSelectedLineIndex(null); 
                    setReturnQty(""); 
                    setReturnReason(""); 
                  }}>
                    Cancel
                  </AttioButton>
                  <AttioButton variant="primary" onClick={handleCreateReturn}>
                    Process Return
                  </AttioButton>
                </div>
              </>
            )}
          </div>
        </PharmacyDialog>
      )}
    </PageChrome>
  );
}
