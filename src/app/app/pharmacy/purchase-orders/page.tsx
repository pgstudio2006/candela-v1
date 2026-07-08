"use client";

import { usePharmacyStore } from "@/components/pharmacy/pharmacy-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, DataTable, StatusBadge, Panel } from "@/components/frontdesk/ui";
import { PharmacyDialog, PharmacyInput, PharmacySelect, PharmacyTextarea, FormRow } from "@/components/pharmacy/ui";
import { PO_STATUS_LABELS } from "@/design-system/pharmacy-data";
import type { PoLine } from "@/design-system/pharmacy-data";
import { Plus, Trash2, Download, MessageSquare } from "lucide-react";
import { useState } from "react";

export default function PharmacyPurchaseOrdersPage() {
  const { purchaseOrders, suppliers, drugs, createPO, updatePOStatus, receivePO, isManager, isPurchase } = usePharmacyStore();
  const [receiveId, setReceiveId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [poLines, setPoLines] = useState<Array<{ drugId: string; qty: string; rate: string; gst: string }>>([{ drugId: "", qty: "", rate: "", gst: "12" }]);
  const [grn, setGrn] = useState<Record<string, { batchNo: string; expiry: string; qty: string }>>({});

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
    const initial: Record<string, { batchNo: string; expiry: string; qty: string }> = {};
    po.lines.forEach((l) => {
      initial[l.drugId] = { batchNo: "", expiry: "", qty: String(l.qtyOrdered - l.qtyReceived) };
    });
    setGrn(initial);
    setReceiveId(poId);
  };

  const submitReceive = () => {
    if (!receiveId) return;
    const received: Record<string, { batchNo: string; expiry: string; qty: number }> = {};
    Object.entries(grn).forEach(([drugId, v]) => {
      if (v.batchNo && v.expiry && Number(v.qty) > 0) {
        received[drugId] = { batchNo: v.batchNo, expiry: v.expiry, qty: Number(v.qty) };
      }
    });
    if (Object.keys(received).length === 0) return;
    void receivePO(receiveId, received).then(() => {
      setReceiveId(null);
      setGrn({});
    });
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
                {["approved", "partial"].includes(p.status) && (
                  <AttioButton variant="primary" className="!h-7 !text-[11px]" onClick={() => openReceive(p.id)}>
                    Receive GRN
                  </AttioButton>
                )}
                <AttioButton variant="ghost" className="!h-7 !text-[11px]" title="Download PDF">
                  <Download className="size-3" />
                </AttioButton>
                <AttioButton variant="ghost" className="!h-7 !text-[11px]" title="WhatsApp PDF">
                  <MessageSquare className="size-3" />
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
              <div className="space-y-2">
                {poLines.map((line, idx) => (
                  <div key={idx} className="grid gap-2 rounded-lg border p-2 sm:grid-cols-6">
                    <PharmacySelect value={line.drugId} onChange={(e) => setPoLines(poLines.map((l, i) => (i === idx ? { ...l, drugId: e.target.value } : l)))}>
                      <option value="">Select drug</option>
                      {drugs.map((d) => <option key={d.id} value={d.id}>{d.brandName}</option>)}
                    </PharmacySelect>
                    <PharmacyInput type="number" placeholder="Qty" value={line.qty} onChange={(e) => setPoLines(poLines.map((l, i) => (i === idx ? { ...l, qty: e.target.value } : l)))} />
                    <PharmacyInput type="number" placeholder="Rate" value={line.rate} onChange={(e) => setPoLines(poLines.map((l, i) => (i === idx ? { ...l, rate: e.target.value } : l)))} />
                    <PharmacyInput type="number" placeholder="GST %" value={line.gst} onChange={(e) => setPoLines(poLines.map((l, i) => (i === idx ? { ...l, gst: e.target.value } : l)))} />
                    <div className="flex items-center text-[11px] text-[var(--attio-text-tertiary)]">
                      ₹{((Number(line.qty) || 0) * (Number(line.rate) || 0) * (1 + (Number(line.gst) || 0) / 100)).toFixed(2)}
                    </div>
                    <button type="button" className="flex items-center justify-center text-red-600" onClick={() => setPoLines(poLines.filter((_, i) => i !== idx))}>
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
                <AttioButton variant="secondary" onClick={() => setPoLines([...poLines, { drugId: "", qty: "", rate: "", gst: "12" }])}>Add line</AttioButton>
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
        <PharmacyDialog open={!!receiveId} title="Goods receipt" subtitle={receiveId} onClose={() => { setReceiveId(null); setGrn({}); }}>
          <div className="space-y-4 text-[13px]">
            <p className="text-[12px] text-[var(--attio-text-secondary)]">Enter batch and expiry for each line received.</p>
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
                  </div>
                );
              })}
            <div className="flex justify-end gap-2">
              <AttioButton variant="secondary" onClick={() => { setReceiveId(null); setGrn({}); }}>Cancel</AttioButton>
              <AttioButton variant="primary" onClick={submitReceive}>Confirm GRN</AttioButton>
            </div>
          </div>
        </PharmacyDialog>
      )}
    </PageChrome>
  );
}
