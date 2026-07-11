"use client";

import { useDoctorStore } from "@/components/doctor/doctor-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, DataTable, MetricStrip, Panel, StatusBadge } from "@/components/frontdesk/ui";
import { useDoctorPoll } from "@/hooks/use-doctor-poll";
import { isRedFlagVisit } from "@/lib/frontdesk-workflow";
import { useSession } from "@/components/candela/session-provider";
import { Stethoscope } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

const PATAUDI_BRANCH_ID = "branch_pataudi";

export default function DoctorDashboardPage() {
  useDoctorPoll();
  const router = useRouter();
  const { session } = useSession();
  const isPataudi = session?.branchId === PATAUDI_BRANCH_ID;
  const [tab, setTab] = useState("overview");
  const {
    getDashboardKpis,
    getOpdQueue,
    getPatient,
    consultations,
    counsellorQueue,
    ipdPatients,
    activeDoctorId,
    profile,
    startConsultation,
  } = useDoctorStore();

  const kpis = getDashboardKpis().filter(
    (k) => !isPataudi || (k.label !== "Counsellor queue" && k.label !== "Templates used"),
  );
  const queue = getOpdQueue();
  const next = queue[0];

  const actionItems = useMemo(() => {
    const items: { id: string; text: string; action: string; href: string; priority: string }[] = [];
    if (next) {
      const p = getPatient(next.patientId);
      items.push({
        id: "next",
        text: `${p?.name ?? "Patient"} waiting — token #${next.token}`,
        action: "Start consultation",
        href: `/app/doctor/consult/${next.id}`,
        priority: isRedFlagVisit(next) || next.waitMin > 15 ? "urgent" : "high",
      });
    }
    const ipdDue = ipdPatients.filter(
      (i) => i.attendingDoctorId === activeDoctorId && !i.lastRoundAt,
    );
    for (const ip of ipdDue) {
      const p = getPatient(ip.patientId);
      items.push({
        id: ip.id,
        text: `IPD round due — ${p?.name ?? ip.patientId} (${ip.ward} ${ip.bed})`,
        action: "Record round",
        href: "/app/doctor/ipd",
        priority: "high",
      });
    }
    if (!isPataudi && counsellorQueue.length > 0) {
      items.push({
        id: "cq",
        text: `${counsellorQueue.length} patient(s) in counsellor queue from your consults`,
        action: "View analytics",
        href: "/app/doctor/analytics",
        priority: "normal",
      });
    }
    return items;
  }, [next, getPatient, ipdPatients, activeDoctorId, isPataudi, counsellorQueue]);

  const recentConsults = consultations
    .filter((c) => c.status === "completed")
    .slice(-6)
    .reverse();

  return (
    <PageChrome
      breadcrumbs={[{ label: "Doctor", href: "/app/doctor" }, { label: "Dashboard" }]}
      title={`${profile.name}'s workspace`}
      meta="Your OPD queue, patients, and consult records only"
      tabs={[
        { id: "overview", label: "Overview" },
        { id: "activity", label: "Activity" },
      ]}
      activeTab={tab}
      onTabChange={setTab}
      actions={
        <AttioButton
          variant="primary"
          className="gap-1.5"
          onClick={() => {
            if (next) {
              void startConsultation(next.id).then(() =>
                router.push(`/app/doctor/consult/${next.id}`),
              );
            } else {
              router.push("/app/doctor/queue");
            }
          }}
        >
          <Stethoscope className="size-3.5" />
          {next ? "Start next consult" : "View queue"}
        </AttioButton>
      }
    >
      <MetricStrip metrics={kpis} />

      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Needs action now">
            <ul className="divide-y divide-[var(--attio-border-subtle)]">
              {actionItems.length === 0 && (
                <li className="py-6 text-center text-[13px] text-[var(--attio-text-tertiary)]">
                  All caught up
                </li>
              )}
              {actionItems.map((a) => (
                <li key={a.id}>
                  <Link
                    href={a.href}
                    className="flex items-start justify-between gap-3 py-3 transition-colors hover:bg-[var(--attio-surface)]"
                  >
                    <div>
                      <StatusBadge
                        label={a.priority}
                        variant={
                          a.priority === "urgent"
                            ? "danger"
                            : a.priority === "high"
                              ? "warning"
                              : "neutral"
                        }
                      />
                      <p className="mt-2 text-[13px] leading-snug text-[var(--attio-text-secondary)]">
                        {a.text}
                      </p>
                      <p className="mt-1 text-[12px] font-medium text-[var(--attio-accent)]">
                        {a.action}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="OPD queue snapshot">
            <DataTable
              columns={[
                { key: "token", label: "Token" },
                { key: "name", label: "Patient" },
                { key: "wait", label: "Wait" },
              ]}
              rows={queue.slice(0, 6).map((v) => {
                const p = getPatient(v.patientId);
                return {
                  token: `#${v.token}`,
                  name: p?.name ?? "—",
                  wait: `${v.waitMin}m`,
                };
              })}
              onRowClick={(i) => {
                const v = queue[i];
                if (v) {
                  void startConsultation(v.id).then(() =>
                    router.push(`/app/doctor/consult/${v.id}`),
                  );
                }
              }}
            />
          </Panel>
        </div>
      )}

      {tab === "activity" && (
        <Panel title="Recent consultations">
          <DataTable
            columns={[
              { key: "patient", label: "Patient" },
              { key: "mode", label: "Mode" },
              { key: "status", label: "Status" },
            ]}
            rows={recentConsults.map((c) => {
              const p = getPatient(c.patientId);
              return {
                patient: p?.name ?? c.patientId,
                mode: c.treatmentMode.toUpperCase(),
                status: c.recommendCounsellor && !c.skipCounsellor ? "→ Counsellor" : "Completed",
              };
            })}
          />
        </Panel>
      )}
    </PageChrome>
  );
}
