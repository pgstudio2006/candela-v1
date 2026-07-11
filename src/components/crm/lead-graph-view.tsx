"use client";

import type { CrmAgent, CrmLead, CrmPipelineStage } from "@/design-system/crm-data";
import { SOURCE_LABELS } from "@/design-system/crm-data";
import { Panel, StatusBadge } from "@/components/frontdesk/ui";

const SOURCE_COLORS: Record<string, string> = {
  whatsapp: "bg-emerald-500",
  google_forms: "bg-blue-500",
  meta_ads: "bg-purple-500",
  website: "bg-cyan-500",
  walk_in: "bg-amber-500",
  phone: "bg-indigo-500",
  doctor_referral: "bg-rose-500",
  camp: "bg-teal-500",
};

export function CrmLeadGraphView({
  leads,
  stages,
  agents,
}: {
  leads: CrmLead[];
  stages: CrmPipelineStage[];
  agents: CrmAgent[];
}) {
  const orderedStages = [...stages].sort((a, b) => a.order - b.order);
  const total = leads.length || 1;
  const converted = leads.filter((l) => l.stageId === "won" || l.stageId === "converted").length;
  const lost = leads.filter((l) => l.stageId === "lost").length;
  const open = leads.filter((l) => l.stageId !== "won" && l.stageId !== "converted" && l.stageId !== "lost").length;

  const stageCounts = orderedStages.map((s) => ({
    stage: s,
    count: leads.filter((l) => l.stageId === s.id).length,
  }));
  const sourceCounts = Object.entries(SOURCE_LABELS).map(([key, label]) => ({
    key,
    label,
    count: leads.filter((l) => l.source === key).length,
  }));

  const agentCounts = agents
    .filter((a) => a.role !== "manager")
    .map((a) => ({
      agent: a,
      count: leads.filter((l) => l.assigneeId === a.id).length,
      converted: leads.filter((l) => l.assigneeId === a.id && (l.stageId === "won" || l.stageId === "converted")).length,
    }));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Panel title="Total leads" className="p-4">
          <p className="text-2xl font-bold">{leads.length}</p>
        </Panel>
        <Panel title="Open" className="p-4">
          <p className="text-2xl font-bold text-amber-600">{open}</p>
          <p className="text-[11px] text-[var(--attio-text-tertiary)]">{Math.round((open / total) * 100)}% of pipeline</p>
        </Panel>
        <Panel title="Converted" className="p-4">
          <p className="text-2xl font-bold text-emerald-600">{converted}</p>
          <p className="text-[11px] text-[var(--attio-text-tertiary)]">{Math.round((converted / total) * 100)}% conversion</p>
        </Panel>
        <Panel title="Lost" className="p-4">
          <p className="text-2xl font-bold text-red-600">{lost}</p>
          <p className="text-[11px] text-[var(--attio-text-tertiary)]">{Math.round((lost / total) * 100)}% of pipeline</p>
        </Panel>
      </div>

      <Panel title="Stage distribution" className="p-4">
        <div className="space-y-2">
          {stageCounts.map(({ stage, count }) => {
            const pct = Math.round((count / total) * 100);
            return (
              <div key={stage.id} className="flex items-center gap-3">
                <div className="flex w-32 items-center gap-1.5 text-[12px]">
                  <span className="size-2 rounded-full" style={{ background: stage.color }} />
                  <span className="truncate">{stage.label}</span>
                </div>
                <div className="flex-1">
                  <div className="h-4 overflow-hidden rounded bg-[var(--attio-border-subtle)]">
                    <div className="h-full rounded" style={{ width: `${Math.max(pct, 2)}%`, background: stage.color }} />
                  </div>
                </div>
                <span className="w-20 text-right text-[12px] tabular-nums">
                  {count} ({pct}%)
                </span>
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Source distribution" className="p-4">
          <div className="space-y-2">
            {sourceCounts.map(({ key, label, count }) => {
              const pct = Math.round((count / total) * 100);
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 text-[12px]">{label}</span>
                  <div className="flex-1">
                    <div className="h-4 overflow-hidden rounded bg-[var(--attio-border-subtle)]">
                      <div className={`h-full rounded ${SOURCE_COLORS[key] ?? "bg-slate-400"}`} style={{ width: `${Math.max(pct, 2)}%` }} />
                    </div>
                  </div>
                  <span className="w-20 text-right text-[12px] tabular-nums">{count} ({pct}%)</span>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="By counsellor" className="p-4">
          <div className="space-y-2">
            {agentCounts.length === 0 && (
              <p className="text-[13px] text-[var(--attio-text-tertiary)]">No counsellors added yet.</p>
            )}
            {agentCounts.map(({ agent, count, converted }) => (
              <div key={agent.id} className="flex items-center justify-between text-[13px]">
                <span className="font-medium">{agent.name}</span>
                <div className="flex items-center gap-2">
                  <StatusBadge label={`${count} leads`} variant="neutral" />
                  <StatusBadge label={`${converted} won`} variant="success" />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
