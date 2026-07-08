"use client";

import { usePharmacyStore } from "@/components/pharmacy/pharmacy-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { MetricStrip, Panel, StatusBadge } from "@/components/frontdesk/ui";
import { RX_STATUS_LABELS } from "@/design-system/pharmacy-data";
import { daysToExpiry } from "@/lib/pharmacy-platform";
import Link from "next/link";

export default function PharmacyDashboardPage() {
  const { getKpis, getActivePrescriptions, stock, drugs, activities, purchaseOrders, getDrug } = usePharmacyStore();
  const kpis = getKpis();
  const urgent = getActivePrescriptions().slice(0, 6);
  const alerts = stock
    .filter((s) => {
      const d = daysToExpiry(s.expiry);
      const drug = getDrug(s.drugId);
      const low = s.qtyOnHand <= (drug?.reorderLevel ?? 0);
      const out = s.qtyOnHand === 0;
      return (d >= 0 && d <= 30) || low || out;
    })
    .slice(0, 6);

  return (
    <PageChrome
      breadcrumbs={[{ label: "Pharmacy", href: "/app/pharmacy" }]}
      title="Pharmacy command center"
      meta="Prescriptions · inventory · procurement · compliance — live store"
      actions={
        <Link href="/app/pharmacy/prescriptions" className="inline-flex h-8 items-center rounded-md bg-[var(--attio-text)] px-3 text-[12px] font-medium text-white">
          Open Rx queue
        </Link>
      }
    >
      <MetricStrip metrics={kpis} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Prescription queue" action={<Link href="/app/pharmacy/prescriptions" className="text-[11px] text-[var(--attio-accent)]">View all →</Link>}>
          <ul className="divide-y divide-[var(--attio-border-subtle)]">
            {urgent.length === 0 && <li className="py-4 text-[13px] text-[var(--attio-text-tertiary)]">Queue clear</li>}
            {urgent.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2.5 text-[13px]">
                <div>
                  <p className="font-medium">{r.patientName}</p>
                  <p className="text-[11px] text-[var(--attio-text-tertiary)]">{r.doctorName} · {r.priority}</p>
                </div>
                <StatusBadge label={RX_STATUS_LABELS[r.status]} variant="info" />
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Stock alerts" action={<Link href="/app/pharmacy/inventory" className="text-[11px] text-[var(--attio-accent)]">Inventory →</Link>}>
          <ul className="divide-y divide-[var(--attio-border-subtle)]">
            {alerts.map((s) => {
              const drug = getDrug(s.drugId);
              const d = daysToExpiry(s.expiry);
              const low = s.qtyOnHand <= (drug?.reorderLevel ?? 0);
              const out = s.qtyOnHand === 0;
              return (
                <li key={s.id} className="py-2 text-[12px]">
                  <p className="font-medium">{drug?.brandName}</p>
                  <p className="text-[var(--attio-text-tertiary)]">
                    Batch {s.batchNo} · {s.qtyOnHand} units
                    {d <= 30 ? ` · expires in ${d}d` : ""}
                    {out ? " · OUT OF STOCK" : ""}
                    {low && !out ? " · low stock" : ""}
                  </p>
                </li>
              );
            })}
            {alerts.length === 0 && <li className="py-4 text-[13px] text-[var(--attio-text-tertiary)]">No stock alerts</li>}
          </ul>
        </Panel>
      </div>
      <Panel title="Activity" className="mt-4">
        <ul className="divide-y divide-[var(--attio-border-subtle)]">
          {activities.slice(0, 8).map((a) => (
            <li key={a.id} className="py-2 text-[12px]">
              <p>{a.summary}</p>
              <p className="text-[var(--attio-text-tertiary)]">{new Date(a.at).toLocaleString("en-IN")}</p>
            </li>
          ))}
          {activities.length === 0 && <li className="py-4 text-[13px] text-[var(--attio-text-tertiary)]">Activity appears on verify, dispense, PO receive</li>}
        </ul>
      </Panel>
      <Panel title="Open purchase orders" className="mt-4">
        <ul className="text-[13px]">
          {purchaseOrders.filter((p) => !["received", "cancelled"].includes(p.status)).map((p) => (
            <li key={p.id} className="flex justify-between border-b py-2">
              <span>{p.id}</span>
              <StatusBadge label={p.status} variant="neutral" />
            </li>
          ))}
          {purchaseOrders.filter((p) => !["received", "cancelled"].includes(p.status)).length === 0 && (
            <li className="py-4 text-[13px] text-[var(--attio-text-tertiary)]">No open purchase orders</li>
          )}
        </ul>
      </Panel>
    </PageChrome>
  );
}
