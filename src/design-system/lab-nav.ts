import {
  Beaker,
  ClipboardList,
  FileText,
  FlaskConical,
  LayoutDashboard,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type LabNavItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  group: "workspace" | "operations" | "catalog";
  managerOnly?: boolean;
};

export const LAB_NAV: LabNavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/app/laboratory", icon: LayoutDashboard, group: "workspace" },
  { id: "orders", label: "Orders", href: "/app/laboratory/orders", icon: ClipboardList, group: "operations" },
  { id: "prepare", label: "Prepare report", href: "/app/laboratory/prepare", icon: FileText, group: "operations" },
  { id: "fields", label: "Fields master", href: "/app/laboratory/fields", icon: FlaskConical, group: "catalog" },
  { id: "reports", label: "Report catalog", href: "/app/laboratory/reports", icon: Beaker, group: "catalog" },
  { id: "settings", label: "Settings", href: "/app/laboratory/settings", icon: Settings, group: "catalog" },
];

export const LAB_NAV_GROUPS = [
  { id: "workspace", label: "Workspace" },
  { id: "operations", label: "Operations" },
  { id: "catalog", label: "Catalog" },
] as const;

export function getLabNavItem(pathname: string) {
  return (
    LAB_NAV.find((n) => (n.href === "/app/laboratory" ? pathname === n.href : pathname.startsWith(n.href))) ??
    LAB_NAV[0]
  );
}
