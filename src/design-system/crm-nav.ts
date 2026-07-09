import {
  BarChart3,
  Clipboard,
  ClipboardList,
  Inbox,
  Kanban,
  LayoutDashboard,
  Plug,
  Settings,
  Users,
  Workflow,
  Calendar,
  IndianRupee,
  FileText,
  type LucideIcon,
} from "lucide-react";

export type CrmNavItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  group: "workspace" | "pipeline" | "ops" | "insights";
  managerOnly?: boolean;
};

export const CRM_NAV: CrmNavItem[] = [
  { id: "dashboard", label: "Workspace", href: "/app/crm", icon: LayoutDashboard, group: "workspace" },
  { id: "inbox", label: "Lead inbox", href: "/app/crm/inbox", icon: Inbox, group: "workspace" },
  { id: "leads", label: "Pipeline", href: "/app/crm/leads", icon: Kanban, group: "pipeline" },
  { id: "follow-ups", label: "Follow-ups", href: "/app/crm/follow-ups", icon: Calendar, group: "pipeline" },
  { id: "patients", label: "Patients", href: "/app/crm/patients", icon: FileText, group: "pipeline" },
  { id: "appointments", label: "Appointments", href: "/app/crm/appointments", icon: Calendar, group: "pipeline" },
  { id: "integrations", label: "Integrations", href: "/app/crm/integrations", icon: Plug, group: "ops", managerOnly: true },
  { id: "form-builder", label: "Lead form builder", href: "/app/crm/form-builder", icon: Clipboard, group: "ops", managerOnly: true },
  { id: "team", label: "Team & routing", href: "/app/crm/team", icon: Users, group: "ops", managerOnly: true },
  { id: "workflows", label: "Workflows", href: "/app/crm/workflows", icon: Workflow, group: "ops", managerOnly: true },
  { id: "commission", label: "Commission Slabs", href: "/app/crm/commission", icon: IndianRupee, group: "ops", managerOnly: true },
  { id: "analytics", label: "Team KPIs", href: "/app/crm/analytics", icon: BarChart3, group: "insights", managerOnly: true },
  { id: "finance", label: "Finance", href: "/app/crm/finance", icon: IndianRupee, group: "insights", managerOnly: true },
  { id: "audit", label: "Audit", href: "/app/crm/audit", icon: ClipboardList, group: "insights", managerOnly: true },
  { id: "settings", label: "Settings", href: "/app/crm/settings", icon: Settings, group: "insights" },
];

export const CRM_NAV_GROUPS = [
  { id: "workspace", label: "Workspace" },
  { id: "pipeline", label: "Pipeline" },
  { id: "ops", label: "Operations" },
  { id: "insights", label: "Insights" },
] as const;

export function getCrmNavItem(pathname: string) {
  return (
    CRM_NAV.find((n) => (n.href === "/app/crm" ? pathname === n.href : pathname.startsWith(n.href))) ??
    CRM_NAV[0]
  );
}
