"use client";

import { CrmLeadFormModal } from "@/components/crm/lead-form";
import { LeadDetailPanel, LeadPipelineBoard } from "@/components/crm/lead-detail";
import { CrmLeadFilterBar } from "@/components/crm/lead-filter-bar";
import { useCrmStore } from "@/components/crm/crm-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton } from "@/components/frontdesk/ui";
import type { CrmLead } from "@/design-system/crm-data";
import { applyCrmLeadFilters, DEFAULT_CRM_LEAD_FILTER, type CrmLeadFilter } from "@/lib/crm-lead-filters";
import { ArrowRight, Plus } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export default function CrmLeadsPageClient() {
  const searchParams = useSearchParams();
  const { getFilteredLeads, stages, agents, moveLeadStage, assignLeadManual, activities, followUps } = useCrmStore();
  const leads = getFilteredLeads();
  const [filters, setFilters] = useState<CrmLeadFilter>(DEFAULT_CRM_LEAD_FILTER);
  const filteredLeads = useMemo(() => applyCrmLeadFilters(leads, filters), [leads, filters]);
  const [selected, setSelected] = useState<CrmLead | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CrmLead | undefined>();

  useEffect(() => {
    if (searchParams.get("new") === "1") setFormOpen(true);
  }, [searchParams]);

  const openAdd = () => {
    setEditing(undefined);
    setFormOpen(true);
  };

  return (
    <PageChrome
      breadcrumbs={[{ label: "CRM", href: "/app/crm" }, { label: "Pipeline" }]}
      title="Lead pipeline"
      meta="Add leads with full patient details · move through customizable stages"
      actions={
        <>
          <Link
            href={selected ? `/app/crm/leads/${selected.id}` : "/app/crm/leads"}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--attio-border)] px-3 text-[12px] font-medium hover:bg-[var(--attio-surface)]"
          >
            <ArrowRight className="size-3.5" />
            Open detail
          </Link>
          <AttioButton variant="primary" onClick={openAdd}>
            <Plus className="size-3.5" />
            Add lead
          </AttioButton>
        </>
      }
    >
      <CrmLeadFilterBar filters={filters} onChange={setFilters} agents={agents} />
      <div className="mt-4">
        <LeadPipelineBoard
          leads={filteredLeads}
          stages={stages}
          agents={agents}
          onSelect={setSelected}
          onMoveStage={moveLeadStage}
        />
      </div>
      {selected && (
        <LeadDetailPanel
          lead={filteredLeads.find((l) => l.id === selected.id) ?? selected}
          agent={agents.find((a) => a.id === selected.assigneeId)}
          stageLabel={stages.find((s) => s.id === selected.stageId)?.label ?? selected.stageId}
          onClose={() => setSelected(null)}
          onAssign={(agentId) => {
            assignLeadManual(selected.id, agentId);
            setSelected(null);
          }}
          onEdit={() => {
            setEditing(selected);
            setFormOpen(true);
          }}
          agents={agents.filter((a) => a.role !== "manager")}
          activities={activities}
          followUps={followUps}
        />
      )}
      <CrmLeadFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(undefined);
        }}
        initial={editing}
        onSaved={() => setSelected(null)}
      />
    </PageChrome>
  );
}
