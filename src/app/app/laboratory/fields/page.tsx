"use client";

import { useLabStore } from "@/components/lab/lab-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, DataTable, Panel } from "@/components/frontdesk/ui";
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
import { LAB_DATA_TYPES, type LabDataType, type LabFieldMaster, type LabFieldRange } from "@/design-system/lab-data";
import { cn } from "@/lib/utils";
import { Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";

const GENDERS = [
  { value: "all", label: "All genders" },
  { value: "M", label: "Male" },
  { value: "F", label: "Female" },
  { value: "O", label: "Other" },
];

const AGE_UNITS = [
  { value: "years", label: "Years" },
  { value: "months", label: "Months" },
  { value: "days", label: "Days" },
];

const emptyRange: Partial<LabFieldRange> = {
  gender: "all",
  ageUnit: "years",
  isDefault: false,
};

const emptyField = {
  code: "",
  name: "",
  unit: "",
  dataType: "numeric" as LabDataType,
  sampleTypes: [] as string[],
  options: "",
  defaultNote: "",
  active: true,
  ranges: [] as Partial<LabFieldRange>[],
};

function toEditForm(f: LabFieldMaster): typeof emptyField & { id: string } {
  return {
    id: f.id,
    code: f.code,
    name: f.name,
    unit: f.unit ?? "",
    dataType: f.dataType,
    sampleTypes: f.sampleTypes,
    options: Array.isArray(f.options) ? f.options.join(", ") : "",
    defaultNote: f.defaultNote ?? "",
    active: f.active,
    ranges: f.ranges.length ? f.ranges : [],
  };
}

export default function LabFieldsMasterPage() {
  const { fieldMasters, saveFieldMaster, deleteFieldMaster } = useLabStore();
  const [editing, setEditing] = useState<typeof emptyField & { id?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const columns = [
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "unit", label: "Unit" },
    { key: "dataType", label: "Type" },
    { key: "ranges", label: "Ranges" },
    { key: "actions", label: "" },
  ];

  const rows = useMemo(
    () =>
      fieldMasters.map((f) => ({
        code: <span className="font-mono text-[11px]">{f.code}</span>,
        name: f.name,
        unit: f.unit ?? "—",
        dataType: f.dataType,
        ranges: (
          <span className="text-[11px] text-[var(--attio-text-tertiary)]">
            {f.ranges.length} range{f.ranges.length !== 1 ? "s" : ""}
          </span>
        ),
        actions: (
          <div className="flex items-center justify-end gap-2">
            <AttioButton variant="ghost" className="!h-7 !text-[11px]" onClick={() => setEditing(toEditForm(f))}>
              Edit
            </AttioButton>
            <AttioButton
              variant="ghost"
              className="!h-7 !text-[11px] !text-red-600"
              onClick={() => {
                if (confirm(`Delete field "${f.name}"?`)) void deleteFieldMaster(f.id);
              }}
            >
              <Trash2 className="size-3" />
            </AttioButton>
          </div>
        ),
      })),
    [fieldMasters, deleteFieldMaster],
  );

  const addRange = () => {
    if (!editing) return;
    setEditing({ ...editing, ranges: [...editing.ranges, { ...emptyRange }] });
  };

  const updateRange = (idx: number, patch: Partial<LabFieldRange>) => {
    if (!editing) return;
    const next = [...editing.ranges];
    next[idx] = { ...next[idx], ...patch };
    setEditing({ ...editing, ranges: next });
  };

  const removeRange = (idx: number) => {
    if (!editing) return;
    const next = [...editing.ranges];
    next.splice(idx, 1);
    setEditing({ ...editing, ranges: next });
  };

  const toggleSampleType = (type: string) => {
    if (!editing) return;
    const set = new Set(editing.sampleTypes);
    if (set.has(type)) set.delete(type);
    else set.add(type);
    setEditing({ ...editing, sampleTypes: Array.from(set) });
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.code.trim() || !editing.name.trim()) return alert("Code and name are required");
    setSaving(true);
    try {
      const optionsArray = editing.options
        ? editing.options
            .split(/\n|,/)
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
      await saveFieldMaster({
        id: editing.id,
        code: editing.code.trim(),
        name: editing.name.trim(),
        unit: editing.unit.trim() || undefined,
        dataType: editing.dataType,
        sampleTypes: editing.sampleTypes,
        options: editing.dataType === "select" ? optionsArray : undefined,
        defaultNote: editing.defaultNote.trim() || undefined,
        active: editing.active,
        ranges: editing.ranges.map((r) => ({
          gender: r.gender ?? "all",
          ageMin: r.ageMin != null ? Number(r.ageMin) : undefined,
          ageMax: r.ageMax != null ? Number(r.ageMax) : undefined,
          ageUnit: r.ageUnit ?? "years",
          sampleType: r.sampleType?.trim() || undefined,
          pregnancy: r.pregnancy,
          condition: r.condition?.trim() || undefined,
          low: r.low != null ? Number(r.low) : undefined,
          high: r.high != null ? Number(r.high) : undefined,
          criticalLow: r.criticalLow != null ? Number(r.criticalLow) : undefined,
          criticalHigh: r.criticalHigh != null ? Number(r.criticalHigh) : undefined,
          displayLabel: r.displayLabel?.trim() || undefined,
          isDefault: r.isDefault ?? false,
        })),
      });
      setEditing(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageChrome
      breadcrumbs={[
        { label: "Laboratory", href: "/app/laboratory" },
        { label: "Fields master" },
      ]}
      title="Lab fields master"
      meta="Test parameters, units, reference ranges, critical values"
      actions={
        <AttioButton onClick={() => setEditing({ ...emptyField })}>
          <Plus className="size-3.5" />
          Add field
        </AttioButton>
      }
    >
      <DataTable columns={columns} rows={rows} />

      {editing && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-12">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-[var(--attio-border)] bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold">{editing.id ? "Edit field" : "New field"}</h2>
              <button onClick={() => setEditing(null)}>
                <X className="size-4" />
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-[12px]">Code</Label>
                <Input value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value })} placeholder="e.g. HGB" />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label className="text-[12px]">Name</Label>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Hemoglobin" />
              </div>
              <div className="space-y-1">
                <Label className="text-[12px]">Unit</Label>
                <Input value={editing.unit} onChange={(e) => setEditing({ ...editing, unit: e.target.value })} placeholder="e.g. g/dL" />
              </div>
              <div className="space-y-1">
                <Label className="text-[12px]">Data type</Label>
                <Select value={editing.dataType} onValueChange={(v) => setEditing({ ...editing, dataType: v as LabDataType })}>
                  <SelectTrigger className="h-8 text-[13px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LAB_DATA_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[12px]">Active</Label>
                <label className="flex h-8 items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    checked={editing.active}
                    onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                  />
                  Active in catalog
                </label>
              </div>
            </div>

            <div className="mt-4 space-y-1">
              <Label className="text-[12px]">Sample types</Label>
              <div className="flex flex-wrap gap-2">
                {["Serum", "Plasma", "Whole blood", "Urine", "CSF", "Stool"].map((t) => (
                  <label key={t} className={cn(
                    "rounded-full border px-3 py-1 text-[12px] cursor-pointer",
                    editing.sampleTypes.includes(t) ? "border-[var(--attio-accent)] bg-[var(--attio-accent)]/10 text-[var(--attio-accent)]" : "border-[var(--attio-border)]"
                  )}>
                    <input type="checkbox" className="sr-only" checked={editing.sampleTypes.includes(t)} onChange={() => toggleSampleType(t)} />
                    {t}
                  </label>
                ))}
              </div>
            </div>

            {editing.dataType === "select" && (
              <div className="mt-4 space-y-1">
                <Label className="text-[12px]">Options (comma or new-line separated)</Label>
                <Textarea
                  value={editing.options}
                  onChange={(e) => setEditing({ ...editing, options: e.target.value })}
                  className="min-h-[60px] text-[13px]"
                  placeholder="Positive, Negative, Reactive, Non-reactive"
                />
              </div>
            )}

            <div className="mt-4 space-y-1">
              <Label className="text-[12px]">Default note</Label>
              <Textarea
                value={editing.defaultNote}
                onChange={(e) => setEditing({ ...editing, defaultNote: e.target.value })}
                className="min-h-[60px] text-[13px]"
                placeholder="Method note or interpretation hint"
              />
            </div>

            <Panel title="Reference ranges" className="mt-5" action={<AttioButton variant="secondary" className="!h-7 !text-[11px]" onClick={addRange}><Plus className="size-3" /> Add range</AttioButton>}>
              <div className="space-y-3">
                {editing.ranges.length === 0 && <p className="text-[12px] text-[var(--attio-text-tertiary)]">No ranges defined. Add at least one to auto-flag results.</p>}
                {editing.ranges.map((r, idx) => (
                  <div key={idx} className="grid gap-2 rounded-lg border border-[var(--attio-border-subtle)] p-3 md:grid-cols-12">
                    <div className="md:col-span-2">
                      <Label className="text-[11px]">Gender</Label>
                      <Select value={r.gender ?? "all"} onValueChange={(v) => updateRange(idx, { gender: v as LabFieldRange["gender"] })}>
                        <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {GENDERS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-[11px]">Age min</Label>
                      <Input type="number" value={r.ageMin ?? ""} onChange={(e) => updateRange(idx, { ageMin: e.target.value ? Number(e.target.value) : undefined })} className="h-8 text-[12px]" />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-[11px]">Age max</Label>
                      <Input type="number" value={r.ageMax ?? ""} onChange={(e) => updateRange(idx, { ageMax: e.target.value ? Number(e.target.value) : undefined })} className="h-8 text-[12px]" />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-[11px]">Age unit</Label>
                      <Select value={r.ageUnit ?? "years"} onValueChange={(v) => updateRange(idx, { ageUnit: v as LabFieldRange["ageUnit"] })}>
                        <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {AGE_UNITS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-[11px]">Sample type</Label>
                      <Input value={r.sampleType ?? ""} onChange={(e) => updateRange(idx, { sampleType: e.target.value })} className="h-8 text-[12px]" placeholder="e.g. Serum" />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-[11px]">Pregnancy</Label>
                      <Select
                        value={r.pregnancy == null ? "" : String(r.pregnancy)}
                        onValueChange={(v) => updateRange(idx, { pregnancy: v === "" ? undefined : v === "true" })}
                      >
                        <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Any</SelectItem>
                          <SelectItem value="true">Pregnant only</SelectItem>
                          <SelectItem value="false">Non-pregnant only</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-[11px]">Condition</Label>
                      <Input value={r.condition ?? ""} onChange={(e) => updateRange(idx, { condition: e.target.value })} className="h-8 text-[12px]" placeholder="Fasting" />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-[11px]">Low</Label>
                      <Input type="number" step="any" value={r.low ?? ""} onChange={(e) => updateRange(idx, { low: e.target.value ? Number(e.target.value) : undefined })} className="h-8 text-[12px]" />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-[11px]">High</Label>
                      <Input type="number" step="any" value={r.high ?? ""} onChange={(e) => updateRange(idx, { high: e.target.value ? Number(e.target.value) : undefined })} className="h-8 text-[12px]" />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-[11px]">Critical low</Label>
                      <Input type="number" step="any" value={r.criticalLow ?? ""} onChange={(e) => updateRange(idx, { criticalLow: e.target.value ? Number(e.target.value) : undefined })} className="h-8 text-[12px]" />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-[11px]">Critical high</Label>
                      <Input type="number" step="any" value={r.criticalHigh ?? ""} onChange={(e) => updateRange(idx, { criticalHigh: e.target.value ? Number(e.target.value) : undefined })} className="h-8 text-[12px]" />
                    </div>
                    <div className="md:col-span-3">
                      <Label className="text-[11px]">Display label</Label>
                      <Input value={r.displayLabel ?? ""} onChange={(e) => updateRange(idx, { displayLabel: e.target.value })} className="h-8 text-[12px]" placeholder="Adult Male" />
                    </div>
                    <div className="flex items-end gap-2 md:col-span-1">
                      <label className="flex h-8 items-center gap-1 text-[11px]">
                        <input type="checkbox" checked={r.isDefault} onChange={(e) => updateRange(idx, { isDefault: e.target.checked })} />
                        Default
                      </label>
                      <button type="button" onClick={() => removeRange(idx)} className="mb-1 text-red-600">
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <div className="mt-5 flex justify-end gap-2">
              <AttioButton variant="secondary" onClick={() => setEditing(null)}>Cancel</AttioButton>
              <AttioButton onClick={() => void handleSave()} disabled={saving}>{saving ? "Saving..." : "Save field"}</AttioButton>
            </div>
          </div>
        </div>
      )}
    </PageChrome>
  );
}
