"use client";

import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton } from "@/components/frontdesk/ui";
import { usePharmacyStore } from "@/components/pharmacy/pharmacy-store";
import Link from "next/link";

export default function AdminPharmacyPage() {
  const { ready, error, refresh } = usePharmacyStore();

  const cards = [
    { label: "Stock inventory", href: "/app/pharmacy/inventory", desc: "View live batches, expiry, low stock and quarantine." },
    { label: "Drugs & formulary", href: "/app/pharmacy/drugs", desc: "Add/edit medicines, schedules, reorder levels and GST." },
    { label: "Suppliers & catalogue", href: "/app/pharmacy/suppliers", desc: "Manage suppliers and their item catalogues." },
    { label: "Purchase orders", href: "/app/pharmacy/purchase-orders", desc: "Create POs, receive stock and pay bills." },
  ];

  return (
    <PageChrome
      breadcrumbs={[{ label: "Admin", href: "/app/admin" }, { label: "Pharmacy inventory" }]}
      title="Pharmacy inventory"
      meta="Admin-only management of drugs, stock, suppliers and purchase orders"
    >
      {!ready ? (
        <p className="text-[13px] text-[var(--attio-text-tertiary)]">Loading pharmacy workspace…</p>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-[13px] text-red-700">Could not load pharmacy workspace: {error}</p>
          <AttioButton variant="secondary" className="mt-3" onClick={() => void refresh()}>
            Retry
          </AttioButton>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="rounded-xl border border-[var(--attio-border)] bg-[var(--attio-surface)] p-4 transition hover:border-[var(--attio-text)]"
            >
              <p className="text-[14px] font-medium">{c.label}</p>
              <p className="mt-1 text-[12px] text-[var(--attio-text-tertiary)]">{c.desc}</p>
            </Link>
          ))}
        </div>
      )}
    </PageChrome>
  );
}
