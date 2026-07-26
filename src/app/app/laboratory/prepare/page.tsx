"use client";

import { useLabStore } from "@/components/lab/lab-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { DataTable, StatusBadge } from "@/components/frontdesk/ui";
import { LAB_ORDER_STATUS_LABELS } from "@/design-system/lab-data";
import Link from "next/link";
import { useMemo } from "react";

export default function LabPrepareListPage() {
  const { orders } = useLabStore();

  const columns = [
    { key: "patient", label: "Patient" },
    { key: "tests", label: "Tests" },
    { key: "status", label: "Status" },
    { key: "orderedAt", label: "Ordered" },
    { key: "actions", label: "" },
  ];

  const rows = useMemo(
    () =>
      orders.map((o) => ({
        patient: (
          <div>
            <p className="font-medium">{o.patientName ?? "Unknown"}</p>
            <p className="text-[11px] text-[var(--attio-text-tertiary)]">{o.patientUhid}</p>
          </div>
        ),
        tests: (
          <div className="text-[12px]">{o.items.map((i) => i.label).join(", ")}</div>
        ),
        status: (
          <StatusBadge
            label={LAB_ORDER_STATUS_LABELS[o.status]}
            variant={
              o.status === "completed"
                ? "success"
                : o.status === "cancelled"
                  ? "danger"
                  : "info"
            }
          />
        ),
        orderedAt: <span className="text-[12px]">{new Date(o.orderedAt).toLocaleString()}</span>,
        actions: (
          <div className="flex items-center justify-end gap-2">
            <Link
              href={`/app/laboratory/prepare/${o.id}`}
              className="rounded-md bg-[var(--attio-text)] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[#333]"
            >
              {o.status === "completed" || o.status === "cancelled" ? "View" : "Prepare"}
            </Link>
          </div>
        ),
      })),
    [orders],
  );

  return (
    <PageChrome
      breadcrumbs={[
        { label: "Laboratory", href: "/app/laboratory" },
        { label: "Prepare report" },
      ]}
      title="Prepare reports"
      meta="Enter lab results and mark orders complete"
    >
      <DataTable columns={columns} rows={rows} />
    </PageChrome>
  );
}
