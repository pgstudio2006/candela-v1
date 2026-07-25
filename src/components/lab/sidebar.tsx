"use client";

import { useSession } from "@/components/candela/session-provider";
import { CandelaBrand, CandelaMark } from "@/components/candela/candela-mark";
import { SectionLabel } from "@/components/frontdesk/page-chrome";
import { SidebarIcon } from "@/components/frontdesk/sidebar-icon";
import { LAB_NAV, LAB_NAV_GROUPS, getLabNavItem } from "@/design-system/lab-nav";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { ArrowLeft, LogOut, PanelLeft, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type Props = {
  branchName: string;
  userName: string;
  onSignOut: () => void;
};

export function LabSidebar({ branchName, userName, onSignOut }: Props) {
  const pathname = usePathname();
  const { session } = useSession();
  const isAdmin = session?.role === "admin";
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("candela-lab-sidebar") === "1") setCollapsed(true);
  }, []);

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
                localStorage.setItem("candela-lab-sidebar", !c ? "1" : "0");
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
        {!collapsed && (
          <div className="mt-2 text-[11px] text-[var(--attio-text-tertiary)]">
            {branchName} · {userName}
          </div>
        )}
      </div>
      <ScrollArea className="flex-1 px-2 py-2">
        {LAB_NAV_GROUPS.map((g) => {
          const items = LAB_NAV.filter((n) => n.group === g.id);
          if (!items.length) return null;
          return (
            <div key={g.id} className="mb-3">
              {!collapsed && <SectionLabel>{g.label}</SectionLabel>}
              <div className="space-y-0.5">
                {items.map((item) => {
                  const active = getLabNavItem(pathname).id === item.id;
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] font-medium transition-colors",
                        active
                          ? "bg-[var(--attio-active)] text-[var(--attio-text)]"
                          : "text-[var(--attio-text-secondary)] hover:bg-[var(--attio-hover)]",
                        collapsed && "justify-center px-2",
                      )}
                    >
                      <SidebarIcon icon={item.icon} active={active} />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </ScrollArea>
      <div className="border-t border-[var(--attio-border-subtle)] p-2">
        <button
          type="button"
          onClick={onSignOut}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] font-medium text-[var(--attio-text-secondary)] hover:bg-[var(--attio-hover)]",
            collapsed && "justify-center px-2",
          )}
        >
          <LogOut className="size-4" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}
