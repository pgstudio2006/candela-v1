"use client";

import { ConsentWizard } from "@/components/nurse/consent-wizard";
import { NursingHandoffView } from "@/components/nurse/nursing-handoff-view";
import { PublishedSchemaForm } from "@/components/candela/published-schema-form";
import { useNurseStore } from "@/components/nurse/nurse-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, Panel, StatusBadge } from "@/components/frontdesk/ui";
import { requiredConsentsComplete, TREATMENT_BAYS, consentProgress } from "@/design-system/nurse-data";
import { useNursePoll } from "@/hooks/use-nurse-poll";
import { usePublishedFormSchema } from "@/hooks/use-published-form-schema";
import { saveNurseIpdNoteAction } from "@/app/actions/nurse-actions";
import { saveSubmissionAction } from "@/app/actions/clinical-actions";
import { validateFormValues } from "@/lib/schema-registry";
import { cn } from "@/lib/utils";
import { ArrowLeft, CheckCircle2, HeartPulse, Play, Shield } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type ExecutionWorkspaceProps = { visitId: string };

type Step = "handoff" | "vitals" | "consent" | "treatment";

const STEPS: { id: Step; label: string }[] = [
  { id: "handoff", label: "Handoff review" },
  { id: "vitals", label: "Vitals & assessment" },
  { id: "consent", label: "Clinical consent" },
  { id: "treatment", label: "Treatment execution" },
];

export function ExecutionWorkspace({ visitId }: ExecutionWorkspaceProps) {
  useNursePoll();
  const router = useRouter();
  const {
    getHandoff,
    getPatient,
    getVisit,
    getEpisode,
    claimEpisode,
    saveVitals,
    startSession,
    completeSession,
    completeEpisode,
    activeNurseName,
    error: storeError,
  } = useNurseStore();

  const handoff = getHandoff(visitId);
  const patient = handoff ? getPatient(handoff.patientId) : undefined;
  const visit = getVisit(visitId);
  const episode = getEpisode(visitId);

  const [step, setStep] = useState<Step>("handoff");
  const [bay, setBay] = useState(TREATMENT_BAYS[0].id);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);
  const [savingVitals, setSavingVitals] = useState(false);
  const [ipdNote, setIpdNote] = useState("");
  const [savingIpdNote, setSavingIpdNote] = useState(false);
  const [ipdNoteMessage, setIpdNoteMessage] = useState<string | null>(null);
  const [vitals, setVitals] = useState({
    bpSystolic: 120,
    bpDiastolic: 80,
    pulse: 72,
    spo2: 98,
    temperature: 36.8,
    weight: patient?.age ? 70 : undefined,
    painScore: 4,
    allergies: "None known",
    redFlags: "",
    nursingNotes: "",
  });
  const [sessionNoteValues, setSessionNoteValues] = useState<Record<string, string | number | boolean>>({});
  const vitalsSchema = usePublishedFormSchema("nurse-vitals");

  useEffect(() => {
    if (!handoff) return;
    void claimEpisode(visitId).catch((err) => {
      setClaimError(err instanceof Error ? err.message : "Could not claim episode");
    });
  }, [handoff, visitId, claimEpisode]);

  useEffect(() => {
    if (episode?.vitals) {
      setVitals({
        bpSystolic: episode.vitals.bpSystolic,
        bpDiastolic: episode.vitals.bpDiastolic,
        pulse: episode.vitals.pulse,
        spo2: episode.vitals.spo2,
        temperature: episode.vitals.temperature,
        weight: episode.vitals.weight,
        painScore: episode.vitals.painScore,
        allergies: episode.vitals.allergies,
        redFlags: episode.vitals.redFlags,
        nursingNotes: episode.vitals.nursingNotes,
      });
    }
  }, [episode?.vitals]);

  if (!handoff || !patient) {
    return (
      <PageChrome breadcrumbs={[{ label: "Nursing" }, { label: "Episode" }]} title="Episode not found">
        <p className="text-[13px] text-[var(--attio-text-tertiary)]">No nursing handoff for this visit.</p>
        <Link href="/app/nurse/queue" className="mt-4 inline-block text-[var(--attio-accent)]">
          Back to queue
        </Link>
      </PageChrome>
    );
  }

  const consentsOk = episode ? requiredConsentsComplete(episode.consents) : false;
  const progress = episode ? consentProgress(episode.consents) : { done: 0, total: 0 };
  const activeSession =
    episode?.sessions.find((s) => s.status === "in_progress") ??
    episode?.sessions.find((s) => s.status === "scheduled");
  const completedSessions = episode?.sessions.filter((s) => s.status === "completed").length ?? 0;
  const totalSessions = activeSession?.totalSessions ?? episode?.sessions[0]?.totalSessions ?? 1;
  const allSessionsDone = completedSessions >= totalSessions;

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const canTreatment = consentsOk && Boolean(episode?.vitals);
  const bayLabel = TREATMENT_BAYS.find((b) => b.id === bay)?.label ?? bay;

  return (
    <PageChrome
      breadcrumbs={[
        { label: "Nursing", href: "/app/nurse" },
        { label: "Queue", href: "/app/nurse/queue" },
        { label: patient.name },
      ]}
      title={`Care episode · ${patient.name}`}
      meta={`${handoff.packageLabel} · ${handoff.treatmentPath.toUpperCase()} · ${handoff.doctorName}`}
      actions={
        <Link
          href="/app/nurse/queue"
          className="inline-flex items-center gap-1 text-[13px] text-[var(--attio-text-secondary)] hover:text-[var(--attio-text)]"
        >
          <ArrowLeft className="size-3.5" /> Queue
        </Link>
      }
    >
      {(claimError || storeError || actionError) && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-900">
          {claimError ?? actionError ?? storeError}
        </div>
      )}

      {handoff.balanceDue && handoff.balanceDue > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          Balance due: ₹{handoff.balanceDue.toLocaleString("en-IN")} — treatment authorized per billing policy
        </div>
      )}

      {handoff.treatmentPath === "ipd" && (handoff.ipdWard || handoff.ipdBed) && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-[13px] text-blue-900">
          IPD admission · {handoff.ipdWard ?? "Ward TBD"}
          {handoff.ipdBed ? ` · Bed ${handoff.ipdBed}` : ""}
        </div>
      )}

      {handoff.treatmentPath === "ipd" && (
        <Panel title="IPD nursing note / report">
          {ipdNoteMessage && (
            <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-900">
              {ipdNoteMessage}
            </div>
          )}
          <textarea
            value={ipdNote}
            onChange={(e) => setIpdNote(e.target.value)}
            placeholder="Record an observation, concern, or handoff message for the doctor’s ward round…"
            className="min-h-[80px] w-full rounded-lg border border-[var(--attio-border)] bg-white px-3 py-2 text-[13px]"
          />
          <AttioButton
            variant="secondary"
            className="mt-3"
            disabled={savingIpdNote || !ipdNote.trim()}
            onClick={async () => {
              setSavingIpdNote(true);
              setActionError(null);
              try {
                await saveNurseIpdNoteAction(visitId, ipdNote.trim());
                setIpdNote("");
                setIpdNoteMessage("Note logged and will be visible in the doctor’s IPD round.");
              } catch (err) {
                setActionError(err instanceof Error ? err.message : "Could not save note");
              } finally {
                setSavingIpdNote(false);
              }
            }}
          >
            {savingIpdNote ? "Saving…" : "Log note for doctor round"}
          </AttioButton>
        </Panel>
      )}

      {episode && (
        <div className="mb-4 flex flex-wrap gap-2 text-[12px] text-[var(--attio-text-secondary)]">
          <span>Assigned nurse: {episode.nurseName}</span>
          {episode.nurseId !== undefined && episode.nurseName !== activeNurseName && (
            <StatusBadge label="Claimed by colleague" variant="warning" />
          )}
          {episode.vitals?.redFlags?.trim() && <StatusBadge label="Red flags noted" variant="warning" />}
        </div>
      )}

      <div className="mb-5 flex flex-wrap gap-2">
        {STEPS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStep(s.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
              step === s.id
                ? "border-[var(--attio-accent)] bg-[var(--attio-accent)]/10 text-[var(--attio-accent)]"
                : "border-[var(--attio-border)] text-[var(--attio-text-secondary)] hover:bg-[var(--attio-surface)]",
              i < stepIndex && "border-emerald-300 bg-emerald-50/50",
            )}
          >
            {i + 1}. {s.label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <StatusBadge label={handoff.billingStatus} variant={handoff.billingStatus === "paid" ? "success" : "warning"} />
        <StatusBadge label={`Consent ${progress.done}/${progress.total}`} variant={consentsOk ? "success" : "warning"} />
        {episode?.status && <StatusBadge label={episode.status.replace("_", " ")} variant="info" />}
        {completedSessions > 0 && (
          <StatusBadge label={`Sessions ${completedSessions}/${totalSessions}`} variant="neutral" />
        )}
      </div>

      {step === "handoff" && (
        <Panel title="Full care handoff">
          <NursingHandoffView handoff={handoff} patient={patient} visit={visit} />
          <AttioButton variant="primary" className="mt-4" onClick={() => setStep("vitals")}>
            Continue to vitals →
          </AttioButton>
        </Panel>
      )}

      {step === "vitals" && (
        <Panel title="Vitals & nursing assessment">
          <PublishedSchemaForm
            schema={vitalsSchema}
            formKey={`${visitId}-${episode?.vitals?.recordedAt ?? "new"}`}
            initialValues={{
              bpSystolic: vitals.bpSystolic,
              bpDiastolic: vitals.bpDiastolic,
              pulse: vitals.pulse,
              spo2: vitals.spo2,
              temperature: vitals.temperature,
              weight: vitals.weight ?? "",
              painScore: vitals.painScore,
              allergies: vitals.allergies,
              redFlags: vitals.redFlags,
              nursingNotes: vitals.nursingNotes,
            }}
            submitLabel={savingVitals ? "Saving…" : "Save vitals & continue to consent"}
            onSubmit={async (data) => {
              const errors = validateFormValues(vitalsSchema, data);
              const firstError = Object.values(errors)[0];
              if (firstError) {
                setActionError(firstError);
                return;
              }
              setSavingVitals(true);
              setActionError(null);
              const payload = {
                bpSystolic: Number(data.bpSystolic),
                bpDiastolic: Number(data.bpDiastolic),
                pulse: Number(data.pulse),
                spo2: Number(data.spo2),
                temperature: Number(data.temperature),
                weight: data.weight ? Number(data.weight) : undefined,
                painScore: Number(data.painScore),
                allergies: String(data.allergies ?? ""),
                redFlags: String(data.redFlags ?? ""),
                nursingNotes: String(data.nursingNotes ?? ""),
              };
              const result = await saveVitals(visitId, payload);
              if (result.ok && patient) {
                await saveSubmissionAction("nurse-vitals", data, {
                  visitId,
                  patientId: patient.id,
                });
              }
              setSavingVitals(false);
              if (!result.ok) {
                setActionError(result.error ?? "Failed to save vitals");
                return;
              }
              setVitals(payload);
              setStep("consent");
            }}
          />
        </Panel>
      )}

      {step === "consent" && (
        <Panel title="Treatment-specific clinical consent" action={<Shield className="size-4 text-[var(--attio-text-tertiary)]" />}>
          <p className="mb-4 text-[12px] text-[var(--attio-text-secondary)]">
            Commercial package consent was captured by counsellor. Nursing must complete procedure-specific consent before treatment.
          </p>
          <ConsentWizard visitId={visitId} />
          <AttioButton
            variant="primary"
            className="mt-4"
            disabled={!consentsOk}
            onClick={() => setStep("treatment")}
          >
            {consentsOk ? "All consents verified → Start treatment" : `Complete ${progress.total - progress.done} required consent(s)`}
          </AttioButton>
        </Panel>
      )}

      {step === "treatment" && (
        <div className="space-y-4">
          {sessionMessage && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-900">
              {sessionMessage}
            </div>
          )}

          <Panel title={`Session ${activeSession?.sessionNumber ?? 1} · Treatment execution`}>
            {!canTreatment && (
              <p className="mb-3 text-[13px] text-amber-700">Complete vitals and verify all required consents before starting.</p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-[var(--attio-border-subtle)] p-3">
                <p className="text-[11px] text-[var(--attio-text-tertiary)]">Procedure</p>
                <p className="font-medium">{handoff.packageLabel}</p>
                <p className="mt-1 text-[12px] text-[var(--attio-text-secondary)]">
                  Session {activeSession?.sessionNumber ?? 1} of {totalSessions}
                </p>
              </div>
              <label className="block text-[12px]">
                <span className="mb-1 block text-[var(--attio-text-tertiary)]">Treatment bay</span>
                <select
                  value={bay}
                  onChange={(e) => setBay(e.target.value)}
                  className="h-9 w-full rounded-lg border border-[var(--attio-border)] bg-white px-3"
                  disabled={episode?.status === "in_treatment"}
                >
                  {TREATMENT_BAYS.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <PublishedSchemaForm
              schemaId="nurse-session-notes"
              hideSubmit
              initialValues={sessionNoteValues}
              onValuesChange={setSessionNoteValues}
              className="mt-3"
            />
            <div className="mt-4 flex flex-wrap gap-2">
              {episode?.status !== "in_treatment" && activeSession?.status === "scheduled" && (
                <AttioButton
                  variant="primary"
                  className="gap-1.5"
                  disabled={!canTreatment}
                  onClick={async () => {
                    setActionError(null);
                    try {
                      await startSession(visitId, bayLabel, String(sessionNoteValues.sessionNotes ?? ""));
                      setSessionMessage(null);
                    } catch (err) {
                      setActionError(err instanceof Error ? err.message : "Could not start session");
                    }
                  }}
                >
                  <Play className="size-3.5" /> Start session {activeSession.sessionNumber}
                </AttioButton>
              )}
              {episode?.status === "in_treatment" && activeSession?.status === "in_progress" && (
                <AttioButton
                  variant="primary"
                  className="gap-1.5"
                  onClick={async () => {
                    setActionError(null);
                    const result = await completeSession(visitId, activeSession.id, sessionNoteValues);
                    if (!result.ok) {
                      setActionError(result.error ?? "Could not complete session");
                      return;
                    }
                    setSessionNoteValues({});
                    if (result.nextSessionNumber) {
                      setSessionMessage(
                        `Session ${activeSession.sessionNumber} complete. Session ${result.nextSessionNumber} is scheduled — return patient for next visit or start now if ready.`,
                      );
                    } else if (allSessionsDone || activeSession.sessionNumber >= totalSessions) {
                      setSessionMessage("Final session complete. Close the care plan when ready.");
                    } else {
                      setSessionMessage(`Session ${activeSession.sessionNumber} complete.`);
                    }
                  }}
                >
                  <CheckCircle2 className="size-3.5" /> Complete session
                </AttioButton>
              )}
              {episode && episode.status !== "completed" && completedSessions > 0 && episode.status !== "in_treatment" && (
                <AttioButton
                  variant="secondary"
                  onClick={async () => {
                    setActionError(null);
                    const result = await completeEpisode(visitId);
                    if (!result.ok) {
                      setActionError(result.error ?? "Could not close episode");
                      return;
                    }
                    router.push("/app/nurse/queue");
                  }}
                >
                  Close care plan ({completedSessions}/{totalSessions} sessions)
                </AttioButton>
              )}
            </div>
          </Panel>

          {episode?.vitals && (
            <Panel title="Vitals snapshot">
              <p className="text-[12px] text-[var(--attio-text-secondary)]">
                BP {episode.vitals.bpSystolic}/{episode.vitals.bpDiastolic} · Pulse {episode.vitals.pulse} · SpO₂{" "}
                {episode.vitals.spo2}% · Pain {episode.vitals.painScore}/10
                {episode.vitals.recordedBy ? ` · Recorded by ${episode.vitals.recordedBy}` : ""}
              </p>
            </Panel>
          )}
        </div>
      )}
    </PageChrome>
  );
}
