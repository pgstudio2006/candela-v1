"use client";

import { InvoicePdfPreviewModal } from "@/components/doctor/print/invoice-pdf-preview-modal";
import { usePharmacyStore } from "@/components/pharmacy/pharmacy-store";
import type { PharmacyBill } from "@/design-system/pharmacy-data";
import { buildPharmacyReceipt } from "@/lib/pharmacy-invoice-pdf";
import type { OpdReceiptPayload } from "@/lib/opd-receipt";
import { useEffect, useState } from "react";

type PharmacyInvoiceModalProps = {
  open: boolean;
  bill: PharmacyBill | null;
  onClose: () => void;
};

export function PharmacyInvoiceModal({ open, bill, onClose }: PharmacyInvoiceModalProps) {
  const { drugs } = usePharmacyStore();
  const [receipt, setReceipt] = useState<OpdReceiptPayload | null>(null);

  useEffect(() => {
    if (!open || !bill) {
      setReceipt(null);
      return;
    }
    setReceipt(buildPharmacyReceipt(bill, drugs));
  }, [open, bill, drugs]);

  const hasBalance = Boolean(receipt && receipt.balanceDue > 0);

  return (
    <InvoicePdfPreviewModal
      open={open}
      onClose={onClose}
      title="Pharmacy invoice"
      receipt={receipt}
      loading={open && !receipt}
      blockPrint={hasBalance}
      blockPrintMessage="Invoice is available only after the full amount is collected. Clear the balance before printing."
    />
  );
}
