import type { CrmLead, CrmLeadSource } from "@/design-system/crm-data";

export type CrmLeadFilter = {
  query: string;
  source: "all" | CrmLeadSource;
  branch: "all" | string;
  counselor: "all" | string;
  status: "all" | string;
  dateFrom: string;
  dateTo: string;
};

export const DEFAULT_CRM_LEAD_FILTER: CrmLeadFilter = {
  query: "",
  source: "all",
  branch: "all",
  counselor: "all",
  status: "all",
  dateFrom: "",
  dateTo: "",
};

function isDateInRange(dateStr: string, from: string, to: string) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  if (from && d < new Date(from)) return false;
  if (to) {
    const toEnd = new Date(to);
    toEnd.setHours(23, 59, 59, 999);
    if (d > toEnd) return false;
  }
  return true;
}

export function applyCrmLeadFilters(
  leads: CrmLead[],
  filters: CrmLeadFilter,
): CrmLead[] {
  const q = filters.query.trim().toLowerCase();
  const dateFilterActive = filters.dateFrom || filters.dateTo;
  return leads.filter((l) => {
    if (q) {
      const text = `${l.fullName} ${l.phone} ${l.uhid ?? ""} ${l.email ?? ""}`.toLowerCase();
      if (!text.includes(q)) return false;
    }
    if (filters.source !== "all" && l.source !== filters.source) return false;
    if (filters.branch !== "all" && l.appointmentCentre !== filters.branch) return false;
    if (filters.counselor !== "all" && l.assigneeId !== filters.counselor) return false;
    if (filters.status !== "all" && l.stageId !== filters.status) return false;
    if (dateFilterActive && !isDateInRange(l.createdAt, filters.dateFrom, filters.dateTo)) return false;
    return true;
  });
}
