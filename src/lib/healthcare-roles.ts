/** Healthcare operational roles for staff onboarding */
export type HealthcareStaffRole =
  | "super_admin"
  | "branch_admin"
  | "branch_manager"
  | "finance"
  | "finance_manager"
  | "mrd"
  | "viewer"
  | "doctor"
  | "nurse"
  | "frontdesk"
  | "receptionist"
  | "pharmacist"
  | "counsellor"
  | "crm_executive"
  | "crm_manager"
  | "hr_executive"
  | "lab_technician"
  | "billing_executive";

export const HEALTHCARE_STAFF_ROLES: { value: HealthcareStaffRole; label: string; moduleRole?: string }[] = [
  { value: "super_admin", label: "Super admin", moduleRole: "admin" },
  { value: "branch_admin", label: "Branch admin", moduleRole: "admin" },
  { value: "branch_manager", label: "Branch manager", moduleRole: "admin" },
  { value: "doctor", label: "Doctor", moduleRole: "doctor" },
  { value: "nurse", label: "Nurse", moduleRole: "nurse" },
  { value: "frontdesk", label: "Front desk", moduleRole: "frontdesk" },
  { value: "receptionist", label: "Receptionist", moduleRole: "frontdesk" },
  { value: "pharmacist", label: "Pharmacist", moduleRole: "pharmacy" },
  { value: "counsellor", label: "Counsellor", moduleRole: "counsellor" },
  { value: "crm_executive", label: "CRM executive", moduleRole: "crm" },
  { value: "crm_manager", label: "CRM manager", moduleRole: "crm" },
  { value: "hr_executive", label: "HR executive", moduleRole: "hr" },
  { value: "lab_technician", label: "Lab technician", moduleRole: "laboratory" },
  { value: "billing_executive", label: "Billing executive", moduleRole: "frontdesk" },
  { value: "finance", label: "Finance", moduleRole: "admin" },
  { value: "finance_manager", label: "Finance manager", moduleRole: "admin" },
  { value: "mrd", label: "MRD officer", moduleRole: "admin" },
  { value: "viewer", label: "Viewer (read-only)" },
];

export function moduleRoleForStaffRole(role: HealthcareStaffRole): string | undefined {
  return HEALTHCARE_STAFF_ROLES.find((r) => r.value === role)?.moduleRole;
}

export function doctorIdFromStaffId(staffId: string) {
  return `dr_${staffId.replace(/^st_/, "")}`;
}

export function generateStaffPassword() {
  return `welcome${Math.floor(1000 + Math.random() * 9000)}`;
}

export function staffRoleLabel(role: string) {
  return HEALTHCARE_STAFF_ROLES.find((r) => r.value === role)?.label ?? role.replace(/_/g, " ");
}
