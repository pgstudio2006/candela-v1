import type { Patient, Visit } from "@/design-system/frontdesk-data";
import type { ConsultationRecord } from "@/design-system/doctor-data";
import {
  fieldEntries,
  formatConsultDate,
  formatPrescriptionDuration,
  humanizeFieldKey,
  scribeLanguageLabel,
} from "@/lib/doctor-records";
import { NavayuLetterhead, letterheadStyles as s } from "./navayu-letterhead";
import { resolvePatientAge } from "@/lib/frontdesk-workflow";

type PrintableConsultRecordProps = {
  patient: Patient;
  visit: Visit;
  consult: ConsultationRecord;
  doctorName: string;
};

function SectionBlock({
  title,
  data,
}: {
  title: string;
  data: Record<string, string | number | boolean>;
}) {
  const entries = fieldEntries(data);
  if (entries.length === 0) return null;
  return (
    <div style={s.section}>
      <div style={s.sectionTitle}>{title}</div>
      <table style={{ ...s.table, marginTop: "4px" }}>
        <tbody>
          {entries.map(([key, val]) => (
            <tr key={key}>
              <td style={{ ...s.td, width: "32%", fontWeight: 600, background: "#fafafa" }}>
                {humanizeFieldKey(key)}
              </td>
              <td style={s.td}>{String(val)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PrintableConsultRecord({
  patient,
  visit,
  consult,
  doctorName,
}: PrintableConsultRecordProps) {
  return (
    <NavayuLetterhead docTitle="Consultation Record">
      <div style={s.metaGrid}>
        <div>
          <strong>Patient:</strong> {patient.name} · {patient.uhid}
          <br />
          <strong>Age / Sex:</strong> {resolvePatientAge(patient.age, patient.dateOfBirth) || "—"}y / {patient.gender}
          <br />
          <strong>Department:</strong> {patient.department}
        </div>
        <div>
          <strong>Consult date:</strong> {formatConsultDate(consult.completedAt ?? consult.startedAt)}
          <br />
          <strong>Doctor:</strong> {doctorName}
          <br />
          <strong>Mode:</strong> {consult.treatmentMode.toUpperCase()} · Token #{visit.token ?? "—"}
        </div>
      </div>

      <SectionBlock title="Examination" data={consult.examination} />
      <SectionBlock title="Diagnosis" data={consult.diagnosis} />
      <SectionBlock title="Treatment plan" data={consult.treatment} />

      {consult.prescription.length > 0 && (
        <div style={s.section}>
          <div style={s.sectionTitle}>Prescription</div>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Medicine</th>
                <th style={s.th}>Dose</th>
                <th style={s.th}>Freq</th>
                <th style={s.th}>Duration</th>
              </tr>
            </thead>
            <tbody>
              {consult.prescription.map((rx) => (
                <tr key={rx.id}>
                  <td style={s.td}>{rx.drug}</td>
                  <td style={s.td}>{rx.dose}</td>
                  <td style={s.td}>{rx.frequency}</td>
                  <td style={s.td}>{formatPrescriptionDuration(rx)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {consult.scribeTranscript && (
        <div style={s.section}>
          <div style={s.sectionTitle}>
            AI Scribe transcript ({scribeLanguageLabel(consult.scribeLanguage)})
          </div>
          <div
            style={{
              padding: "10px",
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: "4px",
              whiteSpace: "pre-wrap",
              fontSize: "10px",
            }}
          >
            {consult.scribeTranscript}
          </div>
          {consult.scribeAppliedAt && (
            <div style={{ fontSize: "9px", color: "#6b7280", marginTop: "4px" }}>
              Applied to examination: {formatConsultDate(consult.scribeAppliedAt)}
            </div>
          )}
        </div>
      )}

      {consult.notes && (
        <div style={s.section}>
          <div style={s.sectionTitle}>Private notes</div>
          <div>{consult.notes}</div>
        </div>
      )}

      {consult.handoff && fieldEntries(consult.handoff).length > 0 && (
        <SectionBlock title="Counsellor handoff" data={consult.handoff} />
      )}

      {consult.doctorAdvice && (
        <div style={s.section}>
          <div style={s.sectionTitle}>Doctor advice to patient</div>
          <div>{consult.doctorAdvice}</div>
        </div>
      )}
    </NavayuLetterhead>
  );
}
