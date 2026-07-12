"use client";

import { FollowUpCompleteModal, FollowUpScheduleModal } from "@/components/crm/follow-up-form";
import { useCrmStore } from "@/components/crm/crm-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, Panel, StatusBadge } from "@/components/frontdesk/ui";
import type { CrmFollowUp } from "@/design-system/crm-data";
import { channelLabel, followUpDisplayStatus } from "@/lib/crm-follow-ups";
import { CalendarPlus, CheckCircle2, Clock, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

type Filter = "all" | "pending" | "overdue" | "done" | "missed";

function statusVariant(status: ReturnType<typeof followUpDisplayStatus>) {
  if (status === "done") return "success" as const;
  if (status === "missed") return "danger" as const;
  if (status === "overdue") return "danger" as const;
  return "warning" as const;
}

function statusLabel(status: ReturnType<typeof followUpDisplayStatus>) {
  if (status === "overdue") return "Overdue";
  if (status === "pending") return "Pending";
  if (status === "done") return "Done";
  return "Missed";
}

export default function CrmFollowUpsPage() {
  const {
    leads,
    agents,
    getFilteredLeads,
    getFilteredFollowUps,
    addFollowUp,
    completeFollowUp,
    rescheduleFollowUp,
    markMissedFollowUp,
    getOperator,
  } = useCrmStore();

  const [filter, setFilter] = useState<Filter>("pending");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [completeId, setCompleteId] = useState<string | null>(null);
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [rescheduleAt, setRescheduleAt] = useState("");

  const visibleLeadIds = new Set(getFilteredLeads().map((l) => l.id));
  const allItems = getFilteredFollowUps().filter((f) => visibleLeadIds.has(f.leadId));

  const items = useMemo(() => {
    const sorted = [...allItems].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    if (filter === "all") return sorted;
    return sorted.filter((f) => {
      const display = followUpDisplayStatus(f);
      if (filter === "pending") return display === "pending";
      if (filter === "overdue") return display === "overdue";
      if (filter === "done") return display === "done";
      if (filter === "missed") return display === "missed";
      return true;
    });
  }, [allItems, filter]);

  const counts = useMemo(() => {
    let pending = 0;
    let overdue = 0;
    let done = 0;
    let missed = 0;
    for (const f of allItems) {
      const s = followUpDisplayStatus(f);
      if (s === "pending") pending += 1;
      else if (s === "overdue") overdue += 1;
      else if (s === "done") done += 1;
      else if (s === "missed") missed += 1;
    }
    return { pending, overdue, done, missed, total: allItems.length };
  }, [allItems]);

  const completeTarget = completeId ? allItems.find((f) => f.id === completeId) : undefined;
  const completeLead = completeTarget ? leads.find((l) => l.id === completeTarget.leadId) : undefined;
  const operator = getOperator();

  const filters: { id: Filter; label: string; count: number }[] = [
    { id: "pending", label: "Pending", count: counts.pending },
    { id: "overdue", label: "Overdue", count: counts.overdue },
    { id: "done", label: "Done", count: counts.done },
    { id: "missed", label: "Missed", count: counts.missed },
    { id: "all", label: "All", count: counts.total },
  ];

  const openReschedule = (f: CrmFollowUp) => {
    setRescheduleId(f.id);
    setRescheduleAt(f.scheduledAt.slice(0, 16));
  };

  return (
    <PageChrome
      breadcrumbs={[{ label: "CRM", href: "/app/crm" }, { label: "Follow-ups" }]}
      title="Follow-ups"
      meta="Scheduled calls & WhatsApp · counsellor accountability"
      actions={
        <AttioButton variant="primary" onClick={() => setScheduleOpen(true)}>
          <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
          Schedule follow-up
        </AttioButton>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {filters.map((f) => (
          <AttioButton
            key={f.id}
            variant={filter === f.id ? "primary" : "secondary"}
            className="!h-8 !text-[12px]"
            onClick={() => setFilter(f.id)}
          >
            {f.label}
            {f.count > 0 && <span className="ml-1.5 tabular-nums opacity-70">({f.count})</span>}
          </AttioButton>
        ))}
      </div>

      <Panel title={`${items.length} follow-up${items.length === 1 ? "" : "s"}`}>
        {items.length === 0 ? (
          <div className="py-10 text-center">
            <Clock className="mx-auto h-8 w-8 text-[var(--attio-text-tertiary)]" />
            <p className="mt-3 text-[13px] font-medium">No follow-ups in this view</p>
            <p className="mt-1 text-[12px] text-[var(--attio-text-tertiary)]">
              Schedule a touchpoint after a call or WhatsApp conversation with a lead.
            </p>
            <AttioButton variant="primary" className="mt-4" onClick={() => setScheduleOpen(true)}>
              Schedule follow-up
            </AttioButton>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--attio-border-subtle)]">
            {items.map((f) => {
              const lead = leads.find((l) => l.id === f.leadId);
              const agent = agents.find((a) => a.id === f.assigneeId);
              const display = followUpDisplayStatus(f);
              const actionable = display === "pending" || display === "overdue";

              return (
                <li key={f.id} className="py-3 text-[13px]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{lead?.fullName ?? f.leadId}</p>
                        <StatusBadge label={statusLabel(display)} variant={statusVariant(display)} />
                      </div>
                      <p className="mt-0.5 text-[11px] text-[var(--attio-text-tertiary)]">
                        {agent?.name ?? "Unassigned"} · {channelLabel(f.channel)} ·{" "}
                        {new Date(f.scheduledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                      </p>
                      {f.notes && <p className="mt-1 text-[12px] text-[var(--attio-text-secondary)]">{f.notes}</p>}
                      {f.outcome && f.status !== "pending" && (
                        <p className="mt-1 text-[12px] text-emerald-700">Outcome: {f.outcome}</p>
                      )}
                      {lead && (
                        <Link
                          href="/app/crm/leads"
                          className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--attio-accent)] hover:underline"
                        >
                          View lead
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                    </div>

                    {actionable && (
                      <div className="flex flex-wrap items-center gap-2">
                        <AttioButton variant="primary" className="!h-7 !text-[11px]" onClick={() => setCompleteId(f.id)}>
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          Done
                        </AttioButton>
                        <AttioButton variant="secondary" className="!h-7 !text-[11px]" onClick={() => openReschedule(f)}>
                          Reschedule
                        </AttioButton>
                        <AttioButton variant="secondary" className="!h-7 !text-[11px]" onClick={() => markMissedFollowUp(f.id)}>
                          Missed
                        </AttioButton>
                      </div>
                    )}
                  </div>

                  {rescheduleId === f.id && (
                    <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-[var(--attio-border-subtle)] bg-[var(--attio-surface)] p-3">
                      <label className="text-[11px] font-medium text-[var(--attio-text-tertiary)]">
                        New time
                        <input
                          type="datetime-local"
                          value={rescheduleAt}
                          onChange={(e) => setRescheduleAt(e.target.value)}
                          className="mt-1 block rounded-md border border-[var(--attio-border)] px-2 py-1.5 text-[12px]"
                        />
                      </label>
                      <AttioButton
                        variant="primary"
                        className="!h-8 !text-[11px]"
                        disabled={!rescheduleAt}
                        onClick={() => {
                          rescheduleFollowUp(f.id, new Date(rescheduleAt).toISOString());
                          setRescheduleId(null);
                        }}
                      >
                        Save
                      </AttioButton>
                      <AttioButton variant="secondary" className="!h-8 !text-[11px]" onClick={() => setRescheduleId(null)}>
                        Cancel
                      </AttioButton>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <FollowUpScheduleModal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        leads={getFilteredLeads()}
        agents={agents}
        defaultAssigneeId={operator?.id}
        onSave={addFollowUp}
      />

      <FollowUpCompleteModal
        open={!!completeId}
        onClose={() => setCompleteId(null)}
        leadName={completeLead?.fullName ?? "Lead"}
        onSave={(outcome) => {
          if (completeId) return completeFollowUp(completeId, outcome);
          return Promise.resolve();
        }}
      />
    </PageChrome>
  );
}
