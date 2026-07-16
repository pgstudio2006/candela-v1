import { PDFDocument, PDFPage, PDFFont, StandardFonts, rgb } from "pdf-lib";
import type { OpdReceiptPayload } from "@/lib/opd-receipt";

const COLORS = {
  ink: rgb(0.12, 0.12, 0.14),
  border: rgb(0.72, 0.72, 0.76),
  headerFill: rgb(0.95, 0.96, 0.98),
  white: rgb(1, 1, 1),
};

const PAGE = { width: 595, height: 842, margin: 40 };
const FONT_SIZES = { title: 16, section: 11, body: 9, small: 8 };

function pdfSafeText(text: string): string {
  return String(text)
    .replace(/₹/g, "Rs.")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00B7/g, "|")
    .replace(/\u2026/g, "...")
    .replace(/[^\t\n\r\u0020-\u00FF]/g, "");
}

function formatInr(amount: number): string {
  return `Rs.${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateTime(iso: string): string {
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

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color = COLORS.ink,
) {
  page.drawText(pdfSafeText(text), { x, y, size, font, color });
}

function drawRightText(
  page: PDFPage,
  text: string,
  rightX: number,
  y: number,
  font: PDFFont,
  size: number,
  color = COLORS.ink,
) {
  const width = font.widthOfTextAtSize(pdfSafeText(text), size);
  page.drawText(pdfSafeText(text), { x: rightX - width, y, size, font, color });
}

function drawHLine(page: PDFPage, x1: number, x2: number, y: number) {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.6, color: COLORS.border });
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = pdfSafeText(text).split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

export async function generatePatientInvoiceSummaryPdf(receipts: OpdReceiptPayload[]): Promise<Uint8Array> {
  if (receipts.length === 0) throw new Error("No invoices to summarize.");

  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([PAGE.width, PAGE.height]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const first = receipts[0];
  let y = PAGE.height - PAGE.margin;

  // Title
  drawText(page, "Patient Invoice Summary", PAGE.margin, y, bold, FONT_SIZES.title);
  y -= 20;

  // Generated timestamp
  drawText(
    page,
    `Generated: ${formatDateTime(new Date().toISOString())}`,
    PAGE.margin,
    y,
    font,
    FONT_SIZES.small,
  );
  y -= 22;

  // Patient info box
  const infoBoxTop = y;
  page.drawRectangle({
    x: PAGE.margin,
    y: y - 50,
    width: PAGE.width - PAGE.margin * 2,
    height: 50,
    borderWidth: 0.6,
    borderColor: COLORS.border,
    color: COLORS.white,
  });
  drawText(page, `Patient: ${first.patientName}`, PAGE.margin + 8, y - 18, bold, FONT_SIZES.body);
  drawText(page, `UHID: ${first.patientUhid}`, PAGE.margin + 8, y - 34, font, FONT_SIZES.body);
  drawText(
    page,
    `Phone: ${first.patientPhone}`,
    PAGE.margin + 8 + 220,
    y - 34,
    font,
    FONT_SIZES.body,
  );
  y -= 62;

  // Table header
  const colX = {
    date: PAGE.margin,
    invoice: PAGE.margin + 70,
    services: PAGE.margin + 170,
    total: PAGE.width - PAGE.margin - 150,
    paid: PAGE.width - PAGE.margin - 90,
    balance: PAGE.width - PAGE.margin - 30,
  };
  const rowHeight = 14;

  page.drawRectangle({
    x: PAGE.margin,
    y: y - rowHeight,
    width: PAGE.width - PAGE.margin * 2,
    height: rowHeight,
    color: COLORS.headerFill,
  });
  drawText(page, "Date", colX.date + 4, y - 10, bold, FONT_SIZES.body);
  drawText(page, "Invoice #", colX.invoice + 4, y - 10, bold, FONT_SIZES.body);
  drawText(page, "Services", colX.services + 4, y - 10, bold, FONT_SIZES.body);
  drawRightText(page, "Total", colX.total + 40, y - 10, bold, FONT_SIZES.body);
  drawRightText(page, "Paid", colX.paid + 40, y - 10, bold, FONT_SIZES.body);
  drawRightText(page, "Balance", colX.balance + 40, y - 10, bold, FONT_SIZES.body);
  y -= rowHeight;
  drawHLine(page, PAGE.margin, PAGE.width - PAGE.margin, y);

  let totalBilled = 0;
  let totalPaid = 0;
  let totalBalance = 0;

  const sorted = [...receipts].sort(
    (a, b) => new Date(a.issuedAt).getTime() - new Date(b.issuedAt).getTime(),
  );

  for (const receipt of sorted) {
    totalBilled += receipt.total;
    totalPaid += receipt.amountPaid;
    totalBalance += receipt.balanceDue;

    const serviceLabels = receipt.lines.map((l) => l.label).join(" · ");
    const serviceLines = wrapText(serviceLabels, font, FONT_SIZES.body, colX.total - colX.services - 12);
    const rowLines = Math.max(1, serviceLines.length);
    const rowH = rowLines * 12 + 4;

    if (y - rowH < PAGE.margin + 80) {
      // Add a new page if running out of space
      page.drawText(pdfSafeText("Continued..."), {
        x: PAGE.margin,
        y: PAGE.margin,
        font,
        size: FONT_SIZES.small,
      });
      const newPage = pdfDoc.addPage([PAGE.width, PAGE.height]);
      page = newPage;
      y = PAGE.height - PAGE.margin;
      page.drawRectangle({
        x: PAGE.margin,
        y: y - rowHeight,
        width: PAGE.width - PAGE.margin * 2,
        height: rowHeight,
        color: COLORS.headerFill,
      });
      drawText(page, "Date", colX.date + 4, y - 10, bold, FONT_SIZES.body);
      drawText(page, "Invoice #", colX.invoice + 4, y - 10, bold, FONT_SIZES.body);
      drawText(page, "Services", colX.services + 4, y - 10, bold, FONT_SIZES.body);
      drawRightText(page, "Total", colX.total + 40, y - 10, bold, FONT_SIZES.body);
      drawRightText(page, "Paid", colX.paid + 40, y - 10, bold, FONT_SIZES.body);
      drawRightText(page, "Balance", colX.balance + 40, y - 10, bold, FONT_SIZES.body);
      y -= rowHeight;
    }

    drawText(page, formatDate(receipt.issuedAt), colX.date + 4, y - 10, font, FONT_SIZES.body);
    drawText(page, receipt.invoiceNumber, colX.invoice + 4, y - 10, font, FONT_SIZES.body);
    serviceLines.forEach((line, i) => {
      drawText(page, line, colX.services + 4, y - 10 - i * 12, font, FONT_SIZES.body);
    });
    drawRightText(page, formatInr(receipt.total), colX.total + 40, y - 10, font, FONT_SIZES.body);
    drawRightText(page, formatInr(receipt.amountPaid), colX.paid + 40, y - 10, font, FONT_SIZES.body);
    drawRightText(page, formatInr(receipt.balanceDue), colX.balance + 40, y - 10, font, FONT_SIZES.body);

    y -= rowH;
    drawHLine(page, PAGE.margin, PAGE.width - PAGE.margin, y);
  }

  // Totals
  y -= 16;
  drawText(page, "Summary", PAGE.margin, y, bold, FONT_SIZES.section);
  y -= 18;
  page.drawRectangle({
    x: PAGE.margin,
    y: y - 40,
    width: PAGE.width - PAGE.margin * 2,
    height: 40,
    borderWidth: 0.6,
    borderColor: COLORS.border,
    color: COLORS.white,
  });
  drawText(page, `Total billed: ${formatInr(totalBilled)}`, PAGE.margin + 8, y - 16, bold, FONT_SIZES.body);
  drawText(page, `Total paid: ${formatInr(totalPaid)}`, PAGE.margin + 8 + 180, y - 16, bold, FONT_SIZES.body);
  drawText(
    page,
    `Total balance: ${formatInr(totalBalance)}`,
    PAGE.margin + 8 + 360,
    y - 16,
    bold,
    FONT_SIZES.body,
  );
  drawText(
    page,
    `Invoices: ${receipts.length}`,
    PAGE.margin + 8,
    y - 32,
    font,
    FONT_SIZES.body,
  );

  return pdfDoc.save();
}
