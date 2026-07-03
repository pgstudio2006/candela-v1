"use client";

import type { DepartmentHawkEye } from "@/design-system/admin-data";
import { StatusBadge } from "@/components/frontdesk/ui";
import { cn } from "@/lib/utils";
import Link from "next/link";

const MODULE_LINKS: Record<string, string> = {
  frontdesk: "/app/frontdesk",
  doctor: "/app/doctor",
  nurse: "/app/nurse",
};

export function HawkEyeGrid({ items }: { items: DepartmentHawkEye[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.moduleId} className="rounded-xl border border-[var(--attio-border)] bg-white p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[14px] font-semibold">{item.label}</p>
              <p className="text-[11px] text-[var(--attio-text-tertiary)]">Live module snapshot</p>
            </div>
            <StatusBadge
              label={item.status}
              variant={item.status === "healthy" ? "success" : item.status === "watch" ? "warning" : "danger"}
            />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-[var(--attio-surface)] p-2">
              <p className="text-[18px] font-semibold tabular-nums">{item.queue}</p>
              <p className="text-[10px] text-[var(--attio-text-tertiary)]">Queue</p>
            </div>
            <div className="rounded-lg bg-[var(--attio-surface)] p-2">
              <p className="text-[18px] font-semibold tabular-nums">{item.slaBreaches}</p>
              <p className="text-[10px] text-[var(--attio-text-tertiary)]">SLA breach</p>
            </div>
            <div className="rounded-lg bg-[var(--attio-surface)] p-2">
              <p className="text-[14px] font-semibold tabular-nums">₹{(item.revenueToday / 1000).toFixed(0)}K</p>
              <p className="text-[10px] text-[var(--attio-text-tertiary)]">Revenue</p>
            </div>
          </div>
          {item.blockers.length > 0 && (
            <ul className="mt-3 space-y-1">
              {item.blockers.map((b) => (
                <li key={b} className={cn("text-[12px] text-amber-800")}>• {b}</li>
              ))}
            </ul>
          )}
          <Link href={MODULE_LINKS[item.moduleId] ?? "#"} className="mt-3 inline-block text-[12px] font-medium text-[var(--attio-accent)] hover:underline">
            Open module →
          </Link>
        </div>
      ))}
    </div>
  );
}
