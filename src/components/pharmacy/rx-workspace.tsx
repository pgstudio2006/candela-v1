"use client";

import { usePharmacyStore } from "@/components/pharmacy/pharmacy-store";
import { PublishedSchemaForm } from "@/components/candela/published-schema-form";
import { saveSubmissionAction } from "@/app/actions/clinical-actions";
import { AttioButton, StatusBadge } from "@/components/frontdesk/ui";
import { usePublishedFormSchema } from "@/hooks/use-published-form-schema";
import type { Prescription, PrescriptionLine } from "@/design-system/pharmacy-data";
import { RX_STATUS_LABELS } from "@/design-system/pharmacy-data";
import { daysToExpiry, isControlledSchedule, pickFefoBatch } from "@/lib/pharmacy-platform";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import { useEffect, useState } from "react";

export function RxWorkspaceModal({ rx, onClose }: { rx: Prescription; onClose: () => void }) {
  const { drugs, stock, verifyPrescription, rejectPrescription, dispensePrescription } = usePharmacyStore();
  const [tab, setTab] = useState<"verify" | "dispense">(rx.status === "pending" ? "verify" : "dispense");
  const [rejectReason, setRejectReason] = useState("");
  const [witness, setWitness] = useState("");
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [batchIds, setBatchIds] = useState<Record<string, string>>({});
  const [addedLines, setAddedLines] = useState<Array<PrescriptionLine & { _local?: boolean }>>([]);
  const [msg, setMsg] = useState("");
  const [newDrugId, setNewDrugId] = useState("");
  const dispenseSchema = usePublishedFormSchema("pharmacy-dispense");

  useEffect(() => {
    const init: Record<string, number> = {};
    const initBatch: Record<string, string> = {};
    rx.lines.forEach((l) => {
      init[l.id] = l.qtyPrescribed - l.qtyDispensed;
      initBatch[l.id] = "";
    });
    setQtys(init);
    setBatchIds(initBatch);
    setAddedLines([]);
  }, [rx]);

  const needsWitness = rx.lines.some((l) => {
    const d = drugs.find((x) => x.id === (l.substituteDrugId ?? l.drugId));
    return d && (d.schedule === "H1" || d.schedule === "X");
  });

  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/35 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-[16px] font-semibold">{rx.patientName}</h2>
            <p className="text-[12px] text-[var(--attio-text-tertiary)]">
              {rx.uhid} · {rx.doctorName} · {rx.source.toUpperCase()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge label={RX_STATUS_LABELS[rx.status]} variant="info" />
            <button type="button" onClick={onClose} className="rounded p-1 hover:bg-[var(--attio-hover)]">
              <X className="size-4" />
            </button>
          </div>
        </div>

        {rx.allergies?.length ? (
          <div className="border-b bg-red-50 px-5 py-2 text-[12px] text-red-800">Allergies: {rx.allergies.join(", ")}</div>
        ) : null}

        <div className="flex border-b px-5">
          {(["verify", "dispense"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`border-b-2 px-4 py-2 text-[13px] capitalize ${tab === t ? "border-[var(--attio-text)] font-medium" : "border-transparent text-[var(--attio-text-tertiary)]"}`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {msg && <p className="mb-3 rounded-lg bg-blue-50 px-3 py-2 text-[12px] text-blue-900">{msg}</p>}

          {tab === "verify" && (
            <div className="space-y-4">
              <ul className="divide-y rounded-lg border">
                {rx.lines.map((l) => {
                  const drug = drugs.find((d) => d.id === l.drugId);
                  const avail = stock.filter((s) => s.drugId === l.drugId && !s.quarantined).reduce((n, s) => n + s.qtyOnHand - s.reserved, 0);
                  const batch = pickFefoBatch(l.drugId, stock, l.qtyPrescribed);
                  return (
                    <li key={l.id} className="flex justify-between gap-4 px-3 py-3 text-[13px]">
                      <div className="flex-1">
                        <p className="font-medium">{drug?.brandName ?? l.drugName ?? l.drugId}</p>
                        <p className="text-[11px] text-[var(--attio-text-tertiary)]">
                          {l.dose} · {l.frequency} · {l.duration} · Qty {l.qtyPrescribed}
                        </p>
                        {l.notes && <p className="text-[11px] text-[var(--attio-text-tertiary)] italic">{l.notes}</p>}
                        {drug && isControlledSchedule(drug.schedule) && (
                          <StatusBadge label={`Schedule ${drug.schedule}`} variant="danger" />
                        )}
                        {batch && (
                          <p className="mt-1 text-[11px] text-[var(--attio-text-tertiary)]">
                            Shelf: {batch.rack} · Box: {batch.batchNo} · Batch: {batch.batchNo}
                          </p>
                        )}
                      </div>
                      <span className={avail >= l.qtyPrescribed ? "text-emerald-600" : "text-amber-600"}>{avail} avail</span>
                    </li>
                  );
                })}
              </ul>
              {rx.status === "pending" && (
                <div className="flex flex-wrap gap-2">
                  <AttioButton
                    variant="primary"
                    onClick={() => {
                      void verifyPrescription(rx.id).then(() => {
                        setMsg("Prescription verified — proceed to dispense.");
                        setTab("dispense");
                      }).catch((err) => setMsg(err instanceof Error ? err.message : "Verify failed"));
                    }}
                  >
                    Verify Rx
                  </AttioButton>
                  <div className="flex flex-1 gap-2">
                    <Input placeholder="Reject reason" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} className="h-9 text-[13px]" />
                    <AttioButton
                      variant="secondary"
                      onClick={() => {
                        if (!rejectReason.trim()) return;
                        void rejectPrescription(rx.id, rejectReason).then(() => onClose());
                      }}
                    >
                      Reject
                    </AttioButton>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "dispense" && (
            <div className="space-y-4">
              {[...rx.lines, ...addedLines].map((l) => {
                const drugId = l.substituteDrugId ?? l.drugId;
                const drug = drugs.find((d) => d.id === drugId);
                const remaining = "_local" in l && l._local ? qtys[l.id] ?? 0 : l.qtyPrescribed - l.qtyDispensed;
                const qty = qtys[l.id] ?? 0;
                const selectedBatchId = batchIds[l.id];
                const selectedBatch = selectedBatchId ? stock.find((s) => s.id === selectedBatchId && s.drugId === drugId) : undefined;
                const fefoBatch = qty > 0 ? pickFefoBatch(drugId, stock, qty) : null;
                const batch = selectedBatch ?? fefoBatch;
                return (
                  <div key={l.id} className="rounded-lg border p-3">
                    <div className="flex justify-between">
                      <div>
                        <p className="text-[13px] font-medium">{drug?.brandName ?? l.drugName ?? l.drugId}</p>
                        <p className="text-[11px] text-[var(--attio-text-tertiary)]">
                          {l.dose} · {l.frequency} · {l.duration} · Remaining: {remaining}
                        </p>
                        {l.notes && <p className="text-[11px] text-[var(--attio-text-tertiary)] italic">{l.notes}</p>}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setQtys((q) => ({ ...q, [l.id]: 0 }));
                          setAddedLines((prev) => prev.filter((x) => x.id !== l.id));
                        }}
                        className="text-red-600 hover:text-red-700 text-[11px]"
                      >
                        Remove
                      </button>
                    </div>
                    {batch && (
                      <p className="mt-1 text-[11px] text-[var(--attio-text-tertiary)]">
                        Shelf: {batch.shelf || batch.rack} · Box: {batch.box || batch.batchNo} · Batch: {batch.batchNo} · Exp: {batch.expiry}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <Input
                        type="number"
                        min={0}
                        max={remaining}
                        value={qty}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setQtys((q) => ({ ...q, [l.id]: v }));
                          if ("_local" in l && l._local) {
                            setAddedLines((prev) => prev.map((x) => (x.id === l.id ? { ...x, qtyPrescribed: v } : x)));
                          }
                        }}
                        className="h-8 w-20 text-[13px]"
                      />
                      <select
                        className="h-8 rounded border px-2 text-[12px] outline-none focus:border-[var(--attio-text)]"
                        value={batchIds[l.id] ?? ""}
                        onChange={(e) => setBatchIds((b) => ({ ...b, [l.id]: e.target.value }))}
                      >
                        <option value="">Auto FEFO</option>
                        {stock.filter((s) => s.drugId === drugId && !s.quarantined).map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.batchNo} · exp {s.expiry} · qty {s.qtyOnHand - s.reserved} · {s.shelf || s.rack}
                          </option>
                        ))}
                      </select>
                    </div>
                    {!batch && qty > 0 && <span className="text-[11px] text-red-600">No valid batch</span>}
                  </div>
                );
              })}
              <div className="flex items-end gap-2 rounded border p-3">
                <Input
                  className="h-9 flex-1 text-[13px]"
                  placeholder="Type medicine name to add"
                  value={newDrugId}
                  onChange={(e) => setNewDrugId(e.target.value)}
                />
                <AttioButton variant="secondary" onClick={() => {
                  const name = newDrugId.trim();
                  if (!name) return;
                  const slug = name.toLowerCase().replace(/\s+/g, "_");
                  const id = `rxl_${rx.id}_${Date.now()}`;
                  const newLine: PrescriptionLine & { _local?: boolean } = {
                    id,
                    drugId: slug,
                    drugName: name,
                    dose: "1 tab",
                    frequency: "OD",
                    duration: "1 day",
                    days: 1,
                    qtyPrescribed: 1,
                    qtyDispensed: 0,
                    notes: "",
                    _local: true,
                  };
                  setAddedLines((prev) => [...prev, newLine]);
                  setQtys((q) => ({ ...q, [id]: 1 }));
                  setBatchIds((b) => ({ ...b, [id]: "" }));
                  setNewDrugId("");
                }}>
                  Add medicine
                </AttioButton>
              </div>
              {needsWitness && (
                <Input placeholder="Witness pharmacist name (Schedule H1/X)" value={witness} onChange={(e) => setWitness(e.target.value)} className="h-9 text-[13px]" />
              )}
              <PublishedSchemaForm
                schema={dispenseSchema}
                submitLabel="Confirm checklist"
                onSubmit={async (data) => {
                  await saveSubmissionAction("pharmacy-dispense", data, {
                    visitId: rx.encounterId,
                  });
                  setMsg("Dispensing checklist saved.");
                }}
              />
              <AttioButton
                variant="primary"
                disabled={!["verified", "partially_dispensed"].includes(rx.status)}
                onClick={() => {
                  const newLines = addedLines
                    .filter((l) => (qtys[l.id] ?? 0) > 0)
                    .map((l) => ({ ...l, qtyPrescribed: qtys[l.id] ?? l.qtyPrescribed, qtyDispensed: 0 }));
                  const cleanedBatchIds = Object.fromEntries(
                    Object.entries(batchIds).filter(([k]) => (qtys[k] ?? 0) > 0),
                  );
                  void dispensePrescription(rx.id, qtys, witness || undefined, cleanedBatchIds, newLines).then((result) => {
                    if (!result.ok) setMsg(result.error ?? "Dispense failed");
                    else if (rx.source === "ipd") {
                      setMsg(`Dispensed — charges added to IPD cart for ${rx.patientName}. Payment at discharge.`);
                    } else {
                      setMsg(`Dispensed — bill ${result.billId} created. Collect payment in Billing.`);
                    }
                  });
                }}
              >
                {rx.source === "ipd" ? "Dispense to IPD cart" : "Dispense & create bill"}
              </AttioButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
