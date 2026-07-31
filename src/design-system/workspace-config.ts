import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Building2,
  FlaskConical,
  HeartPulse,
  Pill,
  Stethoscope,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import type { CandelaRole } from "@/design-system/modules";

export type WorkspaceConfig = {
  role: CandelaRole;
  label: string;
  shortLabel: string;
  description: string;
  homePath: string;
  icon: LucideIcon;
  sidebarItems: { id: string; label: string; href: string }[];
};

export const WORKSPACES: WorkspaceConfig[] = [
  {
    role: "admin",
    label: "Administrator",
    shortLabel: "Admin",
    description: "Master data, finance, disease mapping, MIS",
    homePath: "/app/admin",
    icon: Building2,
    sidebarItems: [
      { id: "dashboard", label: "Command center", href: "/app/admin" },
      { id: "hawk-eye", label: "Hawk-eye control", href: "/app/admin/hawk-eye" },
      { id: "audit", label: "Audit", href: "/app/admin/audit" },
      { id: "geo", label: "Geo intelligence", href: "/app/admin/geo" },
      { id: "data-mining", label: "Data mining", href: "/app/admin/data-mining" },
      { id: "patients", label: "Patients", href: "/app/admin/patients" },
      { id: "staff", label: "Staff & access", href: "/app/admin/staff" },
      { id: "departments", label: "Departments", href: "/app/admin/departments" },
      { id: "disease-mapping", label: "Disease mapping", href: "/app/admin/disease-mapping" },
      { id: "forms", label: "Form builder", href: "/app/admin/forms" },
      { id: "revenue-sharing", label: "Revenue sharing", href: "/app/admin/revenue-sharing" },
      { id: "finance", label: "Finance", href: "/app/admin/finance" },
      { id: "rcm", label: "Revenue cycle AI", href: "/app/admin/rcm" },
      { id: "mrd", label: "Medical records", href: "/app/admin/mrd" },
      { id: "mis", label: "MIS reports", href: "/app/admin/mis" },
      { id: "settings", label: "Settings", href: "/app/admin/settings" },
    ],
  },
  {
    role: "frontdesk",
    label: "Front Desk",
    shortLabel: "Desk",
    description: "Registration, appointments, billing-first, queue",
    homePath: "/app/frontdesk",
    icon: UserRound,
    sidebarItems: [
      { id: "dashboard", label: "Dashboard", href: "/app/frontdesk" },
      { id: "registration", label: "Registration", href: "/app/frontdesk/registration" },
      { id: "patients", label: "Patients", href: "/app/frontdesk/patients" },
      { id: "check-in", label: "Check-in", href: "/app/frontdesk/check-in" },
      { id: "appointments", label: "Appointments", href: "/app/frontdesk/appointments" },
      { id: "queue", label: "Queue", href: "/app/frontdesk/queue" },
      { id: "billing", label: "Billing", href: "/app/frontdesk/billing" },
      { id: "junior-exam", label: "Junior exam", href: "/app/frontdesk/junior-exam" },
    ],
  },
  {
    role: "laboratory",
    label: "Laboratory",
    shortLabel: "Lab",
    description: "Fields master, report catalog and lab orders",
    homePath: "/app/laboratory",
    icon: FlaskConical,
    sidebarItems: [
      { id: "dashboard", label: "Dashboard", href: "/app/laboratory" },
      { id: "orders", label: "Orders", href: "/app/laboratory/orders" },
      { id: "fields", label: "Fields master", href: "/app/laboratory/fields" },
      { id: "reports", label: "Report catalog", href: "/app/laboratory/reports" },
    ],
  },
  {
    role: "nurse",
    label: "Nurse",
    shortLabel: "Nurse",
    description: "Exam handoff, vitals, consent & treatment",
    homePath: "/app/nurse",
    icon: HeartPulse,
    sidebarItems: [
      { id: "dashboard", label: "Dashboard", href: "/app/nurse" },
      { id: "queue", label: "Execution queue", href: "/app/nurse/queue" },
      { id: "patients", label: "Patients", href: "/app/nurse/patients" },
      { id: "consent", label: "Consent registry", href: "/app/nurse/consent" },
      { id: "analytics", label: "Analytics", href: "/app/nurse/analytics" },
      { id: "settings", label: "Settings", href: "/app/nurse/settings" },
    ],
  },
  {
    role: "doctor",
    label: "Doctor",
    shortLabel: "Doctor",
    description: "Queue and consultation workspace",
    homePath: "/app/doctor",
    icon: Stethoscope,
    sidebarItems: [
      { id: "queue", label: "Queue", href: "/app/doctor" },
      { id: "consultation", label: "OPD queue", href: "/app/doctor/queue" },
    ],
  },
  {
    role: "pharmacy",
    label: "Pharmacy",
    shortLabel: "Rx",
    description: "Dispensary · inventory · procurement · Schedule H compliance",
    homePath: "/app/pharmacy",
    icon: Pill,
    sidebarItems: [
      { id: "dashboard", label: "Dashboard", href: "/app/pharmacy" },
      { id: "prescriptions", label: "Prescriptions", href: "/app/pharmacy/prescriptions" },
      { id: "billing", label: "Billing", href: "/app/pharmacy/billing" },
      { id: "inventory", label: "Inventory", href: "/app/pharmacy/inventory" },
      { id: "drugs", label: "Drugs", href: "/app/pharmacy/drugs" },
      { id: "purchase-orders", label: "Purchase orders", href: "/app/pharmacy/purchase-orders" },
      { id: "reports", label: "Reports", href: "/app/pharmacy/reports" },
    ],
  },
  {
    role: "counsellor",
    label: "Counsellor",
    shortLabel: "Counsel",
    description: "Packages, conversion, billing handoff",
    homePath: "/app/counsellor",
    icon: Users,
    sidebarItems: [
      { id: "dashboard", label: "Dashboard", href: "/app/counsellor" },
      { id: "queue", label: "Counsel queue", href: "/app/counsellor/queue" },
      { id: "patients", label: "Patients", href: "/app/counsellor/patients" },
      { id: "packages", label: "Packages", href: "/app/counsellor/packages" },
      { id: "approvals", label: "Approvals", href: "/app/counsellor/approvals" },
      { id: "analytics", label: "Analytics", href: "/app/counsellor/analytics" },
      { id: "settings", label: "Settings", href: "/app/counsellor/settings" },
    ],
  },
  {
    role: "crm",
    label: "CRM",
    shortLabel: "CRM",
    description: "Lead workspace · integrations · counsellor routing · KPIs",
    homePath: "/app/crm",
    icon: Activity,
    sidebarItems: [
      { id: "dashboard", label: "Workspace", href: "/app/crm" },
      { id: "inbox", label: "Lead inbox", href: "/app/crm/inbox" },
      { id: "leads", label: "Pipeline", href: "/app/crm/leads" },
      { id: "follow-ups", label: "Follow-ups", href: "/app/crm/follow-ups" },
      { id: "integrations", label: "Integrations", href: "/app/crm/integrations" },
      { id: "team", label: "Team & routing", href: "/app/crm/team" },
      { id: "workflows", label: "Workflows", href: "/app/crm/workflows" },
      { id: "analytics", label: "Team KPIs", href: "/app/crm/analytics" },
      { id: "settings", label: "Settings", href: "/app/crm/settings" },
    ],
  },
  {
    role: "hr",
    label: "HR",
    shortLabel: "HR",
    description: "People ops · scheduling · leave · payroll",
    homePath: "/app/hr",
    icon: Wallet,
    sidebarItems: [
      { id: "dashboard", label: "Command center", href: "/app/hr" },
      { id: "staff", label: "Staff directory", href: "/app/hr/staff" },
      { id: "org-chart", label: "Org chart", href: "/app/hr/org-chart" },
      { id: "scheduling", label: "Scheduling", href: "/app/hr/scheduling" },
      { id: "leave", label: "Leave", href: "/app/hr/leave" },
      { id: "attendance", label: "Attendance", href: "/app/hr/attendance" },
      { id: "payroll", label: "Payroll", href: "/app/hr/payroll" },
      { id: "settings", label: "Settings", href: "/app/hr/settings" },
    ],
  },
];

export function getWorkspace(role: CandelaRole): WorkspaceConfig {
  const ws = WORKSPACES.find((w) => w.role === role);
  if (!ws) throw new Error(`Unknown role: ${role}`);
  return ws;
}

export function roleForPath(path: string): CandelaRole | null {
  const ws = WORKSPACES.find((w) => path.startsWith(w.homePath));
  return ws?.role ?? null;
}

export function canAccessPath(role: CandelaRole, path: string): boolean {
  const ws = getWorkspace(role);
  return path.startsWith(ws.homePath);
}
