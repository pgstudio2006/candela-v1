import type { Patient, Visit } from "@/design-system/frontdesk-data";
import type { ConsultationRecord } from "@/design-system/doctor-data";
import { formatConsultDate } from "@/lib/doctor-records";
import { resolvePatientAge } from "@/lib/frontdesk-workflow";
import { NavayuLetterhead, letterheadStyles as s } from "./navayu-letterhead";

type PrintablePrescriptionProps = {
  patient: Patient;
  visit: Visit;
  consult: ConsultationRecord;
  doctorName: string;
};

export function PrintablePrescription({
  patient,
  visit,
  consult,
  doctorName,
}: PrintablePrescriptionProps) {
  const date = formatConsultDate(consult.completedAt ?? consult.startedAt);

  return (
    <NavayuLetterhead docTitle="Prescription">
      <div style={s.metaGrid}>
        <div>
          <strong>Patient:</strong> {patient.name}
          <br />
          <strong>UHID:</strong> {patient.uhid}
          <br />
          <strong>Age / Sex:</strong> {resolvePatientAge(patient.age, patient.dateOfBirth) || "—"}y / {patient.gender}
        </div>
        <div>
          <strong>Date:</strong> {date}
          <br />
          <strong>Doctor:</strong> {doctorName}
          <br />
          <strong>Token:</strong> #{visit.token ?? "—"}
        </div>
      </div>

      {String(consult.diagnosis.primaryDiagnosis ?? "") && (
        <div style={s.section}>
          <div style={s.sectionTitle}>Diagnosis</div>
          <div>{String(consult.diagnosis.primaryDiagnosis ?? consult.diagnosis.clinicalImpression ?? "—")}</div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", marginBottom: "8px" }}>
        <span style={s.rxSymbol}>℞</span>
        <span style={{ fontWeight: 600 }}>Medications</span>
      </div>

      {consult.prescription.length === 0 ? (
        <p style={{ color: "#6b7280", fontStyle: "italic" }}>No medicines prescribed</p>
      ) : (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>#</th>
              <th style={s.th}>Medicine</th>
              <th style={s.th}>Dose</th>
              <th style={s.th}>Frequency</th>
              <th style={s.th}>Duration</th>
              <th style={s.th}>Instructions</th>
            </tr>
          </thead>
          <tbody>
            {consult.prescription.map((line, i) => (
              <tr key={line.id}>
                <td style={s.td}>{i + 1}</td>
                <td style={s.td}>{line.drug || "—"}</td>
                <td style={s.td}>{line.dose}</td>
                <td style={s.td}>{line.frequency}</td>
                <td style={s.td}>{line.duration}</td>
                <td style={s.td}>{line.instructions ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {String(consult.treatment.plan ?? "") && (
        <div style={{ ...s.section, marginTop: "16px" }}>
          <div style={s.sectionTitle}>Advice</div>
          <div>{String(consult.treatment.plan)}</div>
          {String(consult.treatment.followUp ?? "") && (
            <div style={{ marginTop: "4px" }}>
              <strong>Follow-up:</strong> {String(consult.treatment.followUp)}
            </div>
          )}
        </div>
      )}

      {consult.doctorAdvice && (
        <div style={s.section}>
          <div style={s.sectionTitle}>Doctor advice</div>
          <div>{consult.doctorAdvice}</div>
        </div>
      )}

      <div style={{ marginTop: "32px", display: "flex", justifyContent: "flex-end" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ borderTop: "1px solid #9ca3af", width: "180px", marginBottom: "4px" }} />
          <div style={{ fontSize: "10px" }}>{doctorName}</div>
          <div style={{ fontSize: "9px", color: "#6b7280" }}>Consultant Signature</div>
        </div>
      </div>
    </NavayuLetterhead>
  );
}
