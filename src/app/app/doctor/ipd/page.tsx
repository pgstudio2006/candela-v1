"use client";

import { getIpdRoundHistoryAction } from "@/app/actions/doctor-actions";
import { PublishedSchemaForm } from "@/components/candela/published-schema-form";
import { useDoctorStore } from "@/components/doctor/doctor-store";
import { useDoctorFormSchema } from "@/components/doctor/use-doctor-form-schema";
import { IpdRoundAiScribe } from "@/components/doctor/ipd-round-ai-scribe";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { Panel, StatusBadge } from "@/components/frontdesk/ui";
import { IpdDischargeSummaryPanel } from "@/components/ipd-discharge-summary";
import { useDoctorPoll } from "@/hooks/use-doctor-poll";
import type { IpdRoundScribeDraft } from "@/lib/ai/scribe-types";
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
  const [roundValues, setRoundValues] = useState<Record<string, string | number | boolean>>({});
  const [roundFormKey, setRoundFormKey] = useState(0);

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
    setRoundValues({});
    setRoundFormKey((k) => k + 1);
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
          <div className="space-y-4">
            <Panel title={`Round · ${getPatient(selected.patientId)?.name}`}>
              <p className="mb-4 text-[13px] text-[var(--attio-text-secondary)]">
                {selected.diagnosis} · Admitted {selected.admittedAt}
              </p>
              {selected.lastRoundNote && (
                <div className="mb-4 rounded-lg bg-[var(--attio-surface)] p-3 text-[12px] text-[var(--attio-text-secondary)]">
                  <p className="mb-1 font-medium text-[var(--attio-text-tertiary)]">Last round ({selected.lastRoundAt})</p>
                  <pre className="whitespace-pre-wrap font-sans">{selected.lastRoundNote}</pre>
                </div>
              )}
              <IpdRoundAiScribe
                patientContext={`${getPatient(selected.patientId)?.name ?? selected.patientId} · ${selected.diagnosis}`}
                onDraftAccepted={(draft: IpdRoundScribeDraft) => {
                  setRoundValues({ ...draft });
                  setRoundFormKey((k) => k + 1);
                }}
              />
              <PublishedSchemaForm
                key={`ipd-${selected.id}-${roundFormKey}`}
                schema={schema}
                initialValues={roundValues}
                submitLabel="Save round note"
                onValuesChange={setRoundValues}
                onSubmit={(data) => {
                  saveIpdRound(selected.id, data);
                  setRoundValues({});
                  setRoundFormKey((k) => k + 1);
                  void loadHistory(selected.id);
                }}
              />
            </Panel>

            <IpdDischargeSummaryPanel admissionId={selected.id} onSaved={() => refresh({ silent: true })} />

            {roundHistory.length > 0 && (
              <Panel title="Round log">
                <ul className="divide-y divide-[var(--attio-border-subtle)]">
                  {roundHistory.map((round) => (
                    <li key={round.id} className="py-3">
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="font-medium text-[var(--attio-text)]">{round.actorName}</span>
                        <span className="rounded-full border border-[var(--attio-border-subtle)] px-1.5 py-0.5 text-[10px] uppercase text-[var(--attio-text-tertiary)]">
                          {round.actorRole}
                        </span>
                        <span className="rounded-full bg-[var(--attio-surface)] px-1.5 py-0.5 text-[10px] text-[var(--attio-text-secondary)]">
                          {round.kind.replace(/_/g, " ")}
                        </span>
                        <span className="text-[var(--attio-text-tertiary)]">
                          {new Date(round.at).toLocaleString("en-IN")}
                        </span>
                      </div>
                      <pre className="whitespace-pre-wrap font-sans text-[12px] text-[var(--attio-text-secondary)]">
                        {round.content}
                      </pre>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </div>
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
