"use client";

import { useFrontdeskStore } from "@/components/frontdesk/frontdesk-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, Panel, StatusBadge } from "@/components/frontdesk/ui";
import { useFrontdeskPoll } from "@/hooks/use-frontdesk-poll";
import { isAwaitingConsultant, isAwaitingJuniorExam, isRedFlagVisit, patientDisplayName, sortQueueVisits } from "@/lib/frontdesk-workflow";
import { cn } from "@/lib/utils";
import { Clock, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function QueuePage() {
  useFrontdeskPoll();
  const router = useRouter();
  const { getQueueVisits, getPatient, visits, roster, refresh, clearQueue } = useFrontdeskStore();
  const [refreshing, setRefreshing] = useState(false);
  const [clearing, setClearing] = useState(false);

  const doctors = roster.allDoctors;

  const callNext = () => {
    const next = sortQueueVisits(visits.filter(isAwaitingJuniorExam))[0];
    if (next) router.push(`/app/frontdesk/junior-exam/${next.id}`);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh({ silent: false });
    setRefreshing(false);
  };

  const handleClear = async () => {
    const confirmed = window.confirm("Clear all active patients from today's queue? This will mark them as completed.");
    if (!confirmed) return;
    setClearing(true);
    const result = await clearQueue();
    setClearing(false);
    if (!result.ok) {
      alert(result.error ?? "Failed to clear queue.");
    }
  };

  return (
    <PageChrome
      breadcrumbs={[
        { label: "Front Desk", href: "/app/frontdesk" },
        { label: "Queue" },
      ]}
      title="Reception queue"
      meta="Grouped by doctor · FIFO by token · through consultant handoff"
      actions={
        <div className="flex items-center gap-2">
          <AttioButton
            variant="secondary"
            className="gap-1.5"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
          >
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </AttioButton>
          <AttioButton
            variant="secondary"
            className="gap-1.5"
            onClick={() => void handleClear()}
            disabled={clearing}
          >
            <Trash2 className="size-3.5" />
            {clearing ? "Clearing…" : "Clear queue"}
          </AttioButton>
          <AttioButton variant="secondary" onClick={callNext}>Call next</AttioButton>
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        {doctors.map((doc) => {
          const queue = sortQueueVisits(getQueueVisits(doc.id));
          return (
            <Panel
              key={doc.id}
              title={doc.name}
              action={<span className="text-[11px] text-[var(--attio-text-tertiary)]">{queue.length} waiting</span>}
            >
              <ul className="divide-y divide-[var(--attio-border-subtle)]">
                {queue.length === 0 && (
                  <li className="py-6 text-center text-[13px] text-[var(--attio-text-tertiary)]">Queue clear</li>
                )}
                {queue.map((v) => {
                  const p = getPatient(v.patientId);
                  if (!p) return null;
                  return (
                    <li
                      key={v.id}
                      className={cn("py-3", v.appointment && "bg-blue-50/40 -mx-4 px-4")}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-[13px] font-medium">
                            {v.token != null ? `#${v.token}` : "—"} · {patientDisplayName(p)}
                          </p>
                          <p className="font-mono text-[11px] text-[var(--attio-text-tertiary)]">{p.uhid}</p>
                        </div>
                        <span className="flex items-center gap-1 text-[11px] text-[var(--attio-text-tertiary)]">
                          <Clock className="size-3" />
                          {v.waitMin}m
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <StatusBadge label={v.billing} variant={v.billing === "paid" ? "success" : "warning"} />
                        <StatusBadge label={`Exam ${v.exam}`} variant={v.exam === "done" ? "success" : "info"} />
                        {isAwaitingConsultant(v) && (
                          <StatusBadge label="Awaiting doctor" variant="info" />
                        )}
                        {v.appointment && <StatusBadge label="Appt" variant="info" />}
                        {isRedFlagVisit(v) && <StatusBadge label="RED FLAG" variant="warning" />}
                      </div>
                      {v.exam !== "done" && (
                        <Link href={`/app/frontdesk/junior-exam/${v.id}`} className="mt-2 inline-block text-[12px] text-[var(--attio-accent)]">
                          Junior exam →
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Panel>
          );
        })}
      </div>
    </PageChrome>
  );
}
