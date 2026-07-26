"use client";

import { useLabStore } from "@/components/lab/lab-store";
import { LabReportActions } from "@/components/lab/lab-report-actions";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, Panel, StatusBadge } from "@/components/frontdesk/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  LAB_DATA_TYPES,
  LAB_ITEM_STATUS_LABELS,
  LAB_ORDER_STATUS_LABELS,
  type LabDataType,
  type LabFieldMaster,
  type LabOrderItem,
  type LabReportResult,
} from "@/design-system/lab-data";
import { cn } from "@/lib/utils";
import { ArrowLeft, Check, FlaskConical } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type FieldValue = {
  value: string;
  note: string;
};

function getExistingResult(
  item: LabOrderItem,
  fieldMasterId: string,
): LabReportResult | undefined {
  return item.results.find((r) => r.fieldMasterId === fieldMasterId);
}

function getSelectOptions(field: LabFieldMaster): string[] {
  const opts = field.options;
  if (Array.isArray(opts)) return opts as string[];
  if (typeof opts === "string" && opts.trim()) return opts.split(",").map((s) => s.trim());
  return [];
}

function FieldInput({
  field,
  value,
  note,
  onChange,
  disabled,
}: {
  field: LabFieldMaster;
  value: string;
  note: string;
  onChange: (value: string, note: string) => void;
  disabled?: boolean;
}) {
  const dataType = field.dataType as LabDataType;
  const options = getSelectOptions(field);

  const input = (() => {
    if (dataType === "boolean") {
      return (
        <Select
          value={value}
          onValueChange={(v) => onChange(v ?? "", note)}
          disabled={disabled}
        >
          <SelectTrigger className="h-8 text-[13px]">
            <SelectValue placeholder="Select result" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Positive">Positive</SelectItem>
            <SelectItem value="Negative">Negative</SelectItem>
          </SelectContent>
        </Select>
      );
    }
    if (dataType === "select" && options.length > 0) {
      return (
        <Select
          value={value}
          onValueChange={(v) => onChange(v ?? "", note)}
          disabled={disabled}
        >
          <SelectTrigger className="h-8 text-[13px]">
            <SelectValue placeholder="Select result" />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    if (dataType === "note") {
      return (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value, note)}
          placeholder={field.defaultNote ?? "Enter note"}
          disabled={disabled}
          className="min-h-[80px] text-[13px]"
        />
      );
    }
    if (dataType === "numeric") {
      return (
        <Input
          type="number"
          step="any"
          value={value}
          onChange={(e) => onChange(e.target.value, note)}
          placeholder={field.unit ? `Value (${field.unit})` : "Value"}
          disabled={disabled}
          className="h-8 text-[13px]"
        />
      );
    }
    return (
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value, note)}
        placeholder={field.unit ? `Value (${field.unit})` : "Value"}
        disabled={disabled}
        className="h-8 text-[13px]"
      />
    );
  })();

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-[12px] font-medium">
          {field.name}
          {field.unit ? <span className="ml-1 text-[var(--attio-text-tertiary)]">({field.unit})</span> : null}
        </Label>
        <span className="text-[10px] uppercase text-[var(--attio-text-tertiary)]">
          {LAB_DATA_TYPES.find((t) => t.value === dataType)?.label ?? dataType}
        </span>
      </div>
      {input}
      <Input
        value={note}
        onChange={(e) => onChange(value, e.target.value)}
        placeholder="Note (optional)"
        disabled={disabled}
        className="h-7 text-[12px]"
      />
    </div>
  );
}

export default function LabPrepareDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const {
    getOrder,
    reloadOrder,
    saveResults,
    collectSample,
    markItemComplete,
    markOrderComplete,
  } = useLabStore();

  const [order, setOrder] = useState(getOrder(orderId));
  const [loading, setLoading] = useState(!order);
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState<Record<string, FieldValue>>({});

  useEffect(() => {
    if (order) return;
    let cancelled = false;
    reloadOrder(orderId)
      .then((o) => {
        if (!cancelled) setOrder(o ?? undefined);
      })
      .catch(() => {
        if (!cancelled) setOrder(undefined);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, order, reloadOrder]);

  useEffect(() => {
    if (!order) return;
    const next: Record<string, FieldValue> = {};
    for (const item of order.items) {
      for (const f of item.reportCatalog?.fields ?? []) {
        if (!f.isVisible) continue;
        const master = f.fieldMaster;
        if (!master) continue;
        const existing = getExistingResult(item, master.id);
        const key = `${item.id}:${master.id}`;
        next[key] = {
          value: existing?.value ?? "",
          note: existing?.note ?? "",
        };
      }
    }
    setValues(next);
  }, [order]);

  const finished = order?.status === "completed" || order?.status === "cancelled";

  const handleSave = async () => {
    if (!order) return;
    const results = [] as { labOrderItemId: string; fieldMasterId: string; value: string; note?: string }[];
    for (const item of order.items) {
      for (const f of item.reportCatalog?.fields ?? []) {
        if (!f.isVisible) continue;
        const master = f.fieldMaster;
        if (!master) continue;
        const key = `${item.id}:${master.id}`;
        const v = values[key];
        if (!v || !v.value.trim()) continue;
        results.push({
          labOrderItemId: item.id,
          fieldMasterId: master.id,
          value: v.value,
          note: v.note?.trim() || undefined,
        });
      }
    }
    if (results.length === 0) return alert("Enter at least one result.");
    setSaving(true);
    try {
      await saveResults(order.id, results);
      const updated = await reloadOrder(order.id);
      if (updated) setOrder(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save results");
    } finally {
      setSaving(false);
    }
  };

  const handleCollectSample = async (itemId: string) => {
    if (!order) return;
    try {
      const updated = await collectSample(order.id, [itemId]);
      setOrder(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to collect sample");
    }
  };

  const handleMarkItemComplete = async (itemId: string) => {
    if (!order) return;
    try {
      const updated = await markItemComplete(itemId);
      setOrder(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to mark item complete");
    }
  };

  const handleMarkOrderComplete = async () => {
    if (!order) return;
    if (!confirm("Mark this order complete? A PDF will be generated and pushed to the patient profile.")) return;
    try {
      const updated = await markOrderComplete(order.id);
      setOrder(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to complete order");
    }
  };

  const breadcrumbs = useMemo(
    () => [
      { label: "Laboratory", href: "/app/laboratory" },
      { label: "Prepare report", href: "/app/laboratory/prepare" },
      { label: order ? order.patientName ?? "Order" : "Order" },
    ],
    [order],
  );

  if (loading) {
    return (
      <PageChrome breadcrumbs={breadcrumbs} title="Prepare report" meta="Loading order...">
        <div className="p-6 text-[13px] text-[var(--attio-text-tertiary)]">Loading order…</div>
      </PageChrome>
    );
  }

  if (!order) {
    return (
      <PageChrome breadcrumbs={breadcrumbs} title="Prepare report" meta="Order not found">
        <div className="p-6 text-[13px] text-red-600">Order not found.</div>
      </PageChrome>
    );
  }

  return (
    <PageChrome
      breadcrumbs={breadcrumbs}
      title={`${order.patientName ?? "Unknown"} · Lab results`}
      meta={`UHID ${order.patientUhid ?? "—"} · ${LAB_ORDER_STATUS_LABELS[order.status]}`}
      actions={
        <div className="flex items-center gap-2">
          <Link
            href="/app/laboratory/prepare"
            className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-[12px] font-medium hover:bg-[var(--attio-hover)]"
          >
            <ArrowLeft className="size-3.5" />
            Back
          </Link>
          {!finished && (
            <AttioButton onClick={() => void handleSave()} disabled={saving}>
              {saving ? "Saving…" : "Save results"}
            </AttioButton>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {order.items.map((item) => (
          <Panel key={item.id} title={item.label}>
            <div className="mb-3 flex items-center gap-2 text-[12px]">
              <FlaskConical className="size-4 text-[var(--attio-text-tertiary)]" />
              <StatusBadge
                label={LAB_ITEM_STATUS_LABELS[item.status]}
                variant={
                  item.status === "completed"
                    ? "success"
                    : item.status === "sample_collected" || item.status === "in_progress"
                      ? "info"
                      : "neutral"
                }
              />
            </div>
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--attio-text-tertiary)]">
                <span>Sample: {item.sampleType ?? "—"}</span>
                {!finished && item.status === "ordered" && (
                  <AttioButton
                    variant="secondary"
                    className="!h-7 !text-[11px]"
                    onClick={() => void handleCollectSample(item.id)}
                  >
                    <FlaskConical className="size-3" />
                    Collect sample
                  </AttioButton>
                )}
                {!finished && item.status !== "completed" && (
                  <AttioButton
                    variant="secondary"
                    className="!h-7 !text-[11px]"
                    onClick={() => void handleMarkItemComplete(item.id)}
                  >
                    <Check className="size-3" />
                    Mark item complete
                  </AttioButton>
                )}
              </div>

              {item.reportCatalog?.fields?.filter((f) => f.isVisible).length ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {item.reportCatalog.fields
                    .filter((f) => f.isVisible)
                    .map((f) => {
                      const master = f.fieldMaster;
                      if (!master) return null;
                      const key = `${item.id}:${master.id}`;
                      const v = values[key] ?? { value: "", note: "" };
                      return (
                        <FieldInput
                          key={key}
                          field={master}
                          value={v.value}
                          note={v.note}
                          disabled={finished}
                          onChange={(value, note) =>
                            setValues((prev) => ({ ...prev, [key]: { value, note } }))
                          }
                        />
                      );
                    })}
                </div>
              ) : (
                <p className="text-[12px] text-[var(--attio-text-tertiary)]">
                  No report fields configured for this test.
                </p>
              )}
            </div>
          </Panel>
        ))}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--attio-border-subtle)] pt-4">
          <LabReportActions
            orderId={order.id}
            patientId={order.patientId}
            status={order.status}
            onOrderUpdate={() => void reloadOrder(order.id).then((o) => o && setOrder(o))}
          />
          {!finished && (
            <AttioButton onClick={() => void handleMarkOrderComplete()}>
              <Check className="size-3.5" />
              Mark order complete
            </AttioButton>
          )}
        </div>
      </div>
    </PageChrome>
  );
}
