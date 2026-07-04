"use client";

import { getIpdRoundHistoryAction } from "@/app/actions/doctor-actions";
import { PublishedSchemaForm } from "@/components/candela/published-schema-form";
import { useDoctorStore } from "@/components/doctor/doctor-store";
import { useDoctorFormSchema } from "@/components/doctor/use-doctor-form-schema";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { Panel, StatusBadge } from "@/components/frontdesk/ui";
import { IpdDischargeSummaryPanel } from "@/components/ipd-discharge-summary";
import { useDoctorPoll } from "@/hooks/use-doctor-poll";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const WARD_BEDS: Record<string, string[]> = {
  "MSK Ward A": ["A-12", "A-13", "A-14", "A-15"],
  "MSK Ward B": ["B-01", "B-02", "B-03"],
  "Daycare Bay": ["D-01", "D-02"],
};

type RoundRecord = Awaited<ReturnType<typeof getIpdRoundHistoryAction>>[number];

export default function DoctorIpdPage() {
  useDoctorPoll();
  const { ipdPatients, getPatient, activeDoctorId, saveIpdRound } = useDoctorStore();
  const schema = useDoctorFormSchema("doctor-ipd-round");
  const [activeIpd, setActiveIpd] = useState<string | null>(null);
  const [roundHistory, setRoundHistory] = useState<RoundRecord[]>([]);

  const myPatients = ipdPatients.filter((ip) => ip.attendingDoctorId === activeDoctorId);

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
        <div className="flex gap-2">
          <Link href="/app/nurse/queue" className="inline-flex h-9 items-center rounded-md border px-3 text-[13px] hover:bg-[var(--attio-hover)]">Nursing queue</Link>
          <Link href="/app/pharmacy/indents" className="inline-flex h-9 items-center rounded-md border px-3 text-[13px] hover:bg-[var(--attio-hover)]">Pharmacy indents</Link>
        </div>
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {Object.entries(WARD_BEDS).map(([ward, beds]) => {
          const occupied = myPatients.filter((p) => p.ward === ward).map((p) => p.bed);
          return (
            <Panel key={ward} title={ward}>
              <div className="flex flex-wrap gap-1.5">
                {beds.map((bed) => {
                  const taken = occupied.includes(bed);
                  return (
                    <span
                      key={bed}
                      className={cn(
                        "rounded-md border px-2 py-1 text-[11px]",
                        taken ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-[var(--attio-border)] text-[var(--attio-text-tertiary)]",
                      )}
                    >
                      {bed}{taken ? " · occupied" : " · free"}
                    </span>
                  );
                })}
              </div>
            </Panel>
          );
        })}
      </div>
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
              <PublishedSchemaForm
                schema={schema}
                formKey={`ipd-${selected.id}`}
                submitLabel="Save round note"
                onSubmit={(data) => {
                  saveIpdRound(selected.id, data);
                  void loadHistory(selected.id);
                }}
              />
            </Panel>

            <IpdDischargeSummaryPanel admissionId={selected.id} />

            {roundHistory.length > 0 && (
              <Panel title="Round history">
                <ul className="divide-y divide-[var(--attio-border-subtle)]">
                  {roundHistory.map((round) => (
                    <li key={round.id} className="py-3">
                      <p className="text-[11px] text-[var(--attio-text-tertiary)]">
                        {new Date(round.at).toLocaleString("en-IN")}
                      </p>
                      <pre className="mt-1 whitespace-pre-wrap font-sans text-[12px] text-[var(--attio-text-secondary)]">
                        {round.note}
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
