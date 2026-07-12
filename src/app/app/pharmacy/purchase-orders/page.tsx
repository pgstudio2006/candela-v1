"use client";

import { usePharmacyStore } from "@/components/pharmacy/pharmacy-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, DataTable, StatusBadge, Panel } from "@/components/frontdesk/ui";
import { PharmacyDialog, PharmacyInput, PharmacySelect, PharmacyTextarea, FormRow, DrugSearch } from "@/components/pharmacy/ui";
import { PO_STATUS_LABELS } from "@/design-system/pharmacy-data";
import type { PoLine } from "@/design-system/pharmacy-data";
import { Plus, Trash2, Download, MessageSquare, Loader2 } from "lucide-react";
import { useState } from "react";

export default function PharmacyPurchaseOrdersPage() {
  const { purchaseOrders, suppliers, drugs, createPO, updatePOStatus, deletePurchaseOrder, receivePO, payPOBill, isManager, isPurchase } = usePharmacyStore();
  const [receiveId, setReceiveId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [poLines, setPoLines] = useState<Array<{ drugId: string; qty: string; rate: string; gst: string }>>([{ drugId: "", qty: "", rate: "", gst: "12" }]);
  const [grn, setGrn] = useState<Record<string, { batchNo: string; expiry: string; qty: string; shelf: string; box: string }>>({});
  const [supplierBillFile, setSupplierBillFile] = useState<File | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState<"cash" | "upi" | "transfer" | "credit">("credit");
  const [whatsappSending, setWhatsappSending] = useState<string | null>(null);

  const handleWhatsAppPO = async (poId: string) => {
    setWhatsappSending(poId);
    try {
      const res = await fetch("/api/pharmacy/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type: "po", poId }),
      });
      const json = await res.json();
      alert(json.ok ? "PO sent on WhatsApp." : (json.error ?? "Failed to send WhatsApp."));
    } catch {
      alert("Network error.");
    } finally {
      setWhatsappSending(null);
    }
  };

  const canDelete = isManager();

  if (!isManager() && !isPurchase()) {
    return (
      <PageChrome breadcrumbs={[{ label: "Pharmacy", href: "/app/pharmacy" }, { label: "PO" }]} title="Purchase orders" meta="Purchase team only">
        <p className="text-[13px]">Purchase order access requires purchase or manager role.</p>
      </PageChrome>
    );
  }

  const resetCreate = () => {
    setSupplierId("");
    setNotes("");
    setPoLines([{ drugId: "", qty: "", rate: "", gst: "12" }]);
  };

  const submitCreate = () => {
    if (!supplierId || poLines.length === 0 || poLines.some((l) => !l.drugId || !l.qty || !l.rate)) return;
    const lines: PoLine[] = poLines.map((l) => ({
      drugId: l.drugId,
      qtyOrdered: Number(l.qty),
      qtyReceived: 0,
      rate: Number(l.rate),
      gstPercent: Number(l.gst) || 12,
    }));
    void createPO(supplierId, lines, notes).then(() => {
      setCreateOpen(false);
      resetCreate();
    });
  };

  const openReceive = (poId: string) => {
    const po = purchaseOrders.find((p) => p.id === poId);
    if (!po) return;
    const initial: Record<string, { batchNo: string; expiry: string; qty: string; shelf: string; box: string }> = {};
    po.lines.forEach((l) => {
      initial[l.drugId] = { batchNo: "", expiry: "", qty: String(l.qtyOrdered - l.qtyReceived), shelf: "", box: "" };
    });
    setGrn(initial);
    setSupplierBillFile(null);
    setPaymentAmount("");
    setPaymentMode("credit");
    setReceiveId(poId);
  };

  const submitReceive = async () => {
    if (!receiveId) return;
    const received: Record<string, { batchNo: string; expiry: string; qty: number; shelf?: string; box?: string }> = {};
    Object.entries(grn).forEach(([drugId, v]) => {
      if (v.batchNo && v.expiry && Number(v.qty) > 0) {
        received[drugId] = { batchNo: v.batchNo, expiry: v.expiry, qty: Number(v.qty), shelf: v.shelf, box: v.box };
      }
    });
    if (Object.keys(received).length === 0) return;
    await receivePO(receiveId, received);
    if (paymentMode !== "credit" || Number(paymentAmount) > 0) {
      const amount = paymentMode === "credit" ? 0 : Number(paymentAmount);
      await payPOBill(receiveId, amount, paymentMode, supplierBillFile ? supplierBillFile.name : undefined);
    }
    setReceiveId(null);
    setGrn({});
    setSupplierBillFile(null);
    setPaymentAmount("");
    setPaymentMode("credit");
  };

  const calculateTotal = () => {
    return poLines.reduce((acc, line) => {
      const qty = Number(line.qty) || 0;
      const rate = Number(line.rate) || 0;
      const gst = Number(line.gst) || 0;
      const lineTotal = qty * rate * (1 + gst / 100);
      return acc + lineTotal;
    }, 0);
  };

  return (
    <PageChrome
      breadcrumbs={[{ label: "Pharmacy", href: "/app/pharmacy" }, { label: "Purchase orders" }]}
      title="Purchase orders"
      meta="Select supplier · select medicines · enter quantity · generate PO · WhatsApp PDF"
      actions={
        <AttioButton variant="primary" onClick={() => { resetCreate(); setCreateOpen(true); }}>
          <Plus className="size-3.5" />
          Create PO
        </AttioButton>
      }
    >
      <DataTable
        columns={[
          { key: "id", label: "PO #" },
          { key: "supplier", label: "Supplier" },
          { key: "lines", label: "Lines" },
          { key: "total", label: "Total" },
          { key: "status", label: "Status" },
          { key: "date", label: "Created" },
          { key: "actions", label: "" },
        ]}
        rows={purchaseOrders.map((p) => {
          const total = p.lines.reduce((acc, l) => acc + (l.qtyOrdered * l.rate * (1 + l.gstPercent / 100)), 0);
          return {
            id: p.id,
            supplier: suppliers.find((s) => s.id === p.supplierId)?.name ?? p.supplierId,
            lines: p.lines.map((l) => `${drugs.find((d) => d.id === l.drugId)?.brandName} ×${l.qtyOrdered}`).join("; "),
            total: `₹${total.toLocaleString("en-IN")}`,
            status: <StatusBadge label={PO_STATUS_LABELS[p.status]} variant="info" />,
            date: new Date(p.createdAt).toLocaleDateString("en-IN"),
            actions: (
              <div className="flex flex-wrap gap-1">
                {p.status === "draft" && (
                  <AttioButton variant="ghost" className="!h-7 !text-[11px]" onClick={() => void updatePOStatus(p.id, "approved")}>
                    Approve
                  </AttioButton>
                )}
                {p.status === "draft" && canDelete && (
                  <AttioButton
                    variant="ghost"
                    className="!h-7 !text-[11px] text-red-600 hover:text-red-700"
                    title="Delete PO"
                    onClick={() => {
                      if (window.confirm(`Delete ${p.id}? This cannot be undone.`)) {
                        void deletePurchaseOrder(p.id).catch((err: Error) => alert(err.message));
                      }
                    }}
                  >
                    <Trash2 className="size-3" />
                  </AttioButton>
                )}
                {["approved", "partial"].includes(p.status) && (
                  <AttioButton variant="primary" className="!h-7 !text-[11px]" onClick={() => openReceive(p.id)}>
                    Receive GRN
                  </AttioButton>
                )}
                <AttioButton variant="ghost" className="!h-7 !text-[11px]" title="Download PDF">
                  <Download className="size-3" />
                </AttioButton>
                <AttioButton
                  variant="ghost"
                  className="!h-7 !text-[11px]"
                  title="WhatsApp PO"
                  disabled={whatsappSending === p.id}
                  onClick={() => void handleWhatsAppPO(p.id)}
                >
                  {whatsappSending === p.id ? <Loader2 className="size-3 animate-spin" /> : <MessageSquare className="size-3" />}
                </AttioButton>
              </div>
            ),
          };
        })}
      />

      {createOpen && (
        <PharmacyDialog open={createOpen} title="Create purchase order" onClose={() => { setCreateOpen(false); resetCreate(); }} width="max-w-2xl">
          <div className="space-y-4 text-[13px]">
            <Panel title="Supplier Information">
              <FormRow label="Supplier *" required>
                <PharmacySelect value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  <option value="">Select supplier</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </PharmacySelect>
              </FormRow>
              <FormRow label="Notes">
                <PharmacyTextarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes / delivery instructions" />
              </FormRow>
            </Panel>

            <Panel title="Order Lines">
              <div className="space-y-3">
                <div className="hidden grid-cols-[2fr_80px_110px_90px_40px] gap-3 px-3 text-[11px] font-medium text-[var(--attio-text-secondary)] sm:grid">
                  <div>Medicine</div>
                  <div>Qty</div>
                  <div>Rate</div>
                  <div>Total</div>
                  <div></div>
                </div>
                {poLines.map((line, idx) => {
                  const drug = drugs.find((d) => d.id === line.drugId);
                  const gstPercent = drug?.gstPercent ?? 0;
                  const lineTotal = (Number(line.qty) || 0) * (Number(line.rate) || 0) * (1 + gstPercent / 100);
                  return (
                    <div key={idx} className="grid grid-cols-1 items-end gap-3 rounded-lg border p-3 sm:grid-cols-[2fr_80px_110px_90px_40px]">
                      <div className="min-w-0 space-y-1">
                        <label className="text-[11px] font-medium text-[var(--attio-text-secondary)] sm:hidden">Medicine</label>
                        <DrugSearch
                          drugs={drugs}
                          value={line.drugId}
                          placeholder="Search medicine…"
                          onChange={(id) =>
                            setPoLines(
                              poLines.map((l, i) =>
                                i === idx
                                  ? {
                                      ...l,
                                      drugId: id,
                                      gst: id ? String(drugs.find((d) => d.id === id)?.gstPercent ?? 0) : "0",
                                    }
                                  : l,
                              ),
                            )
                          }
                        />
                        {drug && (
                          <div className="text-[11px] text-[var(--attio-text-tertiary)]">
                            GST {gstPercent}% · {drug.unit}
                          </div>
                        )}
                      </div>
                      <PharmacyInput type="number" placeholder="Qty" value={line.qty} onChange={(e) => setPoLines(poLines.map((l, i) => (i === idx ? { ...l, qty: e.target.value } : l)))} />
                      <PharmacyInput type="number" placeholder="Rate" value={line.rate} onChange={(e) => setPoLines(poLines.map((l, i) => (i === idx ? { ...l, rate: e.target.value } : l)))} />
                      <div className="flex h-9 items-center text-[13px] font-medium text-[var(--attio-text-secondary)]">
                        ₹{lineTotal.toFixed(2)}
                      </div>
                      <button type="button" className="flex h-9 items-center justify-center text-red-600 hover:text-red-700" onClick={() => setPoLines(poLines.filter((_, i) => i !== idx))}>
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  );
                })}
                <AttioButton variant="secondary" onClick={() => setPoLines([...poLines, { drugId: "", qty: "", rate: "", gst: "0" }])}>Add line</AttioButton>
              </div>
            </Panel>

            <Panel title="Order Summary">
              <div className="flex justify-between">
                <p className="font-medium">Total Amount</p>
                <p className="font-medium">₹{calculateTotal().toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            </Panel>

            <div className="flex justify-end gap-2">
              <AttioButton variant="secondary" onClick={() => { setCreateOpen(false); resetCreate(); }}>Cancel</AttioButton>
              <AttioButton variant="primary" onClick={submitCreate}>Create PO</AttioButton>
            </div>
          </div>
        </PharmacyDialog>
      )}

      {receiveId && (
        <PharmacyDialog open={!!receiveId} title="Goods receipt & Delivery" subtitle={receiveId} onClose={() => { setReceiveId(null); setGrn({}); setSupplierBillFile(null); setPaymentAmount(""); setPaymentMode("credit"); }} width="max-w-xl">
          <div className="space-y-4 text-[13px]">
            <Panel title="Batch & Expiry Details">
              <p className="mb-2 text-[12px] text-[var(--attio-text-secondary)]">Enter batch and expiry for each line received.</p>
              {purchaseOrders
                .find((p) => p.id === receiveId)
                ?.lines.map((l) => {
                  const drug = drugs.find((d) => d.id === l.drugId);
                  return (
                    <div key={l.drugId} className="rounded-lg border p-3">
                      <p className="mb-2 text-[13px] font-medium">{drug?.brandName ?? l.drugId}</p>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <PharmacyInput placeholder="Batch no" value={grn[l.drugId]?.batchNo ?? ""} onChange={(e) => setGrn({ ...grn, [l.drugId]: { ...grn[l.drugId]!, batchNo: e.target.value } })} />
                        <PharmacyInput type="date" value={grn[l.drugId]?.expiry ?? ""} onChange={(e) => setGrn({ ...grn, [l.drugId]: { ...grn[l.drugId]!, expiry: e.target.value } })} />
                        <PharmacyInput type="number" placeholder={`Qty (pending ${l.qtyOrdered - l.qtyReceived})`} value={grn[l.drugId]?.qty ?? ""} onChange={(e) => setGrn({ ...grn, [l.drugId]: { ...grn[l.drugId]!, qty: e.target.value } })} />
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <PharmacyInput placeholder="Shelf / Rack" value={grn[l.drugId]?.shelf ?? ""} onChange={(e) => setGrn({ ...grn, [l.drugId]: { ...grn[l.drugId]!, shelf: e.target.value } })} />
                        <PharmacyInput placeholder="Box number" value={grn[l.drugId]?.box ?? ""} onChange={(e) => setGrn({ ...grn, [l.drugId]: { ...grn[l.drugId]!, box: e.target.value } })} />
                      </div>
                    </div>
                  );
                })}
            </Panel>

            <Panel title="Supplier Bill Upload">
              <FormRow label="Upload Supplier Bill">
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => setSupplierBillFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-[11px] text-[var(--attio-text-tertiary)] file:mr-4 file:rounded file:border-0 file:bg-[var(--attio-hover)] file:px-3 file:py-1 file:text-[11px] file:font-medium"
                />
              </FormRow>
              {supplierBillFile && (
                <p className="text-[11px] text-[var(--attio-accent)]">Selected: {supplierBillFile.name}</p>
              )}
            </Panel>

            <Panel title="Payment Details">
              <div className="grid gap-3 sm:grid-cols-2">
                <FormRow label="Payment Mode">
                  <PharmacySelect value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as any)}>
                    <option value="credit">Credit (as per terms)</option>
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="transfer">Bank Transfer</option>
                  </PharmacySelect>
                </FormRow>
                {paymentMode !== "credit" && (
                  <FormRow label="Payment Amount (₹)">
                    <PharmacyInput type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder="Enter amount" />
                  </FormRow>
                )}
              </div>
            </Panel>

            <div className="flex justify-end gap-2">
              <AttioButton variant="secondary" onClick={() => { setReceiveId(null); setGrn({}); setSupplierBillFile(null); setPaymentAmount(""); setPaymentMode("credit"); }}>Cancel</AttioButton>
              <AttioButton variant="primary" onClick={submitReceive}>Mark Delivered & Pay</AttioButton>
            </div>
          </div>
        </PharmacyDialog>
      )}
    </PageChrome>
  );
}
