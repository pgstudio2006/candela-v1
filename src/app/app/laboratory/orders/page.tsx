"use client";

import { searchLabPatientsAction } from "@/app/actions/lab-actions";
import { LabReportActions } from "@/components/lab/lab-report-actions";
import { useLabStore } from "@/components/lab/lab-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, DataTable, Panel, StatusBadge } from "@/components/frontdesk/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LAB_ITEM_STATUS_LABELS, LAB_ORDER_STATUS_LABELS } from "@/design-system/lab-data";
import { cn } from "@/lib/utils";
import { Plus, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

export default function LabOrdersPage() {
  const { orders, reportCatalogs, createOrder, refresh } = useLabStore();
  const [creating, setCreating] = useState(false);
  const [patientQuery, setPatientQuery] = useState("");
  const [patientResults, setPatientResults] = useState<{ id: string; name: string; uhid: string; phone: string; age?: number; gender?: string }[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<typeof patientResults[number] | null>(null);
  const [source, setSource] = useState<"opd" | "ipd" | "emergency" | "direct">("direct");
  const [visitId, setVisitId] = useState("");
  const [selectedItems, setSelectedItems] = useState<{ reportCatalogId: string; sampleType: string }[]>([]);
  const [saving, setSaving] = useState(false);

  const searchPatients = async () => {
    if (!patientQuery.trim()) return;
    const res = await searchLabPatientsAction(patientQuery);
    if (res.ok) setPatientResults(res.data ?? []);
    else setPatientResults([]);
  };

  const toggleCatalog = (catalogId: string) => {
    setSelectedItems((prev) => {
      const exists = prev.find((i) => i.reportCatalogId === catalogId);
      if (exists) return prev.filter((i) => i.reportCatalogId !== catalogId);
      const catalog = reportCatalogs.find((c) => c.id === catalogId);
      return [...prev, { reportCatalogId: catalogId, sampleType: catalog?.sampleType ?? "" }];
    });
  };

  const handleCreate = async () => {
    if (!selectedPatient) return alert("Select a patient");
    if (!selectedItems.length) return alert("Select at least one test");
    setSaving(true);
    try {
      const items = selectedItems.map((i) => {
        const catalog = reportCatalogs.find((c) => c.id === i.reportCatalogId);
        return {
          reportCatalogId: i.reportCatalogId,
          label: catalog?.name ?? "Lab test",
          sampleType: i.sampleType.trim() || catalog?.sampleType,
        };
      });
      await createOrder({
        patientId: selectedPatient.id,
        visitId: visitId.trim() || undefined,
        source,
        items,
      });
      setCreating(false);
      resetForm();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create order");
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setPatientQuery("");
    setPatientResults([]);
    setSelectedPatient(null);
    setSource("direct");
    setVisitId("");
    setSelectedItems([]);
  };

  const columns = [
    { key: "patient", label: "Patient" },
    { key: "tests", label: "Tests" },
    { key: "amount", label: "Amount" },
    { key: "source", label: "Source" },
    { key: "status", label: "Status" },
    { key: "orderedAt", label: "Ordered" },
    { key: "actions", label: "" },
  ];

  const rows = useMemo(
    () =>
      orders.map((o) => ({
        patient: (
          <div>
            <p className="font-medium">{o.patientName ?? "Unknown"}</p>
            <p className="text-[11px] text-[var(--attio-text-tertiary)]">{o.patientUhid} · {o.patientAge != null ? `${o.patientAge}Y` : "—"} / {o.patientGender?.toUpperCase() ?? "—"}</p>
          </div>
        ),
        tests: (
          <div className="text-[12px]">
            {o.items.map((i) => i.label).join(", ")}
          </div>
        ),
        amount: (() => {
          const total = o.items.reduce((sum, i) => sum + Number(i.reportCatalog?.service?.rate ?? i.price ?? 0), 0);
          return <span className="text-[12px] font-semibold text-[var(--attio-accent)]">₹{Number(total).toLocaleString("en-IN")}</span>;
        })(),
        source: <span className="text-[12px] uppercase">{o.source}</span>,
        status: <StatusBadge label={LAB_ORDER_STATUS_LABELS[o.status]} variant={o.status === "completed" ? "success" : o.status === "cancelled" ? "danger" : "info"} />,
        orderedAt: <span className="text-[12px]">{new Date(o.orderedAt).toLocaleString()}</span>,
        actions: (
          <div className="flex items-center justify-end gap-2">
            {o.status !== "completed" && o.status !== "cancelled" && (
              <Link href={`/app/laboratory/prepare/${o.id}`} className="rounded-md bg-[var(--attio-text)] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[#333]">
                Prepare
              </Link>
            )}
            <LabReportActions
              orderId={o.id}
              patientId={o.patientId}
              status={o.status}
              onOrderUpdate={() => refresh({ silent: true })}
              variant="compact"
            />
          </div>
        ),
      })),
    [orders],
  );

  return (
    <PageChrome
      breadcrumbs={[
        { label: "Laboratory", href: "/app/laboratory" },
        { label: "Orders" },
      ]}
      title="Lab orders"
      meta="View, collect samples and prepare reports"
      actions={
        <AttioButton onClick={() => { resetForm(); setCreating(true); }}>
          <Plus className="size-3.5" />
          New order
        </AttioButton>
      }
    >
      <DataTable columns={columns} rows={rows} />

      {creating && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-12">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[var(--attio-border)] bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold">New lab order</h2>
              <button onClick={() => setCreating(false)}><X className="size-4" /></button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <Label className="text-[12px]">Patient</Label>
                {selectedPatient ? (
                  <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                    <div className="text-[13px]">
                      <span className="font-medium">{selectedPatient.name}</span>
                      <span className="ml-2 text-[var(--attio-text-tertiary)]">{selectedPatient.uhid}</span>
                      <span className="ml-2 text-[var(--attio-text-tertiary)]">· {selectedPatient.age != null ? `${selectedPatient.age}Y` : "—"} / {selectedPatient.gender?.toUpperCase() ?? "—"}</span>
                    </div>
                    <button onClick={() => setSelectedPatient(null)}><X className="size-3.5" /></button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input value={patientQuery} onChange={(e) => setPatientQuery(e.target.value)} placeholder="Name / UHID / phone" />
                    <AttioButton variant="secondary" onClick={() => void searchPatients()}>
                      <Search className="size-3.5" />
                    </AttioButton>
                  </div>
                )}
                {!selectedPatient && patientResults.length > 0 && (
                  <div className="mt-1 max-h-40 overflow-auto rounded-lg border">
                    {patientResults.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { setSelectedPatient(p); setPatientResults([]); }}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-[12px] hover:bg-[var(--attio-surface)]"
                      >
                        <span>{p.name} <span className="text-[var(--attio-text-tertiary)]">{p.uhid} · {p.age != null ? `${p.age}Y` : "—"} / {p.gender?.toUpperCase() ?? "—"}</span></span>
                        <span className="text-[var(--attio-text-tertiary)]">{p.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-[12px]">Source</Label>
                  <Select value={source} onValueChange={(v) => setSource(v as typeof source)}>
                    <SelectTrigger className="h-8 text-[13px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["opd", "ipd", "emergency", "direct"].map((s) => <SelectItem key={s} value={s}>{s.toUpperCase()}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[12px]">Visit ID (optional)</Label>
                  <Input value={visitId} onChange={(e) => setVisitId(e.target.value)} placeholder="Link to OPD/IPD visit" />
                </div>
              </div>

              <Panel title="Select tests" className="mt-2">
                <div className="space-y-2">
                  {reportCatalogs.length === 0 && <p className="text-[12px] text-[var(--attio-text-tertiary)]">No report catalogs available.</p>}
                  {reportCatalogs.map((c) => {
                    const selected = selectedItems.find((i) => i.reportCatalogId === c.id);
                    return (
                      <div key={c.id} className={cn("rounded-lg border p-2", selected ? "border-[var(--attio-accent)] bg-[var(--attio-accent)]/5" : "")}>
                        <label className="flex items-center gap-2 text-[13px] font-medium">
                          <input type="checkbox" checked={!!selected} onChange={() => toggleCatalog(c.id)} />
                          {c.name} <span className="text-[var(--attio-text-tertiary)]">({c.code})</span>
                        </label>
                        {selected && (
                          <div className="mt-2 pl-6">
                            <Label className="text-[11px]">Sample type override</Label>
                            <Input value={selected.sampleType} onChange={(e) => setSelectedItems((prev) => prev.map((i) => i.reportCatalogId === c.id ? { ...i, sampleType: e.target.value } : i))} className="h-7 text-[12px]" placeholder={c.sampleType ?? "Sample type"} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Panel>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <AttioButton variant="secondary" onClick={() => setCreating(false)}>Cancel</AttioButton>
              <AttioButton onClick={() => void handleCreate()} disabled={saving}>{saving ? "Creating..." : "Create order"}</AttioButton>
            </div>
          </div>
        </div>
      )}
    </PageChrome>
  );
}
