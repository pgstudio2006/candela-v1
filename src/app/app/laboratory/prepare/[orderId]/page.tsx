"use client";

import { LabReportActions } from "@/components/lab/lab-report-actions";
import { useLabStore } from "@/components/lab/lab-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, Panel, StatusBadge } from "@/components/frontdesk/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LAB_ITEM_STATUS_LABELS, LAB_ORDER_STATUS_LABELS, LAB_RESULT_FLAG_LABELS, type LabResultFlag } from "@/design-system/lab-data";
import { getApplicableRange, formatReferenceRange, normalizeGender } from "@/lib/lab-ranges";
import { cn } from "@/lib/utils";
import { ArrowLeft, Check, FlaskConical } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export default function PrepareLabReportPage() {
  const params = useParams();
  const orderId = String(params.orderId ?? "");
  const { getOrder, reloadOrder, collectSample, saveResults, saveLabOrderMetadata, markItemComplete } = useLabStore();

  const [order, setOrder] = useState(getOrder(orderId));
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pregnancy, setPregnancy] = useState(order?.pregnancy ?? false);
  const [bloodGroup, setBloodGroup] = useState(order?.patientBloodGroup ?? "");
  const [savingMeta, setSavingMeta] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const o = await reloadOrder(orderId);
      if (o) {
        setOrder(o);
        const init: Record<string, string> = {};
        const initNotes: Record<string, string> = {};
        for (const item of o.items) {
          for (const r of item.results) {
            init[`${item.id}_${r.fieldMasterId}`] = r.value;
            if (r.note) initNotes[`${item.id}_${r.fieldMasterId}`] = r.note;
          }
        }
        setDraft((prev) => ({ ...init, ...prev }));
        setNotes((prev) => ({ ...initNotes, ...prev }));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [orderId]);

  useEffect(() => {
    if (order) {
      setPregnancy(order.pregnancy);
      setBloodGroup(order.patientBloodGroup ?? "");
    }
  }, [order?.pregnancy, order?.patientBloodGroup]);

  useEffect(() => {
    if (!order) return;
    const samePregnancy = pregnancy === order.pregnancy;
    const sameBloodGroup = (bloodGroup || "") === (order.patientBloodGroup || "");
    if (samePregnancy && sameBloodGroup) return;
    const t = setTimeout(async () => {
      setSavingMeta(true);
      try {
        const o = await saveLabOrderMetadata(orderId, {
          pregnancy,
          bloodGroup: bloodGroup.trim() || undefined,
        });
        setOrder(o);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to save details");
      } finally {
        setSavingMeta(false);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [order, pregnancy, bloodGroup, orderId, saveLabOrderMetadata]);

  const fieldsToFill = useMemo(() => {
    const list: { itemId: string; fieldMasterId: string; label: string; unit?: string; dataType: string; section?: string; valueKey: string }[] = [];
    for (const item of order?.items ?? []) {
      for (const f of item.reportCatalog?.fields.filter((x) => x.isVisible) ?? []) {
        if (!f.fieldMaster) continue;
        list.push({
          itemId: item.id,
          fieldMasterId: f.fieldMasterId,
          label: f.fieldMaster.name,
          unit: f.fieldMaster.unit,
          dataType: f.fieldMaster.dataType,
          section: f.section ?? undefined,
          valueKey: `${item.id}_${f.fieldMasterId}`,
        });
      }
    }
    return list;
  }, [order]);

  const getFlag = (itemId: string, fieldMasterId: string): LabResultFlag | undefined => {
    const item = order?.items.find((i) => i.id === itemId);
    return item?.results.find((r) => r.fieldMasterId === fieldMasterId)?.flag;
  };

  const handleCollectAll = async () => {
    try {
      const o = await collectSample(orderId);
      setOrder(o);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    }
  };

  const handleSave = async () => {
    const results = fieldsToFill
      .filter((f) => draft[f.valueKey] != null && draft[f.valueKey].trim() !== "")
      .map((f) => ({
        labOrderItemId: f.itemId,
        fieldMasterId: f.fieldMasterId,
        value: draft[f.valueKey],
        note: notes[f.valueKey]?.trim() || undefined,
      }));
    if (!results.length) return alert("Enter at least one result");
    setSaving(true);
    try {
      const o = await saveResults(orderId, results);
      setOrder(o);
      const next: Record<string, string> = {};
      const nextNotes: Record<string, string> = {};
      for (const item of o.items) {
        for (const r of item.results) {
          next[`${item.id}_${r.fieldMasterId}`] = r.value;
          if (r.note) nextNotes[`${item.id}_${r.fieldMasterId}`] = r.note;
        }
      }
      setDraft(next);
      setNotes(nextNotes);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleItemComplete = async (itemId: string) => {
    try {
      const o = await markItemComplete(itemId);
      setOrder(o);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    }
  };

  if (!order) return null;

  return (
    <PageChrome
      breadcrumbs={[
        { label: "Laboratory", href: "/app/laboratory" },
        { label: "Orders", href: "/app/laboratory/orders" },
        { label: "Prepare" },
      ]}
      title={`Prepare report · ${order.patientName ?? "Unknown"}`}
      meta={`${order.patientUhid} · ${order.items.map((i) => i.label).join(", ")}`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/app/laboratory/orders" className="inline-flex h-8 items-center gap-1 rounded-md border px-3 text-[12px] font-medium hover:bg-[var(--attio-hover)]">
            <ArrowLeft className="size-3.5" />
            Back
          </Link>
          {order && (
            <LabReportActions
              orderId={order.id}
              patientId={order.patientId}
              status={order.status}
              onOrderUpdate={load}
              variant="compact"
            />
          )}
          <AttioButton variant="secondary" onClick={() => void load()} disabled={loading}>
            {loading ? "Loading..." : "Reload"}
          </AttioButton>
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-3 text-[13px]">
        <div className="rounded-lg border px-3 py-2">
          <span className="text-[var(--attio-text-tertiary)]">Status</span>
          <span className="ml-2 font-medium"><StatusBadge label={LAB_ORDER_STATUS_LABELS[order.status]} variant="info" /></span>
        </div>
        <div className="rounded-lg border px-3 py-2">
          <span className="text-[var(--attio-text-tertiary)]">Patient</span>
          <span className="ml-2 font-medium">
            {order.patientName} ({order.patientUhid}) · {order.patientAge != null ? `${order.patientAge}Y` : "—"} / {order.patientGender?.toUpperCase() ?? "—"}
          </span>
          {normalizeGender(order.patientGender) === "F" && (
            <label className="ml-3 inline-flex items-center gap-1.5 text-[12px]">
              <input
                type="checkbox"
                checked={pregnancy}
                onChange={(e) => setPregnancy(e.target.checked)}
                className="size-3.5 rounded border-[var(--attio-border)]"
              />
              Pregnant
            </label>
          )}
          <span className="ml-3 inline-flex items-center gap-1.5 text-[12px]">
            <span className="text-[var(--attio-text-tertiary)]">Blood group</span>
            <select
              value={bloodGroup}
              onChange={(e) => setBloodGroup(e.target.value)}
              className="h-7 rounded border bg-transparent px-1 text-[12px]"
            >
              <option value="">—</option>
              <option value="A+">A+</option>
              <option value="A-">A-</option>
              <option value="B+">B+</option>
              <option value="B-">B-</option>
              <option value="AB+">AB+</option>
              <option value="AB-">AB-</option>
              <option value="O+">O+</option>
              <option value="O-">O-</option>
            </select>
          </span>
          {savingMeta && <span className="ml-2 text-[10px] text-[var(--attio-text-tertiary)]">Saving...</span>}
        </div>
      </div>

      {order.status === "ordered" && (
        <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 p-3 text-[13px]">
          <div className="flex items-center gap-2 text-blue-800">
            <FlaskConical className="size-4" />
            <span className="font-medium">Samples not collected yet.</span>
          </div>
          <AttioButton className="mt-2 !h-7 !text-[11px]" onClick={() => void handleCollectAll()}>Mark all collected</AttioButton>
        </div>
      )}

      <div className="space-y-4">
        {order.items.map((item) => (
          <Panel
            key={item.id}
            title={item.label}
            action={
              <div className="flex items-center gap-2">
                <StatusBadge label={LAB_ITEM_STATUS_LABELS[item.status]} variant={item.status === "completed" ? "success" : item.status === "sample_collected" ? "warning" : "info"} />
                {item.status !== "completed" && (
                  <AttioButton className="!h-7 !text-[11px]" onClick={() => void handleItemComplete(item.id)}>
                    <Check className="size-3" />
                    Complete
                  </AttioButton>
                )}
              </div>
            }
          >
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {(item.reportCatalog?.fields ?? []).filter((f) => f.isVisible).map((f) => {
                const key = `${item.id}_${f.fieldMasterId}`;
                const flag = getFlag(item.id, f.fieldMasterId);
                const range = f.fieldMaster
                  ? getApplicableRange(
                      f.fieldMaster,
                      { gender: order.patientGender, dateOfBirth: order.patientDateOfBirth, age: order.patientAge, pregnancy: order.pregnancy },
                      new Date(),
                      item.sampleType,
                    )
                  : undefined;
                const rangeText = formatReferenceRange(range, f.fieldMaster?.unit);
                return (
                  <div key={key} className={cn("space-y-1 rounded-lg border p-3", flag && flag !== "normal" ? "border-amber-200 bg-amber-50/30" : "border-transparent")}>
                    <div className="flex items-center justify-between">
                      <Label className="text-[12px] font-medium">
                        {f.section && <span className="text-[var(--attio-text-tertiary)]">{f.section} · </span>}
                        {f.fieldMaster?.name} {f.fieldMaster?.unit ? `(${f.fieldMaster.unit})` : ""}
                      </Label>
                      {flag ? (
                        <span className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] font-medium",
                          flag === "normal" && "bg-emerald-50 text-emerald-700",
                          (flag === "low" || flag === "high") && "bg-amber-50 text-amber-700",
                          (flag === "critical_low" || flag === "critical_high") && "bg-red-50 text-red-700",
                        )}>
                          {LAB_RESULT_FLAG_LABELS[flag]}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-[11px] text-[var(--attio-text-tertiary)]">
                      Range: {rangeText}
                    </p>
                    {f.fieldMaster?.dataType === "select" && Array.isArray(f.fieldMaster.options) ? (
                      <select
                        value={draft[key] ?? ""}
                        onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))}
                        className="h-8 w-full rounded-lg border px-2 text-[13px]"
                      >
                        <option value="">Select</option>
                        {f.fieldMaster.options.map((opt: string) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        value={draft[key] ?? ""}
                        onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))}
                        placeholder={f.fieldMaster?.defaultNote ?? "Enter result"}
                        className="h-8 text-[13px]"
                      />
                    )}
                    <Input
                      value={notes[key] ?? ""}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [key]: e.target.value }))}
                      placeholder="Note"
                      className="mt-1 h-7 text-[11px]"
                    />
                  </div>
                );
              })}
            </div>
          </Panel>
        ))}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <AttioButton variant="secondary" onClick={() => void load()} disabled={loading}>Reload</AttioButton>
        <AttioButton onClick={() => void handleSave()} disabled={saving}>{saving ? "Saving..." : "Save results"}</AttioButton>
      </div>
    </PageChrome>
  );
}
