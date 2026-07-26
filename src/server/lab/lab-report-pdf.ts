import { PDFDocument, PDFPage, StandardFonts, rgb, type Color } from "pdf-lib";
import {
  LAB_RESULT_FLAG_LABELS,
  type LabDataType,
  type LabFieldMaster,
  type LabOrder,
  type LabResultFlag,
} from "@/design-system/lab-data";
import {
  resolveAge,
  getApplicableRange,
  formatReferenceRange,
  formatAge,
  parseNumber,
} from "@/lib/lab-ranges";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;

export type LabReportPdfPatient = {
  name: string;
  uhid: string;
  phone?: string | null;
  gender?: string | null;
  dateOfBirth?: Date | string | null;
  age?: number | null;
};

export type LabReportTemplateSpec = {
  fileData: string;
  mimeType: string;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
};

function dataUrlToBytes(dataUrl: string): Uint8Array | undefined {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return undefined;
  const base64 = dataUrl.slice(comma + 1).trim();
  if (!base64) return undefined;
  return Buffer.from(base64, "base64");
}

function evaluateLabResultFlag(
  fieldMaster: LabFieldMaster,
  value: string,
  patient: { gender?: string | null; dateOfBirth?: Date | string | null; age?: number | null; sampleType?: string },
  recordedAt: Date,
): LabResultFlag | undefined {
  const numericValue = parseNumber(value);
  const displayValue = value.trim();

  if (fieldMaster.dataType === ("boolean" as LabDataType)) {
    const text = displayValue.toLowerCase();
    const positive = ["positive", "pos", "+", "yes", "detected", "reactive"];
    return positive.includes(text) ? "high" : "normal";
  }

  if (fieldMaster.dataType === ("select" as LabDataType) || numericValue == null) {
    return undefined;
  }

  const range = getApplicableRange(fieldMaster, patient, recordedAt, patient.sampleType);
  if (!range) return undefined;

  if (range.criticalLow != null && numericValue <= range.criticalLow) return "critical_low";
  if (range.criticalHigh != null && numericValue >= range.criticalHigh) return "critical_high";
  if (range.low != null && numericValue < range.low) return "low";
  if (range.high != null && numericValue > range.high) return "high";
  return "normal";
}

function wrapText(text: string, font: any, size: number, maxWidth: number): string[] {
  const words = String(text ?? "")
    .split(/\s+/)
    .filter((w) => w.length > 0);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) {
      line = test;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function drawWrapped(
  page: PDFPage,
  text: string,
  x: number,
  yTop: number,
  maxWidth: number,
  size: number,
  font: any,
  lineHeight: number,
  color: Color = rgb(0.1, 0.1, 0.1),
): number {
  const lines = wrapText(text, font, size, maxWidth);
  let y = yTop;
  for (let i = 0; i < lines.length; i++) {
    page.drawText(lines[i], { x, y, size, font, color });
    y -= lineHeight;
  }
  return yTop - lines.length * lineHeight;
}

function measureHeight(text: string, font: any, size: number, maxWidth: number, lineHeight: number): number {
  const lines = wrapText(text, font, size, maxWidth);
  return lines.length * lineHeight;
}

function dateLabel(dateStr?: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? String(dateStr) : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export async function buildLabReportPdfBytes(
  patient: LabReportPdfPatient,
  orders: LabOrder[],
  template?: LabReportTemplateSpec,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const normalFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const primary = rgb(0.12, 0.12, 0.12);
  const secondary = rgb(0.4, 0.4, 0.4);
  const accent = rgb(0.1, 0.45, 0.76);
  const critical = rgb(0.75, 0.1, 0.1);
  const low = rgb(0.75, 0.45, 0.1);
  const high = rgb(0.75, 0.45, 0.1);

  function flagColor(flag?: string) {
    if (flag === "critical_low" || flag === "critical_high") return critical;
    if (flag === "low" || flag === "high") return high;
    return primary;
  }

  let marginLeft = MARGIN;
  let marginRight = MARGIN;
  let marginTop = MARGIN;
  let marginBottom = MARGIN;
  let embeddedTemplate: any = undefined;

  if (template?.mimeType === "application/pdf") {
    const bytes = dataUrlToBytes(template.fileData);
    if (bytes) {
      const [first] = await pdfDoc.embedPdf(bytes, [0]);
      embeddedTemplate = first;
      marginTop = template.marginTop;
      marginBottom = template.marginBottom;
      marginLeft = template.marginLeft;
      marginRight = template.marginRight;
    }
  }

  const top = PAGE_HEIGHT - marginTop;
  const bottom = marginBottom;
  const usableWidth = PAGE_WIDTH - marginLeft - marginRight;
  const rightX = PAGE_WIDTH - marginRight;

  function newPage(): PDFPage {
    const p = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    if (embeddedTemplate) {
      p.drawPage(embeddedTemplate, { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT });
    }
    return p;
  }

  let page = newPage();
  let y = top;

  // Header
  page.drawText("Laboratory Report", { x: marginLeft, y, size: 20, font: boldFont, color: accent });
  y -= 26;

  const age = resolveAge(patient, new Date());
  const info = [
    `Patient: ${patient.name}`,
    `UHID: ${patient.uhid}`,
    `Age / Gender: ${formatAge(age)} / ${patient.gender?.toUpperCase() ?? "—"}`,
    patient.phone ? `Phone: ${patient.phone}` : "",
  ]
    .filter(Boolean)
    .join("   ·   ");
  page.drawText(info, { x: marginLeft, y, size: 10, font: normalFont, color: secondary });
  y -= 22;

  const generatedAt = new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  page.drawText(`Generated: ${generatedAt}`, { x: marginLeft, y, size: 9, font: normalFont, color: secondary });
  y -= 20;

  page.drawLine({ start: { x: marginLeft, y }, end: { x: rightX, y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
  y -= 18;

  if (orders.length === 0) {
    page.drawText("No laboratory orders to display.", { x: marginLeft, y, size: 11, font: normalFont, color: secondary });
    return pdfDoc.save();
  }

  const baseColWidths = [165, 65, 50, 70, 130, 55];
  const colWidthTotal = baseColWidths.reduce((a, b) => a + b, 0);
  const colScale = Math.min(1, usableWidth / colWidthTotal);
  const colWidths = baseColWidths.map((w) => w * colScale);
  const colX = [
    marginLeft,
    marginLeft + colWidths[0],
    marginLeft + colWidths[0] + colWidths[1],
    marginLeft + colWidths[0] + colWidths[1] + colWidths[2],
    marginLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3],
    marginLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4],
  ];
  const lineHeight = 11;
  const rowPadding = 6;

  for (const order of orders) {
    // Order header
    if (y < bottom + 60) {
      page = newPage();
      y = top;
    }
    const tests = order.items.map((i) => i.label).join(", ");
    page.drawText(`Order #${order.id.slice(-6).toUpperCase()} · ${tests}`, {
      x: marginLeft,
      y,
      size: 12,
      font: boldFont,
      color: primary,
    });
    y -= 14;
    page.drawText(`Ordered: ${dateLabel(order.orderedAt)} · Status: ${order.status.toUpperCase()} · Source: ${order.source.toUpperCase()}`, {
      x: marginLeft,
      y,
      size: 9,
      font: normalFont,
      color: secondary,
    });
    y -= 18;

    for (const item of order.items) {
      if (y < bottom + 60) {
        page = newPage();
        y = top;
      }
      page.drawText(`${item.label}${item.sampleType ? ` · ${item.sampleType}` : ""}`, {
        x: marginLeft,
        y,
        size: 11,
        font: boldFont,
        color: accent,
      });
      y -= 16;

      // Table header
      page.drawLine({ start: { x: marginLeft, y: y + 2 }, end: { x: rightX, y: y + 2 }, thickness: 0.5, color: rgb(0.75, 0.75, 0.75) });
      const headers = ["Test", "Result", "Unit", "Flag", "Reference range", "Note"];
      for (let i = 0; i < headers.length; i++) {
        page.drawText(headers[i], { x: colX[i], y, size: 9, font: boldFont, color: primary });
      }
      y -= 14;
      page.drawLine({ start: { x: marginLeft, y: y + 2 }, end: { x: rightX, y: y + 2 }, thickness: 0.5, color: rgb(0.75, 0.75, 0.75) });

      const fields = item.reportCatalog?.fields.filter((f) => f.isVisible) ?? [];
      if (fields.length === 0) {
        page.drawText("No visible fields.", { x: marginLeft, y, size: 9, font: normalFont, color: secondary });
        y -= 20;
      } else {
        for (const field of fields) {
          if (!field.fieldMaster) continue;
          const recordedAt = new Date();
          const result = item.results.find((r) => r.fieldMasterId === field.fieldMasterId);
          const value = result?.value ?? "";
          const note = result?.note ?? "";
          let flag = result?.flag;
          if (!flag && value) {
            flag = evaluateLabResultFlag(
              field.fieldMaster,
              value,
              { gender: patient.gender, dateOfBirth: patient.dateOfBirth, age: patient.age, sampleType: item.sampleType },
              recordedAt,
            );
          }
          const range = getApplicableRange(
            field.fieldMaster,
            { gender: patient.gender, dateOfBirth: patient.dateOfBirth, age: patient.age },
            result ? new Date(result.recordedAt) : recordedAt,
            item.sampleType,
          );

          const rowCells = [
            field.fieldMaster.name,
            value || "—",
            field.fieldMaster.unit || "—",
            flag ? LAB_RESULT_FLAG_LABELS[flag] : "—",
            formatReferenceRange(range, field.fieldMaster.unit),
            note,
          ];

          const cellHeights = rowCells.map((cell, idx) =>
            measureHeight(cell, idx === 0 ? boldFont : normalFont, 9, colWidths[idx] - 8, lineHeight)
          );
          const rowHeight = Math.max(...cellHeights, lineHeight) + rowPadding;

          if (y - rowHeight < bottom) {
            page = newPage();
            y = top - 18;
            page.drawLine({ start: { x: marginLeft, y: y + 16 }, end: { x: rightX, y: y + 16 }, thickness: 0.5, color: rgb(0.75, 0.75, 0.75) });
            for (let i = 0; i < headers.length; i++) {
              page.drawText(headers[i], { x: colX[i], y, size: 9, font: boldFont, color: primary });
            }
            y -= 14;
            page.drawLine({ start: { x: marginLeft, y: y + 2 }, end: { x: rightX, y: y + 2 }, thickness: 0.5, color: rgb(0.75, 0.75, 0.75) });
          }

          const baseline = y - lineHeight - rowPadding / 2;
          for (let i = 0; i < rowCells.length; i++) {
            const color = i === 3 && flag ? flagColor(flag) : i === 1 && flag ? flagColor(flag) : primary;
            const font = i === 0 || (i === 1 && flag) ? boldFont : normalFont;
            drawWrapped(page, rowCells[i], colX[i] + 4, baseline, colWidths[i] - 8, 9, font, lineHeight, color);
          }
          y -= rowHeight;
        }
      }
      y -= 10;
    }

    if (order.cancelReason) {
      page.drawText(`Cancellation reason: ${order.cancelReason}`, { x: marginLeft, y, size: 9, font: normalFont, color: critical });
      y -= 16;
    }
    y -= 12;
  }

  // Footer
  page.drawText("End of report", { x: marginLeft, y: Math.max(y, bottom + 10), size: 9, font: normalFont, color: secondary });

  return pdfDoc.save();
}

export async function buildCombinedLabReportPdfBytes(
  patient: LabReportPdfPatient,
  orders: LabOrder[],
  template?: LabReportTemplateSpec,
): Promise<Uint8Array> {
  // Filter to completed/in_progress orders for combined patient report
  const reportOrders = orders.filter((o) => o.status !== "cancelled");
  return buildLabReportPdfBytes(patient, reportOrders, template);
}

export function bytesToDataUrl(bytes: Uint8Array, filename = "lab-report.pdf"): string {
  const base64 = Buffer.from(bytes).toString("base64");
  return `data:application/pdf;base64,${base64}`;
}
