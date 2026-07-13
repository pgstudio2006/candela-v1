import type { Drug, PharmacyBill } from "@/design-system/pharmacy-data";
import type { OpdReceiptPayload } from "@/lib/opd-receipt";
import { parseBranchGstSettings } from "@/lib/gst-invoicing";
import { generateInvoicePdf } from "@/lib/invoice-pdf";

export function buildPharmacyReceipt(
  bill: PharmacyBill,
  drugs: Drug[],
  branchMeta?: unknown,
): OpdReceiptPayload {
  const gst = parseBranchGstSettings(branchMeta);
  const lines = bill.lines.map((line) => {
    const drug = drugs.find((d) => d.id === line.drugId);
    const lineTotal = line.qty * line.rate;
    return {
      label: drug?.brandName ? `${drug.brandName} (${drug.genericName})` : line.drugId,
      quantity: line.qty,
      lineTotal,
      rate: line.rate,
      taxableAmount: lineTotal,
      sacCode: drug?.hsn ?? "3004",
      gstRatePercent: line.gstPercent,
      cgst: (lineTotal * line.gstPercent) / 200,
      sgst: (lineTotal * line.gstPercent) / 200,
      igst: 0,
    };
  });

  const cgstTotal = lines.reduce((s, l) => s + l.cgst, 0);
  const sgstTotal = lines.reduce((s, l) => s + l.sgst, 0);
  const taxTotal = cgstTotal + sgstTotal;

  return {
    invoiceNumber: bill.id,
    issuedAt: bill.createdAt,
    patientName: bill.patientName,
    patientUhid: bill.uhid ?? "Walk-in",
    patientPhone: "—",
    patientCity: "—",
    patientDistrict: "—",
    appointmentCenter: "Pharmacy counter",
    doctorName: "Pharmacy counter",
    token: undefined,
    billingStatus: bill.paid ? "paid" : "pending",
    paymentMode: bill.paymentMode,
    paymentScope: "full",
    lines,
    subtotal: bill.subtotal,
    discount: bill.discount,
    total: bill.total,
    amountPaid: bill.paid ? bill.total : 0,
    balanceDue: bill.paid ? 0 : bill.total,
    gst,
    cgstTotal,
    sgstTotal,
    igstTotal: 0,
    taxTotal,
    placeOfSupply: gst.placeOfSupply,
    isTaxInvoice: true,
  };
}

export async function generatePharmacyInvoicePdf(
  bill: PharmacyBill,
  drugs: Drug[],
  branchMeta?: unknown,
): Promise<Uint8Array> {
  return generateInvoicePdf(buildPharmacyReceipt(bill, drugs, branchMeta));
}
