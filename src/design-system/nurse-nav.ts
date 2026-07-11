import {
  Activity,
  FileCheck,
  FileText,
  LayoutDashboard,
  ListOrdered,
  ScrollText,
  Settings,
  SlidersHorizontal,
  StickyNote,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NurseNavItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
};

export const NURSE_NAV: NurseNavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/app/nurse", icon: LayoutDashboard },
  { id: "queue", label: "Execution queue", href: "/app/nurse/queue", icon: ListOrdered },
  { id: "patients", label: "My patients", href: "/app/nurse/patients", icon: Users },
  { id: "tasks", label: "Doctor tasks", href: "/app/nurse/tasks", icon: StickyNote },
  { id: "scores", label: "Scores", href: "/app/nurse/scores", icon: SlidersHorizontal },
  { id: "discharge", label: "Discharge summary", href: "/app/nurse/discharge", icon: FileText },
  { id: "consent", label: "Consent registry", href: "/app/nurse/consent", icon: FileCheck },
  { id: "analytics", label: "Analytics", href: "/app/nurse/analytics", icon: Activity },
  { id: "audit", label: "Audit log", href: "/app/nurse/audit", icon: ScrollText },
  { id: "settings", label: "Settings", href: "/app/nurse/settings", icon: Settings },
];

export function getNurseNavItem(pathname: string) {
  return (
    NURSE_NAV.find((n) =>
      n.href === "/app/nurse" ? pathname === n.href : pathname.startsWith(n.href),
    ) ?? NURSE_NAV[0]
  );
}
