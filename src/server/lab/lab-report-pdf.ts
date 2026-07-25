"use server";

import { PDFDocument, PDFPage, StandardFonts, rgb, type Color } from "pdf-lib";
import {
  LAB_RESULT_FLAG_LABELS,
  type LabDataType,
  type LabFieldMaster,
  type LabFieldRange,
  type LabOrder,
  type LabResultFlag,
} from "@/design-system/lab-data";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const TOP = PAGE_HEIGHT - MARGIN;
const BOTTOM = MARGIN;
const USABLE_WIDTH = PAGE_WIDTH - MARGIN * 2;

export type LabReportPdfPatient = {
  name: string;
  uhid: string;
  phone?: string | null;
  gender?: string | null;
  dateOfBirth?: Date | string | null;
};

function parseDob(value?: Date | string | null): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
}

function ageAt(dateOfBirth: Date | undefined, at: Date): { years: number; months: number; days: number } {
  if (!dateOfBirth) return { years: 0, months: 0, days: 0 };
  const end = at.getTime();
  const start = dateOfBirth.getTime();
  const days = Math.floor((end - start) / (1000 * 60 * 60 * 24));
  return { years: Math.floor(days / 365.25), months: Math.floor(days / 30.44), days };
}

function formatAge(age: { years: number; months: number; days: number }): string {
  if (age.years > 0) return `${age.years}y`;
  if (age.months > 0) return `${age.months}m`;
  if (age.days > 0) return `${age.days}d`;
  return "—";
}

function matchesRange(
  range: LabFieldRange,
  gender?: string | null,
  age: { years: number; months: number; days: number } = { years: 0, months: 0, days: 0 },
  sampleType?: string,
): boolean {
  if (range.gender && range.gender !== "all" && range.gender !== (gender ?? "")) return false;
  const ageUnit = range.ageUnit ?? "years";
  const ageValue = ageUnit === "years" ? age.years : ageUnit === "months" ? age.months : age.days;
  if (range.ageMin != null && ageValue < range.ageMin) return false;
  if (range.ageMax != null && ageValue > range.ageMax) return false;
  if (sampleType && range.sampleType && range.sampleType !== sampleType) return false;
  return true;
}

function getApplicableRange(
  fieldMaster: LabFieldMaster,
  patient: { gender?: string | null; dateOfBirth?: Date | string | null },
  recordedAt: Date,
  sampleType?: string,
): LabFieldRange | undefined {
  const dob = parseDob(patient.dateOfBirth);
  const age = dob ? ageAt(dob, recordedAt) : { years: 0, months: 0, days: 0 };
  const ranges = fieldMaster.ranges
    .filter((r) => matchesRange(r, patient.gender, age, sampleType))
    .sort((a, b) => (b.isDefault ? 0 : 1) - (a.isDefault ? 0 : 1));
  return ranges[0] ?? fieldMaster.ranges.find((r) => r.isDefault);
}

function formatReferenceRange(range: LabFieldRange | undefined, unit?: string | null): string {
  if (!range) return "—";
  if (range.displayLabel) return range.displayLabel;
  const parts: string[] = [];
  if (range.low != null && range.high != null) parts.push(`${range.low} – ${range.high}`);
  else if (range.low != null) parts.push(`≥ ${range.low}`);
  else if (range.high != null) parts.push(`≤ ${range.high}`);
  if (unit) parts.push(unit);
  const main = parts.join(" ") || "—";
  const crit: string[] = [];
  if (range.criticalLow != null) crit.push(`critical < ${range.criticalLow}`);
  if (range.criticalHigh != null) crit.push(`critical > ${range.criticalHigh}`);
  return crit.length ? `${main} (${crit.join("; ")})` : main;
}

function parseNumber(value: string): number | null {
  const v = value.replace(/,/g, "").trim();
  if (v === "" || v === "-" || v.toLowerCase() === "nil") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function evaluateLabResultFlag(
  fieldMaster: LabFieldMaster,
  value: string,
  patient: { gender?: string | null; dateOfBirth?: Date | string | null; sampleType?: string },
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

  const dob = parseDob(patient.dateOfBirth);
  const age = dob ? ageAt(dob, recordedAt) : { years: 0, months: 0, days: 0 };
  const ranges = fieldMaster.ranges
    .filter((r) => matchesRange(r, patient.gender, age, patient.sampleType))
    .sort((a, b) => (b.isDefault ? 0 : 1) - (a.isDefault ? 0 : 1));
  const range = ranges[0] ?? fieldMaster.ranges.find((r) => r.isDefault);
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
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
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

  let y = TOP;

  // Header
  page.drawText("Laboratory Report", { x: MARGIN, y, size: 20, font: boldFont, color: accent });
  y -= 26;

  const dob = parseDob(patient.dateOfBirth);
  const age = dob ? ageAt(dob, new Date()) : { years: 0, months: 0, days: 0 };
  const info = [
    `Patient: ${patient.name}`,
    `UHID: ${patient.uhid}`,
    `Age / Gender: ${formatAge(age)} / ${patient.gender?.toUpperCase() ?? "—"}`,
    patient.phone ? `Phone: ${patient.phone}` : "",
  ]
    .filter(Boolean)
    .join("   ·   ");
  page.drawText(info, { x: MARGIN, y, size: 10, font: normalFont, color: secondary });
  y -= 22;

  const generatedAt = new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  page.drawText(`Generated: ${generatedAt}`, { x: MARGIN, y, size: 9, font: normalFont, color: secondary });
  y -= 20;

  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
  y -= 18;

  if (orders.length === 0) {
    page.drawText("No laboratory orders to display.", { x: MARGIN, y, size: 11, font: normalFont, color: secondary });
    return pdfDoc.save();
  }

  const colWidths = [165, 65, 50, 70, 130, 55];
  const colX = [MARGIN, MARGIN + colWidths[0], MARGIN + colWidths[0] + colWidths[1], MARGIN + colWidths[0] + colWidths[1] + colWidths[2], MARGIN + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], MARGIN + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4]];
  const lineHeight = 11;
  const rowPadding = 6;

  for (const order of orders) {
    // Order header
    if (y < BOTTOM + 60) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = TOP;
    }
    const tests = order.items.map((i) => i.label).join(", ");
    page.drawText(`Order #${order.id.slice(-6).toUpperCase()} · ${tests}`, {
      x: MARGIN,
      y,
      size: 12,
      font: boldFont,
      color: primary,
    });
    y -= 14;
    page.drawText(`Ordered: ${dateLabel(order.orderedAt)} · Status: ${order.status.toUpperCase()} · Source: ${order.source.toUpperCase()}`, {
      x: MARGIN,
      y,
      size: 9,
      font: normalFont,
      color: secondary,
    });
    y -= 18;

    for (const item of order.items) {
      if (y < BOTTOM + 60) {
        page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = TOP;
      }
      page.drawText(`${item.label}${item.sampleType ? ` · ${item.sampleType}` : ""}`, {
        x: MARGIN,
        y,
        size: 11,
        font: boldFont,
        color: accent,
      });
      y -= 16;

      // Table header
      page.drawLine({ start: { x: MARGIN, y: y + 2 }, end: { x: PAGE_WIDTH - MARGIN, y: y + 2 }, thickness: 0.5, color: rgb(0.75, 0.75, 0.75) });
      const headers = ["Test", "Result", "Unit", "Flag", "Reference range", "Note"];
      for (let i = 0; i < headers.length; i++) {
        page.drawText(headers[i], { x: colX[i], y, size: 9, font: boldFont, color: primary });
      }
      y -= 14;
      page.drawLine({ start: { x: MARGIN, y: y + 2 }, end: { x: PAGE_WIDTH - MARGIN, y: y + 2 }, thickness: 0.5, color: rgb(0.75, 0.75, 0.75) });

      const fields = item.reportCatalog?.fields.filter((f) => f.isVisible) ?? [];
      if (fields.length === 0) {
        page.drawText("No visible fields.", { x: MARGIN, y, size: 9, font: normalFont, color: secondary });
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
              { gender: patient.gender, dateOfBirth: parseDob(patient.dateOfBirth), sampleType: item.sampleType },
              recordedAt,
            );
          }
          const range = getApplicableRange(
            field.fieldMaster,
            patient,
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

          if (y - rowHeight < BOTTOM) {
            page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
            y = TOP - 18;
            page.drawLine({ start: { x: MARGIN, y: y + 16 }, end: { x: PAGE_WIDTH - MARGIN, y: y + 16 }, thickness: 0.5, color: rgb(0.75, 0.75, 0.75) });
            for (let i = 0; i < headers.length; i++) {
              page.drawText(headers[i], { x: colX[i], y, size: 9, font: boldFont, color: primary });
            }
            y -= 14;
            page.drawLine({ start: { x: MARGIN, y: y + 2 }, end: { x: PAGE_WIDTH - MARGIN, y: y + 2 }, thickness: 0.5, color: rgb(0.75, 0.75, 0.75) });
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
      page.drawText(`Cancellation reason: ${order.cancelReason}`, { x: MARGIN, y, size: 9, font: normalFont, color: critical });
      y -= 16;
    }
    y -= 12;
  }

  // Footer
  page.drawText("End of report", { x: MARGIN, y: Math.max(y, BOTTOM + 10), size: 9, font: normalFont, color: secondary });

  return pdfDoc.save();
}

export async function buildCombinedLabReportPdfBytes(
  patient: LabReportPdfPatient,
  orders: LabOrder[],
): Promise<Uint8Array> {
  // Filter to completed/in_progress orders for combined patient report
  const reportOrders = orders.filter((o) => o.status !== "cancelled");
  return buildLabReportPdfBytes(patient, reportOrders);
}

export function bytesToDataUrl(bytes: Uint8Array, filename = "lab-report.pdf"): string {
  const base64 = Buffer.from(bytes).toString("base64");
  return `data:application/pdf;base64,${base64}`;
}
