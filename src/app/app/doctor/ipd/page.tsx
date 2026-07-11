"use client";

import { getIpdRoundHistoryAction } from "@/app/actions/doctor-actions";
import { useDoctorStore } from "@/components/doctor/doctor-store";
import { useDoctorFormSchema } from "@/components/doctor/use-doctor-form-schema";
import { IpdRoundWorkspace } from "@/components/doctor/ipd-round-workspace";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { Panel, StatusBadge } from "@/components/frontdesk/ui";
import { useDoctorPoll } from "@/hooks/use-doctor-poll";
import { cn } from "@/lib/utils";
import { useSession } from "@/components/candela/session-provider";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const PATAUDI_BRANCH_ID = "branch_pataudi";

type RoundRecord = Awaited<ReturnType<typeof getIpdRoundHistoryAction>>[number];

export default function DoctorIpdPage() {
  useDoctorPoll();
  const { session } = useSession();
  const isPataudi = session?.branchId === PATAUDI_BRANCH_ID;
  const { ipdPatients, getPatient, activeDoctorId, saveIpdRound, refresh } = useDoctorStore();
  const schema = useDoctorFormSchema("doctor-ipd-round");
  const [activeIpd, setActiveIpd] = useState<string | null>(null);
  const [roundHistory, setRoundHistory] = useState<RoundRecord[]>([]);

  const myPatients = ipdPatients.filter(
    (ip) => ip.attendingDoctorId === activeDoctorId && !["discharged", "deceased"].includes(ip.status),
  );

  const selected = myPatients.find((ip) => ip.id === activeIpd);

  const loadHistory = useCallback(async (ipdId: string) => {
    const rows = await getIpdRoundHistoryAction(ipdId);
    setRoundHistory(rows);
  }, []);

  useEffect(() => {
    if (activeIpd) void loadHistory(activeIpd);
    else setRoundHistory([]);
  }, [activeIpd, loadHistory]);

  return (
    <PageChrome
      breadcrumbs={[
        { label: "Doctor", href: "/app/doctor" },
        { label: "IPD rounds" },
      ]}
      title="IPD ward rounds"
      meta="Bed allocation · round history · live sync"
      actions={
        !isPataudi && (
          <div className="flex gap-2">
            <Link href="/app/nurse/queue" className="inline-flex h-9 items-center rounded-md border px-3 text-[13px] hover:bg-[var(--attio-hover)]">Nursing queue</Link>
            <Link href="/app/pharmacy/indents" className="inline-flex h-9 items-center rounded-md border px-3 text-[13px] hover:bg-[var(--attio-hover)]">Pharmacy indents</Link>
          </div>
        )
      }
    >
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Panel title="Admitted patients">
          <ul className="divide-y divide-[var(--attio-border-subtle)]">
            {myPatients.length === 0 && (
              <li className="py-6 text-center text-[13px] text-[var(--attio-text-tertiary)]">No IPD patients</li>
            )}
            {myPatients.map((ip) => {
              const p = getPatient(ip.patientId);
              const due = !ip.lastRoundAt;
              return (
                <li key={ip.id}>
                  <button
                    type="button"
                    onClick={() => setActiveIpd(ip.id)}
                    className={cn(
                      "w-full py-3 text-left transition-colors",
                      activeIpd === ip.id && "bg-[var(--attio-surface)] -mx-4 px-4",
                    )}
                  >
                    <p className="text-[13px] font-medium">{p?.name ?? ip.patientId}</p>
                    <p className="text-[11px] text-[var(--attio-text-tertiary)]">
                      {ip.ward} · Bed {ip.bed}
                    </p>
                    <div className="mt-1 flex gap-1">
                      <StatusBadge label={ip.status.replace("_", " ")} variant="info" />
                      {due && <StatusBadge label="Round due" variant="warning" />}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>

        {selected ? (
          <IpdRoundWorkspace
            admission={selected}
            patient={getPatient(selected.patientId)}
            roundHistory={roundHistory}
            schema={schema}
            onSaveRound={(data) => {
              saveIpdRound(selected.id, data);
              void loadHistory(selected.id);
            }}
            onRefresh={() => {
              void loadHistory(selected.id);
              void refresh({ silent: true });
            }}
          />
        ) : (
          <Panel title="Select a patient">
            <p className="py-12 text-center text-[13px] text-[var(--attio-text-tertiary)]">
              Choose an admitted patient to record a ward round
            </p>
          </Panel>
        )}
      </div>
    </PageChrome>
  );
}
