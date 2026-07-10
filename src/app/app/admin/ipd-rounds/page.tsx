"use client";

import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, Panel, StatusBadge } from "@/components/frontdesk/ui";
import {
  deleteIpdRoundConfigAction,
  getIpdRoundConfigsAction,
  saveIpdRoundConfigAction,
} from "@/app/actions/ipd-actions";
import { useToast } from "@/components/ui/toast-provider";
import { useEffect, useState } from "react";

type RoundConfig = {
  id: string;
  name: string;
  scheduleAt?: string;
  vitals: string[];
  notes: string[];
  active: boolean;
};

function tagsFromString(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function tagsToString(tags: string[]): string {
  return tags.join(", ");
}

export default function AdminIpdRoundsPage() {
  const { toast } = useToast();
  const [configs, setConfigs] = useState<RoundConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<RoundConfig | null>(null);
  const [form, setForm] = useState({
    name: "",
    scheduleAt: "",
    vitals: "",
    notes: "",
    active: true,
  });

  const load = () => {
    setLoading(true);
    getIpdRoundConfigsAction()
      .then((res) => {
        if (res.ok && res.data) setConfigs(res.data as RoundConfig[]);
        else toast((res as any).error || "Failed to load round configs", "error");
      })
      .catch((err) => toast(err instanceof Error ? err.message : "Failed to load round configs", "error"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const startNew = () => {
    setEditing(null);
    setForm({ name: "", scheduleAt: "", vitals: "", notes: "", active: true });
  };

  const startEdit = (cfg: RoundConfig) => {
    setEditing(cfg);
    setForm({
      name: cfg.name,
      scheduleAt: cfg.scheduleAt ?? "",
      vitals: tagsToString(cfg.vitals),
      notes: tagsToString(cfg.notes),
      active: cfg.active,
    });
  };

  const handleSave = async () => {
    if (!form.name.trim()) return toast("Round name is required", "error");
    setBusy(true);
    const res = await saveIpdRoundConfigAction({
      id: editing?.id,
      name: form.name.trim(),
      scheduleAt: form.scheduleAt.trim() || undefined,
      vitals: tagsFromString(form.vitals),
      notes: tagsFromString(form.notes),
      active: form.active,
    });
    if (res.ok) {
      toast(editing ? "Round config updated" : "Round config created", "success");
      startNew();
      load();
    } else toast((res as any).error || "Failed to save round config", "error");
    setBusy(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this round configuration?")) return;
    setBusy(true);
    const res = await deleteIpdRoundConfigAction(id);
    if (res.ok) {
      toast("Round config deleted", "success");
      if (editing?.id === id) startNew();
      load();
    } else toast((res as any).error || "Failed to delete round config", "error");
    setBusy(false);
  };

  return (
    <PageChrome
      breadcrumbs={[
        { label: "Admin", href: "/app/admin" },
        { label: "IPD rounds" },
      ]}
      title="IPD round configuration"
      meta="Define nursing round schedules, vitals checklist, and note prompts"
    >
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Panel title={editing ? "Edit round" : "Add round"}>
          <div className="space-y-3">
            <label className="block text-[12px]">
              <span className="mb-1 block text-[var(--attio-text-tertiary)]">Round name</span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Morning round"
                className="h-9 w-full rounded-lg border border-[var(--attio-border)] bg-white px-3 text-[13px]"
              />
            </label>
            <label className="block text-[12px]">
              <span className="mb-1 block text-[var(--attio-text-tertiary)]">Schedule time</span>
              <input
                type="time"
                value={form.scheduleAt}
                onChange={(e) => setForm((f) => ({ ...f, scheduleAt: e.target.value }))}
                className="h-9 w-full rounded-lg border border-[var(--attio-border)] bg-white px-3 text-[13px]"
              />
            </label>
            <label className="block text-[12px]">
              <span className="mb-1 block text-[var(--attio-text-tertiary)]">Vitals checklist (comma-separated)</span>
              <input
                type="text"
                value={form.vitals}
                onChange={(e) => setForm((f) => ({ ...f, vitals: e.target.value }))}
                placeholder="BP, Pulse, SpO2, Temperature"
                className="h-9 w-full rounded-lg border border-[var(--attio-border)] bg-white px-3 text-[13px]"
              />
            </label>
            <label className="block text-[12px]">
              <span className="mb-1 block text-[var(--attio-text-tertiary)]">Note prompts (comma-separated)</span>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Pain, Output, Diet"
                className="h-9 w-full rounded-lg border border-[var(--attio-border)] bg-white px-3 text-[13px]"
              />
            </label>
            <label className="flex items-center gap-2 text-[12px]">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              />
              Active
            </label>
            <div className="flex gap-2 pt-2">
              <AttioButton variant="primary" disabled={busy} onClick={handleSave}>
                {busy ? "Saving…" : editing ? "Update" : "Create"}
              </AttioButton>
              {editing && (
                <AttioButton variant="secondary" disabled={busy} onClick={startNew}>
                  Cancel
                </AttioButton>
              )}
            </div>
          </div>
        </Panel>

        <Panel title="Configured rounds">
          {loading ? (
            <p className="py-6 text-center text-[13px] text-[var(--attio-text-tertiary)]">Loading…</p>
          ) : configs.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-[var(--attio-text-tertiary)]">
              No round configs yet. Create one to guide nursing rounds.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--attio-border-subtle)]">
              {configs.map((cfg) => (
                <li key={cfg.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[13px] font-medium">{cfg.name}</p>
                      <p className="text-[11px] text-[var(--attio-text-tertiary)]">
                        {cfg.scheduleAt ? `Scheduled at ${cfg.scheduleAt}` : "No fixed time"}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {cfg.vitals.map((v) => (
                          <StatusBadge key={v} label={v} variant="info" />
                        ))}
                        {cfg.notes.map((n) => (
                          <StatusBadge key={n} label={n} variant="neutral" />
                        ))}
                        {!cfg.active && <StatusBadge label="inactive" variant="warning" />}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <AttioButton variant="secondary" className="h-8 text-[12px]" onClick={() => startEdit(cfg)}>
                        Edit
                      </AttioButton>
                      <AttioButton variant="secondary" className="h-8 text-[12px]" onClick={() => handleDelete(cfg.id)}>
                        Delete
                      </AttioButton>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </PageChrome>
  );
}
