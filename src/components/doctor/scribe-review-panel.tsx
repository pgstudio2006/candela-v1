"use client";

import { AttioButton, Panel } from "@/components/frontdesk/ui";
import { formatPrescriptionDuration } from "@/lib/doctor-records";
import type { ScribeDraft } from "@/lib/ai/scribe-types";
import { cn } from "@/lib/utils";
import { Check, Pencil } from "lucide-react";
import { useState } from "react";

type ScribeReviewPanelProps = {
  draft: ScribeDraft;
  analyzing: boolean;
  onDraftChange: (draft: ScribeDraft) => void;
  onAccept: () => void;
  accepted?: boolean;
};

function Field({
  label,
  value,
  onChange,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  const cls =
    "mt-1 w-full rounded-lg border border-[var(--attio-border)] bg-white px-3 py-2 text-[12px] outline-none focus:border-[var(--attio-accent)]";
  return (
    <label className="block text-[11px] font-medium text-[var(--attio-text-secondary)]">
      {label}
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className={cls} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} className={cls} />
      )}
    </label>
  );
}

export function ScribeReviewPanel({ draft, analyzing, onDraftChange, onAccept, accepted }: ScribeReviewPanelProps) {
  const [editingRx, setEditingRx] = useState<number | null>(null);

  const setExam = (key: string, value: string) =>
    onDraftChange({ ...draft, examination: { ...draft.examination, [key]: value } });
  const setDx = (key: string, value: string) =>
    onDraftChange({ ...draft, diagnosis: { ...draft.diagnosis, [key]: value } });
  const setTx = (key: string, value: string) =>
    onDraftChange({ ...draft, treatment: { ...draft.treatment, [key]: value } });

  return (
    <Panel
      title="AI consult review"
      action={
        <span className="flex items-center gap-1 text-[11px] text-[var(--attio-text-tertiary)]">
          <Pencil className="size-3" />
          Edit before accept
        </span>
      }
    >
      {analyzing ? (
        <p className="py-6 text-center text-[13px] text-[var(--attio-text-secondary)]">Analyzing transcript with AI…</p>
      ) : (
        <div className="space-y-4">
          {draft.summary && (
            <p className="rounded-lg bg-[var(--attio-surface)] px-3 py-2 text-[12px] leading-relaxed text-[var(--attio-text-secondary)]">
              {draft.summary}
            </p>
          )}

          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--attio-text-tertiary)]">
              Examination
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field
                label="Chief complaint"
                value={String(draft.examination.chiefComplaint ?? "")}
                onChange={(v) => setExam("chiefComplaint", v)}
                multiline
              />
              <Field
                label="History of present illness"
                value={String(draft.examination.historyPresent ?? "")}
                onChange={(v) => setExam("historyPresent", v)}
                multiline
              />
              <Field
                label="MSK examination"
                value={String(draft.examination.mskExam ?? "")}
                onChange={(v) => setExam("mskExam", v)}
                multiline
              />
              <Field
                label="Special tests"
                value={String(draft.examination.specialTests ?? "")}
                onChange={(v) => setExam("specialTests", v)}
              />
            </div>
          </div>

          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--attio-text-tertiary)]">
              Diagnosis
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field
                label="Primary diagnosis"
                value={String(draft.diagnosis.primaryDiagnosis ?? "")}
                onChange={(v) => setDx("primaryDiagnosis", v)}
              />
              <Field
                label="ICD tag"
                value={String(draft.diagnosis.icdTag ?? "")}
                onChange={(v) => setDx("icdTag", v)}
              />
              <Field
                label="Clinical impression"
                value={String(draft.diagnosis.clinicalImpression ?? "")}
                onChange={(v) => setDx("clinicalImpression", v)}
                multiline
              />
            </div>
          </div>

          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--attio-text-tertiary)]">
              Treatment
            </p>
            <div className="grid gap-2">
              <Field label="Plan" value={String(draft.treatment.plan ?? "")} onChange={(v) => setTx("plan", v)} multiline />
              <Field label="Follow-up" value={String(draft.treatment.followUp ?? "")} onChange={(v) => setTx("followUp", v)} />
            </div>
          </div>

          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--attio-text-tertiary)]">
              Prescription ({draft.prescription.length})
            </p>
            {draft.prescription.length === 0 ? (
              <p className="text-[12px] text-[var(--attio-text-tertiary)]">No medicines extracted.</p>
            ) : (
              <ul className="space-y-2">
                {draft.prescription.map((line, idx) => (
                  <li key={idx} className="rounded-lg border border-[var(--attio-border-subtle)] p-3 text-[12px]">
                    {editingRx === idx ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Field
                          label="Drug"
                          value={line.drug}
                          onChange={(v) => {
                            const next = [...draft.prescription];
                            next[idx] = { ...line, drug: v };
                            onDraftChange({ ...draft, prescription: next });
                          }}
                        />
                        <Field
                          label="Dose"
                          value={line.dose}
                          onChange={(v) => {
                            const next = [...draft.prescription];
                            next[idx] = { ...line, dose: v };
                            onDraftChange({ ...draft, prescription: next });
                          }}
                        />
                        <Field
                          label="Frequency"
                          value={line.frequency}
                          onChange={(v) => {
                            const next = [...draft.prescription];
                            next[idx] = { ...line, frequency: v };
                            onDraftChange({ ...draft, prescription: next });
                          }}
                        />
                        <Field
                          label="Days"
                          value={String(line.days ?? "")}
                          onChange={(v) => {
                            const next = [...draft.prescription];
                            next[idx] = { ...line, days: Number(v) || 0, duration: undefined };
                            onDraftChange({ ...draft, prescription: next });
                          }}
                        />
                      </div>
                    ) : (
                      <button type="button" className="w-full text-left" onClick={() => setEditingRx(idx)}>
                        <p className="font-medium">{line.drug}</p>
                        <p className="mt-0.5 text-[var(--attio-text-tertiary)]">
                          {line.dose} · {line.frequency} · {formatPrescriptionDuration(line)}
                        </p>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <AttioButton variant="primary" className="w-full gap-1.5" disabled={accepted} onClick={onAccept}>
            <Check className="size-3.5" />
            {accepted ? "Applied to consult" : "Accept & fill all fields"}
          </AttioButton>

          {accepted && (
            <p className="text-[11px] text-emerald-600">
              Examination, diagnosis, treatment, and prescription updated from scribe review.
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}
