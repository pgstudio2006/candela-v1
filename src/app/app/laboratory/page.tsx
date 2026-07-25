"use client";

import { PageChrome } from "@/components/frontdesk/page-chrome";
import { MetricStrip, Panel, StatusBadge } from "@/components/frontdesk/ui";
import { useLabStore } from "@/components/lab/lab-store";
import { LAB_ORDER_STATUS_LABELS } from "@/design-system/lab-data";
import Link from "next/link";

export default function LaboratoryDashboardPage() {
  const { fieldMasters, reportCatalogs, orders } = useLabStore();

  const pendingOrders = orders.filter((o) => o.status === "ordered" || o.status === "sample_collected" || o.status === "in_progress");
  const completedToday = orders.filter((o) => o.status === "completed" && new Date(o.completedAt ?? 0).toDateString() === new Date().toDateString());

  const metrics = [
    { label: "Active orders", value: String(pendingOrders.length), delta: `${orders.length} total`, trend: "neutral" as const },
    { label: "Completed today", value: String(completedToday.length), delta: "today", trend: "up" as const },
    { label: "Field masters", value: String(fieldMasters.length), delta: "parameters", trend: "neutral" as const },
    { label: "Report catalogs", value: String(reportCatalogs.length), delta: "profiles", trend: "neutral" as const },
  ];

  return (
    <PageChrome
      breadcrumbs={[{ label: "Laboratory", href: "/app/laboratory" }]}
      title="Laboratory dashboard"
      meta="Orders · sample collection · report preparation · catalog"
      actions={
        <div className="flex items-center gap-2">
          <Link
            href="/app/laboratory/orders"
            className="inline-flex h-8 items-center rounded-md border px-3 text-[12px] font-medium hover:bg-[var(--attio-hover)]"
          >
            Open orders
          </Link>
          <Link
            href="/app/laboratory/fields"
            className="inline-flex h-8 items-center rounded-md bg-[var(--attio-text)] px-3 text-[12px] font-medium text-white"
          >
            Fields master
          </Link>
        </div>
      }
    >
      <MetricStrip metrics={metrics} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Pending orders" action={<Link href="/app/laboratory/orders" className="text-[11px] text-[var(--attio-accent)]">View all →</Link>}>
          <ul className="divide-y divide-[var(--attio-border-subtle)]">
            {pendingOrders.length === 0 && (
              <li className="py-4 text-[13px] text-[var(--attio-text-tertiary)]">No active orders</li>
            )}
            {pendingOrders.slice(0, 8).map((o) => (
              <li key={o.id} className="flex items-center justify-between py-2.5 text-[13px]">
                <div>
                  <p className="font-medium">{o.patientName ?? "Unknown"}</p>
                  <p className="text-[11px] text-[var(--attio-text-tertiary)]">
                    {o.patientUhid} · {o.items.length} test{o.items.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <StatusBadge label={LAB_ORDER_STATUS_LABELS[o.status]} variant="info" />
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Catalog" action={<Link href="/app/laboratory/reports" className="text-[11px] text-[var(--attio-accent)]">Manage →</Link>}>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <span className="text-[13px]">Field masters</span>
              <span className="text-[15px] font-semibold">{fieldMasters.length}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <span className="text-[13px]">Report catalogs</span>
              <span className="text-[15px] font-semibold">{reportCatalogs.length}</span>
            </div>
          </div>
        </Panel>
      </div>
    </PageChrome>
  );
}
