"use client";

import {
  deleteDocumentTemplateAction,
  listDocumentTemplatesAction,
  saveDocumentTemplateAction,
} from "@/app/actions/doctor-actions";
import type {
  DocumentTemplate,
  DocumentTemplateKind,
  DocumentTemplateOverlayField,
} from "@/design-system/document-templates";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, Panel } from "@/components/frontdesk/ui";
import { GripVertical, Plus, Save, Star, Trash2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const KINDS: Array<{ value: DocumentTemplateKind; label: string; hint: string }> = [
  { value: "invoice", label: "Bill / Invoice", hint: "Billing invoice and receipt output" },
  { value: "prescription", label: "Prescription", hint: "Doctor prescription output" },
  { value: "lab_report", label: "Lab report", hint: "Laboratory report background" },
  { value: "file_sticker", label: "Patient file sticker", hint: "Patient file label sheet" },
  { value: "room_plate", label: "Room plate", hint: "IPD bed and patient plate" },
  { value: "ipd_overview", label: "IPD file overview", hint: "Inpatient file cover or overview" },
  { value: "discharge_summary", label: "Discharge summary", hint: "Discharge summary document" },
  { value: "consult_summary", label: "Consult summary", hint: "Full consultation record" },
];

const FIELD_CATEGORIES = ["Patient", "Clinical", "IPD", "Lab", "Branch"] as const;

const FIELDS = [
  { key: "patientName", label: "Patient name", category: "Patient" },
  { key: "uhid", label: "UHID number", category: "Patient" },
  { key: "ageGender", label: "Age / Gender", category: "Patient" },
  { key: "bloodGroup", label: "Blood group", category: "Patient" },
  { key: "mobileNo", label: "Mobile number", category: "Patient" },
  { key: "phone", label: "Phone", category: "Patient" },
  { key: "dateOfBirth", label: "Date of birth", category: "Patient" },
  { key: "doctorName", label: "Doctor name", category: "Clinical" },
  { key: "orderedBy", label: "Ordered by", category: "Clinical" },
  { key: "diagnosis", label: "Diagnosis", category: "Clinical" },
  { key: "ward", label: "Ward", category: "IPD" },
  { key: "bed", label: "Bed", category: "IPD" },
  { key: "admissionDate", label: "Admission date", category: "IPD" },
  { key: "dischargeDate", label: "Discharge date", category: "IPD" },
  { key: "collectionTime", label: "Collection time", category: "Lab" },
  { key: "reportingTime", label: "Reporting time", category: "Lab" },
  { key: "sampleId", label: "Sample ID", category: "Lab" },
  { key: "orderId", label: "Order ID", category: "Lab" },
  { key: "sampleType", label: "Sample type", category: "Lab" },
  { key: "pregnancy", label: "Pregnancy", category: "Lab" },
  { key: "orderDate", label: "Order date", category: "Lab" },
  { key: "branchName", label: "Branch name", category: "Branch" },
  { key: "branchAddress", label: "Branch address", category: "Branch" },
  { key: "branchPhone", label: "Branch phone", category: "Branch" },
] as const;

type MarginForm = { top: string; bottom: string; left: string; right: string };

const emptyMargins = (): MarginForm => ({ top: "50", bottom: "50", left: "50", right: "50" });
const parseMargin = (value: string) => Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);
const labelFor = (kind: DocumentTemplateKind) => KINDS.find((item) => item.value === kind)?.label ?? kind;

export default function AdminTemplatesPage() {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [kind, setKind] = useState<DocumentTemplateKind>("invoice");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [fileData, setFileData] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [mimeType, setMimeType] = useState("");
  const [margins, setMargins] = useState<MarginForm>(emptyMargins());
  const [fields, setFields] = useState<DocumentTemplateOverlayField[]>([]);
  const [isDefault, setIsDefault] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const previewRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const active = useMemo(() => templates.find((template) => template.id === activeId) ?? null, [templates, activeId]);

  async function load() {
    setLoading(true);
    const result = await listDocumentTemplatesAction();
    if (!result.ok) setError(result.error ?? "Could not load templates.");
    else setTemplates(result.data);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  function reset() {
    setActiveId(null);
    setKind("invoice");
    setLabel("");
    setDescription("");
    setFileData(null);
    setFileName("");
    setMimeType("");
    setMargins(emptyMargins());
    setFields([]);
    setIsDefault(false);
    setEnabled(true);
    setError("");
  }

  function edit(template: DocumentTemplate) {
    setActiveId(template.id);
    setKind(template.kind);
    setLabel(template.label);
    setDescription(template.description);
    setFileData(template.fileData ?? null);
    setFileName(template.label);
    setMimeType(template.mimeType ?? "application/pdf");
    setMargins({
      top: String(template.marginTop ?? 50),
      bottom: String(template.marginBottom ?? 50),
      left: String(template.marginLeft ?? 50),
      right: String(template.marginRight ?? 50),
    });
    setFields(template.overlayFields ?? []);
    setIsDefault(Boolean(template.isDefault));
    setEnabled(template.enabled);
    setError("");
  }

  function addField(key = "patientName") {
    const option = FIELDS.find((f) => f.key === key) ?? FIELDS[0];
    setFields((current) => [...current, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      key: option.key, label: option.label, x: 8, y: 8 + current.length * 8, width: 32, height: 5,
      fontSize: 10, align: "left", fontStyle: "normal", color: "#1a1a1a", wrap: false, zIndex: current.length,
    }]);
  }

  function updateField(id: string, patch: Partial<DocumentTemplateOverlayField>) {
    setFields((current) => current.map((field) => field.id === id ? { ...field, ...patch } : field));
  }

  function duplicateField(id: string) {
    setFields((current) => {
      const original = current.find((f) => f.id === id);
      if (!original) return current;
      const idx = current.indexOf(original);
      const clone: DocumentTemplateOverlayField = {
        ...original,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        x: Math.min(100, original.x + 2),
        y: Math.min(100, original.y + 2),
        zIndex: current.length,
      };
      return [...current.slice(0, idx + 1), clone, ...current.slice(idx + 1)];
    });
  }

  function moveField(id: string, delta: number) {
    setFields((current) => {
      const idx = current.findIndex((f) => f.id === id);
      if (idx < 0) return current;
      const newIndex = Math.max(0, Math.min(current.length - 1, idx + delta));
      const next = [...current];
      const [item] = next.splice(idx, 1);
      next.splice(newIndex, 0, item);
      return next.map((f, i) => ({ ...f, zIndex: i }));
    });
  }

  function startDrag(event: React.PointerEvent<HTMLDivElement>, field: DocumentTemplateOverlayField) {
    const rect = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!rect) return;
    dragging.current = { id: field.id, dx: event.clientX - rect.left - (field.x / 100) * rect.width, dy: event.clientY - rect.top - (field.y / 100) * rect.height };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: React.PointerEvent<HTMLDivElement>) {
    const current = dragging.current;
    const rect = previewRef.current?.getBoundingClientRect();
    if (!current || !rect) return;
    updateField(current.id, {
      x: Math.max(0, Math.min(100, ((event.clientX - rect.left - current.dx) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((event.clientY - rect.top - current.dy) / rect.height) * 100)),
    });
  }

  function stopDrag() { dragging.current = null; }

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setFileData(String(reader.result ?? "")); setFileName(file.name); setMimeType(file.type || "application/pdf"); };
    reader.readAsDataURL(file);
  }

  async function save() {
    if (!label.trim() || (!fileData && !activeId)) return;
    setSaving(true);
    setError("");
    const layout: DocumentTemplate["layout"] = fileData
      ? (mimeType.startsWith("image/") ? "uploaded-image" : "uploaded-pdf")
      : "navayu-letterhead";
    const template: DocumentTemplate = {
      id: activeId ?? `doc_admin_${Date.now()}`,
      kind, label: label.trim(), layout, description: description.trim(),
      fileData, mimeType, marginTop: parseMargin(margins.top), marginBottom: parseMargin(margins.bottom),
      marginLeft: parseMargin(margins.left), marginRight: parseMargin(margins.right), overlayFields: fields,
      isDefault, enabled, isSystem: false,
    };
    const result = await saveDocumentTemplateAction(template);
    if (result.ok) { await load(); setActiveId(template.id); }
    else setError(result.error ?? "Could not save template.");
    setSaving(false);
  }

  async function remove(template: DocumentTemplate) {
    if (template.isSystem || !window.confirm(`Delete ${template.label}?`)) return;
    const result = await deleteDocumentTemplateAction(template.id);
    if (result.ok) { if (activeId === template.id) reset(); await load(); }
    else setError(result.error ?? "Could not delete template.");
  }

  return (
    <PageChrome breadcrumbs={[{ label: "Admin", href: "/app/admin" }, { label: "Template Studio" }]} title="Template Studio" meta="Upload, position, preview, and manage branch templates">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--attio-border)] bg-[var(--attio-surface)] p-3">
        <div><p className="text-[13px] font-semibold">Admin-only document templates</p><p className="text-[12px] text-[var(--attio-text-secondary)]">Templates are saved to the active branch and do not change another branch.</p></div>
        <AttioButton variant="primary" onClick={reset}><Plus className="mr-1.5 size-3.5" />Fresh template</AttioButton>
      </div>
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</div>}
      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)_340px]">
        <Panel title="Saved templates">
          {loading ? <p className="text-[12px] text-[var(--attio-text-secondary)]">Loading templates…</p> : templates.length === 0 ? <p className="text-[12px] text-[var(--attio-text-secondary)]">No custom templates yet. Create the first one.</p> : <div className="space-y-1.5">{templates.map((template) => <div key={template.id} className={`flex items-center gap-2 rounded-md border p-2 ${activeId === template.id ? "border-[var(--attio-accent)] bg-[var(--attio-surface)]" : "border-[var(--attio-border)]"}`}><button type="button" onClick={() => edit(template)} className="min-w-0 flex-1 text-left"><p className="truncate text-[12px] font-medium">{template.label}</p><p className="truncate text-[10px] text-[var(--attio-text-secondary)]">{labelFor(template.kind)}</p></button>{template.isDefault && <Star className="size-3 fill-amber-400 text-amber-500" />}{!template.isSystem && <button type="button" onClick={() => void remove(template)} className="text-red-600" aria-label={`Delete ${template.label}`}><Trash2 className="size-3.5" /></button>}</div>)}</div>}
        </Panel>
        <Panel title={activeId ? "Edit template" : "Create template"}>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2"><label className="text-[12px]">Template type<select value={kind} onChange={(event) => setKind(event.target.value as DocumentTemplateKind)} className="mt-1 h-9 w-full rounded-md border border-[var(--attio-border)] bg-white px-2">{KINDS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className="text-[12px]">Name<input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Pataudi discharge format" className="mt-1 h-9 w-full rounded-md border border-[var(--attio-border)] px-2" /></label></div>
            <label className="block text-[12px]">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} className="mt-1 w-full rounded-md border border-[var(--attio-border)] px-2 py-1.5" /></label>
            <label className="block text-[12px]">Template file <input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={onFileChange} className="mt-1 block w-full text-[12px]" />{fileName && <span className="mt-1 block truncate text-[11px] text-[var(--attio-text-secondary)]">Selected: {fileName}</span>}</label>
            <div><p className="mb-2 text-[12px] font-medium">Print margins (points)</p><div className="grid grid-cols-2 gap-2">{(["top", "bottom", "left", "right"] as const).map((side) => <label key={side} className="text-[11px] capitalize">{side}<input type="number" min={0} value={margins[side]} onChange={(event) => setMargins((current) => ({ ...current, [side]: event.target.value }))} className="mt-1 h-8 w-full rounded border border-[var(--attio-border)] px-2" /></label>)}</div></div>
            <div className="flex flex-wrap gap-3 text-[12px]"><label className="flex items-center gap-2"><input type="checkbox" checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} />Default for this document type</label><label className="flex items-center gap-2"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />Enabled</label></div>
            <div className="flex flex-wrap gap-2"><AttioButton variant="primary" onClick={() => void save()} disabled={saving || !label.trim() || (!fileData && !activeId)}><Save className="mr-1.5 size-3.5" />{saving ? "Saving…" : activeId ? "Save changes" : "Create template"}</AttioButton><AttioButton variant="secondary" onClick={reset}><X className="mr-1.5 size-3.5" />Clear</AttioButton></div>
          </div>
        </Panel>
        <Panel title="Visual placement">
          <div ref={previewRef} onPointerMove={moveDrag} onPointerUp={stopDrag} onPointerLeave={stopDrag} className="relative aspect-[0.707] overflow-hidden rounded-md border border-[var(--attio-border)] bg-white">
            {fileData && mimeType.startsWith("image/") ? <img src={fileData} alt="Template preview" className="pointer-events-none absolute inset-0 h-full w-full object-contain" /> : fileData && mimeType.includes("pdf") ? <iframe src={fileData} title="Template preview" className="pointer-events-none absolute inset-0 h-full w-full" /> : <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-[12px] text-[var(--attio-text-secondary)]"><div><Upload className="mx-auto mb-2 size-6" /><p>Upload a PDF or image to see the live canvas.</p><p className="mt-1 text-[10px]">Then drag each field into its exact position.</p></div></div>}
            {fields.slice().sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)).map((field) => <div key={field.id} onPointerDown={(event) => startDrag(event, field)} className="absolute cursor-move select-none border border-emerald-500 bg-emerald-100/80 px-1 py-0.5 text-[10px] text-emerald-900 shadow-sm" style={{ left: `${field.x}%`, top: `${field.y}%`, width: `${field.width}%`, minHeight: `${field.height}%`, fontSize: `${field.fontSize ?? 10}px`, textAlign: field.align ?? "left", zIndex: field.zIndex ?? 0, color: field.color ?? "#1a1a1a", fontWeight: (field.fontStyle ?? "").includes("bold") ? 700 : 400, fontStyle: (field.fontStyle ?? "").includes("italic") ? "italic" : "normal" }}><GripVertical className="mr-0.5 inline size-2.5" />{field.label}</div>)}
          </div>
          <div className="mt-3 flex items-center justify-between"><p className="text-[11px] text-[var(--attio-text-secondary)]">Drag fields on the page preview.</p><AttioButton variant="secondary" onClick={() => addField()}><Plus className="mr-1 size-3.5" />Add field</AttioButton></div>
          <div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto">
            {fields.map((field) => (
              <div key={field.id} className="rounded-md border border-[var(--attio-border)] p-2">
                <div className="flex items-center gap-2">
                  <select
                    value={field.key}
                    onChange={(event) => {
                      const option = FIELDS.find((f) => f.key === event.target.value);
                      updateField(field.id, { key: event.target.value, label: option?.label ?? event.target.value });
                    }}
                    className="h-7 min-w-0 flex-1 rounded border border-[var(--attio-border)] px-1 text-[11px]"
                  >
                    {FIELD_CATEGORIES.map((category) => (
                      <optgroup key={category} label={category}>
                        {FIELDS.filter((f) => f.category === category).map((f) => (
                          <option key={f.key} value={f.key}>{f.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <button type="button" onClick={() => duplicateField(field.id)} className="text-emerald-600" aria-label={`Duplicate ${field.label}`} title="Duplicate">
                    <Plus className="size-3.5" />
                  </button>
                  <button type="button" onClick={() => moveField(field.id, -1)} className="text-[var(--attio-text-secondary)]" aria-label={`Move ${field.label} up`} title="Move up">↑</button>
                  <button type="button" onClick={() => moveField(field.id, 1)} className="text-[var(--attio-text-secondary)]" aria-label={`Move ${field.label} down`} title="Move down">↓</button>
                  <button type="button" onClick={() => setFields((current) => current.filter((item) => item.id !== field.id))} className="text-red-600" aria-label={`Remove ${field.label}`}><Trash2 className="size-3.5" /></button>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-1">
                  {(["x", "y", "width", "height"] as const).map((key) => (
                    <label key={key} className="text-[9px] uppercase text-[var(--attio-text-secondary)]">
                      {key}
                      <input type="number" min={0} max={key === "x" || key === "y" ? 100 : undefined} value={field[key]} onChange={(event) => updateField(field.id, { [key]: Number(event.target.value) })} className="mt-0.5 h-7 w-full rounded border border-[var(--attio-border)] px-1 text-[10px]" />
                    </label>
                  ))}
                </div>
                <div className="mt-2 grid grid-cols-5 gap-1">
                  <label className="text-[9px] text-[var(--attio-text-secondary)]">
                    Font
                    <input type="number" min={6} max={72} value={field.fontSize ?? 10} onChange={(event) => updateField(field.id, { fontSize: Number(event.target.value) })} className="mt-0.5 h-7 w-full rounded border border-[var(--attio-border)] px-1 text-[10px]" />
                  </label>
                  <label className="text-[9px] text-[var(--attio-text-secondary)]">
                    Style
                    <select value={field.fontStyle ?? "normal"} onChange={(event) => updateField(field.id, { fontStyle: event.target.value as DocumentTemplateOverlayField["fontStyle"] })} className="mt-0.5 h-7 w-full rounded border border-[var(--attio-border)] px-1 text-[10px]">
                      <option value="normal">Normal</option>
                      <option value="bold">Bold</option>
                      <option value="italic">Italic</option>
                      <option value="bold-italic">Bold+Italic</option>
                    </select>
                  </label>
                  <label className="text-[9px] text-[var(--attio-text-secondary)]">
                    Align
                    <select value={field.align ?? "left"} onChange={(event) => updateField(field.id, { align: event.target.value as DocumentTemplateOverlayField["align"] })} className="mt-0.5 h-7 w-full rounded border border-[var(--attio-border)] px-1 text-[10px]">
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </label>
                  <label className="text-[9px] text-[var(--attio-text-secondary)]">
                    Color
                    <input type="color" value={field.color ?? "#1a1a1a"} onChange={(event) => updateField(field.id, { color: event.target.value })} className="mt-0.5 h-7 w-full rounded border border-[var(--attio-border)] px-0.5 text-[10px]" />
                  </label>
                  <label className="text-[9px] text-[var(--attio-text-secondary)]">
                    Layer
                    <input type="number" value={field.zIndex ?? 0} onChange={(event) => updateField(field.id, { zIndex: Number(event.target.value) })} className="mt-0.5 h-7 w-full rounded border border-[var(--attio-border)] px-1 text-[10px]" />
                  </label>
                </div>
                <div className="mt-2 flex items-center gap-3 text-[11px]">
                  <label className="flex items-center gap-1.5 text-[var(--attio-text-secondary)]">
                    <input type="checkbox" checked={field.wrap ?? false} onChange={(event) => updateField(field.id, { wrap: event.target.checked })} />
                    Wrap text
                  </label>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </PageChrome>
  );
}
