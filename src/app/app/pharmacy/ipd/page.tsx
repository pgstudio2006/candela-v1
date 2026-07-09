"use client";

import { usePharmacyStore } from "@/components/pharmacy/pharmacy-store";
import { RxWorkspaceModal } from "@/components/pharmacy/rx-workspace";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { DataTable, Panel, StatusBadge, AttioButton } from "@/components/frontdesk/ui";
import type { Prescription } from "@/design-system/pharmacy-data";
import { RX_STATUS_LABELS } from "@/design-system/pharmacy-data";
import { useState } from "react";

type IpdTab = "rx" | "indents" | "cart";

export default function PharmacyIpdPage() {
  const { prescriptions, indents, getDrug, fulfillIndent, stock } = usePharmacyStore();
  const [tab, setTab] = useState<IpdTab>("rx");
  const [selectedRx, setSelectedRx] = useState<Prescription | null>(null);

  const ipdRx = prescriptions.filter((r) => r.source === "ipd");
  
  // Calculate IPD cart charges - dispensed IPD prescriptions
  const ipdCart = prescriptions
    .filter((r) => r.source === "ipd" && (r.status === "dispensed" || r.status === "partially_dispensed"))
    .reduce((acc, rx) => {
      const visitId = rx.encounterId;
      if (!visitId) return acc;
      if (!acc[visitId]) {
        acc[visitId] = {
          visitId,
          patientName: rx.patientName,
          uhid: rx.uhid,
          total: 0,
          items: [],
        };
      }
      rx.lines.forEach((line) => {
        if (line.qtyDispensed > 0) {
          const drug = getDrug(line.drugId);
          const rate = line.dispenseRate ?? drug?.defaultMrp ?? 0;
          const lineTotal = line.qtyDispensed * rate;
          acc[visitId].total += lineTotal;
          acc[visitId].items.push({
            drugName: drug?.brandName ?? line.drugId,
            qty: line.qtyDispensed,
            rate,
            total: lineTotal,
          });
        }
      });
      return acc;
    }, {} as Record<string, { visitId: string; patientName: string; uhid: string; total: number; items: Array<{ drugName: string; qty: number; rate: number; total: number }> }>);

  const cartData = Object.values(ipdCart);

  return (
    <PageChrome
      breadcrumbs={[{ label: "Pharmacy", href: "/app/pharmacy" }, { label: "IPD" }]}
      title="IPD pharmacy"
      meta="Inpatient prescriptions · ward indents · IPD cart · discharge billing"
      tabs={[
        { id: "rx", label: "IPD prescriptions" },
        { id: "indents", label: "Ward indents" },
        { id: "cart", label: "IPD cart" },
      ]}
      activeTab={tab}
      onTabChange={(id) => setTab(id as IpdTab)}
    >
      {tab === "rx" && (
        <>
          {ipdRx.length === 0 ? (
            <p className="text-[13px] text-[var(--attio-text-tertiary)]">No IPD prescriptions in queue.</p>
          ) : (
            <DataTable
              columns={[
                { key: "patient", label: "Patient" },
                { key: "uhid", label: "UHID" },
                { key: "doctor", label: "Doctor" },
                { key: "priority", label: "Priority" },
                { key: "items", label: "Items" },
                { key: "status", label: "Status" },
                { key: "time", label: "Received" },
              ]}
              rows={ipdRx.map((r) => ({
                patient: r.patientName,
                uhid: r.uhid,
                doctor: r.doctorName,
                priority: <StatusBadge label={r.priority} variant={r.priority === "stat" ? "danger" : r.priority === "urgent" ? "warning" : "neutral"} />,
                items: r.lines.length,
                status: <StatusBadge label={RX_STATUS_LABELS[r.status]} variant="info" />,
                time: new Date(r.createdAt).toLocaleString("en-IN"),
                actions: (
                  <AttioButton variant="primary" className="!h-7 !text-[11px]" onClick={() => setSelectedRx(r)}>
                    Dispense
                  </AttioButton>
                ),
              }))}
            />
          )}
        </>
      )}
      {tab === "indents" && (
        <DataTable
          columns={[
            { key: "ward", label: "Ward" },
            { key: "drug", label: "Drug" },
            { key: "req", label: "Requested" },
            { key: "issued", label: "Issued" },
            { key: "nurse", label: "Nurse" },
            { key: "urgency", label: "Urgency" },
            { key: "status", label: "Status" },
            { key: "actions", label: "" },
          ]}
          rows={indents.map((i) => ({
            ward: `${i.ward}${i.bed ? ` · ${i.bed}` : ""}`,
            drug: getDrug(i.drugId)?.brandName ?? i.drugId,
            req: i.qtyRequested,
            issued: i.qtyIssued,
            nurse: i.nurseName,
            urgency: i.urgency,
            status: <StatusBadge label={i.status} variant="info" />,
            actions:
              i.status === "pending" ? (
                <button
                  type="button"
                  className="text-[12px] font-medium text-[var(--attio-accent)] hover:underline"
                  onClick={() => void fulfillIndent(i.id, i.qtyRequested)}
                >
                  Issue
                </button>
              ) : null,
          }))}
        />
      )}
      {tab === "cart" && (
        <>
          {cartData.length === 0 ? (
            <p className="text-[13px] text-[var(--attio-text-tertiary)]">No pharmacy charges in IPD cart. Charges appear after IPD dispense.</p>
          ) : (
            <div className="space-y-4">
              <Panel title="IPD Pharmacy Cart - Charges accumulate until discharge">
                <DataTable
                  columns={[
                    { key: "patient", label: "Patient" },
                    { key: "uhid", label: "UHID" },
                    { key: "items", label: "Items" },
                    { key: "total", label: "Total" },
                    { key: "actions", label: "" },
                  ]}
                  rows={cartData.map((cart) => ({
                    patient: cart.patientName,
                    uhid: cart.uhid,
                    items: `${cart.items.length} item(s)`,
                    total: `₹${cart.total.toLocaleString("en-IN")}`,
                    actions: (
                      <AttioButton variant="secondary" className="!h-7 !text-[11px]">
                        View details
                      </AttioButton>
                    ),
                  }))}
                />
              </Panel>
              <div className="text-[11px] text-[var(--attio-text-tertiary)]">
                <p>• Pharmacy charges for IPD patients are added to their IPD cart</p>
                <p>• Payment is collected at discharge from the IPD billing module</p>
                <p>• No separate pharmacy bills are created for IPD patients</p>
              </div>
            </div>
          )}
        </>
      )}
      {selectedRx && <RxWorkspaceModal rx={selectedRx} onClose={() => setSelectedRx(null)} />}
    </PageChrome>
  );
}
