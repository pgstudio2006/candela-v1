"use client";

import { useNurseStore } from "@/components/nurse/nurse-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { Panel } from "@/components/frontdesk/ui";
import { PublishedSchemaForm } from "@/components/candela/published-schema-form";
import { usePublishedFormSchema } from "@/hooks/use-published-form-schema";
import { saveSubmissionAction } from "@/app/actions/clinical-actions";
import { useNursePoll } from "@/hooks/use-nurse-poll";
import { useToast } from "@/components/ui/toast-provider";
import { useMemo, useState } from "react";

export default function NurseScoresPage() {
  useNursePoll();
  const { toast } = useToast();
  const { episodes, patients, handoffs, getEpisode } = useNurseStore();
  const schema = usePublishedFormSchema("nurse-scores");
  const [visitId, setVisitId] = useState("");
  const [saving, setSaving] = useState(false);

  const activeEpisodes = useMemo(
    () =>
      episodes
        .filter((e) => e.status !== "completed")
        .map((e) => ({
          visitId: e.visitId,
          patientName: patients.find((p) => p.id === e.patientId)?.name ?? handoffs.find((h) => h.visitId === e.visitId)?.patientName ?? "Patient",
          uhid: handoffs.find((h) => h.visitId === e.visitId)?.uhid ?? "",
          patientId: e.patientId,
        })),
    [episodes, patients, handoffs],
  );

  const selected = activeEpisodes.find((e) => e.visitId === visitId);

  const save = async (data: Record<string, string | number | boolean>) => {
    if (!selected) {
      toast("Select a patient", "error");
      return;
    }
    setSaving(true);
    try {
      await saveSubmissionAction("nurse-scores", data, { visitId: selected.visitId, patientId: selected.patientId }, true);
      toast("Scores saved", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to save scores", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageChrome
      breadcrumbs={[{ label: "Nursing", href: "/app/nurse" }, { label: "Scores" }]}
      title="Nursing scores"
      meta="Capture slider scores configured in form builder"
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Patient">
          <label className="block space-y-1">
            <span className="text-[12px] font-medium text-[var(--attio-text-secondary)]">Active episode</span>
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
        </Panel>

        {schema && selected && (
          <Panel title="Score capture">
            <PublishedSchemaForm
              schema={schema}
              submitLabel={saving ? "Saving..." : "Save scores"}
              submitStatus={saving ? "saving" : "idle"}
              onSubmit={save}
            />
          </Panel>
        )}
      </div>
    </PageChrome>
  );
}
