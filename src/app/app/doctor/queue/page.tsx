"use client";

import { useDoctorStore } from "@/components/doctor/doctor-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, Panel, StatusBadge } from "@/components/frontdesk/ui";
import { useDoctorPoll } from "@/hooks/use-doctor-poll";
import { isRedFlagVisit, patientDisplayName } from "@/lib/frontdesk-workflow";
import { isJuniorHandoffReady } from "@/lib/doctor-queue";
import { cn } from "@/lib/utils";
import { Clock, Stethoscope, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DoctorQueuePage() {
  useDoctorPoll();
  const router = useRouter();
  const { getOpdQueue, getPatient, getConsultation, startConsultation, skipConsultation, activeDoctorId, profile } = useDoctorStore();
  const [deptView, setDeptView] = useState(false);
  const [skippingId, setSkippingId] = useState<string | null>(null);
  const queue = deptView ? getOpdQueue(undefined, true) : getOpdQueue();

  console.log("[DoctorQueue] doctorId:", activeDoctorId, "doctorName:", profile.name, "deptIds:", profile.departmentIds, "queue length:", queue.length);

  const callNext = async () => {
    const next = queue[0];
    if (next) {
      await startConsultation(next.id);
      router.push(`/app/doctor/consult/${next.id}`);
    }
  };

  return (
    <PageChrome
      breadcrumbs={[
        { label: "Doctor", href: "/app/doctor" },
        { label: "OPD queue" },
      ]}
      title="OPD queue"
      meta="Red flags & appointments first · live sync"
      actions={
        <div className="flex items-center gap-2">
          <AttioButton
            variant={deptView ? "primary" : "secondary"}
            className="gap-1.5"
            onClick={() => setDeptView((v) => !v)}
          >
            <Users className="size-3.5" />
            {deptView ? "My queue" : "Dept queue"}
          </AttioButton>
          <AttioButton variant="primary" className="gap-1.5" onClick={() => void callNext()} disabled={!queue.length}>
            <Stethoscope className="size-3.5" />
            Start next consult
          </AttioButton>
        </div>
      }
    >
      <Panel title="Waiting for consultant" action={<span className="text-[11px] text-[var(--attio-text-tertiary)]">{queue.length} in queue</span>}>
        <ul className="divide-y divide-[var(--attio-border-subtle)]">
          {queue.length === 0 && (
            <li className="py-8 text-center text-[13px] text-[var(--attio-text-tertiary)]">
              Queue clear — patients appear after frontdesk check-in
            </li>
          )}
          {queue.map((v) => {
            const p = getPatient(v.patientId);
            if (!p) return null;
            const redFlag = isRedFlagVisit(v);
            const handoffReady = isJuniorHandoffReady(v);
            const consultStarted = Boolean(getConsultation(v.id));
            return (
              <li
                key={v.id}
                className={cn(
                  "flex items-center justify-between gap-4 py-4",
                  (v.appointment || redFlag) && "bg-blue-50/40 -mx-4 px-4",
                  redFlag && "bg-red-50/50",
                )}
              >
                <div>
                  <p className="text-[14px] font-medium">
                    #{v.token} · {patientDisplayName(p)}
                  </p>
                  <p className="font-mono text-[11px] text-[var(--attio-text-tertiary)]">{p.uhid}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <StatusBadge label={v.billing} variant={v.billing === "paid" ? "success" : "warning"} />
                    {v.exam === "done" && <StatusBadge label="Exam done" variant="success" />}
                    {handoffReady && !consultStarted && (
                      <StatusBadge label="Junior exam complete" variant="info" />
                    )}
                    {redFlag && <StatusBadge label="RED FLAG" variant="danger" />}
                    {v.appointment && <StatusBadge label={`Appt ${v.appointmentTime}`} variant="info" />}
                    {deptView && v.doctorName && (
                      <StatusBadge label={v.doctorName} variant="neutral" />
                    )}
                  </div>
                  {v.routingNote && (
                    <p className="mt-1 text-[11px] text-amber-800">{v.routingNote}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-[12px] text-[var(--attio-text-tertiary)]">
                    <Clock className="size-3.5" />
                    {v.waitMin}m
                  </span>
                  <AttioButton
                    variant="secondary"
                    onClick={() => {
                      void startConsultation(v.id).then(() =>
                        router.push(`/app/doctor/consult/${v.id}`),
                      );
                    }}
                  >
                    Consult
                  </AttioButton>
                  <AttioButton
                    variant="secondary"
                    disabled={skippingId === v.id}
                    onClick={() => {
                      setSkippingId(v.id);
                      skipConsultation(v.id)
                        .then((res) => {
                          console.log("[DoctorQueue] skip result:", res);
                        })
                        .catch((err) => {
                          console.error("[DoctorQueue] skip error:", err);
                          alert(err instanceof Error ? err.message : "Failed to skip");
                        })
                        .finally(() => setSkippingId(null));
                    }}
                  >
                    Skip
                  </AttioButton>
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>
    </PageChrome>
  );
}
