"use client";

import { StatusBadge } from "@/components/frontdesk/ui";
import type { NursingHandoffPayload } from "@/design-system/nurse-data";
import type { Patient, Visit } from "@/design-system/frontdesk-data";
import { CONSENT_TEMPLATES } from "@/design-system/nurse-data";

type NursingHandoffViewProps = {
  handoff: NursingHandoffPayload;
  patient?: Patient;
  visit?: Visit;
};

export function NursingHandoffView({ handoff, patient, visit }: NursingHandoffViewProps) {
  const consult = handoff.consultation;
  const netAmount = visit?.billAmount ?? handoff.netAmount ?? 0;
  const amountPaid = visit?.amountPaid ?? handoff.amountPaid ?? 0;
  const balanceDue = visit?.balanceDue ?? handoff.balanceDue ?? 0;

  return (
    <div className="space-y-4 text-[13px]">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-[var(--attio-border-subtle)] p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--attio-text-tertiary)]">Patient</p>
          <p className="mt-1 font-medium">{handoff.patientName}</p>
          <p className="text-[12px] text-[var(--attio-text-tertiary)]">{handoff.uhid} · {patient?.phone}</p>
        </div>
        <div className="rounded-lg border border-[var(--attio-border-subtle)] p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--attio-text-tertiary)]">Care plan</p>
          <p className="mt-1 font-medium">{handoff.packageLabel}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            <StatusBadge label={handoff.treatmentPath.toUpperCase()} variant="info" />
            <StatusBadge label={handoff.billingStatus} variant={handoff.billingStatus === "paid" ? "success" : "warning"} />
            {handoff.commercialConsent && <StatusBadge label="Commercial consent" variant="success" />}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--attio-border-subtle)] p-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--attio-text-tertiary)]">Billing closure</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <div>
            <p className="text-[11px] text-[var(--attio-text-tertiary)]">Net package</p>
            <p className="font-semibold tabular-nums">₹{netAmount.toLocaleString("en-IN")}</p>
          </div>
          <div>
            <p className="text-[11px] text-[var(--attio-text-tertiary)]">Collected</p>
            <p className="font-semibold tabular-nums text-emerald-700">₹{amountPaid.toLocaleString("en-IN")}</p>
          </div>
          <div>
            <p className="text-[11px] text-[var(--attio-text-tertiary)]">Balance</p>
            <p className="font-semibold tabular-nums text-amber-700">
              {balanceDue ? `₹${balanceDue.toLocaleString("en-IN")}` : "—"}
            </p>
          </div>
        </div>
        {handoff.ipdWard && (
          <p className="mt-2 text-[12px] text-[var(--attio-text-secondary)]">
            Ward: {handoff.ipdWard} · Bed {handoff.ipdBed}
          </p>
        )}
      </div>

      {consult && (
        <div className="rounded-lg border border-[var(--attio-border-subtle)] p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--attio-text-tertiary)]">
            Doctor consult (full payload)
          </p>
          <dl className="mt-2 space-y-1.5 text-[12px]">
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--attio-text-tertiary)]">Diagnosis</dt>
              <dd className="text-right font-medium">
                {String(consult.diagnosis?.primaryDiagnosis ?? "—")}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--attio-text-tertiary)]">Plan</dt>
              <dd className="max-w-[60%] text-right">{String(consult.treatment?.plan ?? "—")}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--attio-text-tertiary)]">Doctor</dt>
              <dd>{handoff.doctorName}</dd>
            </div>
            {consult.prescription.length > 0 && (
              <div>
                <dt className="text-[var(--attio-text-tertiary)]">Rx ({consult.prescription.length} lines)</dt>
                <dd className="mt-1 text-[11px] text-[var(--attio-text-secondary)]">
                  {consult.prescription.map((r) => r.drug).join(" · ")}
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {handoff.billingHandoff?.quote.lineItems && (
        <div className="rounded-lg border border-[var(--attio-border-subtle)] p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--attio-text-tertiary)]">Counsellor quote lines</p>
          <ul className="mt-2 space-y-1">
            {handoff.billingHandoff.quote.lineItems.map((l) => (
              <li key={l.id} className="flex justify-between text-[12px]">
                <span>{l.label}</span>
                <span className="tabular-nums">₹{l.amount.toLocaleString("en-IN")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {visit?.routingNote && (
        <p className="rounded-lg bg-blue-50 px-3 py-2 text-[12px] text-blue-900">{visit.routingNote}</p>
      )}
    </div>
  );
}

export function ConsentTemplatePreview({ templateId }: { templateId: string }) {
  const t = CONSENT_TEMPLATES.find((x) => x.id === templateId);
  if (!t) return null;
  return (
    <div className="rounded-lg border border-[var(--attio-border)] bg-white p-4 text-[12px] leading-relaxed text-[var(--attio-text-secondary)]">
      <p className="mb-2 text-[11px] font-medium text-[var(--attio-text-tertiary)]">Template v{t.version} · {t.language}</p>
      <p>{t.body}</p>
      {t.risks.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-4">
          {t.risks.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
