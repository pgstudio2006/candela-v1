"use client";

import { createLabOrderFromModuleAction, listActiveLabCatalogsAction } from "@/app/actions/lab-actions";
import { AttioButton } from "@/components/frontdesk/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/frontdesk/ui";
import type { LabReportCatalog } from "@/design-system/lab-data";
import { cn } from "@/lib/utils";
import { FlaskConical, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";

type LabOrderModalProps = {
  patientId: string;
  patientName: string;
  visitId?: string;
  admissionId?: string;
  source: "opd" | "ipd" | "emergency" | "direct";
  trigger?: React.ReactNode;
  onCreated?: (orderId: string) => void;
};

export function LabOrderButton(props: LabOrderModalProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {props.trigger ? (
        <button type="button" onClick={() => setOpen(true)}>{props.trigger}</button>
      ) : (
        <AttioButton variant="secondary" onClick={() => setOpen(true)}>
          <FlaskConical className="size-3.5" />
          Order lab
        </AttioButton>
      )}
      {open && <LabOrderModal {...props} onClose={() => setOpen(false)} />}
    </>
  );
}

type InternalProps = LabOrderModalProps & { onClose: () => void };

function LabOrderModal({ patientId, patientName, visitId, admissionId, source, onClose, onCreated }: InternalProps) {
  const [catalogs, setCatalogs] = useState<LabReportCatalog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<{ reportCatalogId: string; sampleType: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listActiveLabCatalogsAction().then((res) => {
      if (cancelled) return;
      if (res.ok) setCatalogs(res.data ?? []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const toggle = (catalog: LabReportCatalog) => {
    setSelected((prev) => {
      const exists = prev.find((i) => i.reportCatalogId === catalog.id);
      if (exists) return prev.filter((i) => i.reportCatalogId !== catalog.id);
      return [...prev, { reportCatalogId: catalog.id, sampleType: catalog.sampleType ?? "" }];
    });
  };

  const handleCreate = async () => {
    if (!selected.length) return alert("Select at least one test");
    setSaving(true);
    try {
      const items = selected.map((i) => {
        const catalog = catalogs.find((c) => c.id === i.reportCatalogId);
        return {
          reportCatalogId: i.reportCatalogId,
          label: catalog?.name ?? "Lab test",
          sampleType: i.sampleType.trim() || catalog?.sampleType,
        };
      });
      const res = await createLabOrderFromModuleAction({
        patientId,
        visitId,
        admissionId,
        source,
        items,
      });
      if (!res.ok) throw new Error(res.error ?? "Failed");
      onCreated?.(res.data?.id ?? "");
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-12">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[var(--attio-border)] bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">Order laboratory tests · {patientName}</h2>
          <button onClick={onClose}><X className="size-4" /></button>
        </div>

        {loading ? (
          <p className="text-[13px] text-[var(--attio-text-tertiary)]">Loading catalogs...</p>
        ) : (
          <>
            <Panel title="Select tests">
              <div className="space-y-2">
                {catalogs.length === 0 && <p className="text-[12px] text-[var(--attio-text-tertiary)]">No active report catalogs.</p>}
                {catalogs.map((c) => {
                  const item = selected.find((i) => i.reportCatalogId === c.id);
                  return (
                    <div key={c.id} className={cn("rounded-lg border p-2", item ? "border-[var(--attio-accent)] bg-[var(--attio-accent)]/5" : "")}>
                      <label className="flex items-center gap-2 text-[13px] font-medium">
                        <input type="checkbox" checked={!!item} onChange={() => toggle(c)} />
                        {c.name} <span className="text-[var(--attio-text-tertiary)]">({c.code})</span>
                      </label>
                      {item && (
                        <div className="mt-2 pl-6">
                          <Label className="text-[11px]">Sample type override</Label>
                          <Input
                            value={item.sampleType}
                            onChange={(e) => setSelected((prev) => prev.map((i) => i.reportCatalogId === c.id ? { ...i, sampleType: e.target.value } : i))}
                            className="h-7 text-[12px]"
                            placeholder={c.sampleType ?? "Sample type"}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Panel>

            <div className="mt-5 flex justify-end gap-2">
              <AttioButton variant="secondary" onClick={onClose}>Cancel</AttioButton>
              <AttioButton onClick={() => void handleCreate()} disabled={saving}>
                {saving ? "Creating..." : <><Plus className="size-3.5" /> Create order</>}
              </AttioButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
