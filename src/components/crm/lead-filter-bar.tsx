"use client";

import type { CrmAgent, CrmLeadSource, CrmPipelineStage } from "@/design-system/crm-data";
import { CRM_APPOINTMENT_CENTRES, SOURCE_LABELS } from "@/design-system/crm-data";
import type { CrmLeadFilter } from "@/lib/crm-lead-filters";
import { Search } from "lucide-react";

export function CrmLeadFilterBar({
  filters,
  onChange,
  agents,
  stages,
}: {
  filters: CrmLeadFilter;
  onChange: (filters: CrmLeadFilter) => void;
  agents: CrmAgent[];
  stages: CrmPipelineStage[];
}) {
  const update = (patch: Partial<CrmLeadFilter>) => onChange({ ...filters, ...patch });

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-[var(--attio-border-subtle)] bg-[var(--attio-surface)]/50 p-3">
      <div className="relative min-w-[200px] flex-1">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--attio-text-tertiary)]" />
        <input
          type="text"
          value={filters.query}
          onChange={(e) => update({ query: e.target.value })}
          placeholder="Search leads by name, phone, UHID…"
          className="h-9 w-full rounded-lg border border-[var(--attio-border)] bg-white pl-9 pr-3 text-[13px]"
        />
      </div>

      <select
        value={filters.source}
        onChange={(e) => update({ source: e.target.value as CrmLeadFilter["source"] })}
        className="h-9 min-w-[140px] rounded-lg border border-[var(--attio-border)] bg-white px-3 text-[13px]"
      >
        <option value="all">All lead types</option>
        {(Object.keys(SOURCE_LABELS) as CrmLeadSource[]).map((s) => (
          <option key={s} value={s}>
            {SOURCE_LABELS[s]}
          </option>
        ))}
      </select>

      <select
        value={filters.branch}
        onChange={(e) => update({ branch: e.target.value })}
        className="h-9 min-w-[150px] rounded-lg border border-[var(--attio-border)] bg-white px-3 text-[13px]"
      >
        <option value="all">All branches</option>
        {CRM_APPOINTMENT_CENTRES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <select
        value={filters.counselor}
        onChange={(e) => update({ counselor: e.target.value })}
        className="h-9 min-w-[150px] rounded-lg border border-[var(--attio-border)] bg-white px-3 text-[13px]"
      >
        <option value="all">All counselors</option>
        {agents
          .filter((a) => a.role !== "manager")
          .map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
      </select>

      <select
        value={filters.status}
        onChange={(e) => update({ status: e.target.value })}
        className="h-9 min-w-[140px] rounded-lg border border-[var(--attio-border)] bg-white px-3 text-[13px]"
      >
        <option value="all">All status</option>
        {stages.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-2">
        <input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => update({ dateFrom: e.target.value })}
          className="h-9 rounded-lg border border-[var(--attio-border)] bg-white px-3 text-[13px]"
        />
        <span className="text-[12px] text-[var(--attio-text-tertiary)]">to</span>
        <input
          type="date"
          value={filters.dateTo}
          onChange={(e) => update({ dateTo: e.target.value })}
          className="h-9 rounded-lg border border-[var(--attio-border)] bg-white px-3 text-[13px]"
        />
      </div>

      <button
        type="button"
        onClick={() =>
          onChange({
            query: "",
            source: "all",
            branch: "all",
            counselor: "all",
            status: "all",
            dateFrom: "",
            dateTo: "",
          })
        }
        className="h-9 rounded-lg border border-[var(--attio-border)] px-3 text-[12px] text-[var(--attio-text-secondary)] hover:bg-white"
      >
        Reset
      </button>
    </div>
  );
}
