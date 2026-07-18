"use client";

import { usePharmacyStore } from "@/components/pharmacy/pharmacy-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, DataTable, StatusBadge, Panel } from "@/components/frontdesk/ui";
import { PharmacyDialog, PharmacyInput, PharmacyTextarea, FormRow } from "@/components/pharmacy/ui";
import type { StockBatch } from "@/design-system/pharmacy-data";
import { daysToExpiry } from "@/lib/pharmacy-platform";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { useState } from "react";

export default function PharmacyInventoryPage() {
  const { stock, getDrug, getSupplier, quarantineBatch, adjustStock, deleteStockBatch, isManager } = usePharmacyStore();
  const [tab, setTab] = useState<"all" | "low" | "expiry">("all");
  const [adjust, setAdjust] = useState<StockBatch | null>(null);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  const canDelete = isManager();

  const rows = stock.filter((s) => {
    const drug = getDrug(s.drugId);
    if (tab === "low") return s.qtyOnHand <= (drug?.reorderLevel ?? 0);
    if (tab === "expiry") {
      const d = daysToExpiry(s.expiry);
      return d >= 0 && d <= 60;
    }
    return true;
  });

  const submitAdjust = async () => {
    if (!adjust) return;
    const d = Number(delta);
    if (!d || !reason.trim()) return;
    setAdjusting(true);
    await adjustStock(adjust.id, d, reason.trim());
    setAdjusting(false);
    setAdjust(null);
    setDelta("");
    setReason("");
  };

  return (
    <PageChrome
      breadcrumbs={[{ label: "Pharmacy", href: "/app/pharmacy" }, { label: "Inventory" }]}
      title="Batch inventory"
      meta="Medicine name · live stock · batch · expiry · supplier · shelf · box · description"
      actions={
        <div className="flex gap-2">
          <Link href="/app/pharmacy/drugs">
            <AttioButton variant="secondary">Add medicine</AttioButton>
          </Link>
          <Link href="/app/pharmacy/suppliers">
            <AttioButton variant="secondary">Suppliers</AttioButton>
          </Link>
          <Link href="/app/pharmacy/purchase-orders">
            <AttioButton variant="primary">New purchase order</AttioButton>
          </Link>
        </div>
      }
      tabs={[
        { id: "all", label: "All batches" },
        { id: "low", label: "Low stock" },
        { id: "expiry", label: "Near expiry" },
      ]}
      activeTab={tab}
      onTabChange={(id) => setTab(id as typeof tab)}
    >
      <DataTable
        columns={[
          { key: "drug", label: "Medicine" },
          { key: "description", label: "Description" },
          { key: "batch", label: "Batch" },
          { key: "expiry", label: "Expiry" },
          { key: "stock", label: "Live Stock" },
          { key: "supplier", label: "Supplier" },
          { key: "location", label: "Shelf/Box" },
          { key: "status", label: "Status" },
          { key: "actions", label: "" },
        ]}
        rows={rows.map((s) => {
          const drug = getDrug(s.drugId);
          const supplier = s.supplierId ? getSupplier(s.supplierId) : undefined;
          const d = daysToExpiry(s.expiry);
          return {
            drug: (
              <div>
                <p className="font-medium">{drug?.brandName ?? s.drugId}</p>
                <p className="text-[11px] text-[var(--attio-text-tertiary)]">{drug?.genericName} · {drug?.strength}</p>
              </div>
            ),
            description: (
              <div className="text-[11px]">
                <p>{drug?.therapeuticClass}</p>
                <p className="text-[var(--attio-text-tertiary)]">{drug?.form} · {drug?.route}</p>
              </div>
            ),
            batch: s.batchNo,
            expiry: (
              <div>
                <p>{s.expiry}</p>
                <p className={`text-[11px] ${d <= 30 ? "text-red-600" : d <= 60 ? "text-amber-600" : "text-[var(--attio-text-tertiary)]"}`}>
                  {d} days
                </p>
              </div>
            ),
            stock: (
              <div>
                <p className="font-medium">{s.qtyOnHand}</p>
                <p className="text-[11px] text-[var(--attio-text-tertiary)]">Reserved: {s.reserved}</p>
              </div>
            ),
            supplier: supplier?.name ?? "—",
            location: (
              <div>
                <p className="text-[11px]">Shelf: {s.shelf || s.rack}</p>
                <p className="text-[11px] text-[var(--attio-text-tertiary)]">Box: {s.box || s.batchNo}</p>
              </div>
            ),
            status: s.quarantined ? <StatusBadge label="Quarantine" variant="danger" /> : <StatusBadge label="Active" variant="success" />,
            actions: (
              <div className="flex gap-1">
                <AttioButton variant="ghost" className="!h-7 !text-[11px]" onClick={() => setAdjust(s)}>
                  Adjust
                </AttioButton>
                <AttioButton variant="ghost" className="!h-7 !text-[11px]" onClick={() => void quarantineBatch(s.id, !s.quarantined)}>
                  {s.quarantined ? "Release" : "Quarantine"}
                </AttioButton>
                {canDelete && (
                  <AttioButton
                    variant="ghost"
                    className="!h-7 !text-[11px] text-red-600 hover:text-red-700"
                    title="Delete batch"
                    onClick={() => {
                      if (window.confirm(`Delete batch ${s.batchNo}? This cannot be undone.`)) {
                        void deleteStockBatch(s.id).catch((err: Error) => alert(err.message));
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                  </AttioButton>
                )}
              </div>
            ),
          };
        })}
      />

      {adjust && (
        <PharmacyDialog
          open={!!adjust}
          title="Adjust stock"
          subtitle={`${getDrug(adjust.drugId)?.brandName ?? adjust.drugId} · batch ${adjust.batchNo}`}
          onClose={() => { setAdjust(null); setDelta(""); setReason(""); }}
        >
          <div className="space-y-4">
            <Panel title="Current Stock">
              <div className="grid grid-cols-2 gap-3 text-[13px]">
                <div>
                  <p className="text-[11px] text-[var(--attio-text-tertiary)]">On hand</p>
                  <p className="font-medium">{adjust.qtyOnHand}</p>
                </div>
                <div>
                  <p className="text-[11px] text-[var(--attio-text-tertiary)]">Reserved</p>
                  <p>{adjust.reserved}</p>
                </div>
                <div>
                  <p className="text-[11px] text-[var(--attio-text-tertiary)]">Available</p>
                  <p>{adjust.qtyOnHand - adjust.reserved}</p>
                </div>
                <div>
                  <p className="text-[11px] text-[var(--attio-text-tertiary)]">Expiry</p>
                  <p>{adjust.expiry}</p>
                </div>
              </div>
            </Panel>
            <FormRow label="Quantity change (+/-)" required>
              <PharmacyInput type="number" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="e.g. -5 or 10" />
            </FormRow>
            <FormRow label="Reason" required>
              <PharmacyTextarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Breakage, expiry, recount, etc." />
            </FormRow>
            <div className="flex justify-end gap-2">
              <AttioButton variant="secondary" onClick={() => { setAdjust(null); setDelta(""); setReason(""); }}>Cancel</AttioButton>
              <AttioButton variant="primary" disabled={adjusting} onClick={submitAdjust}>
                {adjusting ? "Adjusting..." : "Adjust"}
              </AttioButton>
            </div>
          </div>
        </PharmacyDialog>
      )}
    </PageChrome>
  );
}
