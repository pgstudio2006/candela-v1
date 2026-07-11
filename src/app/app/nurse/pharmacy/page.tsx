"use client";

import { useNurseStore } from "@/components/nurse/nurse-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, Panel, StatusBadge } from "@/components/frontdesk/ui";
import { useNursePoll } from "@/hooks/use-nurse-poll";
import { useToast } from "@/components/ui/toast-provider";
import { X } from "lucide-react";
import { useMemo, useState } from "react";

const emptyLine = () => ({ drug: "", dose: "1 tab", frequency: "OD", duration: "7 days", instructions: "" });

export default function NursePharmacyOrdersPage() {
  useNursePoll();
  const { toast } = useToast();
  const { episodes, patients, handoffs, createPharmacyOrder } = useNurseStore();
  const [visitId, setVisitId] = useState("");
  const [lines, setLines] = useState([emptyLine()]);
  const [priority, setPriority] = useState<"routine" | "urgent" | "stat">("routine");
  const [saving, setSaving] = useState(false);

  const activeEpisodes = useMemo(
    () =>
      episodes
        .filter((e) => e.status !== "completed")
        .map((e) => ({
          visitId: e.visitId,
          patientName: patients.find((p) => p.id === e.patientId)?.name ?? handoffs.find((h) => h.visitId === e.visitId)?.patientName ?? "Patient",
          uhid: handoffs.find((h) => h.visitId === e.visitId)?.uhid ?? "",
        })),
    [episodes, patients, handoffs],
  );

  const selected = activeEpisodes.find((e) => e.visitId === visitId);

  const updateLine = (idx: number, patch: Partial<ReturnType<typeof emptyLine>>) => {
    setLines(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const saveOrder = async () => {
    if (!selected || lines.length === 0 || lines.some((l) => !l.drug.trim())) {
      toast("Select patient and add at least one medicine", "error");
      return;
    }
    setSaving(true);
    const result = await createPharmacyOrder(selected.visitId, {
      patientName: selected.patientName,
      uhid: selected.uhid,
      priority,
      lines,
    });
    setSaving(false);
    if (!result.ok) {
      toast(result.error ?? "Failed to create pharmacy order", "error");
      return;
    }
    toast(`Pharmacy order created ${result.rxId ? `· ${result.rxId}` : ""}`, "success");
    setVisitId("");
    setLines([emptyLine()]);
    setPriority("routine");
  };

  return (
    <PageChrome
      breadcrumbs={[{ label: "Nursing", href: "/app/nurse" }, { label: "Pharmacy orders" }]}
      title="IPD pharmacy orders"
      meta="Send medicine orders to pharmacy from nursing"
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="New order">
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-[12px] font-medium text-[var(--attio-text-secondary)]">Patient</span>
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
              <div className="flex gap-2 text-[12px] text-[var(--attio-text-secondary)]">
                <span>{selected.patientName}</span>
                <span>·</span>
                <span>{selected.uhid}</span>
              </div>
            )}
            <label className="block space-y-1">
              <span className="text-[12px] font-medium text-[var(--attio-text-secondary)]">Priority</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as typeof priority)}
                className="h-9 w-full rounded-md border border-[var(--attio-border)] bg-white px-3 text-[13px] outline-none focus:border-[var(--attio-text)]"
              >
                <option value="routine">Routine</option>
                <option value="urgent">Urgent</option>
                <option value="stat">STAT</option>
              </select>
            </label>
            <div className="space-y-2">
              {lines.map((line, idx) => (
                <div key={idx} className="grid gap-2 rounded-lg border border-[var(--attio-border-subtle)] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[12px] font-medium text-[var(--attio-text-secondary)]">Medicine {idx + 1}</span>
                    {lines.length > 1 && (
                      <button type="button" onClick={() => setLines(lines.filter((_, i) => i !== idx))} className="text-[var(--attio-text-tertiary)] hover:text-red-500">
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>
                  <label className="block space-y-1">
                    <span className="text-[11px] text-[var(--attio-text-tertiary)]">Medicine</span>
                    <input
                      value={line.drug}
                      onChange={(e) => updateLine(idx, { drug: e.target.value })}
                      className="h-9 w-full rounded-md border border-[var(--attio-border)] px-3 text-[13px] outline-none focus:border-[var(--attio-text)]"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block space-y-1">
                      <span className="text-[11px] text-[var(--attio-text-tertiary)]">Dose</span>
                      <input
                        value={line.dose}
                        onChange={(e) => updateLine(idx, { dose: e.target.value })}
                        className="h-9 w-full rounded-md border border-[var(--attio-border)] px-3 text-[13px] outline-none focus:border-[var(--attio-text)]"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-[11px] text-[var(--attio-text-tertiary)]">Frequency</span>
                      <input
                        value={line.frequency}
                        onChange={(e) => updateLine(idx, { frequency: e.target.value })}
                        className="h-9 w-full rounded-md border border-[var(--attio-border)] px-3 text-[13px] outline-none focus:border-[var(--attio-text)]"
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block space-y-1">
                      <span className="text-[11px] text-[var(--attio-text-tertiary)]">Duration</span>
                      <input
                        value={line.duration}
                        onChange={(e) => updateLine(idx, { duration: e.target.value })}
                        className="h-9 w-full rounded-md border border-[var(--attio-border)] px-3 text-[13px] outline-none focus:border-[var(--attio-text)]"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-[11px] text-[var(--attio-text-tertiary)]">Instructions</span>
                      <input
                        value={line.instructions}
                        onChange={(e) => updateLine(idx, { instructions: e.target.value })}
                        className="h-9 w-full rounded-md border border-[var(--attio-border)] px-3 text-[13px] outline-none focus:border-[var(--attio-text)]"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
            <AttioButton
              variant="secondary"
              onClick={() => setLines([...lines, emptyLine()])}
              className="text-[12px]"
            >
              + Add medicine
            </AttioButton>
            <div className="pt-2">
              <AttioButton variant="primary" onClick={saveOrder} disabled={saving}>
                Send to pharmacy
              </AttioButton>
            </div>
          </div>
        </Panel>

        <Panel title="Recent IPD orders">
          <p className="text-[13px] text-[var(--attio-text-tertiary)]">
            Orders created here appear in the pharmacy queue with source <StatusBadge label="ipd" variant="info" />. Pharmacy staff verify and dispense.
          </p>
        </Panel>
      </div>
    </PageChrome>
  );
}
