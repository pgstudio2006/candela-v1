"use client";

import { Panel, StatusBadge } from "@/components/frontdesk/ui";
import type { Patient, Visit } from "@/design-system/frontdesk-data";
import type { CounsellorQueueItem } from "@/design-system/doctor-data";
import { fieldEntries, humanizeFieldKey, scribeLanguageLabel } from "@/lib/doctor-records";
import { ShieldCheck } from "lucide-react";

type HandoffPayloadViewProps = {
  item: CounsellorQueueItem;
  patient: Patient;
  visit: Visit;
};

export function HandoffPayloadView({ item, patient, visit }: HandoffPayloadViewProps) {
  const c = item.payload;
  const handoff = c.handoff ?? {};
  const recommendedPkgLabel =
    item.packageLabel ||
    (handoff.packageLabel ? String(handoff.packageLabel) : c.packageId ? String(c.packageId) : "—");
  const serviceIds = String(handoff.serviceIds ?? "")
    .split(",")
    .filter(Boolean);
  const serviceLabels = String(handoff.serviceLabels ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-[12px] text-emerald-800">
        <ShieldCheck className="size-4 shrink-0" />
        Full doctor handoff — no hidden clinical or commercial fields
      </div>

      <Panel title="Patient & visit context">
        <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
          <div><dt className="text-[var(--attio-text-tertiary)]">Patient</dt><dd className="font-medium">{patient.name} · {patient.uhid}</dd></div>
          <div><dt className="text-[var(--attio-text-tertiary)]">Doctor</dt><dd>{item.doctorName}</dd></div>
          <div><dt className="text-[var(--attio-text-tertiary)]">Mode</dt><dd className="uppercase">{item.treatmentMode}</dd></div>
          <div><dt className="text-[var(--attio-text-tertiary)]">Billing</dt><dd><StatusBadge label={visit.billing} variant={visit.billing === "paid" ? "success" : "warning"} /></dd></div>
          {visit.deferredReason && <div className="sm:col-span-2 text-amber-800">Deferred: {visit.deferredReason}</div>}
          <div><dt className="text-[var(--attio-text-tertiary)]">Priority</dt><dd><StatusBadge label={item.priority} variant={item.priority === "high" ? "warning" : "neutral"} /></dd></div>
          {recommendedPkgLabel !== "—" && (
            <div className="sm:col-span-2">
              <dt className="text-[var(--attio-text-tertiary)]">Doctor recommended package</dt>
              <dd className="font-medium text-[var(--attio-accent)]">{recommendedPkgLabel}</dd>
            </div>
          )}
          {serviceIds.length > 0 && (
            <div className="sm:col-span-2">
              <dt className="text-[var(--attio-text-tertiary)]">Doctor recommended services</dt>
              <dd className="mt-1 space-y-1">
                {serviceLabels.map((label, i) => (
                  <p key={serviceIds[i] ?? i} className="font-medium">{label}</p>
                ))}
              </dd>
            </div>
          )}
        </dl>
      </Panel>

      {fieldEntries(c.examination).length > 0 && (
        <Panel title="Examination">
          <dl className="space-y-2 text-[13px]">
            {fieldEntries(c.examination).map(([k, v]) => (
              <div key={k}><dt className="text-[11px] font-medium text-[var(--attio-text-tertiary)]">{humanizeFieldKey(k)}</dt><dd className="mt-0.5 whitespace-pre-wrap">{String(v)}</dd></div>
            ))}
          </dl>
        </Panel>
      )}

      {c.scribeTranscript && (
        <Panel title={`AI Scribe · ${scribeLanguageLabel(c.scribeLanguage)}`}>
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--attio-text-secondary)]">{c.scribeTranscript}</p>
        </Panel>
      )}

      <Panel title="Diagnosis">
        <dl className="space-y-2 text-[13px]">
          {fieldEntries(c.diagnosis).map(([k, v]) => (
            <div key={k}><dt className="text-[11px] font-medium text-[var(--attio-text-tertiary)]">{humanizeFieldKey(k)}</dt><dd>{String(v)}</dd></div>
          ))}
        </dl>
      </Panel>

      <Panel title="Treatment plan">
        <dl className="space-y-2 text-[13px]">
          {fieldEntries(c.treatment).map(([k, v]) => (
            <div key={k}><dt className="text-[11px] font-medium text-[var(--attio-text-tertiary)]">{humanizeFieldKey(k)}</dt><dd className="whitespace-pre-wrap">{String(v)}</dd></div>
          ))}
        </dl>
      </Panel>

      {c.doctorAdvice && (
        <Panel title="Doctor advice to patient">
          <p className="text-[13px]">{c.doctorAdvice}</p>
        </Panel>
      )}

      {c.counsellorNotes && (
        <Panel title="Counsellor notes from doctor">
          <p className="text-[13px]">{c.counsellorNotes}</p>
        </Panel>
      )}

      {c.handoff &&
        fieldEntries(c.handoff).filter(([k]) => !["serviceIds", "serviceLabels", "packageId", "packageLabel"].includes(k)).length > 0 && (
        <Panel title="Commercial handoff fields">
          <dl className="space-y-2 text-[13px]">
            {fieldEntries(c.handoff)
              .filter(([k]) => !["serviceIds", "serviceLabels", "packageId", "packageLabel"].includes(k))
              .map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4"><dt className="text-[var(--attio-text-tertiary)]">{humanizeFieldKey(k)}</dt><dd className="text-right">{String(v)}</dd></div>
              ))}
          </dl>
        </Panel>
      )}

      {c.prescription.length > 0 && (
        <Panel title="Prescription">
          <table className="w-full text-[12px]">
            <thead><tr className="border-b text-left text-[var(--attio-text-tertiary)]"><th className="pb-2">Medicine</th><th>Dose</th><th>Freq</th><th>Duration</th></tr></thead>
            <tbody>
              {c.prescription.map((rx) => (
                <tr key={rx.id} className="border-b border-[var(--attio-border-subtle)]"><td className="py-2">{rx.drug}</td><td>{rx.dose}</td><td>{rx.frequency}</td><td>{rx.duration}</td></tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {c.notes && (
        <Panel title="Doctor consultation notes">
          <p className="whitespace-pre-wrap text-[13px] text-[var(--attio-text-secondary)]">{c.notes}</p>
        </Panel>
      )}
    </div>
  );
}
