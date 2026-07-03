import {
  Activity,
  Bed,
  Building2,
  CalendarClock,
  ClipboardCheck,
  FileBarChart,
  FileText,
  Globe2,
  LayoutDashboard,
  Map,
  MessageCircle,
  Network,
  PieChart,
  Receipt,
  Settings,
  Shield,
  Sparkles,
  Stethoscope,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type AdminNavItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  group: "command" | "observe" | "control" | "optimize";
  configOnly?: boolean;
  financeOnly?: boolean;
};

export const ADMIN_NAV: AdminNavItem[] = [
  { id: "dashboard", label: "Command center", href: "/app/admin", icon: LayoutDashboard, group: "command" },
  { id: "hawk-eye", label: "Hawk-eye control", href: "/app/admin/hawk-eye", icon: Activity, group: "command" },
  { id: "audit", label: "Audit & compliance", href: "/app/admin/audit", icon: Shield, group: "observe" },
  { id: "geo", label: "Geo intelligence", href: "/app/admin/geo", icon: Globe2, group: "observe" },
  { id: "data-mining", label: "Data mining", href: "/app/admin/data-mining", icon: PieChart, group: "observe" },
  { id: "patients", label: "Patients", href: "/app/admin/patients", icon: UserRound, group: "observe" },
  { id: "slots", label: "Slot management", href: "/app/admin/slots", icon: CalendarClock, group: "control", configOnly: true },
  { id: "staff", label: "Staff & access", href: "/app/admin/staff", icon: Users, group: "control", configOnly: true },
  { id: "departments", label: "Departments", href: "/app/admin/departments", icon: Building2, group: "control", configOnly: true },
  { id: "disease-mapping", label: "Disease mapping", href: "/app/admin/disease-mapping", icon: Network, group: "control", configOnly: true },
  { id: "forms", label: "Form builder", href: "/app/admin/forms", icon: FileText, group: "control", configOnly: true },
  { id: "charges", label: "Service charges", href: "/app/admin/charges", icon: Receipt, group: "control", configOnly: true },
  { id: "packages", label: "Care packages", href: "/app/admin/packages", icon: Sparkles, group: "control", configOnly: true },
  { id: "whatsapp", label: "WhatsApp Templates", href: "/app/admin/whatsapp", icon: MessageCircle, group: "control", configOnly: true },
  { id: "referral-doctors", label: "Referral sources", href: "/app/admin/referral-doctors", icon: Stethoscope, group: "control", configOnly: true },
  { id: "ipd", label: "IPD wards", href: "/app/admin/ipd", icon: Bed, group: "control", configOnly: true },
  { id: "revenue-sharing", label: "Doctor revenue share", href: "/app/admin/revenue-sharing", icon: Wallet, group: "control", financeOnly: true },
  { id: "finance", label: "Finance & expenses", href: "/app/admin/finance", icon: Wallet, group: "optimize", financeOnly: true },
  { id: "rcm", label: "Revenue cycle AI", href: "/app/admin/rcm", icon: Sparkles, group: "optimize", financeOnly: true },
  { id: "mrd", label: "Medical records", href: "/app/admin/mrd", icon: ClipboardCheck, group: "optimize" },
  { id: "mis", label: "MIS reports", href: "/app/admin/mis", icon: FileBarChart, group: "optimize" },
  { id: "settings", label: "Settings", href: "/app/admin/settings", icon: Settings, group: "optimize", configOnly: true },
];

export function canAccessAdminNav(
  item: AdminNavItem,
  operator: { isViewer: boolean; canManageConfig: boolean; canManageFinance: boolean },
) {
  if (operator.isViewer && (item.configOnly || item.financeOnly)) return false;
  if (item.configOnly && !operator.canManageConfig) return false;
  if (item.financeOnly && !operator.canManageFinance) return false;
  return true;
}

export function getAdminNavItem(pathname: string) {
  return (
    ADMIN_NAV.find((n) => (n.href === "/app/admin" ? pathname === n.href : pathname.startsWith(n.href))) ??
    ADMIN_NAV[0]
  );
}

export const ADMIN_NAV_GROUPS = [
  { id: "command", label: "Command" },
  { id: "observe", label: "Observe" },
  { id: "control", label: "Control" },
  { id: "optimize", label: "Optimize" },
] as const;
