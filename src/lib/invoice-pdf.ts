import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { OpdReceiptPayload } from "@/lib/opd-receipt";
import { generateRoshniInvoicePdf } from "@/lib/roshni-invoice-pdf";

const TEMPLATE_URL = "/templates/navayu-invoice-template.pdf";
const PATAUDI_BRANCH_ID = "branch_pataudi";

const COLORS = {
  ink: rgb(0.12, 0.12, 0.14),
  border: rgb(0.72, 0.72, 0.76),
  headerFill: rgb(0.95, 0.96, 0.98),
  white: rgb(1, 1, 1),
} as const;

const FONT = {
  caption: 9,
  body: 10,
  table: 10,
  tableHead: 10,
  emphasis: 11,
} as const;

const LAYOUT = {
  marginLeft: 42,
  marginRight: 553,
  invoiceTitleTop: 670,
  invoiceTitleSize: 16,
  infoTableTop: 645,
  infoBaseRowHeight: 13,
  infoHeaderHeight: 15,
  infoMidX: 298,
  tableGap: 8,
  tableLeft: 42,
  tableRight: 553,
  minRowHeight: 15,
  headerHeight: 15,
  lineLeading: 12,
  maxLineRows: 12,
  footerMinY: 110,
  /** # | Service | SAC | Qty | Amount */
  colRight: [56, 300, 342, 374, 553],
} as const;

const TABLE_HEADERS = ["#", "Service", "SAC", "Qty", "Taxable"] as const;

type TableLayout = {
  infoTop: number;
  infoBottom: number;
  infoRowHeights: number[];
  billingTop: number;
  billingBottom: number;
  billingLineHeights: number[];
  notesY: number;
};

type InfoRow = { left: { label: string; value: string }; right: { label: string; value: string } };

function pdfSafeText(text: string): string {
  return String(text)
    .replace(/₹/g, "Rs.")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00B7/g, "|")
    .replace(/\u2026/g, "...")
    .replace(/[^\t\n\r\u0020-\u00FF]/g, "");
}

function formatInrForPdf(amount: number): string {
  const value = amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `Rs.${value}`;
}

function formatInvoiceMeta(iso: string) {
  const date = new Date(iso);
  return {
    date: date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
    time: date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }),
  };
}

function serviceColWidth(): number {
  return LAYOUT.colRight[1] - LAYOUT.colRight[0] - 8;
}

function infoValueWidth(side: "left" | "right", label: string, bold: PDFFont): number {
  const labelWidth = bold.widthOfTextAtSize(pdfSafeText(`${label}: `), FONT.table);
  const cellWidth = side === "left" ? LAYOUT.infoMidX - LAYOUT.tableLeft : LAYOUT.tableRight - LAYOUT.infoMidX;
  return cellWidth - labelWidth - 8;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const safe = pdfSafeText(text.trim());
  if (!safe) return [""];

  const words = safe.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  const pushLongWord = (word: string) => {
    let chunk = "";
    for (const ch of word) {
      const candidate = chunk + ch;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        chunk = candidate;
      } else {
        if (chunk) lines.push(chunk);
        chunk = ch;
      }
    }
    return chunk;
  };

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = font.widthOfTextAtSize(word, size) <= maxWidth ? word : pushLongWord(word);
  }

  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function rowHeightForLineCount(lineCount: number): number {
  return Math.max(LAYOUT.minRowHeight, 6 + lineCount * LAYOUT.lineLeading);
}

function drawText(page: PDFPage, text: string, x: number, y: number, font: PDFFont, size: number = FONT.body) {
  page.drawText(pdfSafeText(text), { x, y, size, font, color: COLORS.ink });
}

function drawRightText(
  page: PDFPage,
  text: string,
  rightX: number,
  y: number,
  font: PDFFont,
  size: number = FONT.body,
  padding = 4,
) {
  const safe = pdfSafeText(text);
  const width = font.widthOfTextAtSize(safe, size);
  page.drawText(safe, { x: rightX - width - padding, y, size, font, color: COLORS.ink });
}

function drawWrappedLines(
  page: PDFPage,
  lines: string[],
  x: number,
  topY: number,
  rowHeight: number,
  font: PDFFont,
  size: number,
) {
  const visualBlockHeight = (lines.length - 1) * LAYOUT.lineLeading + size;
  const startY = topY - (rowHeight - visualBlockHeight) / 2 - size * 0.7;
  lines.forEach((line, index) => {
    drawText(page, line, x, startY - index * LAYOUT.lineLeading, font, size);
  });
}

function discountLabel(receipt: OpdReceiptPayload): string {
  if (receipt.discountMode === "percent" && receipt.discountPercent != null && receipt.discountPercent > 0) {
    return `Discount (${receipt.discountPercent}%)`;
  }
  return "Discount";
}

function footerRows(receipt: OpdReceiptPayload): Array<{ label: string; value: string; emphasis?: boolean }> {
  const rows: Array<{ label: string; value: string; emphasis?: boolean }> = [
    { label: "Subtotal", value: formatInrForPdf(receipt.subtotal) },
  ];
  if (receipt.discount > 0) {
    rows.push({ label: discountLabel(receipt), value: `-${formatInrForPdf(receipt.discount)}` });
  }
  const gstTotal = receipt.cgstTotal + receipt.sgstTotal + receipt.igstTotal;
  if (gstTotal > 0) {
    const gstRate = receipt.lines[0]?.gstRatePercent ?? 0;
    rows.push({ label: `GST (${gstRate}%)`, value: formatInrForPdf(gstTotal) });
  }
  rows.push({ label: "Grand total", value: formatInrForPdf(receipt.total), emphasis: true });
  rows.push({ label: "Collected", value: formatInrForPdf(receipt.amountPaid) });
  if (receipt.balanceDue > 0) {
    rows.push({ label: "Balance due", value: formatInrForPdf(receipt.balanceDue), emphasis: true });
  }
  if (receipt.advanceUsed && receipt.advanceUsed > 0) {
    rows.push({ label: "Advance used", value: formatInrForPdf(receipt.advanceUsed) });
  }
  if (receipt.refundAmount && receipt.refundAmount > 0) {
    rows.push({ label: "Refund due", value: formatInrForPdf(receipt.refundAmount), emphasis: true });
  }
  if (receipt.paymentBreakdown && receipt.paymentBreakdown.length > 0) {
    for (const split of receipt.paymentBreakdown) {
      rows.push({ label: `Payment - ${split.mode.toUpperCase()}`, value: formatInrForPdf(split.amount) });
    }
  } else if (receipt.paymentMode) {
    rows.push({ label: "Payment mode", value: receipt.paymentMode.toUpperCase() });
  }
  return rows;
}

function cellBaseline(rowTop: number, rowHeight: number): number {
  return rowTop - rowHeight + 5;
}

function drawHLine(page: PDFPage, x1: number, x2: number, y: number) {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.6, color: COLORS.border });
}

function drawVLine(page: PDFPage, x: number, yTop: number, yBottom: number) {
  page.drawLine({
    start: { x, y: yTop },
    end: { x, y: yBottom },
    thickness: 0.5,
    color: COLORS.border,
  });
}

function drawLabelValue(
  page: PDFPage,
  label: string,
  value: string,
  x: number,
  rowTop: number,
  rowHeight: number,
  font: PDFFont,
  bold: PDFFont,
  maxWidth: number,
) {
  if (!label && !value) return;
  const labelText = label ? `${label}: ` : "";
  if (labelText) {
    drawText(page, labelText, x, cellBaseline(rowTop, rowHeight), bold, FONT.table);
  }
  const labelWidth = labelText ? bold.widthOfTextAtSize(pdfSafeText(labelText), FONT.table) : 0;
  const lines = wrapText(value, font, FONT.table, maxWidth);
  drawWrappedLines(page, lines, x + labelWidth, rowTop, rowHeight, font, FONT.table);
}

function buildInfoRows(receipt: OpdReceiptPayload, meta: { date: string; time: string }): InfoRow[] {
  const rows: InfoRow[] = [
    {
      left: { label: "Patient", value: receipt.patientName },
      right: { label: "UHID", value: receipt.patientUhid },
    },
    {
      left: { label: "Mobile", value: receipt.patientPhone },
      right: { label: "Doctor", value: receipt.doctorName },
    },
    {
      left: { label: "Patient city", value: receipt.patientCity || "—" },
      right: { label: "Patient district", value: receipt.patientDistrict || "—" },
    },
    {
      left: { label: "Appointment center", value: receipt.appointmentCenter || "—" },
      right: { label: "Invoice No", value: receipt.invoiceNumber },
    },
    {
      left: { label: "Date", value: meta.date },
      right: { label: "Time", value: meta.time },
    },
    {
      left: { label: "Token", value: receipt.token != null ? `#${receipt.token}` : "Walk-in" },
      right: { label: "", value: "" },
    },
  ];

  return rows;
}

function computeInfoRowHeights(rows: InfoRow[], font: PDFFont, bold: PDFFont): number[] {
  return rows.map((row) => {
    const leftLines = wrapText(
      row.left.value,
      font,
      FONT.table,
      infoValueWidth("left", row.left.label, bold),
    );
    const rightLines = wrapText(
      row.right.value,
      font,
      FONT.table,
      infoValueWidth("right", row.right.label, bold),
    );
    return rowHeightForLineCount(Math.max(leftLines.length, rightLines.length));
  });
}

function computeBillingLineHeights(lines: OpdReceiptPayload["lines"], font: PDFFont): number[] {
  return lines.slice(0, LAYOUT.maxLineRows).map((line) => {
    const wrapped = wrapText(line.label, font, FONT.table, serviceColWidth());
    return rowHeightForLineCount(wrapped.length);
  });
}

function computeTableLayout(
  receipt: OpdReceiptPayload,
  meta: { date: string; time: string },
  font: PDFFont,
  bold: PDFFont,
): TableLayout {
  const infoRows = buildInfoRows(receipt, meta);
  const infoRowHeights = computeInfoRowHeights(infoRows, font, bold);
  const infoHeight = LAYOUT.infoHeaderHeight + infoRowHeights.reduce((sum, h) => sum + h, 0);
  const infoTop = LAYOUT.infoTableTop;
  const infoBottom = infoTop - infoHeight;

  const billingLineHeights = computeBillingLineHeights(receipt.lines, font);
  const overflowRow = receipt.lines.length > LAYOUT.maxLineRows ? LAYOUT.minRowHeight : 0;
  const totalsCount = footerRows(receipt).length;
  const billingHeight =
    LAYOUT.headerHeight +
    billingLineHeights.reduce((sum, h) => sum + h, 0) +
    overflowRow +
    totalsCount * LAYOUT.minRowHeight;

  const billingTop = infoBottom - LAYOUT.tableGap;
  const billingBottom = billingTop - billingHeight;

  const notesY = billingBottom - 10;

  return { infoTop, infoBottom, infoRowHeights, billingTop, billingBottom, billingLineHeights, notesY };
}

function drawPatientInfoTable(
  page: PDFPage,
  receipt: OpdReceiptPayload,
  meta: { date: string; time: string },
  font: PDFFont,
  bold: PDFFont,
  layout: TableLayout,
) {
  const rows = buildInfoRows(receipt, meta);
  const tableHeight = layout.infoTop - layout.infoBottom;
  const width = LAYOUT.tableRight - LAYOUT.tableLeft;

  page.drawRectangle({
    x: LAYOUT.tableLeft,
    y: layout.infoBottom,
    width,
    height: tableHeight,
    borderWidth: 0.8,
    borderColor: COLORS.border,
    color: COLORS.white,
  });

  page.drawRectangle({
    x: LAYOUT.tableLeft,
    y: layout.infoTop - LAYOUT.infoHeaderHeight,
    width,
    height: LAYOUT.infoHeaderHeight,
    color: COLORS.headerFill,
  });

  drawHLine(page, LAYOUT.tableLeft, LAYOUT.tableRight, layout.infoTop);
  drawHLine(page, LAYOUT.tableLeft, LAYOUT.tableRight, layout.infoTop - LAYOUT.infoHeaderHeight);
  drawVLine(page, LAYOUT.infoMidX, layout.infoTop, layout.infoBottom);

  const headerY = cellBaseline(layout.infoTop, LAYOUT.infoHeaderHeight);
  drawText(page, "Patient & visit details", LAYOUT.tableLeft + 4, headerY, bold, FONT.tableHead);

  let rowTop = layout.infoTop - LAYOUT.infoHeaderHeight;
  rows.forEach((row, index) => {
    const rowHeight = layout.infoRowHeights[index] ?? LAYOUT.infoBaseRowHeight;
    rowTop -= rowHeight;
    drawHLine(page, LAYOUT.tableLeft, LAYOUT.tableRight, rowTop);
    drawLabelValue(
      page,
      row.left.label,
      row.left.value,
      LAYOUT.tableLeft + 4,
      rowTop + rowHeight,
      rowHeight,
      font,
      bold,
      infoValueWidth("left", row.left.label, bold),
    );
    drawLabelValue(
      page,
      row.right.label,
      row.right.value,
      LAYOUT.infoMidX + 4,
      rowTop + rowHeight,
      rowHeight,
      font,
      bold,
      infoValueWidth("right", row.right.label, bold),
    );
  });
}

function drawBillingTable(
  page: PDFPage,
  receipt: OpdReceiptPayload,
  font: PDFFont,
  bold: PDFFont,
  layout: TableLayout,
) {
  const lineRows = receipt.lines.slice(0, LAYOUT.maxLineRows);
  const totals = footerRows(receipt);
  const tableTop = layout.billingTop;
  const tableBottom = layout.billingBottom;
  const tableHeight = tableTop - tableBottom;
  const width = LAYOUT.tableRight - LAYOUT.tableLeft;

  page.drawRectangle({
    x: LAYOUT.tableLeft,
    y: tableBottom,
    width,
    height: tableHeight,
    borderWidth: 0.8,
    borderColor: COLORS.border,
    color: COLORS.white,
  });

  page.drawRectangle({
    x: LAYOUT.tableLeft,
    y: tableTop - LAYOUT.headerHeight,
    width,
    height: LAYOUT.headerHeight,
    color: COLORS.headerFill,
  });

  drawHLine(page, LAYOUT.tableLeft, LAYOUT.tableRight, tableTop);
  drawHLine(page, LAYOUT.tableLeft, LAYOUT.tableRight, tableTop - LAYOUT.headerHeight);

  const headerY = cellBaseline(tableTop, LAYOUT.headerHeight);
  TABLE_HEADERS.forEach((label, i) => {
    const x = i === 0 ? LAYOUT.tableLeft + 4 : LAYOUT.colRight[i - 1] + 4;
    if (label === "Taxable") {
      drawRightText(page, label, LAYOUT.colRight[4], headerY, bold, FONT.tableHead);
    } else {
      drawText(page, label, x, headerY, bold, FONT.tableHead);
    }
  });

  let rowTop = tableTop - LAYOUT.headerHeight;
  lineRows.forEach((line, index) => {
    const rowHeight = layout.billingLineHeights[index] ?? LAYOUT.minRowHeight;
    rowTop -= rowHeight;
    drawHLine(page, LAYOUT.tableLeft, LAYOUT.tableRight, rowTop);
    const y = cellBaseline(rowTop + rowHeight, rowHeight);
    const serviceLines = wrapText(line.label, font, FONT.table, serviceColWidth());

    drawText(page, String(index + 1), LAYOUT.tableLeft + 4, y, font, FONT.table);
    drawWrappedLines(page, serviceLines, LAYOUT.colRight[0] + 4, rowTop + rowHeight, rowHeight, font, FONT.table);
    drawText(page, line.sacCode ?? receipt.gst.sacCode, LAYOUT.colRight[1] + 4, y, font, FONT.caption);
    drawText(page, String(line.quantity), LAYOUT.colRight[2] + 4, y, font, FONT.table);
    drawRightText(page, formatInrForPdf(line.taxableAmount ?? line.lineTotal), LAYOUT.colRight[4], y, font, FONT.table);
  });

  if (receipt.lines.length > LAYOUT.maxLineRows) {
    rowTop -= LAYOUT.minRowHeight;
    drawHLine(page, LAYOUT.tableLeft, LAYOUT.tableRight, rowTop);
    const y = cellBaseline(rowTop + LAYOUT.minRowHeight, LAYOUT.minRowHeight);
    drawText(
      page,
      `+ ${receipt.lines.length - LAYOUT.maxLineRows} more line(s)`,
      LAYOUT.colRight[0] + 4,
      y,
      font,
      FONT.caption,
    );
  }

  for (const x of LAYOUT.colRight.slice(0, -1)) {
    drawVLine(page, x, tableTop, tableBottom);
  }

  totals.forEach((row) => {
    rowTop -= LAYOUT.minRowHeight;
    drawHLine(page, LAYOUT.tableLeft, LAYOUT.tableRight, rowTop);
    const y = cellBaseline(rowTop + LAYOUT.minRowHeight, LAYOUT.minRowHeight);
    const rowFont = row.emphasis ? bold : font;
    const size = row.emphasis ? FONT.emphasis : FONT.table;
    drawText(page, row.label, LAYOUT.colRight[0] + 4, y, rowFont, size);
    drawRightText(page, row.value, LAYOUT.colRight[4], y, rowFont, size);
  });
}

function drawInvoiceTitle(page: PDFPage, font: PDFFont, bold: PDFFont) {
  const title = "Invoice";
  const titleWidth = bold.widthOfTextAtSize(title, LAYOUT.invoiceTitleSize);
  const centerX = (LAYOUT.tableLeft + LAYOUT.tableRight) / 2 - titleWidth / 2;
  drawText(page, title, centerX, LAYOUT.invoiceTitleTop, bold, LAYOUT.invoiceTitleSize);
}

function drawNotes(page: PDFPage, receipt: OpdReceiptPayload, font: PDFFont, layout: TableLayout) {
  if (layout.notesY < LAYOUT.footerMinY - 20) return;

  let y = layout.notesY;
  const taxNote =
    receipt.taxTotal === 0
      ? "GST exempt healthcare service"
      : `Total tax ${formatInrForPdf(receipt.taxTotal)}`;
  drawText(page, taxNote, LAYOUT.tableLeft, y, font, FONT.caption);
  y -= 11;

  const packagesWithNotes = (receipt.packageLines ?? []).filter(
    (p) => p.description && p.description.trim(),
  );
  if (packagesWithNotes.length > 0) {
    y -= 4;
    drawText(page, "Package notes:", LAYOUT.tableLeft, y, font, FONT.caption);
    y -= 10;
    for (const pkg of packagesWithNotes) {
      const noteText = `${pkg.label}: ${pkg.description}`;
      const noteLines = wrapText(noteText, font, FONT.caption, LAYOUT.tableRight - LAYOUT.tableLeft - 16);
      noteLines.forEach((line) => {
        drawText(page, line, LAYOUT.tableLeft + 8, y, font, FONT.caption);
        y -= 10;
      });
    }
  }

  if (receipt.routingNote) {
    y -= 4;
    const noteLines = wrapText(receipt.routingNote, font, FONT.caption, LAYOUT.tableRight - LAYOUT.tableLeft - 8);
    noteLines.forEach((line) => {
      drawText(page, line, LAYOUT.tableLeft, y, font, FONT.caption);
      y -= 10;
    });
  }
}

export async function generateInvoicePdf(receipt: OpdReceiptPayload): Promise<Uint8Array> {
  if (receipt.branchId === PATAUDI_BRANCH_ID) return generateRoshniInvoicePdf(receipt);

  const templateBytes = await fetch(TEMPLATE_URL).then((res) => {
    if (!res.ok) throw new Error("Invoice template PDF not found.");
    return res.arrayBuffer();
  });

  const pdfDoc = await PDFDocument.load(templateBytes);
  const page = pdfDoc.getPages()[0];
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const meta = formatInvoiceMeta(receipt.issuedAt);
  const layout = computeTableLayout(receipt, meta, font, bold);

  drawInvoiceTitle(page, font, bold);
  drawPatientInfoTable(page, receipt, meta, font, bold, layout);
  drawBillingTable(page, receipt, font, bold, layout);
  drawNotes(page, receipt, font, layout);

  return pdfDoc.save();
}

export function printPdfBytes(bytes: Uint8Array, title = "Invoice") {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.title = title;
  iframe.src = url;
  const cleanup = () => {
    URL.revokeObjectURL(url);
    iframe.remove();
  };
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      window.setTimeout(cleanup, 60_000);
    }
  };
  document.body.appendChild(iframe);
}

export function downloadPdfBytes(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function generateCombinedInvoicePdf(receipts: OpdReceiptPayload[]): Promise<Uint8Array> {
  if (receipts.length === 0) throw new Error("No invoices to print.");
  if (receipts.length === 1) return generateInvoicePdf(receipts[0]);
  if (receipts.some((receipt) => receipt.branchId === PATAUDI_BRANCH_ID)) {
    const merged = await PDFDocument.create();
    for (const receipt of receipts) {
      const bytes = await generateInvoicePdf(receipt);
      const source = await PDFDocument.load(bytes);
      const [page] = await merged.copyPages(source, [0]);
      merged.addPage(page);
    }
    return merged.save();
  }
  const templateBytes = await fetch(TEMPLATE_URL).then((res) => {
    if (!res.ok) throw new Error("Invoice template PDF not found.");
    return res.arrayBuffer();
  });
  const merged = await PDFDocument.create();
  for (const receipt of receipts) {
    const templateDoc = await PDFDocument.load(templateBytes);
    const [page] = await merged.copyPages(templateDoc, [0]);
    merged.addPage(page);
    const target = merged.getPages()[merged.getPageCount() - 1];
    const font = await merged.embedFont(StandardFonts.Helvetica);
    const bold = await merged.embedFont(StandardFonts.HelveticaBold);
    const meta = formatInvoiceMeta(receipt.issuedAt);
    const layout = computeTableLayout(receipt, meta, font, bold);
    drawInvoiceTitle(target, font, bold);
    drawPatientInfoTable(target, receipt, meta, font, bold, layout);
    drawBillingTable(target, receipt, font, bold, layout);
    drawNotes(target, receipt, font, layout);
  }
  return merged.save();
}
