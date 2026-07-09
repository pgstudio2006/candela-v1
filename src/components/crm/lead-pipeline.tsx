"use client";

import type { CrmLead, CrmPipelineStage } from "@/design-system/crm-data";
import { cn, formatRelativeTime } from "@/lib/utils";

export function LeadPipelineBoard({
  leads,
  stages,
  agents,
  onSelect,
  onMoveStage,
}: {
  leads: CrmLead[];
  stages: CrmPipelineStage[];
  agents: { id: string; name: string }[];
  onSelect: (lead: CrmLead) => void;
  onMoveStage: (leadId: string, stageId: string) => void;
}) {
  const ordered = [...stages].sort((a, b) => a.order - b.order).filter((s) => s.id !== "lost");

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {ordered.map((stage) => {
        const col = leads.filter((l) => l.stageId === stage.id);
        return (
          <div key={stage.id} className="min-w-[240px] flex-1 shrink-0">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="flex items-center gap-2 text-[12px] font-semibold">
                <span className="size-2 rounded-full" style={{ background: stage.color }} />
                {stage.label}
              </span>
              <span className="text-[11px] tabular-nums text-[var(--attio-text-tertiary)]">{col.length}</span>
            </div>
            <div className="min-h-[320px] space-y-2 rounded-lg border border-[var(--attio-border-subtle)] bg-[var(--attio-surface)]/50 p-2">
              {col.map((lead) => {
                const agent = agents.find((a) => a.id === lead.assigneeId);
                const stageIdx = ordered.findIndex((s) => s.id === stage.id);
                const nextStage = ordered[stageIdx + 1];
                return (
                  <button
                    key={lead.id}
                    type="button"
                    onClick={() => onSelect(lead)}
                    className={cn(
                      "w-full rounded-lg border border-[var(--attio-border)] bg-white p-3 text-left shadow-sm transition-shadow hover:shadow-md",
                    )}
                  >
                    <p className="text-[13px] font-medium">{lead.fullName}</p>
                    <p className="mt-0.5 text-[11px] text-[var(--attio-text-tertiary)]">
                      {lead.phone}
                      {lead.city ? ` · ${lead.city}` : ""}
                    </p>
                    <p className="mt-2 text-[11px] text-[var(--attio-text-secondary)]">{agent?.name ?? "Unassigned"}</p>
                    <p className="mt-1 text-[10px] text-[var(--attio-text-tertiary)]">{formatRelativeTime(lead.createdAt)}</p>
                    <p className="mt-1 text-[11px] font-medium tabular-nums">₹{(lead.valueEstimate / 1000).toFixed(0)}K</p>
                    {nextStage && (
                      <span
                        role="presentation"
                        onClick={(e) => {
                          e.stopPropagation();
                          onMoveStage(lead.id, nextStage.id);
                        }}
                        className="mt-2 inline-block text-[10px] font-medium text-[var(--attio-accent)] hover:underline"
                      >
                        → {nextStage.label}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
