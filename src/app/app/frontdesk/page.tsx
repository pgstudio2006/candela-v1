"use client";

import { useSession } from "@/components/candela/session-provider";
import { useFrontdeskStore } from "@/components/frontdesk/frontdesk-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, DataTable, MetricStrip, Panel, StatusBadge } from "@/components/frontdesk/ui";
import { useFrontdeskPoll } from "@/hooks/use-frontdesk-poll";
import { formatStageStatus } from "@/lib/frontdesk-workflow";
import { UserPlus, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export default function FrontdeskDashboardPage() {
  useFrontdeskPoll();
  const router = useRouter();
  const [tab, setTab] = useState("overview");
  const { getDashboardKpis, getActionItems, visits, patients, getWaitingCheckIns } = useFrontdeskStore();

  const kpis = getDashboardKpis();
  const actions = getActionItems();
  const nextCheckIn = getWaitingCheckIns()[0];

  const pipeline = useMemo(
    () =>
      (["checked_in", "billing", "queued", "junior_exam", "with_doctor"] as const).map((stage) => ({
        stage,
        count: visits.filter((v) => v.stage === stage).length,
      })),
    [visits],
  );

  return (
    <PageChrome
      breadcrumbs={[
        { label: "Front Desk", href: "/app/frontdesk" },
        { label: "Dashboard" },
      ]}
      title="Command center"
      meta={`${new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })} · live · auto-refresh 15s`}
      tabs={[
        { id: "overview", label: "Overview" },
        { id: "pipeline", label: "Pipeline" },
      ]}
      activeTab={tab}
      onTabChange={setTab}
      actions={
        <div className="flex items-center gap-2">
          <Link href="/app/frontdesk/leads">
            <AttioButton variant="secondary" className="gap-1.5">
              <UserPlus className="size-3.5" />
              Offline lead
            </AttioButton>
          </Link>
          <AttioButton
            variant="primary"
            className="gap-1.5"
            onClick={() => {
              if (nextCheckIn) {
                router.push(`/app/frontdesk/check-in?visit=${nextCheckIn.visit.id}&patient=${nextCheckIn.patient.id}`);
              } else {
                router.push("/app/frontdesk/check-in");
              }
            }}
          >
            <Zap className="size-3.5" />
            Open next check-in
          </AttioButton>
        </div>
      }
    >
      <MetricStrip metrics={kpis} />

      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Needs action now">
            <ul className="divide-y divide-[var(--attio-border-subtle)]">
              {actions.length === 0 && (
                <li className="py-6 text-center text-[13px] text-[var(--attio-text-tertiary)]">All caught up</li>
              )}
              {actions.map((a) => (
                <li key={a.id}>
                  <Link
                    href={a.href}
                    className="flex items-start justify-between gap-3 py-3 transition-colors hover:bg-[var(--attio-surface)]"
                  >
                    <div>
                      <StatusBadge
                        label={a.priority}
                        variant={a.priority === "urgent" ? "danger" : a.priority === "high" ? "warning" : "neutral"}
                      />
                      <p className="mt-2 text-[13px] leading-snug text-[var(--attio-text-secondary)]">{a.text}</p>
                      <p className="mt-1 text-[12px] font-medium text-[var(--attio-accent)]">{a.action}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Recent patients">
            <DataTable
              columns={[
                { key: "name", label: "Name" },
                { key: "uhid", label: "UHID" },
                { key: "stage", label: "Stage" },
              ]}
              rows={patients.slice(0, 6).map((p) => {
                const v = visits.find((x) => x.patientId === p.id);
                return {
                  name: p.name,
                  uhid: p.uhid,
                  stage: v ? formatStageStatus(v.stage) : "—",
                };
              })}
              onRowClick={(i) => router.push(`/app/frontdesk/patients/${patients[i].id}`)}
            />
          </Panel>
        </div>
      )}

      {tab === "pipeline" && (
        <Panel title="Live visit pipeline">
          <div className="grid grid-cols-5 gap-2">
            {pipeline.map(({ stage, count }) => (
              <div key={stage} className="rounded-md bg-[var(--attio-surface)] px-2 py-3 text-center">
                <p className="text-[18px] font-semibold tabular-nums">{count}</p>
                <p className="mt-0.5 text-[10px] text-[var(--attio-text-tertiary)] capitalize">
                  {formatStageStatus(stage)}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </PageChrome>
  );
}
