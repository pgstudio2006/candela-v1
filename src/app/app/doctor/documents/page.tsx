"use client";

import {
  type DocumentTemplate,
  type DocumentTemplateKind,
} from "@/design-system/document-templates";
import { useDoctorStore } from "@/components/doctor/doctor-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, Panel, StatusBadge } from "@/components/frontdesk/ui";
import { cn } from "@/lib/utils";
import { FileText, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const KIND_LABELS: Record<DocumentTemplateKind, string> = {
  prescription: "Prescription",
  invoice: "Invoice",
  consult_summary: "Consult summary",
  lab_report: "Lab report",
  file_sticker: "Patient file sticker",
  room_plate: "Room plate",
  ipd_overview: "IPD file overview",
  discharge_summary: "Discharge summary",
};

export default function DoctorDocumentTemplatesPage() {
  const { documentTemplates, addDocumentTemplate, saveDocumentTemplate } = useDoctorStore();
  const [showAdd, setShowAdd] = useState(false);
  const [kind, setKind] = useState<DocumentTemplateKind>("prescription");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");

  return (
    <PageChrome
      breadcrumbs={[
        { label: "Doctor", href: "/app/doctor" },
        { label: "Document templates" },
      ]}
      title="Print & document templates"
      meta="Navayu letterhead · prescription · invoice · add more layouts"
      actions={
        <AttioButton variant="primary" className="gap-1.5" onClick={() => setShowAdd(true)}>
          <Plus className="size-3.5" />
          Add template
        </AttioButton>
      }
    >
      <Panel title="Reference letterhead" className="mb-4">
        <p className="mb-3 text-[13px] text-[var(--attio-text-secondary)]">
          Based on your Navayu invoice/prescription PDF. All printouts use this letterhead layout.
        </p>
        <Link
          href="/templates/invoice-reference.png"
          target="_blank"
          className="inline-flex items-center gap-1.5 text-[12px] text-[var(--attio-accent)]"
        >
          <FileText className="size-3.5" />
          View original reference PDF (rendered)
        </Link>
      </Panel>

      {showAdd && (
        <Panel title="Add document template" className="mb-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-[12px]">
              <span className="mb-1 block text-[var(--attio-text-tertiary)]">Type</span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as DocumentTemplateKind)}
                className="w-full rounded-md border border-[var(--attio-border)] px-3 py-2 text-[13px]"
              >
                {Object.entries(KIND_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
            <label className="text-[12px]">
              <span className="mb-1 block text-[var(--attio-text-tertiary)]">Label</span>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full rounded-md border border-[var(--attio-border)] px-3 py-2 text-[13px]"
                placeholder="e.g. Navayu Rx — Wellness"
              />
            </label>
            <label className="text-[12px] sm:col-span-2">
              <span className="mb-1 block text-[var(--attio-text-tertiary)]">Description</span>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-md border border-[var(--attio-border)] px-3 py-2 text-[13px]"
              />
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <AttioButton
              variant="primary"
              disabled={!label.trim()}
              onClick={() => {
                addDocumentTemplate(kind, label.trim(), description.trim());
                setLabel("");
                setDescription("");
                setShowAdd(false);
              }}
            >
              Save
            </AttioButton>
            <AttioButton variant="secondary" onClick={() => setShowAdd(false)}>
              Cancel
            </AttioButton>
          </div>
        </Panel>
      )}

      <div className="grid gap-3">
        {documentTemplates.map((tpl) => (
          <div
            key={tpl.id}
            className={cn(
              "flex items-center justify-between rounded-lg border border-[var(--attio-border)] bg-white px-4 py-3",
              !tpl.enabled && "opacity-60",
            )}
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[13px] font-medium">{tpl.label}</p>
                <StatusBadge label={KIND_LABELS[tpl.kind]} variant="info" />
                {tpl.isSystem && <StatusBadge label="System" variant="neutral" />}
              </div>
              <p className="mt-0.5 text-[12px] text-[var(--attio-text-tertiary)]">{tpl.description}</p>
              <p className="text-[11px] text-[var(--attio-text-tertiary)]">Layout: Navayu letterhead</p>
            </div>
            <label className="flex items-center gap-2 text-[12px] text-[var(--attio-text-secondary)]">
              <input
                type="checkbox"
                checked={tpl.enabled}
                onChange={(e) => {
                  saveDocumentTemplate({ ...tpl, enabled: e.target.checked });
                }}
              />
              Enabled
            </label>
          </div>
        ))}
      </div>
    </PageChrome>
  );
}
