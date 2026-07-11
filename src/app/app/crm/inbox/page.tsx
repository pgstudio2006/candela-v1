"use client";

import { CrmLeadFormModal } from "@/components/crm/lead-form";
import { LeadDetailPanel } from "@/components/crm/lead-detail";
import { CrmLeadFilterBar } from "@/components/crm/lead-filter-bar";
import { CrmLeadListView } from "@/components/crm/lead-list-view";
import { useCrmStore } from "@/components/crm/crm-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, Panel } from "@/components/frontdesk/ui";
import type { CrmLead } from "@/design-system/crm-data";
import { applyCrmLeadFilters, DEFAULT_CRM_LEAD_FILTER, type CrmLeadFilter } from "@/lib/crm-lead-filters";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";

export default function CrmInboxPage() {
  const { agents, assignLeadManual, getFilteredLeads, stages, activities, followUps } = useCrmStore();
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
      <CrmLeadFilterBar filters={filters} onChange={setFilters} agents={agents} stages={stages} />
      <Panel className="mt-4" title={`${inbox.length} uncontacted leads`}>
        <CrmLeadListView leads={inbox} stages={stages} agents={agents} onSelect={setSelected} />
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
