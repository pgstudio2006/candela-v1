"use client";

import { CandelaBrand, CandelaMark } from "@/components/candela/candela-mark";
import { CopilotMark } from "@/components/frontdesk/copilot-mark";
import { SectionLabel } from "@/components/frontdesk/page-chrome";
import { SidebarIcon } from "@/components/frontdesk/sidebar-icon";
import { NURSE_NAV } from "@/design-system/nurse-nav";
import { isPataudiBranch } from "@/lib/auth-types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { ChevronDown, LogOut, PanelLeft, Search, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const SIDEBAR_KEY = "candela-nurse-sidebar-collapsed";

type NurseSidebarProps = {
  branchName: string;
  userName: string;
  copilotOpen: boolean;
  onToggleCopilot: () => void;
  onOpenCommand: () => void;
  onSignOut: () => void;
};

export function NurseSidebar({
  branchName,
  userName,
  copilotOpen,
  onToggleCopilot,
  onOpenCommand,
  onSignOut,
}: NurseSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const navItems = NURSE_NAV.filter((item) => item.id !== "pharmacy" || !isPataudiBranch(branchName));

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_KEY);
    if (stored === "1") setCollapsed(true);
  }, []);

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-r border-[var(--attio-border)] bg-[var(--attio-sidebar)] transition-[width] duration-200",
        collapsed ? "w-[52px]" : "w-[var(--attio-sidebar-width)]",
      )}
    >
      <div className={cn("shrink-0 border-b border-[var(--attio-border-subtle)]", collapsed ? "px-1.5 py-2" : "px-2 py-2")}>
        <div className={cn("flex items-center", collapsed ? "flex-col gap-2" : "justify-between gap-1")}>
          {collapsed ? (
            <CandelaMark size={22} />
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-1 hover:bg-[var(--attio-hover)]">
                <CandelaBrand showName iconSize={22} />
                <ChevronDown className="size-3.5 shrink-0 text-[var(--attio-text-tertiary)]" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuItem className="font-medium">Candela</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>{branchName}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <button
            type="button"
            onClick={() => {
              setCollapsed((c) => {
                localStorage.setItem(SIDEBAR_KEY, !c ? "1" : "0");
                return !c;
              });
            }}
            className="flex size-7 items-center justify-center rounded-md text-[var(--attio-text-tertiary)] hover:bg-[var(--attio-hover)]"
          >
            <PanelLeft className="size-4" strokeWidth={1.75} />
          </button>
        </div>
        {!collapsed && (
          <button
            type="button"
            onClick={onOpenCommand}
            className="mt-2 flex w-full items-center gap-2 rounded-lg border border-[var(--attio-border)] bg-white px-2.5 py-2 text-[12px] text-[var(--attio-text-tertiary)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
          >
            <Search className="size-3.5" />
            <span className="flex-1 text-left">Quick actions</span>
            <kbd className="rounded border px-1 font-mono text-[10px]">⌘K</kbd>
          </button>
        )}
      </div>
      <ScrollArea className="min-h-0 flex-1 px-2 py-2">
        {!collapsed && <SectionLabel>Workspace</SectionLabel>}
        <nav className={cn("space-y-0.5", !collapsed && "mb-3")}>
          {navItems.map((item) => {
            const active =
              item.href === "/app/nurse" ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.id}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center rounded-md py-1.5 text-[13px]",
                  collapsed ? "justify-center" : "gap-2.5 px-2",
                  active
                    ? "bg-[var(--attio-active)] font-medium"
                    : "text-[var(--attio-text-secondary)] hover:bg-[var(--attio-hover)]",
                )}
              >
                <SidebarIcon icon={item.icon} active={active} />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>
        <nav className="mb-3 space-y-0.5">
          <button
            type="button"
            onClick={onToggleCopilot}
            className={cn(
              "flex w-full items-center rounded-md py-1.5 text-[13px]",
              collapsed ? "justify-center" : "gap-2.5 px-2",
              copilotOpen
                ? "bg-[var(--attio-active)] font-medium"
                : "text-[var(--attio-text-secondary)] hover:bg-[var(--attio-hover)]",
            )}
          >
            <CopilotMark size={15} active={copilotOpen} />
            {!collapsed && <span>Copilot</span>}
          </button>
        </nav>
      </ScrollArea>
      <div className="shrink-0 border-t border-[var(--attio-border)] p-2">
        <div className={cn("flex items-center gap-2 px-1 py-1", collapsed && "flex-col")}>
          <div className="flex size-7 items-center justify-center rounded-full bg-[var(--attio-active)] text-[11px] font-semibold">
            {userName.charAt(0)}
          </div>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium">{userName}</p>
                <p className="truncate text-[10px] text-[var(--attio-text-tertiary)]">Nursing</p>
              </div>
              <Link
                href="/app/nurse/settings"
                className="rounded p-1 text-[var(--attio-text-tertiary)] hover:bg-[var(--attio-hover)]"
              >
                <Settings className="size-3.5" />
              </Link>
              <button
                type="button"
                onClick={onSignOut}
                className="rounded p-1 text-[var(--attio-text-tertiary)] hover:bg-[var(--attio-hover)]"
              >
                <LogOut className="size-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
