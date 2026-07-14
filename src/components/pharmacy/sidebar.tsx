"use client";

import { usePharmacyStore } from "@/components/pharmacy/pharmacy-store";
import { useSession } from "@/components/candela/session-provider";
import { CandelaBrand, CandelaMark } from "@/components/candela/candela-mark";
import { CopilotMark } from "@/components/frontdesk/copilot-mark";
import { SectionLabel } from "@/components/frontdesk/page-chrome";
import { SidebarIcon } from "@/components/frontdesk/sidebar-icon";
import { PHARMACY_NAV, PHARMACY_NAV_GROUPS, canAccessPharmacyNav } from "@/design-system/pharmacy-nav";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { ArrowLeft, LogOut, PanelLeft, Search, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type Props = {
  branchName: string;
  userName: string;
  copilotOpen: boolean;
  onToggleCopilot: () => void;
  onOpenCommand: () => void;
  onSignOut: () => void;
};

export function PharmacySidebar({ branchName, userName, copilotOpen, onToggleCopilot, onOpenCommand, onSignOut }: Props) {
  const pathname = usePathname();
  const { session } = useSession();
  const { getStaffRole, getOperator } = usePharmacyStore();
  const role = getStaffRole();
  const [collapsed, setCollapsed] = useState(false);
  const isAdmin = session?.role === "admin";

  useEffect(() => {
    if (localStorage.getItem("candela-pharmacy-sidebar") === "1") setCollapsed(true);
  }, []);

  const navItems = PHARMACY_NAV.filter((n) => canAccessPharmacyNav(n, role));
  const operator = getOperator();

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-[var(--attio-border)] bg-[var(--attio-sidebar)] transition-[width]",
        collapsed ? "w-[52px]" : "w-[var(--attio-sidebar-width)]",
      )}
    >
      <div className={cn("border-b border-[var(--attio-border-subtle)] p-2", collapsed ? "px-1.5" : "")}>
        <div className={cn("flex items-center", collapsed ? "flex-col gap-2" : "justify-between")}>
          {collapsed ? <CandelaMark size={22} /> : <CandelaBrand showName iconSize={22} />}
          <button
            type="button"
            className="flex size-7 items-center justify-center rounded-md hover:bg-[var(--attio-hover)]"
            onClick={() =>
              setCollapsed((c) => {
                localStorage.setItem("candela-pharmacy-sidebar", !c ? "1" : "0");
                return !c;
              })
            }
          >
            <PanelLeft className="size-4" />
          </button>
        </div>
        {isAdmin && !collapsed && (
          <Link
            href="/app/admin"
            className="mt-2 flex items-center gap-2 rounded-lg bg-[var(--attio-active)] px-2.5 py-2 text-[12px] font-medium text-[var(--attio-text)] hover:bg-[var(--attio-hover)]"
          >
            <ArrowLeft className="size-3.5" />
            Back to Admin
          </Link>
        )}
        {isAdmin && collapsed && (
          <Link
            href="/app/admin"
            title="Back to Admin"
            className="mt-2 flex items-center justify-center rounded-lg bg-[var(--attio-active)] p-2 hover:bg-[var(--attio-hover)]"
          >
            <ArrowLeft className="size-4" />
          </Link>
        )}
        {!collapsed && (
          <button
            type="button"
            onClick={onOpenCommand}
            className="mt-2 flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-[12px] text-[var(--attio-text-tertiary)]"
          >
            <Search className="size-3.5" />
            <span className="flex-1 text-left">Search pharmacy</span>
            <kbd className="text-[10px]">⌘K</kbd>
          </button>
        )}
      </div>
      <ScrollArea className="flex-1 px-2 py-2">
        {PHARMACY_NAV_GROUPS.map((g) => {
          const items = navItems.filter((n) => n.group === g.id);
          if (!items.length) return null;
          return (
            <div key={g.id} className="mb-3">
              {!collapsed && <SectionLabel>{g.label}</SectionLabel>}
              <nav className="space-y-0.5">
                {items.map((item) => {
                  const active = item.href === "/app/pharmacy" ? pathname === item.href : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "flex items-center rounded-md py-1.5 text-[13px]",
                        collapsed ? "justify-center" : "gap-2.5 px-2",
                        active ? "bg-[var(--attio-active)] font-medium" : "text-[var(--attio-text-secondary)] hover:bg-[var(--attio-hover)]",
                      )}
                    >
                      <SidebarIcon icon={item.icon} active={active} />
                      {!collapsed && item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          );
        })}
        <button
          type="button"
          onClick={onToggleCopilot}
          className={cn(
            "flex w-full items-center rounded-md py-1.5 text-[13px]",
            collapsed ? "justify-center" : "gap-2.5 px-2",
            copilotOpen ? "bg-[var(--attio-active)]" : "hover:bg-[var(--attio-hover)]",
          )}
        >
          <CopilotMark size={15} active={copilotOpen} />
          {!collapsed && "Copilot"}
        </button>
      </ScrollArea>
      <div className="border-t p-2">
        <div className={cn("flex items-center gap-2 px-1", collapsed && "flex-col")}>
          <div className="flex size-7 items-center justify-center rounded-full bg-[var(--attio-active)] text-[11px] font-semibold">
            {(operator?.name ?? userName).charAt(0)}
          </div>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium">{operator?.name ?? userName}</p>
                <p className="truncate text-[10px] capitalize text-[var(--attio-text-tertiary)]">{role} · {branchName}</p>
              </div>
              <Link href="/app/pharmacy/settings" className="rounded p-1 hover:bg-[var(--attio-hover)]">
                <Settings className="size-3.5" />
              </Link>
              <button type="button" onClick={onSignOut} className="rounded p-1 hover:bg-[var(--attio-hover)]">
                <LogOut className="size-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
