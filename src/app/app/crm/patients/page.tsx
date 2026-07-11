"use client";

import { useCrmStore } from "@/components/crm/crm-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, Panel, StatusBadge } from "@/components/frontdesk/ui";
import { FileText, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type VisitRow = {
  id: string;
  token?: number;
  stage: string;
  doctorName: string | null;
  createdAt: string;
  billAmount: number;
  amountPaid: number;
  balanceDue: number;
};

type PatientRow = {
  id: string;
  uhid: string;
  name: string | null;
  fullName: string | null;
  phone: string | null;
  assignedCounsellorId: string | null;
  assignedCounsellorName: string | null;
  createdAt: string;
  visits: VisitRow[];
};

export default function CrmPatientsPage() {
  const { getFilteredLeads, agents, isHierarchyLead } = useCrmStore();
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const all = isHierarchyLead() ? "1" : "0";
        const res = await fetch(`/api/crm/patients?all=${all}`, { credentials: "include" });
        const json = await res.json();
        if (json.ok) setPatients((json.data as PatientRow[]) ?? []);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [isHierarchyLead]);

  const convertedLeads = useMemo(() => {
    const leads = getFilteredLeads();
    return leads
      .filter((l) => l.leadStatus === "converted" || l.leadStatus === "patient" || l.patientId)
      .filter((l) => {
        if (!query) return true;
        const q = query.toLowerCase();
        return (
          l.fullName.toLowerCase().includes(q) ||
          l.phone.includes(q) ||
          (l.uhid ?? "").toLowerCase().includes(q)
        );
      });
  }, [getFilteredLeads, query]);

  const filteredPatients = useMemo(() => {
    if (!query) return patients;
    const q = query.toLowerCase();
    return patients.filter(
      (p) =>
        (p.name ?? "").toLowerCase().includes(q) ||
        (p.fullName ?? "").toLowerCase().includes(q) ||
        (p.phone ?? "").includes(q) ||
        (p.uhid ?? "").toLowerCase().includes(q),
    );
  }, [patients, query]);

  return (
    <PageChrome
      breadcrumbs={[{ label: "CRM", href: "/app/crm" }, { label: "Patients" }]}
      title="My patients"
      meta="Patients assigned to you from leads or walk-in routing"
    >
      <Panel title="Patient list">
        <div className="mb-4 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--attio-text-tertiary)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, phone, UHID…"
              className="h-9 w-full rounded-lg border border-[var(--attio-border)] pl-9 pr-3 text-[13px]"
            />
          </div>
        </div>

        {loading ? (
          <p className="py-6 text-center text-[13px] text-[var(--attio-text-tertiary)]">Loading patients…</p>
        ) : filteredPatients.length === 0 && convertedLeads.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-[var(--attio-text-tertiary)]">
            No assigned patients yet. Walk-in patients will be routed automatically.
          </p>
        ) : (
          <div className="space-y-3">
            {filteredPatients.map((p) => (
              <div key={p.id} className="rounded-lg border border-[var(--attio-border-subtle)] bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold">{p.fullName || p.name || "—"}</p>
                    <p className="text-[12px] text-[var(--attio-text-secondary)]">
                      {p.uhid} · {p.phone ?? "—"} · {p.assignedCounsellorName ?? "Unassigned"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/app/frontdesk/patients/${p.id}`}>
                      <AttioButton variant="secondary" className="!h-7 !text-[11px] gap-1">
                        <FileText className="size-3" />
                        View
                      </AttioButton>
                    </Link>
                  </div>
                </div>
                {p.visits.length > 0 && (
                  <div className="mt-3 border-t border-[var(--attio-border-subtle)] pt-2">
                    <p className="mb-1 text-[11px] font-medium text-[var(--attio-text-tertiary)]">Visits</p>
                    <div className="space-y-1">
                      {p.visits.map((v) => (
                        <div key={v.id} className="flex items-center justify-between text-[12px]">
                          <span>
                            Token {v.token ?? "—"} · {v.doctorName ?? "No doctor"} · {v.stage}
                          </span>
                          <span className="tabular-nums">
                            Bill ₹{v.billAmount.toLocaleString("en-IN")} · Paid ₹{v.amountPaid.toLocaleString("en-IN")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {convertedLeads.map((l) => {
              const agent = agents.find((a) => a.id === l.assigneeId);
              return (
                <div key={`lead-${l.id}`} className="rounded-lg border border-[var(--attio-border-subtle)] bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold">{l.fullName}</p>
                      <p className="text-[12px] text-[var(--attio-text-secondary)]">
                        {l.uhid ?? "—"} · {l.phone} · {agent?.name ?? "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge label={l.leadStatus?.replace(/_/g, " ") ?? "fresh"} variant="info" />
                      {l.patientId && (
                        <Link href={`/app/frontdesk/patients/${l.patientId}`}>
                          <AttioButton variant="secondary" className="!h-7 !text-[11px] gap-1">
                            <FileText className="size-3" />
                            View
                          </AttioButton>
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </PageChrome>
  );
}
