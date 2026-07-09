import type { CrmLead, CrmLeadSource } from "@/design-system/crm-data";

export type CrmLeadFilter = {
  query: string;
  source: "all" | CrmLeadSource;
  branch: "all" | string;
  counselor: "all" | string;
};

export const DEFAULT_CRM_LEAD_FILTER: CrmLeadFilter = {
  query: "",
  source: "all",
  branch: "all",
  counselor: "all",
};

export function applyCrmLeadFilters(
  leads: CrmLead[],
  filters: CrmLeadFilter,
): CrmLead[] {
  const q = filters.query.trim().toLowerCase();
  return leads.filter((l) => {
    if (q) {
      const text = `${l.fullName} ${l.phone} ${l.uhid ?? ""} ${l.email ?? ""}`.toLowerCase();
      if (!text.includes(q)) return false;
    }
    if (filters.source !== "all" && l.source !== filters.source) return false;
    if (filters.branch !== "all" && l.appointmentCentre !== filters.branch) return false;
    if (filters.counselor !== "all" && l.assigneeId !== filters.counselor) return false;
    return true;
  });
}
