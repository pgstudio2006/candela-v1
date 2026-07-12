"use client";

import type { CrmAgent, CrmAssignmentRule } from "@/design-system/crm-data";
import { AttioButton } from "@/components/frontdesk/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const STRATEGIES: CrmAssignmentRule["strategy"][] = [
  "percentage",
  "round_robin",
  "by_source",
  "by_specialty",
  "manual",
];

function Field({
  label,
  required,
  hint,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-[12px] text-[var(--attio-text-secondary)]">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-[var(--attio-text-tertiary)]">{hint}</p>}
    </div>
  );
}

export function CrmRuleFormModal({
  open,
  onClose,
  initial,
  agents,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  initial?: CrmAssignmentRule;
  agents: CrmAgent[];
  onSave: (rule: Omit<CrmAssignmentRule, "id">) => Promise<void>;
}) {
  const [label, setLabel] = useState("");
  const [strategy, setStrategy] = useState<CrmAssignmentRule["strategy"]>("percentage");
  const [active, setActive] = useState(true);
  const [source, setSource] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const teamAgents = useMemo(() => agents.filter((a) => a.role !== "manager"), [agents]);
  const teamAgentIds = useMemo(() => teamAgents.map((a) => a.id), [teamAgents]);

  useEffect(() => {
    if (!open) return;
    setLabel(initial?.label ?? "");
    setStrategy(initial?.strategy ?? "percentage");
    setActive(initial?.active ?? true);
    setSource(initial?.source ?? "");
    setSpecialty(initial?.specialty ?? "");
    setSelectedIds(initial?.assignToAgentIds ?? teamAgentIds);
    setWeights(initial?.agentWeights ?? {});
  }, [open, initial?.id, teamAgentIds.join(",")]);

  const toggleAgent = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const weightSum = selectedIds.reduce((s, id) => s + (weights[id] ?? 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !selectedIds.length) return;
    const agentWeights: Record<string, number> = {};
    if (strategy === "percentage") {
      for (const id of selectedIds) {
        agentWeights[id] = weights[id] ?? Math.floor(100 / selectedIds.length);
      }
      const total = selectedIds.reduce((s, id) => s + agentWeights[id], 0);
      if (total !== 100) {
        setError("Percentage weights must total 100%.");
        return;
      }
    }
    setSaving(true);
    setError("");
    try {
      await onSave({
        label: label.trim(),
        active,
        strategy,
        source: strategy === "by_source" && source ? (source as CrmAssignmentRule["source"]) : undefined,
        specialty: strategy === "by_specialty" ? specialty : undefined,
        assignToAgentIds: selectedIds,
        agentWeights: strategy === "percentage" ? agentWeights : undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save rule.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-[var(--attio-border)] bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-[15px] font-semibold">{initial ? "Edit routing rule" : "Add routing rule"}</h2>
            <p className="text-[12px] text-[var(--attio-text-tertiary)]">Define how inbound leads are distributed across your team.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-[var(--attio-hover)]">
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</p>}
          <section className="mb-4 space-y-3">
            <Field label="Rule name" required>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} required />
            </Field>
            <Field label="Strategy">
              <Select value={strategy} onValueChange={(v) => v && setStrategy(v as CrmAssignmentRule["strategy"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STRATEGIES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {strategy === "by_source" && (
              <Field label="Source filter" hint="e.g. whatsapp, google_forms">
                <Input placeholder="Source" value={source} onChange={(e) => setSource(e.target.value)} />
              </Field>
            )}
            {strategy === "by_specialty" && (
              <Field label="Specialty filter" hint="e.g. spine, knee">
                <Input placeholder="Specialty" value={specialty} onChange={(e) => setSpecialty(e.target.value)} />
              </Field>
            )}
          </section>

          <section className="mb-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--attio-text-tertiary)]">Agent pool</p>
            <div className="flex flex-wrap gap-2">
              {teamAgents.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => toggleAgent(a.id)}
                  className={`rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                    selectedIds.includes(a.id)
                      ? "border-[var(--attio-text)] bg-[var(--attio-text)] text-white"
                      : "border-[var(--attio-border)] bg-white hover:bg-[var(--attio-surface)]"
                  }`}
                >
                  {a.name.split(" ")[0]}
                </button>
              ))}
            </div>
          </section>

          {strategy === "percentage" && selectedIds.length > 0 && (
            <section className="mb-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--attio-text-tertiary)]">
                Percentage split (should total 100%)
              </p>
              <div className="space-y-2 rounded-lg border border-[var(--attio-border-subtle)] bg-[var(--attio-surface)] p-3">
                {selectedIds.map((id) => {
                  const agent = teamAgents.find((a) => a.id === id);
                  return (
                    <div key={id} className="flex items-center gap-2">
                      <span className="w-24 shrink-0 text-[12px] font-medium">{agent?.name.split(" ")[0]}</span>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={weights[id] ?? agent?.leadWeightPercent ?? ""}
                        onChange={(e) => setWeights((w) => ({ ...w, [id]: Number(e.target.value) }))}
                        className="w-20"
                      />
                      <span className="text-[12px] text-[var(--attio-text-tertiary)]">%</span>
                    </div>
                  );
                })}
                <p className={`text-[11px] font-medium ${weightSum === 100 ? "text-emerald-600" : "text-amber-600"}`}>
                  Total: {weightSum}%
                </p>
              </div>
            </section>
          )}

          <label className="mb-4 flex cursor-pointer items-start gap-2 text-[13px]">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="mt-0.5" />
            <span>
              <span className="font-medium">Rule active</span>
              <span className="block text-[11px] text-[var(--attio-text-tertiary)]">Inactive rules are skipped during lead assignment.</span>
            </span>
          </label>

          <div className="flex justify-end gap-2 border-t pt-4">
            <AttioButton type="button" variant="secondary" onClick={onClose}>
              Cancel
            </AttioButton>
            <AttioButton type="submit" variant="primary" disabled={saving}>
              {saving ? "Saving..." : "Save rule"}
            </AttioButton>
          </div>
        </form>
      </div>
    </div>
  );
}

export function CrmAbsenceModal({
  open,
  onClose,
  agent,
  agents,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  agent: CrmAgent;
  agents: CrmAgent[];
  onConfirm: (until: string, reason: string, transfer: boolean) => void;
}) {
  const [until, setUntil] = useState("");
  const [reason, setReason] = useState("Leave / not available");
  const [transfer, setTransfer] = useState(true);

  useEffect(() => {
    if (!open) return;
    const d = new Date();
    d.setDate(d.getDate() + 1);
    setUntil(d.toISOString().slice(0, 16));
    setReason("Leave / not available");
    setTransfer(true);
  }, [open, agent.id]);

  const backupName = agents.find((a) => a.id === agent.backupAgentId)?.name ?? "next available agent";

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-xl border border-[var(--attio-border)] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-[15px] font-semibold">Mark {agent.name} unavailable</h2>
            <p className="text-[12px] text-[var(--attio-text-tertiary)]">Open leads can transfer to backup ({backupName}).</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-[var(--attio-hover)]">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          <Field label="Unavailable until" required>
            <Input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} required />
          </Field>
          <Field label="Reason">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <label className="flex cursor-pointer items-start gap-2 text-[13px]">
            <input type="checkbox" checked={transfer} onChange={(e) => setTransfer(e.target.checked)} className="mt-0.5" />
            <span>
              <span className="font-medium">Transfer open leads now</span>
              <span className="block text-[11px] text-[var(--attio-text-tertiary)]">Reassigns active leads to the backup agent immediately.</span>
            </span>
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <AttioButton variant="secondary" onClick={onClose}>
            Cancel
          </AttioButton>
          <AttioButton variant="primary" onClick={() => onConfirm(new Date(until).toISOString(), reason, transfer)} disabled={!until}>
            Confirm absence
          </AttioButton>
        </div>
      </div>
    </div>
  );
}
