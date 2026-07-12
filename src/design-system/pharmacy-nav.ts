import {
  BarChart3,
  BedDouble,
  ClipboardList,
  FileText,
  FlaskConical,
  LayoutDashboard,
  Package,
  Pill,
  Receipt,
  RotateCcw,
  Settings,
  Shield,
  ShoppingCart,
  Truck,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

export type PharmacyNavItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  group: "workspace" | "operations" | "supply" | "compliance" | "insights";
  managerOnly?: boolean;
  purchaseOnly?: boolean;
};

export const PHARMACY_NAV: PharmacyNavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/app/pharmacy", icon: LayoutDashboard, group: "workspace" },
  { id: "new-order", label: "New order", href: "/app/pharmacy/patient-select", icon: ClipboardList, group: "operations" },
  { id: "prescriptions", label: "Prescriptions", href: "/app/pharmacy/prescriptions", icon: ClipboardList, group: "operations" },
  { id: "billing", label: "Billing", href: "/app/pharmacy/billing", icon: Receipt, group: "operations" },
  { id: "ipd", label: "IPD", href: "/app/pharmacy/ipd", icon: BedDouble, group: "operations" },
  { id: "indents", label: "Ward indents", href: "/app/pharmacy/indents", icon: FileText, group: "operations" },
  { id: "returns", label: "Returns", href: "/app/pharmacy/returns", icon: RotateCcw, group: "operations" },
  { id: "reports", label: "Reports", href: "/app/pharmacy/reports", icon: BarChart3, group: "insights" },
  { id: "settings", label: "Settings", href: "/app/pharmacy/settings", icon: Settings, group: "insights" },
];

export const PHARMACY_NAV_GROUPS = [
  { id: "workspace", label: "Workspace" },
  { id: "operations", label: "Operations" },
  { id: "supply", label: "Supply chain" },
  { id: "compliance", label: "Compliance" },
  { id: "insights", label: "Insights" },
] as const;

export function getPharmacyNavItem(pathname: string) {
  return (
    PHARMACY_NAV.find((n) => (n.href === "/app/pharmacy" ? pathname === n.href : pathname.startsWith(n.href))) ??
    PHARMACY_NAV[0]
  );
}

export function canAccessPharmacyNav(
  item: PharmacyNavItem,
  role: "manager" | "opd" | "purchase",
): boolean {
  if (role === "manager") return true;
  if (item.managerOnly) {
    if (item.purchaseOnly && role === "purchase") return true;
    return false;
  }
  if (role === "purchase") {
    const purchasePaths = ["dashboard", "inventory", "drugs", "suppliers", "purchase-orders", "expiry", "reports", "settings"];
    return purchasePaths.includes(item.id);
  }
  const opdPaths = ["dashboard", "new-order", "prescriptions", "billing", "ipd", "indents", "returns", "inventory", "expiry", "reports", "settings"];
  return opdPaths.includes(item.id);
}
