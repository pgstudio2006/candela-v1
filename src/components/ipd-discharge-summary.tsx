"use client";

import { useEffect, useState } from "react";
import { Panel, AttioButton, StatusBadge } from "@/components/frontdesk/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  generateDischargeSummaryAction,
  saveDischargeSummaryAction,
  generateDeathSummaryAction,
  saveDeathSummaryAction,
  markIpdReadyForDischargeAction,
  getIpdAdmissionAction,
} from "@/app/actions/ipd-actions";
import { useToast } from "@/components/ui/toast-provider";
import type { IpdAdmissionDetail } from "@/design-system/ipd-data";

export function IpdDischargeSummaryPanel({ admissionId, onSaved }: { admissionId: string; onSaved?: () => void }) {
  const { toast } = useToast();
  const [admission, setAdmission] = useState<IpdAdmissionDetail | null>(null);
  const [mode, setMode] = useState<"discharge" | "death" | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [markingReady, setMarkingReady] = useState(false);
  const [summary, setSummary] = useState<Record<string, string>>({});

  const refreshAdmission = async () => {
    const res = await getIpdAdmissionAction(admissionId);
    if (res.ok) {
      setAdmission(res.data);
    } else {
      toast(res.error ?? "Failed to load admission", "error");
    }
  };

  useEffect(() => {
    void refreshAdmission();
  }, [admissionId]);

  const generate = async (m: "discharge" | "death") => {
    setMode(m);
    setLoading(true);
    const res = m === "discharge" ? await generateDischargeSummaryAction(admissionId) : await generateDeathSummaryAction(admissionId);
    if (res.ok) {
      setSummary({
        ...res.data,
        admissionDate: new Date(res.data.admissionDate).toLocaleString("en-IN"),
        dischargeDate: "dischargeDate" in res.data ? new Date((res.data as any).dischargeDate).toLocaleString("en-IN") : "",
        deathDate: "deathDate" in res.data ? new Date((res.data as any).deathDate).toLocaleString("en-IN") : "",
      });
    } else {
      toast(res.error ?? "Failed to generate summary", "error");
    }
    setLoading(false);
  };

  const save = async () => {
    setSaving(true);
    const payload = {
      ...summary,
      admissionDate: new Date(summary.admissionDate).toISOString(),
      preparedAt: new Date().toISOString(),
    } as any;
    if (mode === "discharge") {
      payload.dischargeDate = summary.dischargeDate ? new Date(summary.dischargeDate).toISOString() : new Date().toISOString();
      const res = await saveDischargeSummaryAction(admissionId, payload);
      if (res.ok) toast("Discharge summary saved", "success");
      else toast(res.error ?? "Failed to save", "error");
    } else {
      payload.deathDate = summary.deathDate ? new Date(summary.deathDate).toISOString() : new Date().toISOString();
      const res = await saveDeathSummaryAction(admissionId, payload);
      if (res.ok) toast("Death summary saved", "success");
      else toast(res.error ?? "Failed to save", "error");
    }
    setSaving(false);
    await refreshAdmission();
    onSaved?.();
  };

  const markReady = async () => {
    setMarkingReady(true);
    const res = await markIpdReadyForDischargeAction(admissionId);
    if (res.ok) {
      toast("Patient marked ready for discharge", "success");
      await refreshAdmission();
      onSaved?.();
    } else {
      toast(res.error ?? "Failed to mark ready for discharge", "error");
    }
    setMarkingReady(false);
  };

  const dischargeSummarySaved = Boolean(admission?.dischargeSummary);
  const isDoctorReady = admission?.status === "doctor_ready";
  const isDischarged = admission?.status === "discharged";

  return (
    <Panel title="Discharge / Death summary">
      <div className="flex gap-2">
        <AttioButton variant="secondary" onClick={() => void generate("discharge")} disabled={loading}>
          {loading && mode === "discharge" ? "Loading..." : "Discharge summary"}
        </AttioButton>
        <AttioButton variant="secondary" onClick={() => void generate("death")} disabled={loading}>
          {loading && mode === "death" ? "Loading..." : "Death summary"}
        </AttioButton>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isDoctorReady && <StatusBadge label="Ready for discharge" variant="success" />}
          {isDischarged && <StatusBadge label="Discharged" variant="success" />}
        </div>
        {mode === "discharge" && !isDischarged && !isDoctorReady && (
          <AttioButton
            variant="primary"
            onClick={() => void markReady()}
            disabled={markingReady || !dischargeSummarySaved}
          >
            {markingReady ? "Marking ready…" : "Mark ready for discharge"}
          </AttioButton>
        )}
        {mode === "discharge" && isDoctorReady && (
          <StatusBadge label="Ready for discharge" variant="success" />
        )}
      </div>
      {mode === "discharge" && !isDischarged && !dischargeSummarySaved && (
        <p className="mt-2 text-[11px] text-[var(--attio-text-tertiary)]">
          Save the discharge summary above to enable the “Mark ready for discharge” button.
        </p>
      )}
      {mode && (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-[12px]">Admission date</Label>
              <Input value={summary.admissionDate ?? ""} onChange={(e) => setSummary({ ...summary, admissionDate: e.target.value })} className="h-8 text-[13px]" />
            </div>
            <div className="space-y-1">
              <Label className="text-[12px]">{mode === "discharge" ? "Discharge date" : "Death date"}</Label>
              <Input
                value={mode === "discharge" ? (summary.dischargeDate ?? "") : (summary.deathDate ?? "")}
                onChange={(e) => setSummary({ ...summary, [mode === "discharge" ? "dischargeDate" : "deathDate"]: e.target.value })}
                className="h-8 text-[13px]"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[12px]">Diagnosis</Label>
            <Textarea value={summary.diagnosis ?? ""} onChange={(e) => setSummary({ ...summary, diagnosis: e.target.value })} className="min-h-[60px] text-[13px]" />
          </div>
          {mode === "death" && (
            <div className="space-y-1">
              <Label className="text-[12px]">Cause of death</Label>
              <Input value={summary.causeOfDeath ?? ""} onChange={(e) => setSummary({ ...summary, causeOfDeath: e.target.value })} className="h-8 text-[13px]" />
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-[12px]">Procedures</Label>
            <Textarea value={summary.procedures ?? ""} onChange={(e) => setSummary({ ...summary, procedures: e.target.value })} className="min-h-[60px] text-[13px]" />
          </div>
          <div className="space-y-1">
            <Label className="text-[12px]">Medications</Label>
            <Textarea value={summary.medications ?? ""} onChange={(e) => setSummary({ ...summary, medications: e.target.value })} className="min-h-[60px] text-[13px]" />
          </div>
          {mode === "discharge" && (
            <div className="space-y-1">
              <Label className="text-[12px]">Follow up</Label>
              <Textarea value={summary.followUp ?? ""} onChange={(e) => setSummary({ ...summary, followUp: e.target.value })} className="min-h-[60px] text-[13px]" />
            </div>
          )}
          {mode === "death" && (
            <div className="space-y-1">
              <Label className="text-[12px]">Contributing conditions</Label>
              <Textarea value={summary.contributingConditions ?? ""} onChange={(e) => setSummary({ ...summary, contributingConditions: e.target.value })} className="min-h-[60px] text-[13px]" />
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-[12px]">Notes</Label>
            <Textarea value={summary.notes ?? ""} onChange={(e) => setSummary({ ...summary, notes: e.target.value })} className="min-h-[80px] text-[13px]" />
          </div>
          <div className="flex justify-end">
            <AttioButton onClick={() => void save()} disabled={saving}>
              {saving ? "Saving..." : "Save summary"}
            </AttioButton>
          </div>
        </div>
      )}
    </Panel>
  );
}
