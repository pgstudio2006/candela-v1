"use client";

import { useNurseStore } from "@/components/nurse/nurse-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, Panel, StatusBadge } from "@/components/frontdesk/ui";
import { useNursePoll } from "@/hooks/use-nurse-poll";
import { useToast } from "@/components/ui/toast-provider";
import { useMemo, useState } from "react";

export default function NurseDischargePage() {
  useNursePoll();
  const { toast } = useToast();
  const { episodes, patients, handoffs, getEpisode, saveDischargeSummary } = useNurseStore();
  const [visitId, setVisitId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [admissionDate, setAdmissionDate] = useState("");
  const [dischargeDate, setDischargeDate] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [procedures, setProcedures] = useState("");
  const [medications, setMedications] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const activeEpisodes = useMemo(
    () =>
      episodes
        .filter((e) => e.treatmentPath === "ipd" && e.status !== "completed")
        .map((e) => ({
          visitId: e.visitId,
          patientName: patients.find((p) => p.id === e.patientId)?.name ?? handoffs.find((h) => h.visitId === e.visitId)?.patientName ?? "Patient",
          uhid: handoffs.find((h) => h.visitId === e.visitId)?.uhid ?? "",
          existing: e.dischargeSummary,
        })),
    [episodes, patients, handoffs],
  );

  const selected = activeEpisodes.find((e) => e.visitId === visitId);

  const loadExisting = () => {
    if (selected?.existing) {
      setAdmissionDate(selected.existing.admissionDate);
      setDischargeDate(selected.existing.dischargeDate);
      setDiagnosis(selected.existing.diagnosis);
      setProcedures(selected.existing.procedures);
      setMedications(selected.existing.medications);
      setFollowUp(selected.existing.followUp);
      setNotes(selected.existing.notes);
    }
  };

  const generateAIDraft = async () => {
    if (!visitId) {
      toast("Select an IPD patient", "error");
      return;
    }
    setGenerating(true);
    const episode = getEpisode(visitId);
    const handoff = handoffs.find((h) => h.visitId === visitId);
    const patient = patients.find((p) => p.id === episode?.patientId);
    const today = new Date().toISOString().slice(0, 10);
    const vitals = episode?.vitals;
    const diagnosis =
      (handoff?.consultation?.diagnosis?.clinicalImpression as string) ||
      (handoff?.consultation?.diagnosis?.provisionalDiagnosis as string) ||
      "";
    const procedures = episode?.sessions.map((s) => s.procedure).filter(Boolean).join("\n") ?? "";
    const medications = episode?.tasks.map((t) => t.title).filter(Boolean).join("\n") ?? "";
    const vitalsLine = vitals
      ? `Vitals recorded by ${vitals.recordedBy}: BP ${vitals.bpSystolic ?? "—"}/${vitals.bpDiastolic ?? "—"}, pulse ${vitals.pulse ?? "—"}, SpO₂ ${vitals.spo2 ?? "—"}%` +
        (vitals.redFlags ? `. Red flags: ${vitals.redFlags}` : "")
      : "No vitals recorded.";
    const notes = `AI draft generated for ${patient?.name ?? handoff?.patientName ?? "patient"}. ${vitalsLine}`;
    setAdmissionDate(episode?.queuedAt?.slice(0, 10) ?? "");
    setDischargeDate(today);
    setDiagnosis(diagnosis);
    setProcedures(procedures);
    setMedications(medications);
    setFollowUp("");
    setNotes(notes);
    setGenerating(false);
    toast("AI draft generated — review and edit before saving", "success");
  };

  const save = async () => {
    if (!visitId) {
      toast("Select an IPD patient", "error");
      return;
    }
    if (!admissionDate || !dischargeDate || !diagnosis.trim()) {
      toast("Admission date, discharge date and diagnosis are required", "error");
      return;
    }
    setSaving(true);
    const result = await saveDischargeSummary(visitId, {
      admissionDate,
      dischargeDate,
      diagnosis: diagnosis.trim(),
      procedures: procedures.trim(),
      medications: medications.trim(),
      followUp: followUp.trim(),
      notes: notes.trim(),
    });
    setSaving(false);
    if (!result.ok) {
      toast(result.error ?? "Failed to save discharge summary", "error");
      return;
    }
    toast("Discharge summary saved", "success");
  };

  return (
    <PageChrome
      breadcrumbs={[{ label: "Nursing", href: "/app/nurse" }, { label: "Discharge summary" }]}
      title="Discharge summary"
      meta="Prepare discharge summary for IPD patients"
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Patient details">
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-[12px] font-medium text-[var(--attio-text-secondary)]">IPD patient</span>
              <select
                value={visitId}
                onChange={(e) => setVisitId(e.target.value)}
                className="h-9 w-full rounded-md border border-[var(--attio-border)] bg-white px-3 text-[13px] outline-none focus:border-[var(--attio-text)]"
              >
                <option value="">Select patient</option>
                {activeEpisodes.map((e) => (
                  <option key={e.visitId} value={e.visitId}>
                    {e.patientName} · {e.uhid}
                  </option>
                ))}
              </select>
            </label>
            {selected && (
              <div className="flex flex-wrap items-center gap-2">
                {selected.existing ? (
                  <>
                    <StatusBadge label="Existing summary" variant="success" />
                    <button type="button" onClick={loadExisting} className="text-[12px] text-[var(--attio-accent)] hover:underline">
                      Load into form
                    </button>
                  </>
                ) : (
                  <StatusBadge label="New summary" variant="neutral" />
                )}
                <AttioButton variant="secondary" disabled={generating} onClick={generateAIDraft}>
                  {generating ? "Generating..." : "Generate AI draft"}
                </AttioButton>
              </div>
            )}
          </div>
        </Panel>

        <Panel title="Summary">
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-[12px] font-medium text-[var(--attio-text-secondary)]">Admission date</span>
                <input
                  type="date"
                  value={admissionDate}
                  onChange={(e) => setAdmissionDate(e.target.value)}
                  className="h-9 w-full rounded-md border border-[var(--attio-border)] px-3 text-[13px] outline-none focus:border-[var(--attio-text)]"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[12px] font-medium text-[var(--attio-text-secondary)]">Discharge date</span>
                <input
                  type="date"
                  value={dischargeDate}
                  onChange={(e) => setDischargeDate(e.target.value)}
                  className="h-9 w-full rounded-md border border-[var(--attio-border)] px-3 text-[13px] outline-none focus:border-[var(--attio-text)]"
                />
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-[12px] font-medium text-[var(--attio-text-secondary)]">Diagnosis</span>
              <textarea
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-[var(--attio-border)] px-3 py-2 text-[13px] outline-none focus:border-[var(--attio-text)]"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[12px] font-medium text-[var(--attio-text-secondary)]">Procedures / treatment</span>
              <textarea
                value={procedures}
                onChange={(e) => setProcedures(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-[var(--attio-border)] px-3 py-2 text-[13px] outline-none focus:border-[var(--attio-text)]"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[12px] font-medium text-[var(--attio-text-secondary)]">Discharge medications</span>
              <textarea
                value={medications}
                onChange={(e) => setMedications(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-[var(--attio-border)] px-3 py-2 text-[13px] outline-none focus:border-[var(--attio-text)]"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[12px] font-medium text-[var(--attio-text-secondary)]">Follow-up</span>
              <textarea
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-[var(--attio-border)] px-3 py-2 text-[13px] outline-none focus:border-[var(--attio-text)]"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[12px] font-medium text-[var(--attio-text-secondary)]">Additional notes</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-[var(--attio-border)] px-3 py-2 text-[13px] outline-none focus:border-[var(--attio-text)]"
              />
            </label>
            <div className="pt-2">
              <AttioButton variant="primary" onClick={save} disabled={saving}>
                Save discharge summary
              </AttioButton>
            </div>
          </div>
        </Panel>
      </div>
    </PageChrome>
  );
}
