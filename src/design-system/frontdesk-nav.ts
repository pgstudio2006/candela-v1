import {
  BedDouble,
  Calendar,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  FileText,
  LayoutDashboard,
  ListOrdered,
  Monitor,
  Stethoscope,
  Siren,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";

export type FrontdeskNavItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  color: string;
  shortcut?: string;
};

export type FrontdeskListItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  color: string;
};

/** Attio-style colorful nav */
export const FRONTDESK_NAV: FrontdeskNavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/app/frontdesk", icon: LayoutDashboard, color: "#4F46E5" },
  { id: "registration", label: "Registration", href: "/app/frontdesk/registration", icon: UserPlus, color: "#2563EB" },
  { id: "patients", label: "Patients", href: "/app/frontdesk/patients", icon: Users, color: "#0EA5E9" },
  { id: "ipd", label: "IPD", href: "/app/frontdesk/ipd", icon: BedDouble, color: "#E11D48" },
  { id: "emergency", label: "Emergency", href: "/app/frontdesk/emergency", icon: Siren, color: "#DC2626" },
  { id: "check-in", label: "Check-in", href: "/app/frontdesk/check-in", icon: ClipboardCheck, color: "#14B8A6" },
  { id: "appointments", label: "Appointments", href: "/app/frontdesk/appointments", icon: Calendar, color: "#F59E0B" },
  { id: "queue", label: "Queue", href: "/app/frontdesk/queue", icon: ListOrdered, color: "#F97316" },
  { id: "display", label: "Display board", href: "/app/frontdesk/display", icon: Monitor, color: "#EC4899" },
  { id: "handover", label: "Shift handover", href: "/app/frontdesk/handover", icon: ClipboardList, color: "#64748B" },
  { id: "audit", label: "Audit log", href: "/app/frontdesk/audit", icon: FileText, color: "#475569" },
  { id: "billing", label: "Billing", href: "/app/frontdesk/billing", icon: CreditCard, color: "#22C55E" },
  { id: "junior-exam", label: "Junior exam", href: "/app/frontdesk/junior-exam", icon: Stethoscope, color: "#8B5CF6" },
];

export const FRONTDESK_LISTS: FrontdeskListItem[] = [
  { id: "all-patients", label: "All patients", href: "/app/frontdesk/patients", icon: Users, color: "#3B82F6" },
  { id: "emergency", label: "Emergency", href: "/app/frontdesk/emergency", icon: Siren, color: "#DC2626" },
  { id: "ipd", label: "IPD ward", href: "/app/frontdesk/ipd", icon: BedDouble, color: "#E11D48" },
  { id: "today-queue", label: "Today's queue", href: "/app/frontdesk/queue", icon: ListOrdered, color: "#F97316" },
  { id: "pending-billing", label: "Pending billing", href: "/app/frontdesk/billing", icon: CreditCard, color: "#10B981" },
  { id: "junior-intake", label: "Junior intake", href: "/app/frontdesk/junior-exam", icon: Stethoscope, color: "#A855F7" },
];

export const COPILOT_NAV = {
  id: "copilot",
  label: "Copilot",
  color: "#6366F1",
};

export function getFrontdeskNavItem(pathname: string) {
  return (
    FRONTDESK_NAV.find((n) =>
      n.href === "/app/frontdesk" ? pathname === n.href : pathname.startsWith(n.href),
    ) ?? FRONTDESK_NAV[0]
  );
}
