import type { GstInvoiceBreakdown, GstSettings } from "@/lib/gst-invoicing";

export type OpdReceiptLine = {
  label: string;
  quantity: number;
  lineTotal: number;
  /** Gross unit rate before discount (template RATE column). */
  rate?: number;
  taxableAmount?: number;
  sacCode?: string;
  gstRatePercent?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
};

export type OpdReceiptPayload = {
  branchId?: string;
  invoiceNumber: string;
  issuedAt: string;
  patientName: string;
  patientUhid: string;
  patientPhone: string;
  patientCity?: string;
  patientDistrict?: string;
  patientAddress?: string;
  patientAge?: number;
  patientGender?: string;
  patientType?: string;
  appointmentCenter?: string;
  doctorName: string;
  token?: number;
  billingStatus: string;
  paymentScope?: string;
  paymentMode: string;
  packageNotes?: string[];
  lines: OpdReceiptLine[];
  subtotal: number;
  discount: number;
  discountMode?: "amount" | "percent";
  discountPercent?: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
  routingNote?: string;
  gst: GstSettings;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  taxTotal: number;
  placeOfSupply: string;
  isTaxInvoice: boolean;
};

export function formatReceiptDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function formatInr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function receiptFromGstBreakdown(
  base: Omit<
    OpdReceiptPayload,
    "lines" | "subtotal" | "total" | "cgstTotal" | "sgstTotal" | "igstTotal" | "taxTotal" | "gst" | "placeOfSupply" | "isTaxInvoice"
  >,
  gstInvoice: GstInvoiceBreakdown,
): OpdReceiptPayload {
  return {
    ...base,
    gst: gstInvoice.settings,
    placeOfSupply: gstInvoice.settings.placeOfSupply,
    isTaxInvoice: true,
    lines: gstInvoice.lines.map((l) => ({
      label: l.label,
      quantity: l.quantity,
      lineTotal: l.lineTotal,
      rate: l.quantity > 0 ? l.taxableAmount / l.quantity : l.taxableAmount,
      taxableAmount: l.taxableAmount,
      sacCode: l.sacCode,
      gstRatePercent: l.gstRatePercent,
      cgst: l.cgst,
      sgst: l.sgst,
      igst: l.igst,
    })),
    subtotal: gstInvoice.taxableSubtotal,
    total: gstInvoice.grandTotal,
    cgstTotal: gstInvoice.cgstTotal,
    sgstTotal: gstInvoice.sgstTotal,
    igstTotal: gstInvoice.igstTotal,
    taxTotal: gstInvoice.taxTotal,
  };
}
