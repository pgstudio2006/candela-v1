"use client";

import { CrmLeadFormModal } from "@/components/crm/lead-form";
import { LeadDetailPanel, LeadPipelineBoard } from "@/components/crm/lead-detail";
import { CrmLeadFilterBar } from "@/components/crm/lead-filter-bar";
import { CrmLeadListView } from "@/components/crm/lead-list-view";
import { CrmLeadGraphView } from "@/components/crm/lead-graph-view";
import { useCrmStore } from "@/components/crm/crm-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton } from "@/components/frontdesk/ui";
import type { CrmLead } from "@/design-system/crm-data";
import { applyCrmLeadFilters, DEFAULT_CRM_LEAD_FILTER, type CrmLeadFilter } from "@/lib/crm-lead-filters";
import { ArrowRight, BarChart3, Plus, Table2 } from "lucide-react";
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
  const [view, setView] = useState<"board" | "list" | "graph">("board");

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
      <CrmLeadFilterBar filters={filters} onChange={setFilters} agents={agents} stages={stages} />
      <div className="mt-4 flex items-center gap-2">
        <div className="inline-flex rounded-lg border border-[var(--attio-border)] bg-white p-1">
          {[
            { id: "board", label: "Board", icon: Table2 },
            { id: "list", label: "List", icon: Table2 },
            { id: "graph", label: "Graph", icon: BarChart3 },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id as typeof view)}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                view === id
                  ? "bg-[var(--attio-text)] text-white"
                  : "text-[var(--attio-text-secondary)] hover:bg-[var(--attio-surface)]"
              }`}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4">
        {view === "board" && (
          <LeadPipelineBoard
            leads={filteredLeads}
            stages={stages}
            agents={agents}
            onSelect={setSelected}
            onMoveStage={moveLeadStage}
          />
        )}
        {view === "list" && (
          <CrmLeadListView leads={filteredLeads} stages={stages} agents={agents} onSelect={setSelected} />
        )}
        {view === "graph" && <CrmLeadGraphView leads={filteredLeads} stages={stages} agents={agents} />}
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
