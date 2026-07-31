/** Navayu Candela — 8 role modules (unified palette, in-page views only) */

export type CandelaModuleId =
  | "admin"
  | "frontdesk"
  | "nurse"
  | "doctor"
  | "pharmacy"
  | "laboratory"
  | "counsellor"
  | "crm"
  | "hr";

export type CandelaRole = CandelaModuleId;

export type ModuleView = {
  id: string;
  label: string;
};

export type CandelaModule = {
  id: CandelaModuleId;
  label: string;
  shortLabel: string;
  path: string;
  description: string;
  roles: CandelaRole[];
  views: ModuleView[];
};

export const CANDELA_MODULES: CandelaModule[] = [
  {
    id: "admin",
    label: "Admin",
    shortLabel: "Admin",
    path: "/app/admin",
    description: "Command center, hawk-eye, staff, audit, geo, finance, RCM, MRD, MIS, universal form builder",
    roles: ["admin"],
    views: [
      { id: "dashboard", label: "Command center" },
      { id: "hawk-eye", label: "Hawk-eye control" },
      { id: "audit", label: "Audit" },
      { id: "geo", label: "Geo intelligence" },
      { id: "data-mining", label: "Data mining" },
      { id: "staff", label: "Staff & access" },
      { id: "departments", label: "Departments" },
      { id: "disease-mapping", label: "Disease mapping" },
      { id: "forms", label: "Form builder" },
      { id: "revenue-sharing", label: "Revenue sharing" },
      { id: "finance", label: "Finance" },
      { id: "rcm", label: "Revenue cycle AI" },
      { id: "mrd", label: "Medical records" },
      { id: "mis", label: "MIS reports" },
      { id: "settings", label: "Settings" },
    ],
  },
  {
    id: "frontdesk",
    label: "Front Desk",
    shortLabel: "Desk",
    path: "/app/frontdesk",
    description: "Registration, appointments, billing-first, queue — includes junior doctor intake",
    roles: ["frontdesk"],
    views: [
      { id: "registration", label: "Registration" },
      { id: "appointments", label: "Appointments" },
      { id: "billing", label: "Billing-first" },
      { id: "queue", label: "Reception queue" },
      { id: "closure", label: "Billing closure" },
      { id: "intake", label: "Junior intake / MSK" },
    ],
  },
  {
    id: "nurse",
    label: "Nurse",
    shortLabel: "Nurse",
    path: "/app/nurse",
    description: "Exam handoff, vitals, assessments, nursing & consent",
    roles: ["nurse"],
    views: [
      { id: "handoff", label: "Exam handoff" },
      { id: "vitals", label: "Vitals & assessment" },
      { id: "consent", label: "Consent & treatment" },
    ],
  },
  {
    id: "doctor",
    label: "Doctor",
    shortLabel: "Doctor",
    path: "/app/doctor",
    description: "Doctor queue and consultation with counsellor handoff",
    roles: ["doctor"],
    views: [
      { id: "queue", label: "Queue" },
      { id: "consultation", label: "Consultation" },
    ],
  },
  {
    id: "pharmacy",
    label: "Pharmacy",
    shortLabel: "Rx",
    path: "/app/pharmacy",
    description: "Dispensing, inventory, prescription fulfillment",
    roles: ["pharmacy"],
    views: [
      { id: "dispensary", label: "Dispensary" },
      { id: "inventory", label: "Inventory" },
    ],
  },
  {
    id: "laboratory",
    label: "Laboratory",
    shortLabel: "Lab",
    path: "/app/laboratory",
    description: "Lab orders, sample collection, report preparation and catalog",
    roles: ["laboratory"],
    views: [
      { id: "orders", label: "Orders" },
      { id: "prepare", label: "Prepare report" },
      { id: "fields", label: "Fields master" },
      { id: "reports", label: "Report catalog" },
    ],
  },
  {
    id: "counsellor",
    label: "Counsellor",
    shortLabel: "Counsel",
    path: "/app/counsellor",
    description: "Package planning, conversion, discount, billing handoff",
    roles: ["counsellor"],
    views: [{ id: "desk", label: "Counsellor desk" }],
  },
  {
    id: "crm",
    label: "CRM",
    shortLabel: "CRM",
    path: "/app/crm",
    description: "Attio-style workspace · WhatsApp & Forms · lead routing · team KPIs",
    roles: ["crm"],
    views: [
      { id: "dashboard", label: "Workspace" },
      { id: "inbox", label: "Lead inbox" },
      { id: "leads", label: "Pipeline" },
      { id: "follow-ups", label: "Follow-ups" },
      { id: "integrations", label: "Integrations" },
      { id: "team", label: "Team & routing" },
      { id: "workflows", label: "Workflows" },
      { id: "analytics", label: "Team KPIs" },
      { id: "settings", label: "Settings" },
    ],
  },
  {
    id: "hr",
    label: "HR",
    shortLabel: "HR",
    path: "/app/hr",
    description: "Staff, scheduling, leave, attendance, payroll",
    roles: ["hr"],
    views: [
      { id: "dashboard", label: "Command center" },
      { id: "staff", label: "Staff directory" },
      { id: "org-chart", label: "Org chart" },
      { id: "scheduling", label: "Scheduling" },
      { id: "leave", label: "Leave" },
      { id: "attendance", label: "Attendance" },
      { id: "payroll", label: "Payroll" },
      { id: "settings", label: "Settings" },
    ],
  },
];

export function modulesForRole(role: CandelaRole): CandelaModule[] {
  return CANDELA_MODULES.filter((m) => m.id === role);
}

export function getModule(id: CandelaModuleId) {
  return CANDELA_MODULES.find((m) => m.id === id);
}

export function getModuleByPath(path: string) {
  return CANDELA_MODULES.find((m) => path.startsWith(m.path));
}

export const ROLE_LABELS: Record<CandelaRole, string> = {
  admin: "Administrator",
  frontdesk: "Front Desk (+ Junior Doctor)",
  nurse: "Nurse",
  doctor: "Doctor",
  pharmacy: "Pharmacy",
  laboratory: "Laboratory",
  counsellor: "Counsellor",
  crm: "CRM",
  hr: "HR",
};
