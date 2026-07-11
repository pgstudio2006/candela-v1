"use client";

import type { CrmAgent } from "@/design-system/crm-data";
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
import { useEffect, useState } from "react";

const SPECIALTY_OPTIONS = ["spine", "knee", "shoulder", "wellness", "general"];

type AgentFormProps = {
  open: boolean;
  onClose: () => void;
  initial?: CrmAgent;
  agents?: CrmAgent[];
  onSave: (data: Omit<CrmAgent, "id">, password?: string) => void;
};

export function CrmAgentFormModal({ open, onClose, initial, agents = [], onSave }: AgentFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CrmAgent["role"]>("counsellor");
  const [specialtyTags, setSpecialtyTags] = useState<string[]>([]);
  const [maxOpenLeads, setMaxOpenLeads] = useState(25);
  const [leadWeightPercent, setLeadWeightPercent] = useState(33);
  const [backupAgentId, setBackupAgentId] = useState("");
  const [active, setActive] = useState(true);
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setEmail(initial?.email ?? "");
    setRole(initial?.role ?? "counsellor");
    setSpecialtyTags(initial?.specialtyTags ?? []);
    setMaxOpenLeads(initial?.maxOpenLeads ?? 25);
    setLeadWeightPercent(initial?.leadWeightPercent ?? 33);
    setBackupAgentId(initial?.backupAgentId ?? "");
    setActive(initial?.active ?? true);
    setPassword("");
  }, [open, initial]);

  if (!open) return null;

  const toggleTag = (tag: string) => {
    setSpecialtyTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    onSave(
      {
        name: name.trim(),
        email: email.trim(),
        role,
        specialtyTags,
        maxOpenLeads,
        leadWeightPercent,
        backupAgentId: backupAgentId || undefined,
        active,
      },
      password.trim() || undefined,
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-lg rounded-xl border border-[var(--attio-border)] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-[15px] font-semibold">{initial ? "Edit team member" : "Add team member"}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-[var(--attio-hover)]">
            <X className="size-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-[12px]">Full name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-[13px]" required />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-[12px]">Work email *</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-9 text-[13px]" required />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-[12px]">{initial ? "New password (optional)" : "Login password"}</Label>
              <Input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={initial ? "Leave blank to keep current" : "Auto-generated if empty"}
                className="h-9 text-[13px] font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">Role</Label>
              <Select value={role} onValueChange={(v) => v && setRole(v as CrmAgent["role"])}>
                <SelectTrigger className="h-9 text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="counsellor">Counsellor</SelectItem>
                  <SelectItem value="team_lead">Team Lead</SelectItem>
                  <SelectItem value="caller">Caller / SDR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">Max open leads</Label>
              <Input type="number" value={maxOpenLeads} onChange={(e) => setMaxOpenLeads(Number(e.target.value))} className="h-9 text-[13px]" min={1} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">Lead weight %</Label>
              <Input type="number" value={leadWeightPercent} onChange={(e) => setLeadWeightPercent(Number(e.target.value))} className="h-9 text-[13px]" min={0} max={100} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-[12px]">Backup when absent</Label>
              <Select value={backupAgentId || "none"} onValueChange={(v) => setBackupAgentId(!v || v === "none" ? "" : v)}>
                <SelectTrigger className="h-9 text-[13px]">
                  <SelectValue placeholder="Select backup agent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {agents.filter((a) => a.id !== initial?.id).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-[12px]">Specialty tags (for routing)</Label>
            <div className="flex flex-wrap gap-2">
              {SPECIALTY_OPTIONS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`rounded-md border px-2.5 py-1 text-[12px] capitalize ${specialtyTags.includes(tag) ? "border-[var(--attio-text)] bg-[var(--attio-text)] text-white" : "border-[var(--attio-border)]"}`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Active — receives new lead assignments
          </label>
          <div className="flex justify-end gap-2 border-t pt-4">
            <AttioButton variant="secondary" type="button" onClick={onClose}>
              Cancel
            </AttioButton>
            <AttioButton variant="primary" type="submit">
              {initial ? "Save" : "Add person"}
            </AttioButton>
          </div>
        </form>
      </div>
    </div>
  );
}
