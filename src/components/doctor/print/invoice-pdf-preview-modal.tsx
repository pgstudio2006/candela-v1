"use client";

import { AttioButton } from "@/components/frontdesk/ui";
import type { OpdReceiptPayload } from "@/lib/opd-receipt";
import { downloadPdfBytes, generateInvoicePdf, printPdfBytes } from "@/lib/invoice-pdf";
import { Download, Loader2, Printer, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type InvoicePdfPreviewModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  receipt: OpdReceiptPayload | null;
  loading?: boolean;
  error?: string;
  blockPrint?: boolean;
  blockPrintMessage?: string;
};

export function InvoicePdfPreviewModal({
  open,
  onClose,
  title = "Invoice",
  receipt,
  loading = false,
  error = "",
  blockPrint = false,
  blockPrintMessage = "Invoice available after full payment is received.",
}: InvoicePdfPreviewModalProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !receipt) {
      setPdfUrl(null);
      setPdfBytes(null);
      setGenError("");
      return;
    }

    let cancelled = false;
    setGenerating(true);
    setGenError("");

    void generateInvoicePdf(receipt)
      .then((bytes) => {
        if (cancelled) return;
        setPdfBytes(bytes);
        const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
        setPdfUrl(URL.createObjectURL(blob));
      })
      .catch(() => {
        if (!cancelled) setGenError("Could not prepare invoice PDF.");
      })
      .finally(() => {
        if (!cancelled) setGenerating(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, receipt]);

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  if (!open) return null;

  const busy = loading || generating;
  const displayError = error || genError;
  const printDisabled = blockPrint || !pdfBytes || busy;

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-start justify-center overflow-y-auto bg-black/30 p-4 pt-8 backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="mb-8 w-full max-w-[210mm] overflow-hidden rounded-xl border border-[var(--attio-border)] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between border-b border-[var(--attio-border-subtle)] px-4 py-3">
          <h2 className="text-[14px] font-semibold">{title}</h2>
          <div className="flex gap-2">
            <AttioButton
              variant="primary"
              className="gap-1.5"
              disabled={printDisabled}
              onClick={() => {
                if (pdfBytes) printPdfBytes(pdfBytes, title);
              }}
            >
              <Printer className="size-3.5" />
              Print
            </AttioButton>
            <AttioButton
              variant="secondary"
              className="gap-1.5"
              disabled={printDisabled}
              onClick={() => {
                if (pdfBytes && receipt) {
                  downloadPdfBytes(pdfBytes, `${receipt.invoiceNumber}.pdf`);
                }
              }}
            >
              <Download className="size-3.5" />
              Download
            </AttioButton>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-[var(--attio-text-tertiary)] hover:bg-[var(--attio-hover)]"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="max-h-[75vh] overflow-y-auto bg-[#f5f5f4] p-4">
          {busy && (
            <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-[var(--attio-text-tertiary)]">
              <Loader2 className="size-4 animate-spin" />
              Preparing invoice…
            </div>
          )}
          {displayError && !busy && (
            <p className="py-16 text-center text-[13px] text-red-600">{displayError}</p>
          )}
          {blockPrint && !busy && !displayError && (
            <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
              {blockPrintMessage}
            </div>
          )}
          {pdfUrl && !busy && !displayError && (
            <iframe
              src={pdfUrl}
              title={title}
              className="mx-auto block min-h-[297mm] w-full max-w-[210mm] rounded-sm bg-white shadow-sm"
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
