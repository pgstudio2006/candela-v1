import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { OpdReceiptPayload } from "@/lib/opd-receipt";

const TEMPLATE_URL = "/templates/ROSHNI BILL.pdf";
const PAGE = { width: 596, height: 842 } as const;
const INK = rgb(0.08, 0.08, 0.08);
const BORDER = rgb(0.5, 0.5, 0.5);
const WHITE = rgb(1, 1, 1);
const FONT = { body: 8, small: 7, header: 7, title: 10 } as const;
const COLUMNS = [15, 96, 194, 274, 318, 371, 474, 575] as const;

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

function drawInfo(page: PDFPage, receipt: OpdReceiptPayload, font: PDFFont, bold: PDFFont) {
  const left = 15;
  const right = 342;
  const rightValue = 410;
  const rows = [
    ["UHID No.", receipt.patientUhid, "Date", new Date(receipt.issuedAt).toLocaleString("en-IN")],
    ["Name", receipt.patientName, "Receipt No.", receipt.invoiceNumber],
    ["Age/Sex", "-", "Pay Mode", receipt.paymentMode.toUpperCase()],
    ["Mobile No.", receipt.patientPhone, "Token No.", valueOrDash(receipt.token)],
    ["Address", receipt.patientCity || "-", "Patient Type", "NEW PATIENT"],
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

function drawTable(page: PDFPage, receipt: OpdReceiptPayload, font: PDFFont, bold: PDFFont) {
  const left = COLUMNS[0];
  const right = COLUMNS[COLUMNS.length - 1];
  line(page, left, right, 648, 0.7);
  const headers = ["Sr No.", "Item Name", "Item Code", "Qty", "*", "Amount", "Discount", "Net Amount"];
  headers.forEach((header, index) => {
    if (index >= 6) drawRight(page, header, COLUMNS[index], 636, bold, FONT.header);
    else drawText(page, header, COLUMNS[index], 636, bold, FONT.header);
  });
  line(page, left, right, 629, 0.7);

  const rows = receipt.lines.slice(0, 12);
  let y = 615;
  rows.forEach((item, index) => {
    drawText(page, String(index + 1), COLUMNS[0], y, font, FONT.body);
    drawText(page, item.label, COLUMNS[1], y, font, FONT.body);
    drawText(page, valueOrDash(item.sacCode), COLUMNS[2], y, font, FONT.body);
    drawText(page, String(item.quantity), COLUMNS[3], y, font, FONT.body);
    drawText(page, "*", COLUMNS[4], y, font, FONT.body);
    drawRight(page, money(item.lineTotal), COLUMNS[6], y, font, FONT.body);
    drawRight(page, "0", COLUMNS[7] - 72, y, font, FONT.body);
    drawRight(page, money(item.lineTotal), COLUMNS[7], y, font, FONT.body);
    y -= 13;
  });

  if (rows.length === 0) drawText(page, "No services billed", COLUMNS[1], y, font, FONT.body);
  line(page, left, right, Math.max(y + 5, 490), 0.5);
}

function drawTotals(page: PDFPage, receipt: OpdReceiptPayload, font: PDFFont, bold: PDFFont) {
  const labelX = 372;
  const valueX = 575;
  const y = 476;
  drawRight(page, "Sub Amount", labelX + 80, y, bold, FONT.body);
  drawRight(page, money(receipt.subtotal), valueX, y, bold, FONT.body);
  drawRight(page, "Sub Discount", labelX + 80, y - 13, bold, FONT.body);
  drawRight(page, money(receipt.discount), valueX, y - 13, bold, FONT.body);
  drawRight(page, "Total Amount", labelX + 80, y - 26, bold, FONT.body);
  drawRight(page, money(receipt.total), valueX, y - 26, bold, FONT.body);
  drawRight(page, "Balance Amount", labelX + 80, y - 39, bold, FONT.body);
  drawRight(page, money(receipt.balanceDue), valueX, y - 39, bold, FONT.body);
  line(page, 15, 575, y - 35, 0.5);
  drawText(page, `Paid Amount - ${money(receipt.amountPaid)}`, 15, y - 57, bold, FONT.body);
  drawRight(page, "GLOBAL HOSPITAL & TRAUMA CENTRE", 575, y - 57, font, FONT.body);
  drawRight(page, "Authorised Signatory", 575, y - 75, font, FONT.body);
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

  page.drawRectangle({ x: 10, y: 430, width: PAGE.width - 10, height: 325, color: WHITE });
  drawText(page, "OPD RECEIPT", 267, 746, bold, FONT.title);
  line(page, 15, 575, 735, 0.8);
  drawInfo(page, receipt, font, bold);
  drawTable(page, receipt, font, bold);
  drawTotals(page, receipt, font, bold);

  return pdfDoc.save();
}
