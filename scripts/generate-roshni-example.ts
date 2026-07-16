import { generateRoshniInvoicePdf } from "@/lib/roshni-invoice-pdf";
import type { OpdReceiptPayload } from "@/lib/opd-receipt";
import fs from "fs";
import path from "path";

// Override fetch so the Pataudi template is loaded from the local public folder.
(globalThis as any).fetch = (url: string): Promise<any> => {
  if (typeof url !== "string" || !url.startsWith("/templates/")) {
    return Promise.reject(new Error(`Unsupported fetch URL in example generator: ${url}`));
  }
  const filePath = path.join(process.cwd(), "public", url);
  const buffer = fs.readFileSync(filePath);
  return Promise.resolve({
    ok: true,
    arrayBuffer: () => Promise.resolve(new Uint8Array(buffer).buffer),
  });
};

async function main() {
  const issuedAt = "2026-07-09T04:32:00.000Z";
  const receipt: OpdReceiptPayload = {
    branchId: "branch_pataudi",
    invoiceNumber: "OPD53706",
    issuedAt,
    patientName: "ROSHNI KUMARI",
    patientUhid: "GHTC014981",
    patientPhone: "6207625534",
    patientAddress: "BINOLA , MANESAR",
    patientAge: 30,
    patientGender: "Female",
    patientType: "NEW PATIENT",
    doctorName: "Dr. Anshuman MBBS , MD (Medicine)",
    token: 1,
    billingStatus: "paid",
    paymentMode: "cash",
    paymentScope: "full",
    lines: [
      {
        label: "OPD consultation & services",
        quantity: 1,
        lineTotal: 300,
        rate: 254.24,
        taxableAmount: 254.24,
        sacCode: "999312",
        gstRatePercent: 18,
        cgst: 22.88,
        sgst: 22.88,
        igst: 0,
      },
    ],
    subtotal: 254.24,
    discount: 0,
    total: 300,
    amountPaid: 300,
    balanceDue: 0,
    gst: {
      gstin: "06AABCN1234F1Z9",
      legalName: "Navayu Spine & Joint Care Pvt Ltd",
      address: "Sector 44, Gurgaon, Haryana 122003",
      placeOfSupply: "Haryana",
      sacCode: "999312",
      gstRatePercent: 18,
      taxMode: "cgst_sgst",
    },
    cgstTotal: 22.88,
    sgstTotal: 22.88,
    igstTotal: 0,
    taxTotal: 45.76,
    placeOfSupply: "Haryana",
    isTaxInvoice: true,
  };

  const bytes = await generateRoshniInvoicePdf(receipt);
  const outPath = path.join(process.cwd(), "example-roshni-invoice.pdf");
  fs.writeFileSync(outPath, Buffer.from(bytes));
  console.log(`Example PDF generated: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
