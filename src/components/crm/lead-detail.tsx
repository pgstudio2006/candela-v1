"use client";

import { LeadPipelineBoard } from "@/components/crm/lead-pipeline";
import { FollowUpScheduleModal } from "@/components/crm/follow-up-form";
import { useCrmStore } from "@/components/crm/crm-store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CrmActivity, CrmAgent, CrmFollowUp, CrmLead } from "@/design-system/crm-data";
import { SOURCE_LABELS } from "@/design-system/crm-data";
import { AttioButton, StatusBadge } from "@/components/frontdesk/ui";
import { formatStageStatus } from "@/lib/frontdesk-workflow";
import { channelLabel, followUpDisplayStatus } from "@/lib/crm-follow-ups";
import { cn, formatRelativeTime } from "@/lib/utils";
import { convertLeadToPatientAction } from "@/server/crm/online-counsellor-actions";
import { getCrmLeadClinicalHistoryAction, type CrmPatientHistory } from "@/server/crm/actions";
import { useEffect, useMemo, useState } from "react";

type HistoryEvent = CrmPatientHistory["timeline"][number];

function DetailRow({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex justify-between gap-4 border-b border-[var(--attio-border-subtle)] py-2 last:border-0">
      <dt className="shrink-0 text-[var(--attio-text-tertiary)]">{label}</dt>
      <dd className="text-right text-[13px] font-medium">{value}</dd>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone?: "danger" | "success" }) {
  return (
    <div className="rounded-lg border border-[var(--attio-border-subtle)] bg-[var(--attio-surface)] px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--attio-text-tertiary)]">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-[15px] font-semibold tabular-nums",
          tone === "danger" && "text-red-600",
          tone === "success" && "text-emerald-600",
        )}
      >
        {value}
      </p>
    </div>
  );
}

const CATEGORY_LABELS: Record<HistoryEvent["category"], string> = {
  crm: "CRM",
  visit: "Visit",
  billing: "Billing",
  pharmacy: "Pharmacy",
  counselling: "Counselling",
  follow_up: "Follow-up",
};

const CATEGORY_VARIANT: Record<HistoryEvent["category"], "info" | "success" | "warning" | "neutral" | "danger"> = {
  crm: "neutral",
  visit: "info",
  billing: "success",
  pharmacy: "warning",
  counselling: "info",
  follow_up: "neutral",
};

function HistoryTimeline({ events }: { events: HistoryEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="py-6 text-center text-[12px] text-[var(--attio-text-tertiary)]">
        No history yet — link this lead to a registered patient by phone or UHID.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {events.map((e) => (
        <li key={e.id} className="rounded-lg border border-[var(--attio-border-subtle)] p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge label={CATEGORY_LABELS[e.category]} variant={CATEGORY_VARIANT[e.category]} />
                <p className="text-[13px] font-medium">{e.title}</p>
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-[var(--attio-text-secondary)]">{e.detail}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[11px] text-[var(--attio-text-tertiary)]">
                {new Date(e.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
              </p>
              {e.amount != null && (
                <p className="mt-0.5 text-[12px] font-semibold tabular-nums">₹{e.amount.toLocaleString("en-IN")}</p>
              )}
              {e.status && (
                <p className="mt-0.5 text-[10px] capitalize text-[var(--attio-text-tertiary)]">{e.status.replace(/_/g, " ")}</p>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function LeadDetailPanel({
  lead,
  agent,
  stageLabel,
  onClose,
  onAssign,
  onEdit,
  agents,
  activities,
  followUps,
}: {
  lead: CrmLead;
  agent?: CrmAgent;
  stageLabel: string;
  onClose: () => void;
  onAssign: (agentId: string) => void;
  onEdit: () => void;
  agents: { id: string; name: string }[];
  activities: CrmActivity[];
  followUps: CrmFollowUp[];
}) {
  const { addFollowUp, agents: storeAgents, stages: storeStages, getOperator, moveLeadStage, getFilteredLeads, refresh } = useCrmStore();
  const currentLead = useMemo(() => getFilteredLeads().find((l) => l.id === lead.id) ?? lead, [getFilteredLeads, lead]);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState("");
  const [tab, setTab] = useState("overview");
  const [historyTick, setHistoryTick] = useState(0);
  const [history, setHistory] = useState<CrmPatientHistory>({
    matchType: "none",
    patient: undefined,
    visits: [],
    pharmacyRx: [],
    pharmacyBills: [],
    counselSessions: [],
    crmActivities: [],
    followUps: [],
    timeline: [],
    billing: {
      totalBilled: 0,
      totalPaid: 0,
      outstanding: 0,
      visitCount: 0,
      pharmacyTotal: 0,
      pharmacyPaid: 0,
    },
  });

  useEffect(() => {
    const refresh = () => setHistoryTick((n) => n + 1);
    window.addEventListener("candela-clinical-updated", refresh);
    window.addEventListener("candela-pharmacy-updated", refresh);
    window.addEventListener("candela-counsellor-updated", refresh);
    return () => {
      window.removeEventListener("candela-clinical-updated", refresh);
      window.removeEventListener("candela-pharmacy-updated", refresh);
      window.removeEventListener("candela-counsellor-updated", refresh);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const next = await getCrmLeadClinicalHistoryAction(currentLead);
        if (!mounted) return;
        setHistory(next);
      } catch (err) {
        console.error("[LeadDetail] history load failed:", err);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [currentLead.id, activities, followUps, historyTick]);

  const genderLabel =
    currentLead.gender === "prefer_not"
      ? "Prefer not to say"
      : currentLead.gender
        ? currentLead.gender.charAt(0).toUpperCase() + currentLead.gender.slice(1)
        : undefined;
  const currentStageLabel = storeStages.find((s) => s.id === currentLead.stageId)?.label ?? currentLead.stageId;

  const handleConvert = async () => {
    setConverting(true);
    setConvertError("");
    try {
      const result = await convertLeadToPatientAction(currentLead.id, { bookAppointment: false, source: "crm_manager" });
      if (!result.ok) {
        setConvertError(result.error || "Failed to convert lead to patient.");
        return;
      }
      await refresh({ silent: true });
      setHistoryTick((n) => n + 1);
    } catch (err) {
      setConvertError(err instanceof Error ? err.message : "Conversion failed.");
    } finally {
      setConverting(false);
    }
  };

  const { billing, patient, timeline, visits, pharmacyRx, pharmacyBills, counselSessions } = history;
  const leadFollowUps = followUps
    .filter((f) => f.leadId === currentLead.id)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-xl flex-col border-l border-[var(--attio-border)] bg-white shadow-xl">
      <div className="relative flex items-center justify-between border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold">{currentLead.fullName}</h2>
          {patient && (
            <p className="text-[11px] text-[var(--attio-text-tertiary)]">
              {patient.uhid} · Registered patient · {history.matchType.replace("_", " ")} match
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Select value={currentLead.stageId} onValueChange={(stageId) => stageId && moveLeadStage(currentLead.id, stageId)}>
            <SelectTrigger size="sm" className="w-36 text-[12px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {storeStages.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <AttioButton variant="secondary" className="!h-7 !text-[11px]" onClick={onEdit}>
            Edit
          </AttioButton>
          {currentLead.uhid ? (
            <span className="rounded-md bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700">Patient registered</span>
          ) : (
            <AttioButton
              variant="primary"
              className="!h-7 !text-[11px]"
              disabled={converting}
              onClick={() => void handleConvert()}
            >
              {converting ? "Converting…" : "Convert to patient"}
            </AttioButton>
          )}
          <button type="button" onClick={onClose} className="text-[12px] text-[var(--attio-text-tertiary)] hover:underline">
            Close
          </button>
          {convertError && <p className="absolute right-0 top-10 z-50 rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-700">{convertError}</p>}
        </div>
      </div>

      <div className="border-b bg-[var(--attio-surface)] px-4 py-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <SummaryCard label="Total billed" value={`₹${billing.totalBilled.toLocaleString("en-IN")}`} />
          <SummaryCard label="Collected" value={`₹${billing.totalPaid.toLocaleString("en-IN")}`} tone="success" />
          <SummaryCard
            label="Outstanding"
            value={`₹${billing.outstanding.toLocaleString("en-IN")}`}
            tone={billing.outstanding > 0 ? "danger" : undefined}
          />
          <SummaryCard label="Visits" value={String(billing.visitCount)} />
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => v && v !== tab && setTab(v)} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-4 mt-3 w-auto justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="history">Full history</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 text-[13px]">
          <TabsContent value="overview" className="mt-0 space-y-4">
            <div className="flex flex-wrap gap-2">
              <StatusBadge label={currentStageLabel} variant="info" />
              <StatusBadge label={SOURCE_LABELS[currentLead.source]} variant="neutral" />
              {currentLead.priority === "high" && <StatusBadge label="High priority" variant="danger" />}
            </div>

            <dl className="rounded-lg border border-[var(--attio-border-subtle)] px-3">
              <DetailRow label="Status" value={currentStageLabel} />
              <DetailRow label="Lost reason" value={currentLead.lostReason} />
              <DetailRow label="Assignee" value={agent?.name} />
              <DetailRow label="UHID" value={currentLead.uhid ?? patient?.uhid} />
              <DetailRow label="Est. pipeline value" value={currentLead.valueEstimate ? `₹${currentLead.valueEstimate.toLocaleString("en-IN")}` : undefined} />
              <DetailRow label="Capture time" value={formatRelativeTime(currentLead.createdAt)} />
            </dl>

            <p className="text-[11px] font-semibold uppercase text-[var(--attio-text-tertiary)]">Patient</p>
            <dl className="rounded-lg border border-[var(--attio-border-subtle)] px-3">
              <DetailRow label="Phone" value={currentLead.phone} />
              <DetailRow label="Alternate" value={currentLead.alternatePhone} />
              <DetailRow label="Email" value={currentLead.email} />
              <DetailRow label="Age" value={currentLead.age ?? patient?.age} />
              <DetailRow label="Gender" value={genderLabel} />
              <DetailRow label="City" value={currentLead.city} />
              <DetailRow label="Department" value={patient?.department} />
              <DetailRow label="Referrer" value={patient?.referrer} />
              <DetailRow label="Last visit" value={patient?.lastVisit} />
            </dl>

            <p className="text-[11px] font-semibold uppercase text-[var(--attio-text-tertiary)]">Appointment intent</p>
            <dl className="rounded-lg border border-[var(--attio-border-subtle)] px-3">
              <DetailRow label="Doctor" value={currentLead.doctorName} />
              <DetailRow label="Specialty" value={currentLead.specialty} />
              <DetailRow label="Date" value={currentLead.appointmentDate} />
              <DetailRow label="Time" value={currentLead.appointmentTime} />
              <DetailRow label="Centre" value={currentLead.appointmentCentre} />
            </dl>

            {currentLead.notes && (
              <p className="rounded-lg bg-[var(--attio-surface)] p-3 text-[12px] leading-relaxed">{currentLead.notes}</p>
            )}

            {leadFollowUps.length > 0 && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase text-[var(--attio-text-tertiary)]">Follow-ups</p>
                  <AttioButton variant="secondary" className="!h-7 !text-[11px]" onClick={() => setScheduleOpen(true)}>
                    Schedule
                  </AttioButton>
                </div>
                <ul className="space-y-2">
                  {leadFollowUps.map((f) => {
                    const display = followUpDisplayStatus(f);
                    return (
                      <li key={f.id} className="rounded-lg border border-[var(--attio-border-subtle)] px-3 py-2 text-[12px]">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{channelLabel(f.channel)}</span>
                          <StatusBadge
                            label={display === "overdue" ? "Overdue" : display}
                            variant={display === "done" ? "success" : display === "overdue" || display === "missed" ? "danger" : "warning"}
                          />
                        </div>
                        <p className="mt-0.5 text-[var(--attio-text-tertiary)]">
                          {new Date(f.scheduledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                        </p>
                        {f.notes && <p className="mt-1 text-[var(--attio-text-secondary)]">{f.notes}</p>}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {leadFollowUps.length === 0 && !["won", "lost"].includes(currentLead.stageId) && (
              <AttioButton variant="secondary" className="!h-8 !text-[12px]" onClick={() => setScheduleOpen(true)}>
                Schedule follow-up
              </AttioButton>
            )}

            <div>
              <p className="mb-2 text-[11px] font-medium uppercase text-[var(--attio-text-tertiary)]">Reassign</p>
              <Select
                value={currentLead.assigneeId || undefined}
                onValueChange={(agentId) => agentId && onAssign(agentId)}
              >
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue placeholder="Assign to…" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          <TabsContent value="history" className="mt-0">
            <p className="mb-3 text-[12px] text-[var(--attio-text-secondary)]">
              {timeline.length} events — CRM touchpoints, visits, counselling, pharmacy
            </p>
            <HistoryTimeline events={timeline} />
          </TabsContent>

          <TabsContent value="billing" className="mt-0 space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <SummaryCard label="OPD / IPD billed" value={`₹${(billing.totalBilled - billing.pharmacyTotal).toLocaleString("en-IN")}`} />
              <SummaryCard label="Pharmacy" value={`₹${billing.pharmacyTotal.toLocaleString("en-IN")}`} />
            </div>

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase text-[var(--attio-text-tertiary)]">Visit billing</p>
              {visits.length === 0 ? (
                <p className="text-[12px] text-[var(--attio-text-tertiary)]">No registered visits linked to this lead.</p>
              ) : (
                <ul className="space-y-2">
                  {visits.map((v) => (
                    <li key={v.id} className="rounded-lg border border-[var(--attio-border-subtle)] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">{v.doctorName}</p>
                        <StatusBadge label={v.billing} variant={v.billing === "paid" ? "success" : v.billing === "partial" ? "warning" : "neutral"} />
                      </div>
                      <p className="mt-1 text-[12px] text-[var(--attio-text-tertiary)]">
                        {formatStageStatus(v.stage)}
                        {v.token != null ? ` · Token #${v.token}` : ""}
                      </p>
                      {v.billAmount != null && (
                        <p className="mt-1 text-[13px] font-semibold tabular-nums">
                          ₹{v.billAmount.toLocaleString("en-IN")}
                          {v.amountPaid != null && ` · paid ₹${v.amountPaid.toLocaleString("en-IN")}`}
                          {v.balanceDue ? ` · due ₹${v.balanceDue.toLocaleString("en-IN")}` : ""}
                        </p>
                      )}
                      {v.counselPackageLabel && (
                        <p className="mt-1 text-[12px] text-[var(--attio-text-secondary)]">{v.counselPackageLabel}</p>
                      )}
                      {v.deferredReason && (
                        <p className="mt-1 text-[11px] text-amber-700">{v.deferredReason}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {counselSessions.length > 0 && (
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase text-[var(--attio-text-tertiary)]">Counselling quotes</p>
                <ul className="space-y-2">
                  {counselSessions.map((s) => (
                    <li key={s.id} className="rounded-lg border border-[var(--attio-border-subtle)] p-3 text-[12px]">
                      <p className="font-medium">{s.quote?.packageLabel ?? "Session"}</p>
                      {s.quote && <p className="mt-1 tabular-nums">Net ₹{s.quote.netAmount.toLocaleString("en-IN")}</p>}
                      {s.outcome && <p className="mt-1 capitalize text-[var(--attio-text-tertiary)]">Outcome: {s.outcome}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase text-[var(--attio-text-tertiary)]">Pharmacy</p>
              {pharmacyRx.length === 0 && pharmacyBills.length === 0 ? (
                <p className="text-[12px] text-[var(--attio-text-tertiary)]">No pharmacy Rx or bills for this patient.</p>
              ) : (
                <ul className="space-y-2">
                  {pharmacyRx.map((r) => (
                    <li key={r.id} className="rounded-lg border border-[var(--attio-border-subtle)] px-3 py-2 text-[12px]">
                      Rx {r.id} · {r.status.replace(/_/g, " ")} · {r.lines.length} items
                    </li>
                  ))}
                  {pharmacyBills.map((b) => (
                    <li key={b.id} className="rounded-lg border border-[var(--attio-border-subtle)] px-3 py-2 text-[12px]">
                      Bill {b.id} · ₹{b.total.toLocaleString("en-IN")} · {b.paid ? "Paid" : "Pending"}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TabsContent>
        </div>
      </Tabs>

      <FollowUpScheduleModal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        leads={[currentLead]}
        agents={storeAgents}
        defaultLeadId={currentLead.id}
        defaultAssigneeId={currentLead.assigneeId || getOperator()?.id}
        onSave={addFollowUp}
      />
    </div>
  );
}

export { LeadPipelineBoard };
