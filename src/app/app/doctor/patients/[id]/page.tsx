"use client";

import { useDoctorStore } from "@/components/doctor/doctor-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, Panel, StatusBadge } from "@/components/frontdesk/ui";
import { PatientDocumentsPanel } from "@/components/patient-documents";
import { PatientConsentsPanel } from "@/components/patient-consents";
import { PatientLabReportsPanel } from "@/components/candela/patient-lab-reports-panel";
import { PatientIpdRecord } from "@/components/doctor/patient-ipd-record";
import { consultPrimaryDiagnosis, formatConsultDate } from "@/lib/doctor-records";
import { parseScribeSessions } from "@/lib/scribe-transcript";
import { formatStageStatus, resolvePatientAge } from "@/lib/frontdesk-workflow";
import { ArrowLeft, ChevronRight, FileText, Mic, Pill, Stethoscope } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

export default function DoctorPatientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const patientId = params.id as string;
  const [tab, setTab] = useState("timeline");
  const {
    getPatient,
    visits,
    getPatientConsultations,
    getVisit,
    startConsultation,
  } = useDoctorStore();

  const patient = getPatient(patientId);
  const allVisits = visits.filter((v) => v.patientId === patientId);
  const todayVisit = allVisits.find((v) => v.stage !== "completed" && v.stage !== "registered") ?? allVisits[0];
  const history = getPatientConsultations(patientId);
  const scribeHistory = history.filter((c) => c.scribeTranscript?.trim());

  if (!patient) {
    return (
      <PageChrome breadcrumbs={[{ label: "Doctor", href: "/app/doctor" }, { label: "Patient" }]} title="Not found">
        <Link href="/app/doctor/patients" className="text-[13px] text-[var(--attio-accent)]">← Patients</Link>
      </PageChrome>
    );
  }

  return (
    <PageChrome
      breadcrumbs={[
        { label: "Doctor", href: "/app/doctor" },
        { label: "Patients", href: "/app/doctor/patients" },
        { label: patient.name },
      ]}
      title={patient.name}
      meta={`${patient.uhid} · ${patient.department} · ${resolvePatientAge(patient.age, patient.dateOfBirth) || "—"}y ${patient.gender}`}
      tabs={[
        { id: "timeline", label: "Clinical timeline" },
        { id: "ipd", label: "IPD" },
        { id: "scribe", label: "AI Scribe" },
        { id: "overview", label: "Overview" },
        { id: "documents", label: "Documents" },
        { id: "labs", label: "Lab Reports" },
        { id: "consents", label: "Consents" },
      ]}
      activeTab={tab}
      onTabChange={setTab}
      actions={
        todayVisit?.stage === "with_doctor" ? (
          <AttioButton
            variant="primary"
            className="gap-1.5"
            onClick={() => {
              startConsultation(todayVisit.id);
              router.push(`/app/doctor/consult/${todayVisit.id}`);
            }}
          >
            <Stethoscope className="size-3.5" />
            Open consult
          </AttioButton>
        ) : undefined
      }
    >
      <Link
        href="/app/doctor/patients"
        className="mb-4 inline-flex items-center gap-1 text-[13px] text-[var(--attio-text-tertiary)] hover:text-[var(--attio-text)]"
      >
        <ArrowLeft className="size-4" />
        All patients
      </Link>

      {tab === "scribe" && (
        <Panel title="AI Scribe transcripts">
          <p className="mb-4 text-[12px] text-[var(--attio-text-tertiary)]">
            Every live scribe session is saved to this patient profile and linked to the consult visit.
          </p>
          {scribeHistory.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-[var(--attio-text-tertiary)]">
              No AI scribe transcripts yet — use AI Scribe during a consultation to record conversations here.
            </p>
          ) : (
            <ul className="space-y-4">
              {scribeHistory.map((c) => {
                const sessions = parseScribeSessions(c.scribeTranscript ?? "");
                const v = getVisit(c.visitId);
                return (
                  <li
                    key={c.visitId}
                    className="rounded-xl border border-[var(--attio-border-subtle)] bg-[var(--attio-surface)] p-4"
                  >
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-[14px] font-medium">{consultPrimaryDiagnosis(c)}</p>
                        <p className="text-[12px] text-[var(--attio-text-tertiary)]">
                          {formatConsultDate(c.completedAt ?? c.startedAt)}
                          {v && ` · Token #${v.token}`}
                          {c.scribeLanguage && ` · ${c.scribeLanguage}`}
                        </p>
                      </div>
                      <Link
                        href={`/app/doctor/patients/${patientId}/records/${c.visitId}`}
                        className="text-[12px] font-medium text-[var(--attio-accent)]"
                      >
                        Full record →
                      </Link>
                    </div>
                    <div className="space-y-3">
                      {sessions.map((session, idx) => (
                        <div
                          key={`${c.visitId}-${idx}`}
                          className="rounded-lg border border-[var(--attio-border-subtle)] bg-white px-3 py-2.5"
                        >
                          {(session.recordedAt || session.language) && (
                            <p className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-blue-700">
                              <Mic className="size-3" />
                              {session.recordedAt || "Scribe session"}
                              {session.language ? ` · ${session.language}` : ""}
                            </p>
                          )}
                          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--attio-text-secondary)]">
                            {session.transcript}
                          </p>
                        </div>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      )}

      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Demographics">
            <dl className="space-y-2 text-[13px]">
              <div className="flex justify-between"><dt className="text-[var(--attio-text-tertiary)]">Phone</dt><dd>{patient.phone}</dd></div>
              <div className="flex justify-between"><dt className="text-[var(--attio-text-tertiary)]">Email</dt><dd>{patient.email || "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-[var(--attio-text-tertiary)]">Department</dt><dd>{patient.department}</dd></div>
              <div className="flex justify-between"><dt className="text-[var(--attio-text-tertiary)]">Referred by</dt><dd>{patient.referrer || "Walk-in"}</dd></div>
              <div className="flex justify-between"><dt className="text-[var(--attio-text-tertiary)]">Balance</dt><dd>₹{patient.balance.toLocaleString("en-IN")}</dd></div>
            </dl>
          </Panel>

          <Panel title="Visit history">
            <ul className="divide-y divide-[var(--attio-border-subtle)]">
              {allVisits.length === 0 && (
                <li className="py-4 text-center text-[13px] text-[var(--attio-text-tertiary)]">No visits</li>
              )}
              {allVisits.map((v) => (
                <li key={v.id} className="flex items-center justify-between py-2.5 text-[13px]">
                  <div>
                    <StatusBadge label={formatStageStatus(v.stage)} variant="info" />
                    <p className="mt-1">Token #{v.token} · {v.doctorName}</p>
                  </div>
                  <StatusBadge label={v.billing} variant={v.billing === "paid" ? "success" : "warning"} />
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Address">
            <dl className="space-y-2 text-[13px]">
              <div className="flex justify-between"><dt className="text-[var(--attio-text-tertiary)]">Country</dt><dd>{patient.country || "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-[var(--attio-text-tertiary)]">State</dt><dd>{patient.state || "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-[var(--attio-text-tertiary)]">District</dt><dd>{patient.district || "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-[var(--attio-text-tertiary)]">City</dt><dd>{patient.city || "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-[var(--attio-text-tertiary)]">Society / colony</dt><dd>{patient.society || "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-[var(--attio-text-tertiary)]">House / building</dt><dd>{patient.houseNumber || "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-[var(--attio-text-tertiary)]">Street / road</dt><dd>{patient.street || "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-[var(--attio-text-tertiary)]">Locality / area</dt><dd>{patient.locality || "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-[var(--attio-text-tertiary)]">Landmark</dt><dd>{patient.landmark || "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-[var(--attio-text-tertiary)]">Pincode</dt><dd>{patient.pincode || "—"}</dd></div>
              {patient.address && (
                <div><dt className="text-[var(--attio-text-tertiary)]">Full address</dt><dd>{patient.address}</dd></div>
              )}
            </dl>
          </Panel>

          <Panel title="Summary" className="lg:col-span-2">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="rounded-lg bg-[var(--attio-surface)] py-4">
                <p className="text-[20px] font-semibold tabular-nums">{history.length}</p>
                <p className="text-[11px] text-[var(--attio-text-tertiary)]">Consults recorded</p>
              </div>
              <div className="rounded-lg bg-[var(--attio-surface)] py-4">
                <p className="text-[20px] font-semibold tabular-nums">
                  {history.filter((c) => c.scribeTranscript).length}
                </p>
                <p className="text-[11px] text-[var(--attio-text-tertiary)]">AI scribe sessions</p>
              </div>
              <div className="rounded-lg bg-[var(--attio-surface)] py-4">
                <p className="text-[20px] font-semibold tabular-nums">
                  {history.filter((c) => c.prescription.length > 0).length}
                </p>
                <p className="text-[11px] text-[var(--attio-text-tertiary)]">Prescriptions</p>
              </div>
            </div>
          </Panel>
        </div>
      )}

      {tab === "ipd" && (
        <PatientIpdRecord patientId={patientId} patientName={patient.name} />
      )}

      {tab === "timeline" && (
        <Panel title="Clinical timeline">
          <p className="mb-4 text-[12px] text-[var(--attio-text-tertiary)]">
            Every consult saves examination, diagnosis, treatment, prescription, AI scribe & handoff to this profile.
          </p>
          <ul className="divide-y divide-[var(--attio-border-subtle)]">
            {history.length === 0 && (
              <li className="py-8 text-center text-[13px] text-[var(--attio-text-tertiary)]">
                No consult records yet — start a consultation to build the profile
              </li>
            )}
            {history.map((c) => {
              const v = getVisit(c.visitId);
              return (
                <li key={c.visitId}>
                  <Link
                    href={`/app/doctor/patients/${patientId}/records/${c.visitId}`}
                    className="flex items-start justify-between gap-4 py-4 transition-colors hover:bg-[var(--attio-surface)] -mx-4 px-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-medium">{consultPrimaryDiagnosis(c)}</p>
                      <p className="mt-0.5 text-[12px] text-[var(--attio-text-tertiary)]">
                        {formatConsultDate(c.completedAt ?? c.startedAt)} · {c.treatmentMode.toUpperCase()}
                        {v && ` · Token #${v.token}`}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <StatusBadge label={c.status.replace("_", " ")} variant={c.status === "completed" ? "success" : "warning"} />
                        {c.scribeTranscript && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">
                            <Mic className="size-3" /> Scribe
                          </span>
                        )}
                        {c.prescription.length > 0 && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-[var(--attio-surface)] px-1.5 py-0.5 text-[10px] text-[var(--attio-text-secondary)]">
                            <Pill className="size-3" /> {c.prescription.length} Rx
                          </span>
                        )}
                      </div>
                      {c.scribeTranscript && (
                        <p className="mt-2 line-clamp-2 text-[12px] text-[var(--attio-text-secondary)]">
                          {c.scribeTranscript}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="mt-1 size-4 shrink-0 text-[var(--attio-text-tertiary)]" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      {tab === "documents" && (
        <PatientDocumentsPanel patientId={patientId} />
      )}

      {tab === "labs" && (
        <PatientLabReportsPanel patientId={patientId} />
      )}

      {tab === "consents" && (
        <PatientConsentsPanel patientId={patientId} />
      )}
    </PageChrome>
  );
}
