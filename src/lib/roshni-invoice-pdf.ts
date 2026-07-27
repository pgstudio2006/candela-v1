import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { OpdReceiptPayload } from "@/lib/opd-receipt";

const TEMPLATE_URL = "/templates/ROSHNI BILL.pdf";
const PAGE = { width: 596, height: 842 } as const;
const INK = rgb(0.08, 0.08, 0.08);
const BORDER = rgb(0.5, 0.5, 0.5);
const WHITE = rgb(1, 1, 1);
const FONT = { body: 8, small: 7, header: 7, title: 10 } as const;
const COLUMNS = [15, 96, 274, 318, 371, 474, 575] as const;

function safe(text: string): string {
  return String(text)
    .replace(/₹/g, "Rs.")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\t\n\r\u0020-\u00FF]/g, "");
}

function money(amount: number): string {
  return amount.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function drawText(page: PDFPage, text: string, x: number, y: number, font: PDFFont, size: number = FONT.body) {
  page.drawText(safe(text), { x, y, size, font, color: INK });
}

function drawRight(page: PDFPage, text: string, right: number, y: number, font: PDFFont, size: number = FONT.body) {
  const value = safe(text);
  page.drawText(value, { x: right - font.widthOfTextAtSize(value, size), y, size, font, color: INK });
}

function line(page: PDFPage, x1: number, x2: number, y: number, thickness = 0.5) {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color: BORDER });
}

function valueOrDash(value: string | number | undefined | null): string {
  return value == null || String(value).trim() === "" ? "-" : String(value);
}

function formatRoshniDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  const hours = d.getHours();
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  const ampm = hours >= 12 ? "PM" : "AM";
  const hours12 = pad(hours % 12 || 12);
  return `${day}-${month}-${year} ${hours12}:${minutes}:${seconds} ${ampm}`;
}

function genderLabel(gender?: string): string {
  const map: Record<string, string> = {
    M: "Male",
    F: "Female",
    O: "Other",
    male: "Male",
    female: "Female",
    other: "Other",
    prefer_not: "Other",
  };
  return gender ? map[gender] ?? gender : "-";
}

function ageSexText(receipt: OpdReceiptPayload): string {
  const agePart = receipt.patientAge ? `${receipt.patientAge}Yrs.-` : "-";
  const sexPart = genderLabel(receipt.patientGender);
  return `${agePart} / ${sexPart}`;
}

function drawInfo(page: PDFPage, receipt: OpdReceiptPayload, font: PDFFont, bold: PDFFont) {
  const left = 15;
  const right = 342;
  const rightValue = 410;
  const rows = [
    ["UHID No.", receipt.patientUhid, "Date", formatRoshniDateTime(receipt.issuedAt)],
    ["Name", receipt.patientName, "Receipt No.", receipt.invoiceNumber],
    ["Age/Sex", ageSexText(receipt), "Pay Mode", receipt.paymentMode.toUpperCase()],
    ["Mobile No.", receipt.patientPhone, "Token No.", valueOrDash(receipt.token)],
    ["Address", receipt.patientAddress || receipt.patientCity || "-", "Patient Type", receipt.patientType || "NEW PATIENT"],
    ["Doctor", receipt.doctorName, "", ""],
  ] as const;

  let y = 719;
  for (const [label, value, rightLabel, rightValueText] of rows) {
    drawText(page, `${label} :`, left, y, bold, FONT.body);
    drawText(page, valueOrDash(value), 102, y, font, FONT.body);
    if (rightLabel) {
      drawText(page, `${rightLabel} :`, right, y, bold, FONT.body);
      drawText(page, valueOrDash(rightValueText), rightValue, y, font, FONT.body);
    }
    y -= 13;
  }
}

function drawTable(page: PDFPage, receipt: OpdReceiptPayload, font: PDFFont, bold: PDFFont): number {
  const left = COLUMNS[0];
  const right = COLUMNS[COLUMNS.length - 1];
  line(page, left, right, 648, 0.7);
  const headers = ["Sr No.", "Item Name", "Qty", "*", "Amount", "Discount", "Net Amount"];
  headers.forEach((header, index) => {
    if (index >= 5) drawRight(page, header, COLUMNS[index], 636, bold, FONT.header);
    else drawText(page, header, COLUMNS[index], 636, bold, FONT.header);
  });
  line(page, left, right, 629, 0.7);

  const rows = receipt.lines.slice(0, 12);
  let y = 615;
  rows.forEach((item, index) => {
    const lineTax = (item.cgst ?? 0) + (item.sgst ?? 0) + (item.igst ?? 0);
    const taxable = Math.max(0, item.lineTotal - lineTax);
    const gross = item.taxableAmount ?? taxable;
    const lineDiscount = Math.max(0, gross - taxable);
    drawText(page, String(index + 1), COLUMNS[0], y, font, FONT.body);
    drawText(page, item.label, COLUMNS[1], y, font, FONT.body);
    drawText(page, String(item.quantity), COLUMNS[2], y, font, FONT.body);
    drawText(page, "*", COLUMNS[3], y, font, FONT.body);
    drawRight(page, money(taxable), COLUMNS[4] + 25, y, font, FONT.body);
    drawRight(page, money(lineDiscount), COLUMNS[5], y, font, FONT.body);
    drawRight(page, money(item.lineTotal), COLUMNS[6], y, font, FONT.body);
    y -= 13;
  });

  if (rows.length === 0) drawText(page, "No services billed", COLUMNS[1], y, font, FONT.body);
  const tableBottom = Math.max(y + 5, 490);
  line(page, left, right, tableBottom, 0.5);
  return tableBottom;
}

function drawTotals(page: PDFPage, receipt: OpdReceiptPayload, font: PDFFont, bold: PDFFont, tableBottom: number): number {
  const labelX = 372;
  const valueX = 575;
  let y = tableBottom - 40;
  drawRight(page, "Subtotal", labelX + 80, y, bold, FONT.body);
  drawRight(page, money(receipt.subtotal), valueX, y, bold, FONT.body);
  y -= 13;
  if (receipt.discount > 0) {
    drawRight(page, "Discount", labelX + 80, y, bold, FONT.body);
    drawRight(page, money(receipt.discount), valueX, y, bold, FONT.body);
    y -= 13;
  }
  if (receipt.cgstTotal > 0) {
    drawRight(page, "CGST", labelX + 80, y, bold, FONT.body);
    drawRight(page, money(receipt.cgstTotal), valueX, y, bold, FONT.body);
    y -= 13;
  }
  if (receipt.sgstTotal > 0) {
    drawRight(page, "SGST", labelX + 80, y, bold, FONT.body);
    drawRight(page, money(receipt.sgstTotal), valueX, y, bold, FONT.body);
    y -= 13;
  }
  if (receipt.igstTotal > 0) {
    drawRight(page, "IGST", labelX + 80, y, bold, FONT.body);
    drawRight(page, money(receipt.igstTotal), valueX, y, bold, FONT.body);
    y -= 13;
  }
  drawRight(page, "Grand total", labelX + 80, y, bold, FONT.body);
  drawRight(page, money(receipt.total), valueX, y, bold, FONT.body);
  y -= 13;
  drawRight(page, "Collected", labelX + 80, y, bold, FONT.body);
  drawRight(page, money(receipt.amountPaid), valueX, y, bold, FONT.body);
  y -= 13;
  if (receipt.balanceDue > 0) {
    drawRight(page, "Balance due", labelX + 80, y, bold, FONT.body);
    drawRight(page, money(receipt.balanceDue), valueX, y, bold, FONT.body);
    y -= 13;
  }
  if (receipt.advanceUsed && receipt.advanceUsed > 0) {
    drawRight(page, "Advance used", labelX + 80, y, bold, FONT.body);
    drawRight(page, money(receipt.advanceUsed), valueX, y, font, FONT.body);
    y -= 13;
  }
  if (receipt.refundAmount && receipt.refundAmount > 0) {
    drawRight(page, "Refund due", labelX + 80, y, bold, FONT.body);
    drawRight(page, money(receipt.refundAmount), valueX, y, bold, FONT.body);
    y -= 13;
  }
  if (receipt.paymentBreakdown && receipt.paymentBreakdown.length > 0) {
    for (const split of receipt.paymentBreakdown) {
      drawRight(page, `Payment - ${split.mode.toUpperCase()}`, labelX + 80, y, bold, FONT.body);
      drawRight(page, money(split.amount), valueX, y, font, FONT.body);
      y -= 13;
    }
  } else if (receipt.paymentMode) {
    drawRight(page, "Payment mode", labelX + 80, y, bold, FONT.body);
    drawRight(page, receipt.paymentMode.toUpperCase(), valueX, y, font, FONT.body);
    y -= 13;
  }
  line(page, 15, 575, y, 0.5);
  y -= 13;
  drawRight(page, "GLOBAL HOSPITAL & TRAUMA CENTRE", 575, y, font, FONT.body);
  y -= 18;
  drawRight(page, "Authorised Signatory", 575, y, font, FONT.body);
  return y - 10;
}

function drawNotes(page: PDFPage, receipt: OpdReceiptPayload, font: PDFFont, startY: number) {
  const packagesWithNotes = (receipt.packageLines ?? []).filter(
    (p) => p.description && p.description.trim(),
  );
  if (packagesWithNotes.length === 0) return;

  let y = startY;
  drawText(page, "Package notes:", 15, y, font, FONT.body);
  y -= 13;
  for (const pkg of packagesWithNotes) {
    const text = `${pkg.label}: ${pkg.description}`;
    const safeText = safe(text);
    const maxWidth = 560 - 15;
    const words = safeText.split(" ");
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, FONT.body) > maxWidth) {
        drawText(page, line, 25, y, font, FONT.body);
        y -= 12;
        line = word;
      } else {
        line = test;
      }
    }
    if (line) {
      drawText(page, line, 25, y, font, FONT.body);
      y -= 12;
    }
  }
}

export async function generateRoshniInvoicePdf(receipt: OpdReceiptPayload): Promise<Uint8Array> {
  const templateBytes = await fetch(TEMPLATE_URL).then((res) => {
    if (!res.ok) throw new Error("Roshni bill template PDF not found.");
    return res.arrayBuffer();
  });
  const pdfDoc = await PDFDocument.load(templateBytes);
  const page = pdfDoc.getPages()[0];
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  page.drawRectangle({ x: 10, y: 380, width: PAGE.width - 10, height: 375, color: WHITE });
  drawText(page, "OPD RECEIPT", 267, 746, bold, FONT.title);
  line(page, 15, 575, 735, 0.8);
  drawInfo(page, receipt, font, bold);
  const tableBottom = drawTable(page, receipt, font, bold);
  const totalsBottom = drawTotals(page, receipt, font, bold, tableBottom);
  drawNotes(page, receipt, font, totalsBottom);

  return pdfDoc.save();
}
