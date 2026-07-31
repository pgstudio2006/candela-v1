"use client";

import { useEffect, useState, useCallback } from "react";
import { listPatientLabOrdersAction, generateLabReportPdfAction } from "@/app/actions/lab-actions";
import { useToast } from "@/components/ui/toast-provider";
import { Panel, StatusBadge, AttioButton } from "@/components/frontdesk/ui";
import { FileText, Download, Printer, FlaskConical } from "lucide-react";
import type { LabOrder, LabOrderStatus } from "@/design-system/lab-data";
import { LAB_ORDER_STATUS_LABELS } from "@/design-system/lab-data";

const STATUS_VARIANT: Record<LabOrderStatus, "info" | "warning" | "success" | "danger"> = {
  pending_billing: "warning",
  ordered: "info",
  sample_collected: "info",
  in_progress: "info",
  completed: "success",
  cancelled: "danger",
};

function formatDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
    });
  } catch {
    return iso;
  }
}

export function PatientLabReportsPanel({ patientId }: { patientId: string }) {
  const { toast } = useToast();
  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    const res = await listPatientLabOrdersAction(patientId);
    if (res.ok) {
      setOrders(res.data);
    } else {
      toast(res.error ?? "Failed to load lab reports", "error");
    }
    setLoading(false);
  }, [patientId, toast]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const handleDownload = async (orderId: string) => {
    setGeneratingId(orderId);
    try {
      const res = await generateLabReportPdfAction(orderId);
      if (res.ok && res.data?.dataUrl) {
        const link = document.createElement("a");
        link.href = res.data.dataUrl;
        link.download = `lab-report-${orderId}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else if (!res.ok) {
        toast(res.error ?? "Failed to generate PDF", "error");
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to generate PDF", "error");
    }
    setGeneratingId(null);
  };

  const handlePrint = async (orderId: string) => {
    setGeneratingId(orderId);
    try {
      const res = await generateLabReportPdfAction(orderId);
      if (res.ok && res.data?.dataUrl) {
        const win = window.open(res.data.dataUrl, "_blank");
        if (win) {
          win.onload = () => win.print();
        }
      } else if (!res.ok) {
        toast(res.error ?? "Failed to generate PDF", "error");
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to generate PDF", "error");
    }
    setGeneratingId(null);
  };

  const completedOrders = orders.filter((o) => o.status === "completed");
  const inProgressOrders = orders.filter((o) => ["ordered", "sample_collected", "in_progress"].includes(o.status));
  const cancelledOrders = orders.filter((o) => o.status === "cancelled");

  return (
    <Panel title="Lab reports">
      {loading ? (
        <p className="py-6 text-center text-[13px] text-[var(--attio-text-tertiary)]">Loading lab reports…</p>
      ) : orders.length === 0 ? (
        <div className="py-8 text-center">
          <FlaskConical className="mx-auto mb-2 size-8 text-[var(--attio-text-tertiary)]" />
          <p className="text-[13px] text-[var(--attio-text-tertiary)]">No lab reports found for this patient.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {completedOrders.length > 0 && (
            <div>
              <p className="mb-2 text-[12px] font-medium text-[var(--attio-text-secondary)]">Completed reports</p>
              <ul className="divide-y divide-[var(--attio-border-subtle)]">
                {completedOrders.map((order) => (
                  <LabReportRow
                    key={order.id}
                    order={order}
                    generatingId={generatingId}
                    onDownload={() => void handleDownload(order.id)}
                    onPrint={() => void handlePrint(order.id)}
                  />
                ))}
              </ul>
            </div>
          )}

          {inProgressOrders.length > 0 && (
            <div>
              <p className="mb-2 text-[12px] font-medium text-[var(--attio-text-secondary)]">In progress</p>
              <ul className="divide-y divide-[var(--attio-border-subtle)]">
                {inProgressOrders.map((order) => (
                  <LabReportRow
                    key={order.id}
                    order={order}
                    generatingId={generatingId}
                    onDownload={() => void handleDownload(order.id)}
                    onPrint={() => void handlePrint(order.id)}
                  />
                ))}
              </ul>
            </div>
          )}

          {cancelledOrders.length > 0 && (
            <div>
              <p className="mb-2 text-[12px] font-medium text-[var(--attio-text-secondary)]">Cancelled</p>
              <ul className="divide-y divide-[var(--attio-border-subtle)]">
                {cancelledOrders.map((order) => (
                  <LabReportRow
                    key={order.id}
                    order={order}
                    generatingId={generatingId}
                    onDownload={() => void handleDownload(order.id)}
                    onPrint={() => void handlePrint(order.id)}
                  />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function LabReportRow({
  order,
  generatingId,
  onDownload,
  onPrint,
}: {
  order: LabOrder;
  generatingId: string | null;
  onDownload: () => void;
  onPrint: () => void;
}) {
  const canGenerate = order.status === "completed" || order.items.some((i) => i.results.length > 0);
  const isGenerating = generatingId === order.id;

  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <FileText className="size-3.5 shrink-0 text-[var(--attio-text-tertiary)]" />
            <p className="truncate text-[13px] font-medium">
              {order.items.map((i) => i.label || i.reportCatalog?.name).join(", ") || "Lab order"}
            </p>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--attio-text-tertiary)]">
            <span>Ordered: {formatDate(order.orderedAt)}</span>
            {order.completedAt && <span>· Completed: {formatDate(order.completedAt)}</span>}
            <span>· Source: {order.source}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <StatusBadge
              label={LAB_ORDER_STATUS_LABELS[order.status]}
              variant={STATUS_VARIANT[order.status]}
            />
            {order.items.map((item) => (
              <span
                key={item.id}
                className="rounded bg-[var(--attio-surface)] px-1.5 py-0.5 text-[10px] text-[var(--attio-text-secondary)]"
              >
                {item.label || item.reportCatalog?.name}
              </span>
            ))}
          </div>
        </div>
        {canGenerate && (
          <div className="flex shrink-0 gap-1.5">
            <AttioButton
              variant="secondary"
              className="!h-7 !px-2 !text-[11px] gap-1"
              onClick={onDownload}
              disabled={isGenerating}
            >
              <Download className="size-3" />
              {isGenerating ? "Generating…" : "Download"}
            </AttioButton>
            <AttioButton
              variant="secondary"
              className="!h-7 !px-2 !text-[11px] gap-1"
              onClick={onPrint}
              disabled={isGenerating}
            >
              <Printer className="size-3" />
              Print
            </AttioButton>
          </div>
        )}
      </div>
    </li>
  );
}
