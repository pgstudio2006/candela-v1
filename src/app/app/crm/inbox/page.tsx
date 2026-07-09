"use client";

import { CrmLeadFormModal } from "@/components/crm/lead-form";
import { LeadDetailPanel } from "@/components/crm/lead-detail";
import { CrmLeadFilterBar } from "@/components/crm/lead-filter-bar";
import { useCrmStore } from "@/components/crm/crm-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, Panel, StatusBadge } from "@/components/frontdesk/ui";
import { SOURCE_LABELS } from "@/design-system/crm-data";
import type { CrmLead } from "@/design-system/crm-data";
import { applyCrmLeadFilters, DEFAULT_CRM_LEAD_FILTER, type CrmLeadFilter } from "@/lib/crm-lead-filters";
import { formatRelativeTime } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";

export default function CrmInboxPage() {
  const { agents, assignLeadManual, getFilteredLeads, stages, isManager, activities, followUps } = useCrmStore();
  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState<CrmLead | null>(null);
  const [filters, setFilters] = useState<CrmLeadFilter>(DEFAULT_CRM_LEAD_FILTER);
  const firstStageId = [...stages].sort((a, b) => a.order - b.order)[0]?.id;
  const inbox = useMemo(
    () => applyCrmLeadFilters(getFilteredLeads().filter((l) => l.stageId === firstStageId), filters),
    [getFilteredLeads, firstStageId, filters],
  );

  return (
    <PageChrome
      breadcrumbs={[{ label: "CRM", href: "/app/crm" }, { label: "Lead inbox" }]}
      title="Lead inbox"
      meta="New arrivals from integrations · or add a lead manually with full details"
      actions={
        <AttioButton variant="primary" onClick={() => setFormOpen(true)}>
          <Plus className="size-3.5" />
          Add lead
        </AttioButton>
      }
    >
      <CrmLeadFilterBar filters={filters} onChange={setFilters} agents={agents} />
      <Panel className="mt-4" title={`${inbox.length} uncontacted leads`}>
        <ul className="divide-y divide-[var(--attio-border-subtle)]">
          {inbox.length === 0 && (
            <li className="py-8 text-center text-[13px] text-[var(--attio-text-tertiary)]">
              Inbox clear — simulate a lead from Integrations or ⌘K
            </li>
          )}
          {inbox.map((l) => (
            <li key={l.id} className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <button type="button" className="text-left" onClick={() => setSelected(l)}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[14px] font-semibold hover:underline">{l.fullName}</p>
                  <StatusBadge label={SOURCE_LABELS[l.source]} variant="info" />
                  {l.priority === "high" && <StatusBadge label="Hot" variant="danger" />}
                </div>
                <p className="mt-1 text-[12px] text-[var(--attio-text-secondary)]">{l.phone} · {l.sourceDetail}</p>
                <p className="text-[11px] text-[var(--attio-text-tertiary)]">
                  Assigned: {agents.find((a) => a.id === l.assigneeId)?.name ?? "—"} · {formatRelativeTime(l.createdAt)}
                </p>
              </button>
              {isManager() && (
                <Select
                  value={l.assigneeId || undefined}
                  onValueChange={(agentId) => agentId && assignLeadManual(l.id, agentId)}
                >
                  <SelectTrigger size="sm" className="w-40">
                    <SelectValue placeholder="Assign to…" />
                  </SelectTrigger>
                  <SelectContent>
                    {agents
                      .filter((a) => a.role !== "manager")
                      .map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            </li>
          ))}
        </ul>
      </Panel>

      {selected && (
        <LeadDetailPanel
          lead={inbox.find((l) => l.id === selected.id) ?? selected}
          agent={agents.find((a) => a.id === selected.assigneeId)}
          stageLabel={stages.find((s) => s.id === selected.stageId)?.label ?? selected.stageId}
          onClose={() => setSelected(null)}
          onAssign={(agentId) => {
            assignLeadManual(selected.id, agentId);
            setSelected(null);
          }}
          onEdit={() => setFormOpen(true)}
          agents={agents.filter((a) => a.role !== "manager")}
          activities={activities}
          followUps={followUps}
        />
      )}

      <CrmLeadFormModal open={formOpen} onClose={() => setFormOpen(false)} />
    </PageChrome>
  );
}
