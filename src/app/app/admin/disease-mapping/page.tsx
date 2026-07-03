"use client";

import { DiseaseMappingGraph } from "@/components/admin/disease-graph";
import { AdminLeafletMap, diseaseToMapPoints } from "@/components/admin/leaflet-map";
import { useAdminStore } from "@/components/admin/admin-store";
import { useSession } from "@/components/candela/session-provider";
import { isPataudiBranch } from "@/lib/auth-types";
import { GroupedBarChart, ChartCard } from "@/components/doctor/analytics-charts";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, Panel } from "@/components/frontdesk/ui";
import { SEED_SEASONAL_PATTERNS } from "@/design-system/admin-data";
import { cn } from "@/lib/utils";
import { AlertTriangle, Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const SEVERITY_DOT = {
  high: "bg-red-500",
  medium: "bg-orange-500",
  low: "bg-blue-500",
} as const;

export default function AdminDiseaseMappingPage() {
  const { session } = useSession();
  const pataudi = isPataudiBranch(session?.branchName);
  const { diseaseMap, diseaseClusters, settings, logAdminAction } = useAdminStore();
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [tab, setTab] = useState<"clusters" | "clinical">("clusters");

  useEffect(() => {
    if (!selectedId && diseaseClusters[0]?.id) setSelectedId(diseaseClusters[0].id);
  }, [diseaseClusters, selectedId]);

  const mapPoints = useMemo(() => diseaseToMapPoints(diseaseClusters), [diseaseClusters]);
  const selected = diseaseClusters.find((c) => c.id === selectedId);
  const highSurge = diseaseClusters.filter((c) => (c.surgePercent ?? 0) >= 40);

  const seasonalGroups = useMemo(
    () =>
      SEED_SEASONAL_PATTERNS.map((m) => ({
        label: m.month,
        values: [
          { key: "dengue", value: m.dengue, color: "#dc2626" },
          { key: "tb", value: m.tuberculosis, color: "#1b1b1b" },
          { key: "diabetes", value: m.diabetes, color: "#94a3b8" },
          { key: "hypertension", value: m.hypertension, color: "#f97316" },
        ],
      })),
    [],
  );

  return (
    <PageChrome
      breadcrumbs={[{ label: "Admin", href: "/app/admin" }, { label: "Disease mapping" }]}
      title="Disease cluster mapping"
      meta="Live geospatial prevalence · clinical care routing"
      actions={
        <AttioButton variant="secondary" onClick={() => logAdminAction("Exported disease cluster report")}>
          <Download className="size-3.5" />
          Export
        </AttioButton>
      }
      tabs={[
        { id: "clusters", label: "Cluster map" },
        { id: "clinical", label: "Clinical care mapping" },
      ]}
      activeTab={tab}
      onTabChange={(id) => setTab(id as "clusters" | "clinical")}
    >
      {tab === "clusters" ? (
        <>
          {settings.outbreakAlerts && highSurge.length > 0 && (
            <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600" />
              <div className="text-[13px] text-red-900">
                <p className="font-medium">Outbreak alert</p>
                <p className="mt-0.5 text-red-800">
                  {highSurge.map((c) => `${c.topDisease} surge in ${c.locality} (+${c.surgePercent}%)`).join(" · ")}
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <AdminLeafletMap points={mapPoints} selectedId={selectedId} flyToId={selectedId} />
            <Panel title="Select an area">
              {diseaseClusters.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-[var(--attio-text-tertiary)]">No clusters yet — data builds from live consultations</p>
              ) : (
                <ul className="divide-y divide-[var(--attio-border-subtle)]">
                  {diseaseClusters.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(c.id)}
                        className={cn(
                          "flex w-full items-center justify-between py-3 text-left text-[13px] transition-colors",
                          selectedId === c.id && "bg-[var(--attio-surface)]",
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <span className={cn("size-2 rounded-full", SEVERITY_DOT[c.severity])} />
                          <span className="font-medium">{c.locality}</span>
                        </span>
                        <span className="tabular-nums text-[var(--attio-text-secondary)]">{c.caseCount}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {selected && (
                <div className="mt-3 rounded-md border border-[var(--attio-border-subtle)] bg-[var(--attio-surface)] p-3 text-[12px]">
                  <p className="font-medium">{selected.locality}</p>
                  <p className="mt-1 text-[var(--attio-text-tertiary)]">Top disease: {selected.topDisease}</p>
                  {selected.surgePercent ? (
                    <p className="mt-1 text-red-600">+{selected.surgePercent}% vs baseline</p>
                  ) : null}
                </div>
              )}
            </Panel>
          </div>

          {!pataudi && (
            <ChartCard title="Seasonal disease pattern" subtitle="Reference baseline · anonymized aggregate" className="mt-4">
              <GroupedBarChart
                groups={seasonalGroups}
                legend={[
                  { key: "dengue", label: "Dengue", color: "#dc2626" },
                  { key: "tb", label: "Tuberculosis", color: "#1b1b1b" },
                  { key: "diabetes", label: "Diabetes", color: "#94a3b8" },
                  { key: "hypertension", label: "Hypertension", color: "#f97316" },
                ]}
              />
            </ChartCard>
          )}
        </>
      ) : (
        <>
          <DiseaseMappingGraph nodes={diseaseMap} />
          <Panel title="Mapping rules" className="mt-4">
            <p className="text-[13px] text-[var(--attio-text-secondary)]">
              ICD → template → package → consent → billing. Changes propagate to Doctor template suggestions, Counsellor package tiers, Nursing consent templates, and Front Desk billing quick templates.
            </p>
          </Panel>
        </>
      )}
    </PageChrome>
  );
}
