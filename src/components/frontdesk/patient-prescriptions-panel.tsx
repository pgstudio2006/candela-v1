"use client";

import { getPatientConsultationsAction } from "@/app/actions/clinical-actions";
import { AttioButton, Panel, StatusBadge } from "@/components/frontdesk/ui";
import { PrintPreviewModal } from "@/components/doctor/print/print-preview-modal";
import { PrintablePrescription } from "@/components/doctor/print/printable-prescription";
import type { Patient, Visit } from "@/design-system/frontdesk-data";
import type { ConsultationRecord } from "@/design-system/doctor-data";
import { formatConsultDate } from "@/lib/doctor-records";
import { Printer } from "lucide-react";
import { useEffect, useState } from "react";

type PatientPrescriptionsPanelProps = {
  patient: Patient;
  visits: Visit[];
};

export function PatientPrescriptionsPanel({ patient, visits }: PatientPrescriptionsPanelProps) {
  const [consultations, setConsultations] = useState<ConsultationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ConsultationRecord | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getPatientConsultationsAction(patient.id).then((result) => {
      if (cancelled) return;
      if (result.ok) setConsultations(result.data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [patient.id]);

  return (
    <>
      <Panel title="Doctor prescriptions">
        {loading ? (
          <p className="text-[13px] text-[var(--attio-text-secondary)]">Loading prescriptions…</p>
        ) : consultations.length === 0 ? (
          <p className="text-[13px] text-[var(--attio-text-secondary)]">No completed consultation prescriptions found.</p>
        ) : (
          <ul className="space-y-3">
            {consultations.map((consult) => {
              const visit = visits.find((item) => item.id === consult.visitId);
              const doctorName = visit?.doctorName || "Doctor";
              const date = formatConsultDate(consult.completedAt ?? consult.startedAt);
              return (
                <li key={consult.visitId} className="rounded-lg border border-[var(--attio-border-subtle)] p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-[13px] font-medium">Dr. {doctorName}</p>
                      <p className="text-[11px] text-[var(--attio-text-tertiary)]">{date} · Visit {consult.visitId}</p>
                    </div>
                    <StatusBadge label={`${consult.prescription.length} medicine(s)`} variant="info" />
                  </div>
                  {consult.prescription.length > 0 && (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-[12px]">
                        <thead>
                          <tr className="border-b border-[var(--attio-border-subtle)] text-left text-[11px] text-[var(--attio-text-tertiary)]">
                            <th className="pb-1 pr-2">Medicine</th>
                            <th className="pb-1 pr-2">Dose</th>
                            <th className="pb-1 pr-2">Frequency</th>
                            <th className="pb-1">Duration</th>
                          </tr>
                        </thead>
                        <tbody>
                          {consult.prescription.map((line) => (
                            <tr key={line.id} className="border-b border-[var(--attio-border-subtle)] last:border-0">
                              <td className="py-1.5 pr-2 font-medium">{line.drug || "—"}</td>
                              <td className="py-1.5 pr-2">{line.dose || "—"}</td>
                              <td className="py-1.5 pr-2">{line.frequency || "—"}</td>
                              <td className="py-1.5">{line.duration || `${line.days} days`}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <AttioButton variant="secondary" className="h-8 gap-1.5 text-[11px]" onClick={() => setSelected(consult)}>
                      <Printer className="size-3.5" />
                      Print / save as PDF
                    </AttioButton>
                    {consult.doctorAdvice && <StatusBadge label="Doctor advice included" variant="neutral" />}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {selected && (
        <PrintPreviewModal
          open
          onClose={() => setSelected(null)}
          title="Doctor prescription"
          printId={`frontdesk-rx-${selected.visitId}`}
        >
          <PrintablePrescription
            patient={patient}
            visit={visits.find((item) => item.id === selected.visitId) ?? {
              id: selected.visitId,
              patientId: patient.id,
              doctorName: "Doctor",
              doctorId: selected.doctorId,
              stage: "completed",
              billing: "pending",
              exam: "done",
              departmentId: patient.departmentId,
              appointment: false,
              waitMin: 0,
            }}
            consult={selected}
            doctorName={visits.find((item) => item.id === selected.visitId)?.doctorName || "Doctor"}
          />
        </PrintPreviewModal>
      )}
    </>
  );
}
