"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { Panel, AttioButton } from "@/components/frontdesk/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  listLabReportTemplatesAction,
  upsertLabReportTemplateAction,
  deleteLabReportTemplateAction,
  setDefaultLabReportTemplateAction,
} from "@/app/actions/lab-actions";
import type { LabReportTemplate, LabTemplateOverlayField } from "@/design-system/lab-data";
import { cn } from "@/lib/utils";
import { FileText, Plus, Star, Trash2, Upload, X } from "lucide-react";

type MarginForm = {
  top: string;
  bottom: string;
  left: string;
  right: string;
};

const OVERLAY_FIELD_OPTIONS = [
  { key: "uhid", label: "UHID No." },
  { key: "patientName", label: "Patient Name" },
  { key: "ageGender", label: "Age / Gender" },
  { key: "bloodGroup", label: "Blood Group" },
  { key: "mobileNo", label: "Mobile No." },
  { key: "collectionTime", label: "Collection Time" },
  { key: "reportingTime", label: "Reporting Time" },
  { key: "sampleId", label: "Sample ID" },
];

function parseMargin(v: string) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function toMarginForm(n?: number): MarginForm {
  return {
    top: n != null ? String(n) : "50",
    bottom: n != null ? String(n) : "50",
    left: n != null ? String(n) : "50",
    right: n != null ? String(n) : "50",
  };
}

export default function LabSettingsPage() {
  const [templates, setTemplates] = useState<LabReportTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [fileData, setFileData] = useState<string>("");
  const [fileName, setFileName] = useState("");
  const [mimeType, setMimeType] = useState("");
  const [margins, setMargins] = useState<MarginForm>(toMarginForm());
  const [overlayFields, setOverlayFields] = useState<LabTemplateOverlayField[]>([]);
  const [isDefault, setIsDefault] = useState(false);

  const [preview, setPreview] = useState<LabReportTemplate | null>(null);

  async function loadTemplates() {
    setLoading(true);
    const result = await listLabReportTemplatesAction();
    setLoading(false);
    if (result.ok && result.data) {
      setTemplates(result.data);
      if (preview) {
        const updated = result.data.find((t) => t.id === preview.id);
        if (updated) setPreview(updated);
      }
    }
  }

  useEffect(() => {
    void loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetForm() {
    setEditingId(null);
    setName("");
    setFileData("");
    setFileName("");
    setMimeType("");
    setMargins(toMarginForm());
    setOverlayFields([]);
    setIsDefault(false);
  }

  function editTemplate(t: LabReportTemplate) {
    setEditingId(t.id);
    setName(t.name);
    setFileData(t.fileData);
    setFileName(t.name);
    setMimeType(t.mimeType);
    setMargins({
      top: String(t.marginTop),
      bottom: String(t.marginBottom),
      left: String(t.marginLeft),
      right: String(t.marginRight),
    });
    setOverlayFields(Array.isArray(t.overlayFields) ? t.overlayFields : []);
    setIsDefault(t.isDefault);
    setPreview(t);
  }

  function addOverlayField() {
    const key = OVERLAY_FIELD_OPTIONS[0].key;
    setOverlayFields((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        key,
        label: OVERLAY_FIELD_OPTIONS[0].label,
        x: 5,
        y: 5,
        width: 25,
        height: 5,
        fontSize: 9,
        align: "left" as const,
      },
    ]);
  }

  function removeOverlayField(idx: number) {
    setOverlayFields((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateOverlayField(idx: number, patch: Partial<LabTemplateOverlayField>) {
    setOverlayFields((prev) => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  }

  function updateOverlayKey(idx: number, key: string) {
    const option = OVERLAY_FIELD_OPTIONS.find((o) => o.key === key);
    updateOverlayField(idx, { key, label: option?.label ?? key });
  }

  const activePreview = useMemo(() => {
    if (!preview) return null;
    if (!editingId || editingId !== preview.id) return preview;
    return {
      ...preview,
      name,
      marginTop: parseMargin(margins.top),
      marginBottom: parseMargin(margins.bottom),
      marginLeft: parseMargin(margins.left),
      marginRight: parseMargin(margins.right),
      overlayFields,
    };
  }, [preview, editingId, name, margins, overlayFields]);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result ?? "");
      setFileData(data);
      setFileName(file.name);
      setMimeType(file.type || "application/pdf");
    };
    reader.readAsDataURL(file);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || (!fileData && !editingId)) return;

    startTransition(async () => {
      const result = await upsertLabReportTemplateAction(
        {
          name: name.trim(),
          fileData,
          mimeType,
          marginTop: parseMargin(margins.top),
          marginBottom: parseMargin(margins.bottom),
          marginLeft: parseMargin(margins.left),
          marginRight: parseMargin(margins.right),
          overlayFields,
          isDefault,
        },
        editingId ?? undefined,
      );
      if (result.ok) {
        resetForm();
        await loadTemplates();
      } else {
        window.alert(result.error || "Failed to save template");
      }
    });
  }

  function onDelete(id: string) {
    if (!window.confirm("Delete this template?")) return;
    startTransition(async () => {
      const result = await deleteLabReportTemplateAction(id);
      if (result.ok) {
        if (preview?.id === id) setPreview(null);
        await loadTemplates();
      } else {
        window.alert(result.error || "Failed to delete template");
      }
    });
  }

  function onSetDefault(id: string) {
    startTransition(async () => {
      const result = await setDefaultLabReportTemplateAction(id);
      if (result.ok) await loadTemplates();
    });
  }

  const isPdf = (t?: LabReportTemplate | null) => t?.mimeType === "application/pdf";

  return (
    <PageChrome
      breadcrumbs={[
        { label: "Laboratory", href: "/app/laboratory" },
        { label: "Settings" },
      ]}
      title="Report templates"
      meta="Upload PDF or DOC templates and set report margins with live preview"
      actions={
        <AttioButton variant="secondary" onClick={() => { resetForm(); setPreview(null); }}>
          New template
        </AttioButton>
      }
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1 space-y-4">
          <Panel title={editingId ? "Edit template" : "Add template"}>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1">
                <Label className="text-[12px]">Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" required />
              </div>

              <div className="space-y-1">
                <Label className="text-[12px]">File (PDF or DOC)</Label>
                <Input
                  type="file"
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={onFileChange}
                />
                {fileName && (
                  <p className="text-[11px] text-[var(--attio-text-tertiary)] truncate">
                    Selected: {fileName}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {(["top", "bottom", "left", "right"] as const).map((k) => (
                  <div key={k} className="space-y-1">
                    <Label className="text-[12px] capitalize">{k} margin (pt)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={margins[k]}
                      onChange={(e) => setMargins((m) => ({ ...m, [k]: e.target.value }))}
                      required
                    />
                  </div>
                ))}
              </div>

              <label className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="size-4 rounded border-[var(--attio-border)]"
                />
                Set as default template
              </label>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-[12px]">Header overlay fields</Label>
                  <AttioButton type="button" variant="secondary" onClick={addOverlayField}>
                    <Plus className="mr-1 size-3.5" />
                    Add field
                  </AttioButton>
                </div>
                {overlayFields.length === 0 && (
                  <p className="text-[11px] text-[var(--attio-text-tertiary)]">No overlay fields configured.</p>
                )}
                <div className="space-y-2">
                  {overlayFields.map((field, idx) => (
                    <div key={field.id} className="rounded border p-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <select
                          value={field.key}
                          onChange={(e) => updateOverlayKey(idx, e.target.value)}
                          className="h-8 rounded border bg-transparent px-2 text-[12px]"
                        >
                          {OVERLAY_FIELD_OPTIONS.map((o) => (
                            <option key={o.key} value={o.key}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <Input
                          value={field.label}
                          onChange={(e) => updateOverlayField(idx, { label: e.target.value })}
                          placeholder="Label"
                          className="h-8 text-[12px]"
                        />
                        <AttioButton
                          type="button"
                          variant="ghost"
                          className="!px-1.5 text-red-600"
                          onClick={() => removeOverlayField(idx)}
                        >
                          <Trash2 className="size-3.5" />
                        </AttioButton>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          { k: "x", label: "X %" },
                          { k: "y", label: "Y %" },
                          { k: "width", label: "W %" },
                          { k: "height", label: "H %" },
                        ].map(({ k, label }) => (
                          <div key={k} className="space-y-0.5">
                            <Label className="text-[10px] text-[var(--attio-text-tertiary)]">{label}</Label>
                            <Input
                              type="number"
                              step="0.1"
                              min={0}
                              max={k === "x" || k === "y" ? 100 : undefined}
                              value={String((field as any)[k] ?? "")}
                              onChange={(e) =>
                                updateOverlayField(idx, { [k]: Number(e.target.value) } as Partial<LabTemplateOverlayField>)
                              }
                              className="h-8 text-[12px]"
                            />
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-0.5">
                          <Label className="text-[10px] text-[var(--attio-text-tertiary)]">Font size</Label>
                          <Input
                            type="number"
                            min={6}
                            value={field.fontSize ?? 9}
                            onChange={(e) => updateOverlayField(idx, { fontSize: Number(e.target.value) })}
                            className="h-8 text-[12px]"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-[10px] text-[var(--attio-text-tertiary)]">Align</Label>
                          <select
                            value={field.align ?? "left"}
                            onChange={(e) =>
                              updateOverlayField(idx, { align: e.target.value as LabTemplateOverlayField["align"] })
                            }
                            className="h-8 w-full rounded border bg-transparent px-2 text-[12px]"
                          >
                            <option value="left">Left</option>
                            <option value="center">Center</option>
                            <option value="right">Right</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <AttioButton type="submit" disabled={isPending || !name.trim() || (!fileData && !editingId)}>
                  {editingId ? "Update" : "Upload"}
                </AttioButton>
                {editingId && (
                  <AttioButton type="button" variant="ghost" onClick={resetForm}>
                    Cancel
                  </AttioButton>
                )}
              </div>
            </form>
          </Panel>

          <Panel title="Templates">
            <div className="space-y-2">
              {loading ? (
                <p className="text-[13px] text-[var(--attio-text-tertiary)]">Loading...</p>
              ) : templates.length === 0 ? (
                <p className="text-[13px] text-[var(--attio-text-tertiary)]">No templates uploaded yet.</p>
              ) : (
                templates.map((t) => (
                  <div
                    key={t.id}
                    className={cn(
                      "flex items-start justify-between rounded-lg border p-3",
                      preview?.id === t.id && "bg-[var(--attio-surface)]",
                    )}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] font-medium">{t.name}</span>
                        {t.isDefault && <Star className="size-3.5 fill-amber-400 text-amber-400" />}
                      </div>
                      <p className="text-[11px] text-[var(--attio-text-tertiary)]">
                        {t.mimeType.includes("pdf") ? "PDF" : "DOC"} · T {t.marginTop} · B {t.marginBottom} · L {t.marginLeft} · R {t.marginRight}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <AttioButton variant="ghost" className="!px-1.5" onClick={() => setPreview(t)} title="Preview">
                        <FileText className="size-3.5" />
                      </AttioButton>
                      <AttioButton variant="ghost" className="!px-1.5" onClick={() => editTemplate(t)} title="Edit">
                        <Upload className="size-3.5" />
                      </AttioButton>
                      {!t.isDefault && (
                        <AttioButton variant="ghost" className="!px-1.5" onClick={() => onSetDefault(t.id)} title="Set default">
                          <Star className="size-3.5" />
                        </AttioButton>
                      )}
                      <AttioButton variant="ghost" className="!px-1.5 text-red-600" onClick={() => onDelete(t.id)} title="Delete">
                        <Trash2 className="size-3.5" />
                      </AttioButton>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>

        <div className="lg:col-span-2">
          <Panel title="Preview">
            {activePreview ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-medium">{activePreview.name}</p>
                  <AttioButton variant="ghost" className="!px-2" onClick={() => setPreview(null)}>
                    <X className="size-3.5" />
                  </AttioButton>
                </div>
                {isPdf(activePreview) ? (
                  <div className="relative h-[600px] w-full overflow-hidden rounded-lg border bg-[var(--attio-surface)]">
                    <iframe src={activePreview.fileData} className="h-full w-full" title={activePreview.name} />
                    <div
                      className="pointer-events-none absolute border-2 border-dashed border-red-400/60"
                      style={{
                        top: activePreview.marginTop,
                        bottom: activePreview.marginBottom,
                        left: activePreview.marginLeft,
                        right: activePreview.marginRight,
                      }}
                    />
                    {(activePreview.overlayFields ?? []).map((field) => (
                      <div
                        key={field.id}
                        className="pointer-events-none absolute border border-dashed border-emerald-500/70 bg-emerald-500/10 p-1 text-[10px] text-emerald-800"
                        style={{
                          left: `${field.x}%`,
                          top: `${field.y}%`,
                          width: `${field.width}%`,
                          height: `${field.height}%`,
                          fontSize: `${field.fontSize ?? 9}px`,
                          textAlign: field.align ?? "left",
                          overflow: "hidden",
                        }}
                        title={`${field.label} (${field.key})`}
                      >
                        {field.label}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border p-6 text-center">
                    <p className="text-[13px] text-[var(--attio-text-tertiary)]">
                      DOC/DOCX preview is not available. The template will be stored and used as default when supported.
                    </p>
                    <a
                      href={activePreview.fileData}
                      download={activePreview.name}
                      className="mt-2 inline-block text-[13px] font-medium text-[var(--attio-text)] underline"
                    >
                      Download file
                    </a>
                  </div>
                )}
                <p className="text-[11px] text-[var(--attio-text-tertiary)]">
                  Red dashed border shows the content margins for this template.
                </p>
              </div>
            ) : (
              <p className="text-[13px] text-[var(--attio-text-tertiary)]">
                Select or add a template to preview it. Only PDF templates can be rendered as report backgrounds.
              </p>
            )}
          </Panel>
        </div>
      </div>
    </PageChrome>
  );
}
