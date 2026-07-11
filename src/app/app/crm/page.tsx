"use client";

import { useCrmStore } from "@/components/crm/crm-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { MetricStrip, Panel, StatusBadge } from "@/components/frontdesk/ui";
import { SOURCE_LABELS } from "@/design-system/crm-data";
import Link from "next/link";
import { Plus } from "lucide-react";

export default function CrmDashboardPage() {
  const {
    getWorkspaceKpis,
    getMyKpis,
    getFilteredLeads,
    integrations,
    activities,
    agents,
    stages,
    isManager,
    isTeamLead,
    isHierarchyLead,
    getOperator,
    setViewAsAgent,
    viewAsAgentId,
  } = useCrmStore();
  const operator = getOperator();
  const manager = isManager();
  const teamLead = isTeamLead();
  const hierarchy = isHierarchyLead();
  const myKpis = getMyKpis();
  const kpis = getWorkspaceKpis();
  const leads = getFilteredLeads();
  const recent = leads.slice(0, 5);
  const connected = integrations.filter((i) => i.connected);

  const agentMetrics = myKpis
    ? [
        { label: "My open leads", value: String(myKpis.openLeads), delta: "Assigned to you", trend: "neutral" as const },
        { label: "Contacted today", value: String(myKpis.contactedToday), delta: "Outreach", trend: "up" as const },
        { label: "My conversion", value: `${myKpis.conversionRate}%`, delta: `${myKpis.conversions} won`, trend: "up" as const },
        { label: "Follow-ups due", value: String(myKpis.followUpsDue), delta: "Action needed", trend: myKpis.followUpsDue ? ("down" as const) : ("neutral" as const) },
        { label: "Pipeline value", value: `₹${(myKpis.pipelineValue / 100000).toFixed(1)}L`, delta: "Your book", trend: "up" as const },
        { label: "SLA breaches", value: String(myKpis.slaBreaches), delta: "New leads waiting", trend: myKpis.slaBreaches ? ("down" as const) : ("neutral" as const) },
      ]
    : kpis;

  return (
    <PageChrome
      breadcrumbs={[{ label: "CRM", href: "/app/crm" }, { label: manager ? "Manager workspace" : teamLead ? "Team lead workspace" : "My workspace" }]}
      title={manager ? "CRM command workspace" : teamLead ? "Team lead workspace" : `${operator?.name}'s workspace`}
      meta={
        manager
          ? "Full team visibility · integrations · routing · KPIs"
          : teamLead
            ? "Team visibility · track below performance · KPIs"
            : "Your leads · your pipeline · your follow-ups only"
      }
      actions={
        <>
          <Link href="/app/crm/leads?new=1" className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--attio-text)] px-3 text-[12px] font-medium text-white hover:opacity-90">
            <Plus className="size-3.5" />
            Add lead
          </Link>
          {hierarchy && (
            <select
              value={viewAsAgentId ?? ""}
              onChange={(e) => setViewAsAgent(e.target.value || null)}
              className="h-8 rounded-md border border-[var(--attio-border)] px-2 text-[12px]"
            >
              <option value="">All team</option>
              {agents.filter((a) => a.role !== "manager").map((a) => (
                <option key={a.id} value={a.id}>
                  Filter: {a.name}
                </option>
              ))}
            </select>
          )}
        </>
      }
    >
      <MetricStrip metrics={agentMetrics} />
      <div className="grid gap-4 lg:grid-cols-2">
        {manager && (
          <Panel title="Connected sources" action={<Link href="/app/crm/integrations" className="text-[11px] text-[var(--attio-accent)]">Manage →</Link>}>
            <ul className="space-y-2">
              {connected.map((i) => (
                <li key={i.id} className="flex items-center justify-between rounded-lg border border-[var(--attio-border-subtle)] px-3 py-2 text-[13px]">
                  <span>{i.label}</span>
                  <span className="text-[11px] text-[var(--attio-text-tertiary)]">{i.leadsToday} today</span>
                </li>
              ))}
            </ul>
          </Panel>
        )}
        <Panel title={manager ? "Recent leads" : "My recent leads"} action={<Link href="/app/crm/leads" className="text-[11px] text-[var(--attio-accent)]">Pipeline →</Link>}>
          <ul className="divide-y divide-[var(--attio-border-subtle)]">
            {recent.length === 0 && (
              <li className="py-4 text-[13px] text-[var(--attio-text-tertiary)]">No leads yet — check inbox or integrations</li>
            )}
            {recent.map((l) => (
              <li key={l.id} className="flex items-center justify-between py-2.5 text-[13px]">
                <div>
                  <p className="font-medium">{l.fullName}</p>
                  <p className="text-[11px] text-[var(--attio-text-tertiary)]">
                    {SOURCE_LABELS[l.source]} · {stages.find((s) => s.id === l.stageId)?.label ?? l.stageId}
                  </p>
                </div>
                {manager && (
                  <StatusBadge label={agents.find((a) => a.id === l.assigneeId)?.name?.split(" ")[0] ?? "—"} variant="neutral" />
                )}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      <Panel title="Activity stream" className="mt-4">
        <ul className="divide-y divide-[var(--attio-border-subtle)]">
          {activities.length === 0 && <li className="py-4 text-[13px] text-[var(--attio-text-tertiary)]">Activity appears when leads move or arrive</li>}
          {activities.slice(0, 8).map((a) => (
            <li key={a.id} className="py-2 text-[12px]">
              <p>{a.summary}</p>
              <p className="text-[var(--attio-text-tertiary)]">{new Date(a.at).toLocaleString("en-IN")}</p>
            </li>
          ))}
        </ul>
      </Panel>
    </PageChrome>
  );
}
