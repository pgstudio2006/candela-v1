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
import type { LabReportCatalog, LabReportCatalogField } from "@/design-system/lab-data";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";

type ReportFormField = {
  id?: string;
  fieldMasterId: string;
  section: string;
  sortOrder: number;
  isVisible: boolean;
};

type ReportForm = {
  id?: string;
  code: string;
  name: string;
  description: string;
  sampleType: string;
  headerNote: string;
  footerNote: string;
  active: boolean;
  fields: ReportFormField[];
};

export default function LabReportCatalogPage() {
  const { reportCatalogs, fieldMasters, saveReportCatalog, deleteReportCatalog } = useLabStore();
  const [editing, setEditing] = useState<ReportForm | null>(null);
  const [saving, setSaving] = useState(false);

  const columns = [
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "sampleType", label: "Sample" },
    { key: "fields", label: "Fields" },
    { key: "actions", label: "" },
  ];

  const rows = useMemo(
    () =>
      reportCatalogs.map((c) => ({
        code: <span className="font-mono text-[11px]">{c.code}</span>,
        name: c.name,
        sampleType: c.sampleType ?? "—",
        fields: (
          <span className="text-[11px] text-[var(--attio-text-tertiary)]">
            {c.fields.length} field{c.fields.length !== 1 ? "s" : ""}
          </span>
        ),
        actions: (
          <div className="flex items-center justify-end gap-2">
            <AttioButton variant="ghost" className="!h-7 !text-[11px]" onClick={() => setEditing(toEditForm(c))}>
              Edit
            </AttioButton>
            <AttioButton
              variant="ghost"
              className="!h-7 !text-[11px] !text-red-600"
              onClick={() => {
                if (confirm(`Delete report "${c.name}"?`)) void deleteReportCatalog(c.id);
              }}
            >
              <Trash2 className="size-3" />
            </AttioButton>
          </div>
        ),
      })),
    [reportCatalogs, deleteReportCatalog],
  );

  const toEditForm = (c?: LabReportCatalog): ReportForm => {
    if (!c) {
      return { code: "", name: "", description: "", sampleType: "", headerNote: "", footerNote: "", active: true, fields: [] };
    }
    return {
      id: c.id,
      code: c.code,
      name: c.name,
      description: c.description ?? "",
      sampleType: c.sampleType ?? "",
      headerNote: c.headerNote ?? "",
      footerNote: c.footerNote ?? "",
      active: c.active,
      fields: c.fields.map((f) => ({
        id: f.id,
        fieldMasterId: f.fieldMasterId,
        section: f.section ?? "",
        sortOrder: f.sortOrder,
        isVisible: f.isVisible,
      })),
    };
  };

  const addField = () => {
    if (!editing) return;
    setEditing({
      ...editing,
      fields: [
        ...editing.fields,
        { fieldMasterId: fieldMasters[0]?.id ?? "", section: "", sortOrder: editing.fields.length, isVisible: true },
      ],
    });
  };

  const updateField = (idx: number, patch: Partial<ReportFormField>) => {
    if (!editing) return;
    const next = [...editing.fields];
    next[idx] = { ...next[idx], ...patch };
    setEditing({ ...editing, fields: next });
  };

  const removeField = (idx: number) => {
    if (!editing) return;
    const next = [...editing.fields];
    next.splice(idx, 1);
    setEditing({ ...editing, fields: next });
  };

  const moveField = (idx: number, dir: -1 | 1) => {
    if (!editing) return;
    const next = [...editing.fields];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    const [moved] = next.splice(idx, 1);
    next.splice(target, 0, moved);
    setEditing({
      ...editing,
      fields: next.map((f, i) => ({ ...f, sortOrder: i })),
    });
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.code.trim() || !editing.name.trim()) return alert("Code and name are required");
    setSaving(true);
    try {
      await saveReportCatalog({
        id: editing.id,
        code: editing.code.trim(),
        name: editing.name.trim(),
        description: editing.description.trim() || undefined,
        sampleType: editing.sampleType.trim() || undefined,
        headerNote: editing.headerNote.trim() || undefined,
        footerNote: editing.footerNote.trim() || undefined,
        active: editing.active,
        fields: editing.fields.map((f) => ({
          id: f.id,
          fieldMasterId: f.fieldMasterId,
          section: f.section?.trim() || undefined,
          sortOrder: f.sortOrder,
          isVisible: f.isVisible,
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
        { label: "Report catalog" },
      ]}
      title="Lab report catalog"
      meta="Combine fields into printable report profiles"
      actions={
        <AttioButton onClick={() => setEditing(toEditForm())}>
          <Plus className="size-3.5" />
          Add report
        </AttioButton>
      }
    >
      <DataTable columns={columns} rows={rows} />

      {editing && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-12">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-[var(--attio-border)] bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold">{editing.id ? "Edit report" : "New report"}</h2>
              <button onClick={() => setEditing(null)}>
                <X className="size-4" />
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-[12px]">Code</Label>
                <Input value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value })} placeholder="e.g. CBC" />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label className="text-[12px]">Name</Label>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Complete Blood Count" />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label className="text-[12px]">Description</Label>
                <Input value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="Short description" />
              </div>
              <div className="space-y-1">
                <Label className="text-[12px]">Default sample type</Label>
                <Input value={editing.sampleType} onChange={(e) => setEditing({ ...editing, sampleType: e.target.value })} placeholder="e.g. Whole blood" />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label className="text-[12px]">Header note</Label>
                <Textarea value={editing.headerNote} onChange={(e) => setEditing({ ...editing, headerNote: e.target.value })} className="min-h-[50px] text-[13px]" />
              </div>
              <div className="space-y-1">
                <Label className="text-[12px]">Active</Label>
                <label className="flex h-8 items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
                  Active
                </label>
              </div>
              <div className="space-y-1 md:col-span-3">
                <Label className="text-[12px]">Footer note</Label>
                <Textarea value={editing.footerNote} onChange={(e) => setEditing({ ...editing, footerNote: e.target.value })} className="min-h-[50px] text-[13px]" />
              </div>
            </div>

            <Panel title="Fields" className="mt-5" action={<AttioButton variant="secondary" className="!h-7 !text-[11px]" onClick={addField}><Plus className="size-3" /> Add field</AttioButton>}>
              <div className="space-y-2">
                {editing.fields.length === 0 && <p className="text-[12px] text-[var(--attio-text-tertiary)]">No fields added.</p>}
                {editing.fields.map((f, idx) => (
                  <div key={idx} className="grid items-end gap-2 rounded-lg border border-[var(--attio-border-subtle)] p-2 md:grid-cols-12">
                    <div className="md:col-span-4">
                      <Label className="text-[11px]">Field</Label>
                      <Select value={f.fieldMasterId} onValueChange={(v) => { if (v) updateField(idx, { fieldMasterId: v }); }}>
                        <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {fieldMasters.filter((fm) => fm.active).map((fm) => (
                            <SelectItem key={fm.id} value={fm.id}>{fm.name} ({fm.code})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-3">
                      <Label className="text-[11px]">Section</Label>
                      <Input value={f.section ?? ""} onChange={(e) => updateField(idx, { section: e.target.value })} className="h-8 text-[12px]" placeholder="e.g. Hematology" />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-[11px]">Order</Label>
                      <Input type="number" value={f.sortOrder} onChange={(e) => updateField(idx, { sortOrder: Number(e.target.value) })} className="h-8 text-[12px]" />
                    </div>
                    <div className="md:col-span-1 flex items-center justify-center pb-2">
                      <label className="flex items-center gap-1 text-[11px]">
                        <input type="checkbox" checked={f.isVisible} onChange={(e) => updateField(idx, { isVisible: e.target.checked })} />
                        Show
                      </label>
                    </div>
                    <div className="md:col-span-2 flex items-center justify-end gap-1 pb-1">
                      <button type="button" onClick={() => moveField(idx, -1)} disabled={idx === 0} className="rounded p-1 hover:bg-[var(--attio-hover)] disabled:opacity-30">
                        <ArrowUp className="size-3.5" />
                      </button>
                      <button type="button" onClick={() => moveField(idx, 1)} disabled={idx === editing.fields.length - 1} className="rounded p-1 hover:bg-[var(--attio-hover)] disabled:opacity-30">
                        <ArrowDown className="size-3.5" />
                      </button>
                      <button type="button" onClick={() => removeField(idx)} className="rounded p-1 text-red-600 hover:bg-red-50">
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <div className="mt-5 flex justify-end gap-2">
              <AttioButton variant="secondary" onClick={() => setEditing(null)}>Cancel</AttioButton>
              <AttioButton onClick={() => void handleSave()} disabled={saving}>{saving ? "Saving..." : "Save report"}</AttioButton>
            </div>
          </div>
        </div>
      )}
    </PageChrome>
  );
}
