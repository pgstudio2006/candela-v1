"use client";

import { useCrmStore } from "@/components/crm/crm-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, Panel, StatusBadge } from "@/components/frontdesk/ui";
import { FileText, Search, User } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

export default function CrmPatientsPage() {
  const { getFilteredLeads, agents } = useCrmStore();
  const [query, setQuery] = useState("");

  // Show converted leads that have patientId
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

  return (
    <PageChrome
      breadcrumbs={[{ label: "CRM", href: "/app/crm" }, { label: "Patients" }]}
      title="Converted patients"
      meta="Patients from online counsellor lead conversions"
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

        {convertedLeads.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-[var(--attio-text-tertiary)]">
            No converted patients yet. Convert leads to patients from the lead profile.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-[var(--attio-border-subtle)] text-[11px] text-[var(--attio-text-tertiary)]">
                  <th className="py-2 pr-4 font-medium">Patient</th>
                  <th className="py-2 pr-4 font-medium">UHID</th>
                  <th className="py-2 pr-4 font-medium">Phone</th>
                  <th className="py-2 pr-4 font-medium">Counsellor</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--attio-border-subtle)]">
                {convertedLeads.map((l) => {
                  const agent = agents.find((a) => a.id === l.assigneeId);
                  return (
                    <tr key={l.id}>
                      <td className="py-2.5 pr-4 font-medium">{l.fullName}</td>
                      <td className="py-2.5 pr-4 tabular-nums">{l.uhid ?? "—"}</td>
                      <td className="py-2.5 pr-4 tabular-nums">{l.phone}</td>
                      <td className="py-2.5 pr-4">{agent?.name ?? "—"}</td>
                      <td className="py-2.5 pr-4">
                        <StatusBadge label={l.leadStatus?.replace(/_/g, " ") ?? "fresh"} variant="info" />
                      </td>
                      <td className="py-2.5 pr-4">
                        {l.patientId && (
                          <Link href={`/app/crm/patients/${l.patientId}`}>
                            <AttioButton variant="secondary" className="!h-7 !text-[11px] gap-1">
                              <FileText className="size-3" />
                              View
                            </AttioButton>
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </PageChrome>
  );
}
