"use client";

import { InvoicePdfPreviewModal } from "@/components/doctor/print/invoice-pdf-preview-modal";
import { getVisitReceiptAction } from "@/app/actions/clinical-actions";
import type { OpdReceiptPayload } from "@/lib/opd-receipt";
import { useEffect, useState } from "react";

type BillingReceiptModalProps = {
  open: boolean;
  visitId: string | null;
  onClose: () => void;
};

export function BillingReceiptModal({
  open,
  visitId,
  onClose,
}: BillingReceiptModalProps) {
  const [receipt, setReceipt] = useState<OpdReceiptPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !visitId) {
      setReceipt(null);
      setError("");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    void getVisitReceiptAction(visitId)
      .then((data) => {
        if (cancelled) return;
        if ("error" in data) {
          console.error("[BillingReceiptModal] server error:", data.error);
          setError(data.error ?? "Could not load receipt.");
          setReceipt(null);
        } else {
          setReceipt(data.receipt);
        }
      })
      .catch((err) => {
        console.error("[BillingReceiptModal] action failed:", err);
        if (!cancelled) setError("Could not load receipt.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, visitId]);

  return (
    <InvoicePdfPreviewModal
      open={open}
      onClose={onClose}
      title="Tax invoice"
      receipt={receipt}
      loading={loading}
      error={error}
    />
  );
}
