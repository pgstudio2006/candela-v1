"use client";

import {
  generateLabReportPdfAction,
  generatePatientLabReportPdfAction,
  markLabOrderCompleteAction,
  sendLabReportOnWhatsAppAction,
} from "@/app/actions/lab-actions";
import { AttioButton } from "@/components/frontdesk/ui";
import type { LabOrderStatus } from "@/design-system/lab-data";
import { cn } from "@/lib/utils";
import { Check, FileText, MessageCircle, Printer } from "lucide-react";
import { useState } from "react";

type LabReportActionsProps = {
  orderId: string;
  patientId: string;
  patientPhone?: string | null;
  status?: LabOrderStatus;
  onOrderUpdate?: () => void;
  variant?: "compact" | "default";
};

export function LabReportActions({
  orderId,
  patientId,
  patientPhone,
  status,
  onOrderUpdate,
  variant = "default",
}: LabReportActionsProps) {
  const finished = status === "completed" || status === "cancelled";
  const [pdfLoading, setPdfLoading] = useState(false);
  const [allLoading, setAllLoading] = useState(false);
  const [whatsappLoading, setWhatsappLoading] = useState(false);
  const [completeLoading, setCompleteLoading] = useState(false);

  const openPdf = (dataUrl: string, title = "Lab report") => {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html>
        <head><title>${title}</title></head>
        <body style="margin:0;height:100vh">
          <iframe src="${dataUrl}" width="100%" height="100%" style="border:0"></iframe>
        </body>
      </html>
    `);
    win.document.close();
  };

  const handlePreview = async () => {
    setPdfLoading(true);
    try {
      const res = await generateLabReportPdfAction(orderId);
      if (!res.ok) throw new Error(res.error);
      if (!res.data) throw new Error("Failed to generate report");
      openPdf(res.data.dataUrl, "Lab report preview");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setPdfLoading(false);
    }
  };

  const handlePrintAll = async () => {
    setAllLoading(true);
    try {
      const res = await generatePatientLabReportPdfAction(patientId);
      if (!res.ok) throw new Error(res.error);
      if (!res.data) throw new Error("Failed to generate combined report");
      openPdf(res.data.dataUrl, "Combined lab reports");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setAllLoading(false);
    }
  };

  const handleWhatsApp = async () => {
    setWhatsappLoading(true);
    try {
      const res = await sendLabReportOnWhatsAppAction(orderId, patientPhone ?? undefined);
      if (!res.ok) throw new Error(res.error);
      if (!res.data) throw new Error("Failed to send");
      alert(res.data.ok ? `WhatsApp sent · ${res.data.detail ?? ""}` : `Failed: ${res.data.detail ?? ""}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setWhatsappLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!confirm("Mark this order complete? A PDF will be generated and pushed to the patient profile.")) return;
    setCompleteLoading(true);
    try {
      const res = await markLabOrderCompleteAction(orderId);
      if (!res.ok) throw new Error(res.error);
      onOrderUpdate?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setCompleteLoading(false);
    }
  };

  const baseClass = variant === "compact" ? "!h-7 !text-[11px] gap-1" : "gap-1.5";

  return (
    <div className={cn("flex flex-wrap items-center gap-2", variant === "compact" && "justify-end")}>
      <AttioButton variant="secondary" className={baseClass} onClick={() => void handlePreview()} disabled={pdfLoading}>
        <FileText className="size-3.5" />
        {pdfLoading ? "Generating..." : "Preview report"}
      </AttioButton>
      <AttioButton variant="secondary" className={baseClass} onClick={() => void handlePrintAll()} disabled={allLoading}>
        <Printer className="size-3.5" />
        {allLoading ? "Generating..." : "Print all"}
      </AttioButton>
      <AttioButton variant="secondary" className={baseClass} onClick={() => void handleWhatsApp()} disabled={whatsappLoading}>
        <MessageCircle className="size-3.5" />
        {whatsappLoading ? "Sending..." : "WhatsApp"}
      </AttioButton>
      {!finished && (
        <AttioButton className={baseClass} onClick={() => void handleComplete()} disabled={completeLoading}>
          <Check className="size-3.5" />
          {completeLoading ? "Completing..." : "Complete"}
        </AttioButton>
      )}
    </div>
  );
}
