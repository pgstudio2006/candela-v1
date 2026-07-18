import { PDFDocument, PDFImage, PDFPage, PDFFont, StandardFonts, rgb } from "pdf-lib";
import type { OpdReceiptPayload } from "@/lib/opd-receipt";

const COLORS = {
  ink: rgb(0.12, 0.12, 0.14),
  border: rgb(0.72, 0.72, 0.76),
  headerFill: rgb(0.95, 0.96, 0.98),
  white: rgb(1, 1, 1),
};

const PAGE = { width: 595, height: 842, marginLeft: 55, marginRight: 540 };
const LAYOUT = {
  headerHeight: 170,
  footerMinY: 100,
  rowHeight: 13,
  lineLeading: 11,
  contentTop: PAGE.height - 170,
};
const FONT_SIZES = { title: 14, section: 11, body: 9, small: 8 };

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

function drawTableHeader(page: PDFPage, y: number, bold: PDFFont) {
  page.drawRectangle({
    x: PAGE.marginLeft,
    y: y - LAYOUT.rowHeight,
    width: PAGE.marginRight - PAGE.marginLeft,
    height: LAYOUT.rowHeight,
    color: COLORS.headerFill,
  });
}

export async function generatePatientInvoiceSummaryPdf(receipts: OpdReceiptPayload[]): Promise<Uint8Array> {
  if (receipts.length === 0) throw new Error("No invoices to summarize.");

  const pdfDoc = await PDFDocument.create();
  let backgroundImage: PDFImage | null = null;
  try {
    const res = await fetch("/templates/invoice-reference.png");
    if (res.ok) {
      const bytes = new Uint8Array(await res.arrayBuffer());
      backgroundImage = await pdfDoc.embedPng(bytes);
    }
  } catch {
    backgroundImage = null;
  }

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const first = receipts[0];

  const addPage = () => {
    const p = pdfDoc.addPage([PAGE.width, PAGE.height]);
    if (backgroundImage) {
      p.drawImage(backgroundImage, { x: 0, y: 0, width: PAGE.width, height: PAGE.height });
    }
    return p;
  };

  let page = addPage();
  let y = LAYOUT.contentTop;

  drawText(page, "Patient Invoice Summary", PAGE.marginLeft, y - 18, bold, FONT_SIZES.title);
  y -= 32;

  drawText(page, `Generated: ${formatDateTime(new Date().toISOString())}`, PAGE.marginLeft, y, font, FONT_SIZES.small);
  y -= 16;

  page.drawRectangle({
    x: PAGE.marginLeft,
    y: y - 42,
    width: PAGE.marginRight - PAGE.marginLeft,
    height: 42,
    borderWidth: 0.6,
    borderColor: COLORS.border,
    color: COLORS.white,
  });
  drawText(page, `Patient: ${first.patientName}`, PAGE.marginLeft + 8, y - 16, bold, FONT_SIZES.body);
  drawText(page, `UHID: ${first.patientUhid}`, PAGE.marginLeft + 8, y - 30, font, FONT_SIZES.body);
  drawText(
    page,
    `Phone: ${first.patientPhone}`,
    PAGE.marginLeft + 260,
    y - 30,
    font,
    FONT_SIZES.body,
  );
  y -= 56;

  const colX = {
    date: PAGE.marginLeft,
    invoice: PAGE.marginLeft + 65,
    services: PAGE.marginLeft + 160,
    total: PAGE.marginRight - 148,
    paid: PAGE.marginRight - 78,
    balance: PAGE.marginRight - 4,
  };

  drawTableHeader(page, y, bold);
  drawText(page, "Date", colX.date + 4, y - 9, bold, FONT_SIZES.body);
  drawText(page, "Invoice #", colX.invoice + 4, y - 9, bold, FONT_SIZES.body);
  drawText(page, "Services", colX.services + 4, y - 9, bold, FONT_SIZES.body);
  drawRightText(page, "Total", colX.total - 4, y - 9, bold, FONT_SIZES.body);
  drawRightText(page, "Paid", colX.paid - 4, y - 9, bold, FONT_SIZES.body);
  drawRightText(page, "Balance", colX.balance - 4, y - 9, bold, FONT_SIZES.body);
  y -= LAYOUT.rowHeight;
  drawHLine(page, PAGE.marginLeft, PAGE.marginRight, y);

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
    const serviceLines = wrapText(serviceLabels, font, FONT_SIZES.body, colX.total - colX.services - 14);
    const rowLines = Math.max(1, serviceLines.length);
    const rowH = rowLines * LAYOUT.lineLeading + 6;

    if (y - rowH < LAYOUT.footerMinY) {
      page.drawText(pdfSafeText("Continued..."), {
        x: PAGE.marginLeft,
        y: LAYOUT.footerMinY - 20,
        font,
        size: FONT_SIZES.small,
      });
      page = addPage();
      y = LAYOUT.contentTop;
      drawTableHeader(page, y, bold);
      drawText(page, "Date", colX.date + 4, y - 9, bold, FONT_SIZES.body);
      drawText(page, "Invoice #", colX.invoice + 4, y - 9, bold, FONT_SIZES.body);
      drawText(page, "Services", colX.services + 4, y - 9, bold, FONT_SIZES.body);
      drawRightText(page, "Total", colX.total - 4, y - 9, bold, FONT_SIZES.body);
      drawRightText(page, "Paid", colX.paid - 4, y - 9, bold, FONT_SIZES.body);
      drawRightText(page, "Balance", colX.balance - 4, y - 9, bold, FONT_SIZES.body);
      y -= LAYOUT.rowHeight;
    }

    drawText(page, formatDate(receipt.issuedAt), colX.date + 4, y - 9, font, FONT_SIZES.body);
    drawText(page, receipt.invoiceNumber, colX.invoice + 4, y - 9, font, FONT_SIZES.body);
    serviceLines.forEach((line, i) => {
      drawText(page, line, colX.services + 4, y - 9 - i * LAYOUT.lineLeading, font, FONT_SIZES.body);
    });
    drawRightText(page, formatInr(receipt.total), colX.total - 4, y - 9, font, FONT_SIZES.body);
    drawRightText(page, formatInr(receipt.amountPaid), colX.paid - 4, y - 9, font, FONT_SIZES.body);
    drawRightText(page, formatInr(receipt.balanceDue), colX.balance - 4, y - 9, font, FONT_SIZES.body);

    y -= rowH;
    drawHLine(page, PAGE.marginLeft, PAGE.marginRight, y);
  }

  y -= 12;
  if (y - 50 < LAYOUT.footerMinY) {
    page = addPage();
    y = LAYOUT.contentTop;
  }
  drawText(page, "Summary", PAGE.marginLeft, y, bold, FONT_SIZES.section);
  y -= 16;
  page.drawRectangle({
    x: PAGE.marginLeft,
    y: y - 36,
    width: PAGE.marginRight - PAGE.marginLeft,
    height: 36,
    borderWidth: 0.6,
    borderColor: COLORS.border,
    color: COLORS.white,
  });
  drawText(page, `Total billed: ${formatInr(totalBilled)}`, PAGE.marginLeft + 8, y - 14, bold, FONT_SIZES.body);
  drawText(page, `Total paid: ${formatInr(totalPaid)}`, PAGE.marginLeft + 180, y - 14, bold, FONT_SIZES.body);
  drawText(
    page,
    `Total balance: ${formatInr(totalBalance)}`,
    PAGE.marginLeft + 340,
    y - 14,
    bold,
    FONT_SIZES.body,
  );
  drawText(
    page,
    `Invoices: ${receipts.length}`,
    PAGE.marginLeft + 8,
    y - 28,
    font,
    FONT_SIZES.body,
  );

  return pdfDoc.save();
}
