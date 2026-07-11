"use client";

import { getIpdAdmissionsByPatientAction } from "@/app/actions/ipd-actions";
import { AttioButton, Panel, StatusBadge } from "@/components/frontdesk/ui";
import { useToast } from "@/components/ui/toast-provider";
import { Printer } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type AdmissionRecord = Extract<
  Awaited<ReturnType<typeof getIpdAdmissionsByPatientAction>>,
  { ok: true }
>["data"][number];

export function PatientIpdRecord({ patientId, patientName }: { patientId: string; patientName: string }) {
  const { toast } = useToast();
  const [admissions, setAdmissions] = useState<AdmissionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    getIpdAdmissionsByPatientAction(patientId)
      .then((res) => {
        if (res.ok && res.data) setAdmissions(res.data);
      })
      .finally(() => setLoading(false));
  }, [patientId]);

  const handlePrint = () => {
    if (!printRef.current) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast("Could not open print window", "error");
      return;
    }
    printWindow.document.write(`
      <html>
        <head>
          <title>IPD Record - ${patientName}</title>
          <style>
            body { font-family: system-ui, sans-serif; padding: 24px; color: #111; }
            h1 { font-size: 18px; margin: 0 0 8px; }
            h2 { font-size: 14px; margin: 16px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
            h3 { font-size: 13px; margin: 12px 0 4px; }
            .meta { color: #555; font-size: 12px; margin-bottom: 16px; }
            .section { margin-bottom: 12px; }
            .label { font-weight: 600; font-size: 12px; color: #444; }
            .value { font-size: 12px; white-space: pre-wrap; }
            .round { border: 1px solid #eee; padding: 8px; border-radius: 6px; margin-bottom: 8px; }
            .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #f3f4f6; font-size: 11px; }
          </style>
        </head>
        <body>${printRef.current.innerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  if (loading) return <Panel title="IPD record"><p className="py-8 text-center text-[13px] text-[var(--attio-text-tertiary)]">Loading…</p></Panel>;

  if (admissions.length === 0) {
    return (
      <Panel title="IPD record">
        <p className="py-8 text-center text-[13px] text-[var(--attio-text-tertiary)]">
          No IPD admissions found for this patient.
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <AttioButton variant="secondary" onClick={handlePrint}>
          <Printer className="mr-1 size-3.5" />
          Print complete IPD record
        </AttioButton>
      </div>

      <div ref={printRef} className="space-y-6">
        <div className="print-header">
          <h1 className="text-[18px] font-semibold">IPD Record</h1>
          <p className="text-[13px] text-[var(--attio-text-secondary)]">
            {patientName} · {admissions.length} admission(s)
          </p>
        </div>

        {admissions.map((adm) => (
          <Panel key={adm.id} title={`${adm.ward} · Bed ${adm.bed} · ${adm.diagnosis || "No diagnosis"}`}>
            <div className="mb-4 flex flex-wrap gap-2 text-[12px]">
              <span className="text-[var(--attio-text-secondary)]">Attending: {adm.doctorName}</span>
              <span className="text-[var(--attio-text-secondary)]">Admitted: {new Date(adm.admittedAt).toLocaleString("en-IN")}</span>
              <StatusBadge label={adm.status.replace("_", " ")} variant={adm.status === "discharged" ? "success" : adm.status === "deceased" ? "danger" : "info"} />
              {adm.dischargedAt && <span className="text-[var(--attio-text-secondary)]">Discharged: {new Date(adm.dischargedAt).toLocaleString("en-IN")}</span>}
              {adm.deathDeclaredAt && <span className="text-[var(--attio-text-secondary)]">Death declared: {new Date(adm.deathDeclaredAt).toLocaleString("en-IN")}</span>}
            </div>

            {adm.rounds.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-[13px] font-medium">Rounds & procedures</h3>
                {adm.rounds.map((round) => (
                  <div key={round.id} className="rounded-lg border border-[var(--attio-border-subtle)] bg-[var(--attio-surface)] p-3">
                    <div className="mb-2 flex flex-wrap gap-2 text-[11px] text-[var(--attio-text-tertiary)]">
                      <span className="font-medium text-[var(--attio-text)]">{round.actorName}</span>
                      <span className="uppercase">{round.actorRole}</span>
                      <span className="rounded-full bg-white px-1.5 py-0.5 uppercase">{round.kind.replace(/_/g, " ")}</span>
                      <span>{new Date(round.at).toLocaleString("en-IN")}</span>
                    </div>
                    <pre className="whitespace-pre-wrap font-sans text-[12px] text-[var(--attio-text-secondary)]">{round.content}</pre>
                  </div>
                ))}
              </div>
            )}

            {Boolean(adm.dischargeSummary) && (
              <div className="mt-4 space-y-2">
                <h3 className="text-[13px] font-medium">Discharge summary</h3>
                <pre className="whitespace-pre-wrap rounded-lg border border-[var(--attio-border-subtle)] bg-[var(--attio-surface)] p-3 font-sans text-[12px]">
                  {JSON.stringify(adm.dischargeSummary, null, 2)}
                </pre>
              </div>
            )}

            {Boolean(adm.deathSummary) && (
              <div className="mt-4 space-y-2">
                <h3 className="text-[13px] font-medium">Death summary</h3>
                <pre className="whitespace-pre-wrap rounded-lg border border-[var(--attio-border-subtle)] bg-[var(--attio-surface)] p-3 font-sans text-[12px]">
                  {JSON.stringify(adm.deathSummary, null, 2)}
                </pre>
              </div>
            )}
          </Panel>
        ))}
      </div>
    </div>
  );
}
