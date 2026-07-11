"use client";

import type { CrmAgent, CrmLead, CrmPipelineStage } from "@/design-system/crm-data";
import { SOURCE_LABELS } from "@/design-system/crm-data";
import { StatusBadge } from "@/components/frontdesk/ui";
import { formatRelativeTime } from "@/lib/utils";

export function CrmLeadListView({
  leads,
  stages,
  agents,
  onSelect,
}: {
  leads: CrmLead[];
  stages: CrmPipelineStage[];
  agents: CrmAgent[];
  onSelect: (lead: CrmLead) => void;
}) {
  const orderedStages = [...stages].sort((a, b) => a.order - b.order);
  const stageById = new Map(stages.map((s) => [s.id, s]));
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--attio-border)] bg-white">
      <table className="w-full text-left text-[13px]">
        <thead className="bg-[var(--attio-surface)]">
          <tr className="border-b border-[var(--attio-border)] text-[11px] text-[var(--attio-text-tertiary)]">
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Mobile</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Counselor</th>
            <th className="px-3 py-2 font-medium">Source</th>
            <th className="px-3 py-2 font-medium">Created</th>
            <th className="px-3 py-2 text-right font-medium">Est. value</th>
          </tr>
        </thead>
        <tbody>
          {leads.length === 0 && (
            <tr>
              <td colSpan={7} className="py-8 text-center text-[13px] text-[var(--attio-text-tertiary)]">
                No leads match the selected filters.
              </td>
            </tr>
          )}
          {leads.map((lead) => {
            const stage = stageById.get(lead.stageId);
            const agent = agents.find((a) => a.id === lead.assigneeId);
            return (
              <tr
                key={lead.id}
                className="cursor-pointer border-b border-[var(--attio-border-subtle)] last:border-0 hover:bg-[var(--attio-surface)]/50"
                onClick={() => onSelect(lead)}
              >
                <td className="px-3 py-2.5">
                  <p className="font-medium">{lead.fullName}</p>
                  {lead.priority === "high" && (
                    <span className="mt-0.5 inline-block rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                      Hot
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-[var(--attio-text-secondary)]">{lead.phone}</td>
                <td className="px-3 py-2.5">
                  {stage ? (
                    <div className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ background: stage.color }} />
                      <span className="text-[12px]">{stage.label}</span>
                    </div>
                  ) : (
                    <StatusBadge label={lead.stageId} variant="neutral" />
                  )}
                </td>
                <td className="px-3 py-2.5 text-[var(--attio-text-secondary)]">{agent?.name ?? "Unassigned"}</td>
                <td className="px-3 py-2.5">
                  <StatusBadge label={SOURCE_LABELS[lead.source]} variant="info" />
                </td>
                <td className="px-3 py-2.5 text-[12px] text-[var(--attio-text-tertiary)]">
                  {formatRelativeTime(lead.createdAt)}
                </td>
                <td className="px-3 py-2.5 text-right text-[12px] font-medium tabular-nums">
                  ₹{lead.valueEstimate.toLocaleString("en-IN")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
