"use client";

import { HawkEyeGrid } from "@/components/admin/hawk-eye-panel";
import { useAdminStore } from "@/components/admin/admin-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { MetricStrip, Panel, StatusBadge } from "@/components/frontdesk/ui";
import Link from "next/link";

export default function AdminDashboardPage() {
  const { getCommandKpis, getHawkEye, getLeakageFlags, getAuditLog } = useAdminStore();
  const kpis = getCommandKpis();
  const hawk = getHawkEye();
  const leaks = getLeakageFlags().slice(0, 4);
  const audit = getAuditLog().slice(0, 6);

  return (
    <PageChrome
      breadcrumbs={[{ label: "Admin", href: "/app/admin" }, { label: "Command center" }]}
      title="Admin command center"
      meta="Cross-module KPIs · hawk-eye · RCM alerts · audit stream"
    >
      <MetricStrip metrics={kpis} />
      <Panel title="Document templates" className="mb-6" action={<Link href="/app/admin/templates" className="text-[11px] text-[var(--attio-accent)]">Open Template Studio →</Link>}>
        <p className="text-[13px] text-[var(--attio-text-secondary)]">Create fresh branch templates, set print margins, upload backgrounds, and position patient fields visually.</p>
      </Panel>
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold">Department hawk-eye</h2>
          <Link href="/app/admin/hawk-eye" className="text-[12px] font-medium text-[var(--attio-accent)] hover:underline">Full control panel →</Link>
        </div>
        <HawkEyeGrid items={hawk} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Revenue leakage flags" action={<Link href="/app/admin/rcm" className="text-[11px] text-[var(--attio-accent)]">RCM →</Link>}>
          <ul className="space-y-2">
            {leaks.length === 0 && <li className="text-[13px] text-[var(--attio-text-tertiary)]">No active flags</li>}
            {leaks.map((l) => (
              <li key={l.id} className="rounded-lg border border-[var(--attio-border-subtle)] p-3">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-medium">{l.patientName}</p>
                  <StatusBadge label={l.priority} variant={l.priority === "high" ? "danger" : "warning"} />
                </div>
                <p className="mt-1 text-[12px] text-[var(--attio-text-secondary)]">{l.suggestion}</p>
                {l.amount > 0 && <p className="mt-1 text-[12px] font-semibold tabular-nums text-amber-700">₹{l.amount.toLocaleString("en-IN")}</p>}
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Live audit stream" action={<Link href="/app/admin/audit" className="text-[11px] text-[var(--attio-accent)]">Full log →</Link>}>
          <ul className="divide-y divide-[var(--attio-border-subtle)]">
            {audit.map((e) => (
              <li key={e.id} className="py-2.5 text-[12px]">
                <p className="font-medium">{e.summary}</p>
                <p className="text-[var(--attio-text-tertiary)]">{e.module} · {e.actor} · {new Date(e.at).toLocaleString("en-IN")}</p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </PageChrome>
  );
}
