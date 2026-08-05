import { PDFDocument, PDFPage, StandardFonts, rgb, type Color, type PDFEmbeddedPage } from "pdf-lib";
import { loadTemplateFile } from "@/lib/pdf-template-loader";
import {
  type LabDataType,
  type LabFieldMaster,
  type LabOrder,
  type LabResultFlag,
  type LabTemplateOverlayField,
} from "@/design-system/lab-data";
import { CLINIC_BRAND } from "@/design-system/document-templates";
import {
  resolveAge,
  getApplicableRange,
  parseNumber,
} from "@/lib/lab-ranges";

const PAGE_WIDTH = 595.28;   // A4 portrait in points
const PAGE_HEIGHT = 841.89;
const MARGIN_LEFT = 42;      // ~15mm
const MARGIN_RIGHT = 42;
const MARGIN_TOP = 20;
const MARGIN_BOTTOM = 50;

export type LabReportPdfPatient = {
  name: string;
  uhid: string;
  phone?: string | null;
  gender?: string | null;
  dateOfBirth?: Date | string | null;
  age?: number | null;
  bloodGroup?: string | null;
};

export type LabReportTemplateSpec = {
  fileData: string;
  mimeType: string;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  overlayFields: LabTemplateOverlayField[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function evaluateLabResultFlag(
  fieldMaster: LabFieldMaster,
  value: string,
  patient: { gender?: string | null; dateOfBirth?: Date | string | null; age?: number | null; sampleType?: string; pregnancy?: boolean },
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
    const wordWidth = font.widthOfTextAtSize(word, size);
    if (wordWidth <= maxWidth) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) <= maxWidth) {
        line = test;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    } else {
      if (line) { lines.push(line); line = ""; }
      let remaining = word;
      while (remaining.length) {
        let i = 1;
        while (i <= remaining.length && font.widthOfTextAtSize(remaining.slice(0, i), size) <= maxWidth) i++;
        i = Math.max(1, Math.min(i - 1, remaining.length));
        lines.push(remaining.slice(0, i));
        remaining = remaining.slice(i);
      }
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
  for (const l of lines) {
    page.drawText(l, { x, y, size, font, color });
    y -= lineHeight;
  }
  return yTop - lines.length * lineHeight;
}

function measureHeight(text: string, font: any, size: number, maxWidth: number, lineHeight: number): number {
  return wrapText(text, font, size, maxWidth).length * lineHeight;
}

function dateLabel(dateStr?: string | Date | null): string {
  if (!dateStr) return "—";
  const d = new Date(String(dateStr));
  if (isNaN(d.getTime())) return String(dateStr);
  const parts = new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).formatToParts(d);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("day")}-${value("month")}-${value("year")} ${value("hour")}:${value("minute")} ${value("dayPeriod").toUpperCase()}`;
}

function ageGenderText(patient: LabReportPdfPatient): string {
  const age = resolveAge(patient, new Date());
  const gender = patient.gender
    ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1).toLowerCase()
    : "—";
  return `${age?.years && age.years > 0 ? `${age.years}Yrs.-` : "—"} / ${gender}`;
}

function flagPrefix(flag?: LabResultFlag): string {
  if (flag === "critical_low") return "LL ";
  if (flag === "critical_high") return "HH ";
  if (flag === "low") return "L ";
  if (flag === "high") return "H ";
  return "";
}

function reportReferenceRange(range: ReturnType<typeof getApplicableRange>): string {
  if (!range) return "—";
  if (range.low != null && range.high != null) return `${range.low} – ${range.high}`;
  if (range.low != null) return `≥ ${range.low}`;
  if (range.high != null) return `≤ ${range.high}`;
  return range.displayLabel?.trim() || "—";
}

// ---------------------------------------------------------------------------
// Native header drawing — draws hospital header on every page
// ---------------------------------------------------------------------------

function drawHeader(
  p: PDFPage,
  fonts: { normal: any; bold: any },
  branchName?: string,
  isPataudi: boolean = false,
): number {
  const rightX = PAGE_WIDTH - MARGIN_RIGHT;
  const usableWidth = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
  let y = PAGE_HEIGHT - MARGIN_TOP;

  if (isPataudi) {
    // Hospital name — centered, bold, 16px
    const hospitalName = "GLOBAL HOSPITAL & TRAUMA CENTRE";
    const nameSize = 16;
    const nameW = fonts.bold.widthOfTextAtSize(hospitalName, nameSize);
    p.drawText(hospitalName, {
      x: MARGIN_LEFT + usableWidth / 2 - nameW / 2,
      y: y - nameSize,
      size: nameSize,
      font: fonts.bold,
      color: rgb(0.05, 0.05, 0.05),
    });
    y -= nameSize + 4;

    // Tagline / legal entity — centered, 8.5px
    const legalEntity = "A Unit of ASP Global Health & Educare Pvt. Ltd.";
    const tagW = fonts.normal.widthOfTextAtSize(legalEntity, 8.5);
    p.drawText(legalEntity, {
      x: MARGIN_LEFT + usableWidth / 2 - tagW / 2,
      y,
      size: 8.5,
      font: fonts.normal,
      color: rgb(0.38, 0.38, 0.38),
    });
    y -= 11;

    // GST — centered, 8px
    const gstLine = "GST NO. : 06AAZCA2057M1Z3";
    const gstW = fonts.normal.widthOfTextAtSize(gstLine, 8);
    p.drawText(gstLine, {
      x: MARGIN_LEFT + usableWidth / 2 - gstW / 2,
      y,
      size: 8,
      font: fonts.normal,
      color: rgb(0.38, 0.38, 0.38),
    });
    y -= 10;

    // Phone & Email — centered, 8px
    const contactLine = "Mobile No. : 0124-2672124, 9996888124 , Email-ID : globalhospitalpataudi@gmail.com";
    const cW = fonts.normal.widthOfTextAtSize(contactLine, 8);
    p.drawText(contactLine, {
      x: MARGIN_LEFT + usableWidth / 2 - cW / 2,
      y,
      size: 8,
      font: fonts.normal,
      color: rgb(0.38, 0.38, 0.38),
    });
    y -= 10;

    // Address — centered, 7.5px
    const address = "Opp. New Bus Stand, Near Civil Hospital Pataudi, Gurugram (Hr.)";
    const addrLines = wrapText(address, fonts.normal, 7.5, usableWidth);
    for (const line of addrLines) {
      const aW = fonts.normal.widthOfTextAtSize(line, 7.5);
      p.drawText(line, {
        x: MARGIN_LEFT + usableWidth / 2 - aW / 2,
        y,
        size: 7.5,
        font: fonts.normal,
        color: rgb(0.38, 0.38, 0.38),
      });
      y -= 9;
    }
  } else {
    // Hospital name — centered, bold, 16px
    const hospitalName = (branchName ?? CLINIC_BRAND.name).toUpperCase();
    const nameSize = 16;
    const nameW = fonts.bold.widthOfTextAtSize(hospitalName, nameSize);
    p.drawText(hospitalName, {
      x: MARGIN_LEFT + usableWidth / 2 - nameW / 2,
      y: y - nameSize,
      size: nameSize,
      font: fonts.bold,
      color: rgb(0.05, 0.05, 0.05),
    });
    y -= nameSize + 4;

    // Tagline / legal entity — centered, 9px
    if (CLINIC_BRAND.legalEntity) {
      const tagW = fonts.normal.widthOfTextAtSize(CLINIC_BRAND.legalEntity, 8.5);
      p.drawText(CLINIC_BRAND.legalEntity, {
        x: MARGIN_LEFT + usableWidth / 2 - tagW / 2,
        y,
        size: 8.5,
        font: fonts.normal,
        color: rgb(0.38, 0.38, 0.38),
      });
      y -= 11;
    }

    // GST + Phone line — centered, 8px
    const contactParts: string[] = [];
    if (CLINIC_BRAND.gstNumber) contactParts.push(`GST: ${CLINIC_BRAND.gstNumber}`);
    if (CLINIC_BRAND.phone) contactParts.push(`Ph: ${CLINIC_BRAND.phone}`);
    if (CLINIC_BRAND.email) contactParts.push(CLINIC_BRAND.email);
    if (contactParts.length) {
      const contactLine = contactParts.join("  |  ");
      const cW = fonts.normal.widthOfTextAtSize(contactLine, 8);
      p.drawText(contactLine, {
        x: MARGIN_LEFT + usableWidth / 2 - cW / 2,
        y,
        size: 8,
        font: fonts.normal,
        color: rgb(0.38, 0.38, 0.38),
      });
      y -= 10;
    }

    // Address — centered, 8px
    if (CLINIC_BRAND.address) {
      const addrLines = wrapText(CLINIC_BRAND.address, fonts.normal, 7.5, usableWidth);
      for (const line of addrLines) {
        const aW = fonts.normal.widthOfTextAtSize(line, 7.5);
        p.drawText(line, {
          x: MARGIN_LEFT + usableWidth / 2 - aW / 2,
          y,
          size: 7.5,
          font: fonts.normal,
          color: rgb(0.38, 0.38, 0.38),
        });
        y -= 9;
      }
    }
  }

  // Divider line under header
  y -= 4;
  p.drawLine({
    start: { x: MARGIN_LEFT, y },
    end: { x: rightX, y },
    thickness: 1,
    color: rgb(0.15, 0.15, 0.15),
  });

  return y - 8; // return Y for next content (patient info block)
}

// ---------------------------------------------------------------------------
// Main PDF builder
// ---------------------------------------------------------------------------
export async function buildLabReportPdfBytes(
  patient: LabReportPdfPatient,
  orders: LabOrder[],
  _template?: LabReportTemplateSpec,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  let embeddedTemplate: PDFEmbeddedPage | undefined;
  if (_template?.mimeType === "application/pdf" && _template.fileData) {
    const templateBytes = await loadTemplateFile(_template.fileData);
    if (templateBytes) {
      const templateDoc = await PDFDocument.load(templateBytes);
      [embeddedTemplate] = await pdfDoc.embedPdf(templateDoc, [0]);
    }
  }

  const isPataudi = orders.some((o) => o.branchId === "branch_pataudi");

  const normalFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const categoryFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

  const textPrimary = rgb(0.05, 0.05, 0.05);
  const textSecondary = rgb(0.38, 0.38, 0.38);
  const flagRed = rgb(0.78, 0.08, 0.08);
  const ruleColor = rgb(0.15, 0.15, 0.15);
  const ruleLight = rgb(0.72, 0.72, 0.72);
  const headerBg = rgb(0.93, 0.93, 0.93);

  const rightX = PAGE_WIDTH - MARGIN_RIGHT;
  const usableWidth = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

  // Results table column widths: Test Name | Result | Unit | Normal Value | Notes
  const colWidths = [usableWidth * 0.40, usableWidth * 0.12, usableWidth * 0.12, usableWidth * 0.18, usableWidth * 0.18];
  const colX = [
    MARGIN_LEFT,
    MARGIN_LEFT + colWidths[0],
    MARGIN_LEFT + colWidths[0] + colWidths[1],
    MARGIN_LEFT + colWidths[0] + colWidths[1] + colWidths[2],
    MARGIN_LEFT + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3],
  ];

  const ROW_HEIGHT = 15.5;     // compact LIS-style row height
  const ROW_FONT_SIZE = 8;
  const PATIENT_ROW_GAP = 13;
  const LABEL_WIDTH = 90;
  const HALF_W = usableWidth / 2;

  let pageIndex = 0;

  const templateTopMargin = Math.min(180, Math.max(90, _template?.marginTop ?? 120));

  function newPage(): PDFPage {
    const p = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    if (embeddedTemplate) {
      p.drawPage(embeddedTemplate, { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT });
    }
    pageIndex++;
    return p;
  }

  function startPage(p: PDFPage): number {
    return embeddedTemplate
      ? PAGE_HEIGHT - templateTopMargin
      : drawHeader(p, { normal: normalFont, bold: boldFont }, undefined, isPataudi);
  }

  function drawHRule(p: PDFPage, y: number, thick: number = 0.5, color: Color = ruleColor) {
    p.drawLine({ start: { x: MARGIN_LEFT, y }, end: { x: rightX, y }, thickness: thick, color });
  }

  function drawPatientInfoBlock(p: PDFPage, yStart: number, order: LabOrder): number {
    const leftRows: [string, string][] = [
      ["UHID No. :", patient.uhid || "\u2014"],
      ["Patient Name :", patient.name || "\u2014"],
      ["Age/Gender :", ageGenderText(patient)],
      [isPataudi ? "Mobile No :" : "Mobile No. :", patient.phone || "\u2014"],
    ];
    const rightRows: [string, string][] = [
      ["Collection Time :", order.sampleCollectedAt ? dateLabel(order.sampleCollectedAt) : "\u2014"],
      ["Receiving Time :", order.sampleCollectedAt ? dateLabel(order.sampleCollectedAt) : "\u2014"],
      ["Reporting Time :", order.completedAt ? dateLabel(order.completedAt) : "\u2014"],
      ["Sample ID :", order.id.slice(-8).toUpperCase()],
    ];

    let rowY = yStart;
    const rowCount = Math.max(leftRows.length, rightRows.length);
    for (let i = 0; i < rowCount; i++) {
      if (leftRows[i]) {
        const [lLabel, lValue] = leftRows[i];
        p.drawText(lLabel, { x: MARGIN_LEFT, y: rowY, size: 9, font: boldFont, color: textPrimary });
        p.drawText(lValue, { x: MARGIN_LEFT + LABEL_WIDTH, y: rowY, size: 9, font: isPataudi ? boldFont : normalFont, color: textPrimary });
      }
      if (rightRows[i]) {
        const [rLabel, rValue] = rightRows[i];
        p.drawText(rLabel, { x: MARGIN_LEFT + HALF_W, y: rowY, size: 9, font: boldFont, color: textPrimary });
        p.drawText(rValue, { x: MARGIN_LEFT + HALF_W + LABEL_WIDTH, y: rowY, size: 9, font: isPataudi ? boldFont : normalFont, color: textPrimary });
      }
      rowY -= PATIENT_ROW_GAP;
    }

    const ruleY = rowY - 4;
    drawHRule(p, ruleY, 0.75, ruleColor);
    return ruleY - 14;
  }

  function drawTableHeader(p: PDFPage, y: number): number {
    if (!isPataudi) {
      // Light grey background bar
      p.drawRectangle({
        x: MARGIN_LEFT,
        y: y - 13,
        width: usableWidth,
        height: 15,
        color: headerBg,
      });
    }
    drawHRule(p, y + 2, 0.75, ruleColor);
    const headerLabels = ["Test Name", "Result", "Unit", "Normal Value", "Notes"];
    for (let i = 0; i < headerLabels.length; i++) {
      const align = isPataudi ? "left" : (i === 1 || i === 3 ? "right" : i === 2 ? "center" : "left");
      const textW = boldFont.widthOfTextAtSize(headerLabels[i], 8.5);
      let drawX = colX[i] + 2;
      if (align === "right") drawX = colX[i] + colWidths[i] - textW - 4;
      else if (align === "center") drawX = colX[i] + (colWidths[i] - textW) / 2;
      p.drawText(headerLabels[i], { x: drawX, y: y - 10, size: 8.5, font: boldFont, color: textPrimary });
    }
    const afterY = y - 14;
    drawHRule(p, afterY, 0.75, ruleColor);
    return afterY - 8;
  }

  function drawPanelHeader(p: PDFPage, y: number, label: string): number {
    // Full-width top border
    drawHRule(p, y, 0.75, ruleColor);
    // Panel title — left aligned, bold
    p.drawText(label, { x: MARGIN_LEFT + 2, y: y - 12, size: 10, font: boldFont, color: textPrimary });
    // Full-width bottom border
    drawHRule(p, y - 16, 0.75, ruleColor);
    return y - 16 - 8;
  }

  function drawCategoryHeader(p: PDFPage, y: number, label: string): number {
    const fontSize = isPataudi ? 14 : 10;
    const sW = categoryFont.widthOfTextAtSize(label, fontSize);
    p.drawText(label, {
      x: MARGIN_LEFT + usableWidth / 2 - sW / 2,
      y: y - fontSize - 1,
      size: fontSize,
      font: categoryFont,
      color: textPrimary,
    });
    return y - fontSize - 8;
  }

  function drawTestRow(p: PDFPage, y: number, cells: string[], isAbnormal: boolean): number {
    const baseline = y - ROW_HEIGHT + 6;
    for (let i = 0; i < cells.length; i++) {
      const color = i === 1 && isAbnormal ? flagRed : textPrimary;
      const font = i === 1 && isAbnormal ? boldFont : normalFont;
      const align = isPataudi ? "left" : (i === 1 || i === 3 ? "right" : i === 2 ? "center" : "left");
      // Truncate text to fit column width
      let text = cells[i];
      if (isPataudi && i === 0) text = text.toUpperCase();
      const maxW = colWidths[i] - 8;
      let textW = font.widthOfTextAtSize(text, ROW_FONT_SIZE);
      if (textW > maxW) {
        // Truncate with ellipsis
        while (text.length > 1 && font.widthOfTextAtSize(text + "…", ROW_FONT_SIZE) > maxW) {
          text = text.slice(0, -1);
        }
        text += "…";
        textW = font.widthOfTextAtSize(text, ROW_FONT_SIZE);
      }
      let drawX = colX[i] + 4;
      if (align === "right") drawX = colX[i] + colWidths[i] - textW - 4;
      else if (align === "center") drawX = colX[i] + (colWidths[i] - textW) / 2;
      p.drawText(text, { x: drawX, y: baseline, size: ROW_FONT_SIZE, font, color });
    }
    return y - ROW_HEIGHT;
  }

  function drawNotes(p: PDFPage, y: number, notes: string[]): number {
    if (notes.length === 0) return y;
    y -= 4;
    for (const note of notes) {
      const lines = wrapText("• " + note, normalFont, 8, usableWidth - 8);
      for (const line of lines) {
        p.drawText(line, { x: MARGIN_LEFT + 4, y, size: 8, font: normalFont, color: textSecondary });
        y -= 11;
      }
    }
    return y - 4;
  }

  function drawFooter(p: PDFPage, y: number, doctorName: string | undefined, isLastPage: boolean) {
    // Doctor signature — bottom right
    if (doctorName) {
      const sigLine1 = `Dr. ${doctorName}`;
      const sigLine2 = "MBBS MD (PATHOLOGY)";
      const w1 = boldFont.widthOfTextAtSize(sigLine1, 9);
      const w2 = normalFont.widthOfTextAtSize(sigLine2, 8.5);
      p.drawText(sigLine1, { x: rightX - w1, y, size: 9, font: boldFont, color: textPrimary });
      p.drawText(sigLine2, { x: rightX - w2, y: y - 12, size: 8.5, font: normalFont, color: textSecondary });
    }

    // Page number — bottom left
    const pageLabel = `Page ${pageIndex}`;
    p.drawText(pageLabel, { x: MARGIN_LEFT, y: 20, size: 8, font: normalFont, color: textSecondary });

    // Timestamp — bottom right
    const tsLabel = dateLabel(new Date().toISOString());
    const tsW = normalFont.widthOfTextAtSize(tsLabel, 8);
    p.drawText(tsLabel, { x: rightX - tsW, y: 20, size: 8, font: normalFont, color: textSecondary });

    // END OF REPORT — centered, only on last page
    if (isLastPage) {
      const endLabel = "*** END OF REPORT ***";
      const endW = boldFont.widthOfTextAtSize(endLabel, 9);
      p.drawText(endLabel, {
        x: MARGIN_LEFT + usableWidth / 2 - endW / 2,
        y: y - 20,
        size: 9,
        font: boldFont,
        color: textSecondary,
      });
    }
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  if (orders.length === 0) {
    const p = newPage();
    const y = startPage(p);
    p.drawText("No laboratory orders to display.", {
      x: MARGIN_LEFT, y, size: 11, font: normalFont, color: textSecondary,
    });
    drawFooter(p, MARGIN_BOTTOM + 20, undefined, true);
    return pdfDoc.save();
  }

  let page = newPage();
  let y = startPage(page);

  for (let ordIdx = 0; ordIdx < orders.length; ordIdx++) {
    const ord = orders[ordIdx];
    const isLastOrder = ordIdx === orders.length - 1;

    // Patient info block
    y = drawPatientInfoBlock(page, y, ord);

    // Table header
    y = drawTableHeader(page, y);

    // ------------------------------------------------------------------
    // Render items — structured as Category > Panel > Rows > Notes
    // ------------------------------------------------------------------
    let lastSection = "";
    for (const item of ord.items) {
      const catalog = item.reportCatalog;
      const fields = catalog?.fields.filter((f) => f.isVisible) ?? [];

      // Category header (e.g. "Biochemistry", "Hematology")
      const section = fields.find((f) => f.section?.trim())?.section?.trim() ?? "";
      if (section && section !== lastSection) {
        if (y - 28 < MARGIN_BOTTOM + 40) {
          drawFooter(page, MARGIN_BOTTOM + 20, ord.orderedByName, false);
          page = newPage();
          y = startPage(page);
          y = drawTableHeader(page, y);
        }
        y = drawCategoryHeader(page, y, section);
        lastSection = section;
      }

      // Panel header with full-width borders (e.g. "LFT - Liver Function Test")
      if (item.label) {
        if (y - 24 < MARGIN_BOTTOM + 40) {
          drawFooter(page, MARGIN_BOTTOM + 20, ord.orderedByName, false);
          page = newPage();
          y = startPage(page);
          y = drawTableHeader(page, y);
        }
        y = drawPanelHeader(page, y, item.label);
      }

      if (fields.length === 0) {
        page.drawText("No visible fields.", { x: MARGIN_LEFT, y, size: 9, font: normalFont, color: textSecondary });
        y -= ROW_HEIGHT;
        continue;
      }

      // Collect notes for this panel (critical ranges, qualifiers, footer notes)
      const panelNotes: string[] = [];

      // Field rows — fixed height, single line, truncated
      for (const field of fields) {
        if (!field.fieldMaster) continue;
        const recordedAt = new Date();
        const result = item.results.find((r) => r.fieldMasterId === field.fieldMasterId);
        const value = result?.value ?? "";
        let flag = result?.flag;
        if (!flag && value) {
          flag = evaluateLabResultFlag(
            field.fieldMaster,
            value,
            { gender: patient.gender, dateOfBirth: patient.dateOfBirth, age: patient.age, sampleType: item.sampleType, pregnancy: ord.pregnancy },
            recordedAt,
          );
        }

        const range = getApplicableRange(
          field.fieldMaster,
          { gender: patient.gender, dateOfBirth: patient.dateOfBirth, age: patient.age, pregnancy: ord.pregnancy },
          result ? new Date(result.recordedAt) : recordedAt,
          item.sampleType,
        );

        const isAbnormal = Boolean(flag && flag !== "normal");
        const resultText = `${flagPrefix(flag)}${value || "\u2014"}`;
        // Keep the normal-value column limited to the ordinary reference range.
        const refText = reportReferenceRange(range);

        const rowCells = [field.fieldMaster.name, resultText, field.fieldMaster.unit || "\u2014", refText, result?.note ?? ""];

        // Check page break before each row
        if (y - ROW_HEIGHT < MARGIN_BOTTOM + 40) {
          // Draw notes before page break
          if (panelNotes.length > 0) {
            y = drawNotes(page, y, panelNotes);
            panelNotes.length = 0;
          }
          drawFooter(page, MARGIN_BOTTOM + 20, ord.orderedByName, false);
          page = newPage();
          y = startPage(page);
          y = drawTableHeader(page, y);
        }

        y = drawTestRow(page, y, rowCells, isAbnormal);
      }

      // Catalog footer note -> add to panel notes
      if (catalog?.footerNote?.trim()) {
        panelNotes.push(catalog.footerNote.trim());
      }

      // Render notes below the panel table
      if (panelNotes.length > 0) {
        if (y - panelNotes.length * 12 - 8 < MARGIN_BOTTOM + 40) {
          drawFooter(page, MARGIN_BOTTOM + 20, ord.orderedByName, false);
          page = newPage();
          y = startPage(page);
        }
        y = drawNotes(page, y, panelNotes);
      }

      y -= 8;
    }

    // Cancel reason
    if (ord.cancelReason) {
      page.drawText(`Cancellation reason: ${ord.cancelReason}`, {
        x: MARGIN_LEFT, y, size: 9, font: normalFont, color: flagRed,
      });
      y -= 16;
    }

    // Ensure space for footer
    if (y < MARGIN_BOTTOM + 60) {
      drawFooter(page, MARGIN_BOTTOM + 20, ord.orderedByName, false);
      page = newPage();
      y = startPage(page);
    }

    y -= 12;

    // Doctor signature + END OF REPORT on last page of last order
    drawFooter(page, y, ord.orderedByName, isLastOrder);
    y -= 30;

    // Start next order on a new page
    if (!isLastOrder) {
      page = newPage();
      y = startPage(page);
    }
  }

  return pdfDoc.save();
}

export async function buildCombinedLabReportPdfBytes(
  patient: LabReportPdfPatient,
  orders: LabOrder[],
  template?: LabReportTemplateSpec,
): Promise<Uint8Array> {
  const reportOrders = orders.filter((o) => o.status !== "cancelled");
  return buildLabReportPdfBytes(patient, reportOrders, template);
}

export function bytesToDataUrl(bytes: Uint8Array, filename = "lab-report.pdf"): string {
  const base64 = Buffer.from(bytes).toString("base64");
  return `data:application/pdf;base64,${base64}`;
}
