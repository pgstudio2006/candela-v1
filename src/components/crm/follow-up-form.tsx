"use client";

import type { CrmAgent, CrmFollowUp, CrmLead } from "@/design-system/crm-data";
import { PublishedSchemaForm } from "@/components/candela/published-schema-form";
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
import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

function defaultScheduleLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setMinutes(0, 0, 0);
  return d.toISOString().slice(0, 16);
}

export function FollowUpScheduleModal({
  open,
  onClose,
  leads,
  agents,
  defaultLeadId,
  defaultAssigneeId,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  leads: CrmLead[];
  agents: CrmAgent[];
  defaultLeadId?: string;
  defaultAssigneeId?: string;
  onSave: (fu: Omit<CrmFollowUp, "id" | "status">) => Promise<void>;
}) {
  const openLeads = useMemo(
    () => leads.filter((l) => !["won", "lost"].includes(l.stageId)).sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [leads],
  );
  const assignableAgents = useMemo(() => agents.filter((a) => a.active && a.role !== "manager"), [agents]);

  const [leadId, setLeadId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [channel, setChannel] = useState<CrmFollowUp["channel"]>("call");
  const [scheduledAt, setScheduledAt] = useState(defaultScheduleLocal());
  const [notes, setNotes] = useState("");
  const [followupSchema, setFollowupSchema] = useState<Record<string, string | number | boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const lead = defaultLeadId ? openLeads.find((l) => l.id === defaultLeadId) : openLeads[0];
    setLeadId(lead?.id ?? "");
    setAssigneeId(defaultAssigneeId ?? lead?.assigneeId ?? assignableAgents[0]?.id ?? "");
    setChannel("call");
    setScheduledAt(defaultScheduleLocal());
    setNotes("");
    setFollowupSchema({});
  }, [open, defaultLeadId, defaultAssigneeId, openLeads, assignableAgents]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadId || !assigneeId || !scheduledAt) return;
    const followupNotes = String(followupSchema.followupNotes ?? notes).trim();
    const outcome = followupSchema.outcome ? ` [${followupSchema.outcome}]` : "";
    setSaving(true);
    setError("");
    try {
      await onSave({
        leadId,
        assigneeId,
        channel,
        scheduledAt: new Date(scheduledAt).toISOString(),
        notes: followupNotes ? `${followupNotes}${outcome}` : outcome.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to schedule follow-up.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-xl border border-[var(--attio-border)] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-[15px] font-semibold">Schedule follow-up</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-[var(--attio-text-tertiary)] hover:bg-[var(--attio-surface)]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-4">
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</p>}
          <div className="space-y-1.5">
            <Label htmlFor="fu-lead">Lead</Label>
            <Select value={leadId} onValueChange={(v) => v && setLeadId(v)}>
              <SelectTrigger id="fu-lead">
                <SelectValue placeholder="Select lead" />
              </SelectTrigger>
              <SelectContent>
                {openLeads.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.fullName} · {l.phone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {openLeads.length === 0 && (
              <p className="text-[11px] text-[var(--attio-text-tertiary)]">No open leads — add a lead first.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fu-assignee">Assignee</Label>
            <Select value={assigneeId} onValueChange={(v) => v && setAssigneeId(v)}>
              <SelectTrigger id="fu-assignee">
                <SelectValue placeholder="Team member" />
              </SelectTrigger>
              <SelectContent>
                {assignableAgents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fu-channel">Channel</Label>
              <Select value={channel} onValueChange={(v) => v && setChannel(v as CrmFollowUp["channel"])}>
                <SelectTrigger id="fu-channel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="call">Call</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fu-when">When</Label>
              <Input
                id="fu-when"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                required
              />
            </div>
          </div>

          <PublishedSchemaForm
            schemaId="crm-followup"
            hideSubmit
            initialValues={followupSchema}
            onValuesChange={setFollowupSchema}
          />

          <div className="flex justify-end gap-2 pt-1">
            <AttioButton type="button" variant="secondary" onClick={onClose}>
              Cancel
            </AttioButton>
            <AttioButton type="submit" variant="primary" disabled={saving || !leadId || !assigneeId || openLeads.length === 0}>
              {saving ? "Saving..." : "Schedule"}
            </AttioButton>
          </div>
        </form>
      </div>
    </div>
  );
}

export function FollowUpCompleteModal({
  open,
  onClose,
  leadName,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  leadName: string;
  onSave: (outcome: string) => Promise<void>;
}) {
  const [outcome, setOutcome] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setOutcome("");
      setError("");
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-sm rounded-xl border border-[var(--attio-border)] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-[15px] font-semibold">Mark follow-up done</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-[var(--attio-text-tertiary)] hover:bg-[var(--attio-surface)]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!outcome.trim()) return;
            setSaving(true);
            setError("");
            try {
              await onSave(outcome.trim());
              onClose();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed to save outcome.");
            } finally {
              setSaving(false);
            }
          }}
          className="space-y-4 p-4"
        >
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</p>}
          <p className="text-[13px] text-[var(--attio-text-secondary)]">{leadName}</p>
          <div className="space-y-1.5">
            <Label htmlFor="fu-outcome">Outcome</Label>
            <Input
              id="fu-outcome"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              placeholder="Patient agreed to visit, needs callback, etc."
              required
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <AttioButton type="button" variant="secondary" onClick={onClose}>
              Cancel
            </AttioButton>
            <AttioButton type="submit" variant="primary" disabled={saving || !outcome.trim()}>
              {saving ? "Saving..." : "Save"}
            </AttioButton>
          </div>
        </form>
      </div>
    </div>
  );
}
