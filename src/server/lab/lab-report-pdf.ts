import zlib from "node:zlib";
import { PDFDocument, PDFPage, StandardFonts, rgb, type Color } from "pdf-lib";
import {
  type LabDataType,
  type LabFieldMaster,
  type LabOrder,
  type LabResultFlag,
  type LabTemplateOverlayField,
} from "@/design-system/lab-data";
import { CLINIC_BRAND } from "@/design-system/document-templates";
import { loadTemplateFile } from "@/lib/pdf-template-loader";
import {
  resolveAge,
  getApplicableRange,
  formatReferenceRange,
  formatAge,
  parseNumber,
} from "@/lib/lab-ranges";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_LEFT = 40;
const MARGIN_RIGHT = 40;
const MARGIN_BOTTOM = 60;
const FULL_WIDTH_LINE_MIN_RATIO = 0.75;
const LINE_MAX_HEIGHT = 8;
const HEADER_CLUSTER_GAP = 30;

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
  return isNaN(d.getTime()) ? String(dateStr) : d.toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Kolkata" });
}

function ageGenderText(patient: LabReportPdfPatient): string {
  const age = resolveAge(patient, new Date());
  const gender = patient.gender
    ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1).toLowerCase()
    : "—";
  return `${formatAge(age)} / ${gender}`;
}

function flagPrefix(flag?: LabResultFlag): string {
  if (flag === "critical_low") return "LL ";
  if (flag === "critical_high") return "HH ";
  if (flag === "low") return "L ";
  if (flag === "high") return "H ";
  return "";
}

// ---------------------------------------------------------------------------
// CTM / template height helpers (unchanged from original)
// ---------------------------------------------------------------------------

type CTM = [number, number, number, number, number, number];

function cleanContentStream(input: string): string {
  let out = "";
  let i = 0;
  const n = input.length;
  while (i < n) {
    const c = input[i];
    if (c === "(") {
      let depth = 1;
      i++;
      while (i < n && depth > 0) {
        const ch = input[i];
        if (ch === "\\") { i += 2; continue; }
        if (ch === "(") depth++;
        if (ch === ")") depth--;
        i++;
      }
      continue;
    }
    if (c === "<") {
      if (input[i + 1] === "<") {
        let depth = 1; i += 2;
        while (i < n && depth > 0) {
          if (i + 1 < n && input[i] === "<" && input[i + 1] === "<") { depth++; i += 2; }
          else if (i + 1 < n && input[i] === ">" && input[i + 1] === ">") { depth--; i += 2; }
          else i++;
        }
      } else {
        while (i < n && input[i] !== ">") i++;
        i++;
      }
      continue;
    }
    if (c === "[") {
      let depth = 1; i++;
      while (i < n && depth > 0) {
        if (input[i] === "(") {
          let pDepth = 1; i++;
          while (i < n && pDepth > 0) {
            const ch = input[i];
            if (ch === "\\") { i += 2; continue; }
            if (ch === "(") pDepth++;
            if (ch === ")") pDepth--;
            i++;
          }
          continue;
        }
        if (input[i] === "[") depth++;
        if (input[i] === "]") depth--;
        i++;
      }
      continue;
    }
    if (c === "%") { while (i < n && input[i] !== "\n" && input[i] !== "\r") i++; continue; }
    out += c;
    i++;
  }
  return out;
}

function multiplyCTM(m1: CTM, m2: CTM): CTM {
  return [
    m1[0] * m2[0] + m1[1] * m2[2],
    m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2],
    m1[2] * m2[1] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[1] * m2[5] + m1[4],
    m1[2] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function transformX(ctm: CTM, x: number, y: number) { return ctm[0] * x + ctm[1] * y + ctm[4]; }
function transformY(ctm: CTM, x: number, y: number) { return ctm[2] * x + ctm[3] * y + ctm[5]; }

async function computeTemplateHeaderHeight(templateBytes: Uint8Array): Promise<number | undefined> {
  let sourceDoc;
  try { sourceDoc = await PDFDocument.load(templateBytes); } catch { return undefined; }
  const sourcePage = sourceDoc.getPage(0);
  const pageH = sourcePage.getHeight();
  const pageW = sourcePage.getWidth();

  const contents = (sourcePage as any).node.Contents();
  if (!contents) return undefined;
  const refs = (contents as any).asArray ? (contents as any).asArray() : [contents];

  const allTokens: string[] = [];
  for (const ref of refs) {
    const obj = sourceDoc.context.lookup(ref) as any;
    if (!obj?.getContents) continue;
    const raw = obj.getContents() as Uint8Array;
    let de = "";
    try { de = zlib.inflateSync(raw).toString("latin1"); } catch { de = Buffer.from(raw).toString("latin1"); }
    const cleaned = cleanContentStream(de);
    allTokens.push(...cleaned.split(/\s+/).filter(Boolean));
  }

  const ctmStack: CTM[] = [];
  let ctm: CTM = [1, 0, 0, 1, 0, 0];
  const fullWidthLines: { minTop: number; maxTop: number }[] = [];
  const paintOps = new Set(["f", "F", "s", "S", "b", "B", "f*", "B*", "b*"]);

  for (let i = 0; i < allTokens.length; i++) {
    const t = allTokens[i];
    if (t === "q") { ctmStack.push(ctm); continue; }
    if (t === "Q") { ctm = ctmStack.pop() ?? ctm; continue; }
    if (t === "cm" && i >= 6) {
      const [a, b, c, d, e, f] = allTokens.slice(i - 6, i).map(Number);
      if (!Number.isNaN(a + b + c + d + e + f)) ctm = multiplyCTM(ctm, [a, b, c, d, e, f]);
      continue;
    }
    if (t === "re" && i >= 4) {
      const [x, y, w, h] = allTokens.slice(i - 4, i).map(Number);
      if (!Number.isNaN(x + y + w + h)) {
        const paint = allTokens[i + 1];
        if (paintOps.has(paint)) {
          const ys = [transformY(ctm, x, y), transformY(ctm, x + w, y), transformY(ctm, x, y + h), transformY(ctm, x + w, y + h)];
          const xs = [transformX(ctm, x, y), transformX(ctm, x + w, y), transformX(ctm, x, y + h), transformX(ctm, x + w, y + h)];
          const minPageY = Math.min(...ys); const maxTop = pageH - minPageY;
          const maxPageY = Math.max(...ys); const minTop = pageH - maxPageY;
          const width = Math.max(...xs) - Math.min(...xs);
          const height = maxTop - minTop;
          if (width >= pageW * FULL_WIDTH_LINE_MIN_RATIO && height < LINE_MAX_HEIGHT) fullWidthLines.push({ minTop, maxTop });
        }
      }
      continue;
    }
  }

  if (fullWidthLines.length === 0) return undefined;
  fullWidthLines.sort((a, b) => a.minTop - b.minTop);
  let headerBottom = fullWidthLines[0].maxTop;
  for (let k = 1; k < fullWidthLines.length; k++) {
    if (fullWidthLines[k].minTop - fullWidthLines[k - 1].minTop > HEADER_CLUSTER_GAP) break;
    headerBottom = Math.max(headerBottom, fullWidthLines[k].maxTop);
  }
  return (headerBottom / pageH) * PAGE_HEIGHT;
}

// ---------------------------------------------------------------------------
// Overlay fields (kept for compatibility when template specifies overlayFields)
// ---------------------------------------------------------------------------

type OverlayFontMap = { normal: any; bold: any; italic: any; boldItalic: any };

function overlayFont(field: LabTemplateOverlayField, fonts: OverlayFontMap) {
  if (field.fontStyle === "bold-italic") return fonts.boldItalic;
  if (field.fontStyle === "italic") return fonts.italic;
  if (field.fontStyle === "bold") return fonts.bold;
  return fonts.normal;
}

function hexToRgb(hex: string | undefined): Color | undefined {
  if (!hex) return undefined;
  const sanitized = hex.replace("#", "");
  if (sanitized.length !== 3 && sanitized.length !== 6) return undefined;
  const full = sanitized.length === 3 ? sanitized.split("").map((c) => c + c).join("") : sanitized;
  const int = Number.parseInt(full, 16);
  if (Number.isNaN(int)) return undefined;
  return rgb(((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255);
}

function overlayFieldValue(field: LabTemplateOverlayField, patient: LabReportPdfPatient, order?: LabOrder): string {
  const value = (() => {
    switch (field.key) {
      case "hospitalName": return CLINIC_BRAND.name;
      case "hospitalAddress": return CLINIC_BRAND.address;
      case "hospitalPhone": return CLINIC_BRAND.phone;
      case "hospitalEmail": return CLINIC_BRAND.email;
      case "patientName": return patient.name;
      case "uhid": case "uhidNo": return patient.uhid;
      case "phone": case "mobileNo": return patient.phone ?? "";
      case "bloodGroup": return patient.bloodGroup ?? "";
      case "ageGender": return ageGenderText(patient);
      case "collectionTime": return order?.sampleCollectedAt ? dateLabel(order.sampleCollectedAt) : "";
      case "receivingTime": return order?.sampleCollectedAt ? dateLabel(order.sampleCollectedAt) : "";
      case "reportingTime": return order?.completedAt ? dateLabel(order.completedAt) : dateLabel(new Date().toISOString());
      case "sampleId": case "orderId": return order?.id ?? "";
      case "doctorName": return order?.orderedByName ?? "";
      case "generatedOn": return dateLabel(new Date().toISOString());
      case "sampleType": return order?.items.map((i) => i.sampleType).filter(Boolean).join(", ") ?? "";
      case "orderDate": return order?.orderedAt ? dateLabel(order.orderedAt) : "";
      default: return "";
    }
  })();
  if (!field.label) return value;
  return value ? `${field.label}: ${value}` : field.label;
}

function drawOverlayFields(page: PDFPage, fields: LabTemplateOverlayField[], patient: LabReportPdfPatient, order: LabOrder | undefined, fonts: OverlayFontMap) {
  const sorted = [...fields].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  for (const field of sorted) {
    const text = overlayFieldValue(field, patient, order);
    if (!text && field.key !== "ageGender") continue;
    const font = overlayFont(field, fonts);
    const fontSize = field.fontSize ?? 9;
    const color = hexToRgb(field.color) ?? rgb(0.1, 0.1, 0.1);
    const x = (field.x / 100) * PAGE_WIDTH;
    const yTop = PAGE_HEIGHT - (field.y / 100) * PAGE_HEIGHT;
    const maxWidth = Math.max(20, (field.width / 100) * PAGE_WIDTH);
    const lineHeight = fontSize * 1.2;
    if (field.wrap) { drawWrapped(page, text, x, yTop - fontSize * 0.2, maxWidth, fontSize, font, lineHeight, color); continue; }
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    let drawX = x;
    if (field.align === "center") drawX = x + maxWidth / 2 - textWidth / 2;
    if (field.align === "right") drawX = x + maxWidth - textWidth;
    if (textWidth > maxWidth) drawWrapped(page, text, x, yTop - fontSize * 0.2, maxWidth, fontSize, font, lineHeight, color);
    else page.drawText(text, { x: Math.max(0, drawX), y: yTop - fontSize * 0.2, size: fontSize, font, color });
  }
}

// ---------------------------------------------------------------------------
// Main PDF builder
// ---------------------------------------------------------------------------

export async function buildLabReportPdfBytes(
  patient: LabReportPdfPatient,
  orders: LabOrder[],
  template?: LabReportTemplateSpec,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const normalFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const boldItalicFont = await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique);
  const overlayFonts: OverlayFontMap = { normal: normalFont, bold: boldFont, italic: italicFont, boldItalic: boldItalicFont };

  const textPrimary = rgb(0.05, 0.05, 0.05);
  const textSecondary = rgb(0.38, 0.38, 0.38);
  const flagRed = rgb(0.78, 0.08, 0.08);
  const ruleColor = rgb(0.18, 0.18, 0.18);
  const ruleLight = rgb(0.75, 0.75, 0.75);

  // ------------------------------------------------------------------
  // Load template background
  // ------------------------------------------------------------------
  let embeddedTemplate: any = undefined;
  let embeddedImage: any = undefined;
  let detectedHeaderHeight: number | undefined;
  let hasOverlayPatientInfo = false;

  // Default template path: use /templates/60984.pdf if no template provided
  const effectiveFileData = template?.fileData ?? "/templates/60984.pdf";
  const effectiveMimeType = template?.mimeType ?? "application/pdf";

  const bytes = await loadTemplateFile(effectiveFileData).catch(() => undefined);
  if (bytes) {
    const mime = effectiveMimeType.toLowerCase();
    if (mime === "application/pdf") {
      detectedHeaderHeight = await computeTemplateHeaderHeight(bytes);
      const [first] = await pdfDoc.embedPdf(bytes, [0]);
      embeddedTemplate = first;
    } else if (mime === "image/png") {
      embeddedImage = await pdfDoc.embedPng(bytes);
    } else if (mime === "image/jpeg" || mime === "image/jpg") {
      embeddedImage = await pdfDoc.embedJpg(bytes);
    }
  }

  if (template?.overlayFields?.length) {
    hasOverlayPatientInfo = template.overlayFields.some((f) => f.key === "patientName");
  }

  // ------------------------------------------------------------------
  // Compute margins matching the Kamlesh layout
  // 60984.pdf header ends around 100pt from top; add a small gap then
  // draw the patient info block starting right below.
  // ------------------------------------------------------------------
  const marginLeft = template?.marginLeft ?? MARGIN_LEFT;
  const marginRight = template?.marginRight ?? MARGIN_RIGHT;
  const marginBottom = template?.marginBottom ?? MARGIN_BOTTOM;

  // Header height: auto-detected or fallback to 100pt (fits 60984.pdf header)
  const headerHeightPt = detectedHeaderHeight ?? template?.marginTop ?? 100;
  // Content starts just below the header rule
  const HEADER_GAP = 10; // pt gap between header bottom rule and patient info block
  const contentTop = PAGE_HEIGHT - headerHeightPt - HEADER_GAP;

  const usableWidth = PAGE_WIDTH - marginLeft - marginRight;
  const rightX = PAGE_WIDTH - marginRight;

  // ------------------------------------------------------------------
  // newPage helper — draws template background + optional overlay fields
  // ------------------------------------------------------------------
  function newPage(orderForOverlay?: LabOrder): PDFPage {
    const p = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    if (embeddedTemplate) p.drawPage(embeddedTemplate, { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT });
    if (embeddedImage) p.drawImage(embeddedImage, { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT });
    if (template?.overlayFields?.length) drawOverlayFields(p, template.overlayFields, patient, orderForOverlay, overlayFonts);
    return p;
  }

  if (orders.length === 0) {
    const p = newPage();
    p.drawText("No laboratory orders to display.", { x: marginLeft, y: contentTop, size: 11, font: normalFont, color: textSecondary });
    return pdfDoc.save();
  }

  // ------------------------------------------------------------------
  // Layout constants — matching Kamlesh PDF exactly
  // ------------------------------------------------------------------
  const LINE_HEIGHT = 12;
  const ROW_PADDING = 4;

  // Patient info block: two-column grid
  const PATIENT_ROW_GAP = 14;   // vertical gap between patient info rows
  const LABEL_WIDTH = 88;        // width reserved for bold label text
  const HALF_W = usableWidth / 2;

  // Results table column widths  (Test Name | Result | Unit | Normal Value)
  const colWidths = [usableWidth * 0.42, usableWidth * 0.20, usableWidth * 0.15, usableWidth * 0.23];
  const colX = [
    marginLeft,
    marginLeft + colWidths[0],
    marginLeft + colWidths[0] + colWidths[1],
    marginLeft + colWidths[0] + colWidths[1] + colWidths[2],
  ];

  // ------------------------------------------------------------------
  // drawHRule — full-width horizontal line
  // ------------------------------------------------------------------
  function drawHRule(p: PDFPage, y: number, thick: number = 0.5, color: Color = ruleColor) {
    p.drawLine({ start: { x: marginLeft, y }, end: { x: rightX, y }, thickness: thick, color });
  }

  // ------------------------------------------------------------------
  // drawPatientInfoBlock — 2-col grid matching Kamlesh header table
  // Returns Y position after the block (including bottom rule)
  // ------------------------------------------------------------------
  function drawPatientInfoBlock(p: PDFPage, yStart: number, order: LabOrder): number {
    const leftRows: [string, string][] = [
      ["UHID No. :", patient.uhid || "—"],
      ["Patient Name :", patient.name || "—"],
      ["Age/Gender :", ageGenderText(patient)],
      ["Mobile No :", patient.phone || "—"],
    ];
    const rightRows: [string, string][] = [
      ["Collection Time :", order.sampleCollectedAt ? dateLabel(order.sampleCollectedAt) : "—"],
      ["Receiving Time :", order.sampleCollectedAt ? dateLabel(order.sampleCollectedAt) : "—"],
      ["Reporting Time :", order.completedAt ? dateLabel(order.completedAt) : dateLabel(new Date().toISOString())],
      ["Sample ID :", order.id.slice(-8).toUpperCase()],
    ];

    let rowY = yStart;
    const rowCount = Math.max(leftRows.length, rightRows.length);
    for (let i = 0; i < rowCount; i++) {
      if (leftRows[i]) {
        const [lLabel, lValue] = leftRows[i];
        p.drawText(lLabel, { x: marginLeft, y: rowY, size: 9, font: boldFont, color: textPrimary });
        p.drawText(lValue, { x: marginLeft + LABEL_WIDTH, y: rowY, size: 9, font: normalFont, color: textPrimary });
      }
      if (rightRows[i]) {
        const [rLabel, rValue] = rightRows[i];
        p.drawText(rLabel, { x: marginLeft + HALF_W, y: rowY, size: 9, font: boldFont, color: textPrimary });
        p.drawText(rValue, { x: marginLeft + HALF_W + LABEL_WIDTH, y: rowY, size: 9, font: normalFont, color: textPrimary });
      }
      rowY -= PATIENT_ROW_GAP;
    }

    // Bottom rule under patient info
    const ruleY = rowY - 4;
    drawHRule(p, ruleY, 0.75, ruleColor);
    return ruleY - 14; // return Y for next content
  }

  // ------------------------------------------------------------------
  // drawTableHeader — "Test Name | Result | Unit | Normal Value" header row
  // ------------------------------------------------------------------
  function drawTableHeader(p: PDFPage, y: number): number {
    drawHRule(p, y + 2, 0.75, ruleColor);
    const headerLabels = ["Test Name", "Result", "Unit", "Normal Value"];
    for (let i = 0; i < headerLabels.length; i++) {
      p.drawText(headerLabels[i], { x: colX[i], y: y - 10, size: 9.5, font: boldFont, color: textPrimary });
    }
    const afterY = y - 14;
    drawHRule(p, afterY, 0.75, ruleColor);
    return afterY - 12;
  }

  // ------------------------------------------------------------------
  // drawDoctorSignature — "Dr. MAHAK SHARMA / MBBS MD (PATHOLOGY)"
  // at bottom-right, above END OF REPORT
  // ------------------------------------------------------------------
  function drawDoctorSignature(p: PDFPage, y: number, doctorName?: string): number {
    const name = doctorName ?? order?.orderedByName ?? "";
    if (!name) return y;
    // Draw the name right-aligned
    const sigLine1 = `Dr. ${name}`;
    const sigLine2 = "MBBS MD (PATHOLOGY)";
    const w1 = boldFont.widthOfTextAtSize(sigLine1, 9);
    const w2 = normalFont.widthOfTextAtSize(sigLine2, 8.5);
    p.drawText(sigLine1, { x: rightX - w1, y, size: 9, font: boldFont, color: textPrimary });
    p.drawText(sigLine2, { x: rightX - w2, y: y - 12, size: 8.5, font: normalFont, color: textSecondary });
    return y - 26;
  }

  // ------------------------------------------------------------------
  // Main rendering loop
  // ------------------------------------------------------------------
  let order = orders[0]; // used by closures
  let page = newPage(order);
  let y = contentTop;

  for (const ord of orders) {
    order = ord; // update closure variable

    if (y < marginBottom + 160) {
      page = newPage(ord);
      y = contentTop;
    }

    // Patient info block (skip if overlay template already draws patient info)
    if (!hasOverlayPatientInfo) {
      y = drawPatientInfoBlock(page, y, ord);
    }

    // Table header
    y = drawTableHeader(page, y);

    // ------------------------------------------------------------------
    // Render items
    // ------------------------------------------------------------------
    let lastSection = "";
    for (const item of ord.items) {
      const catalog = item.reportCatalog;
      const fields = catalog?.fields.filter((f) => f.isVisible) ?? [];

      // Section header (e.g. "Biochemistry", "Hematology")
      const section = fields.find((f) => f.section?.trim())?.section?.trim() ?? "";
      if (section && section !== lastSection) {
        if (y - 22 < marginBottom) {
          page = newPage(ord);
          y = contentTop;
          y = drawTableHeader(page, y);
        }
        // Full-width divider line before section
        drawHRule(page, y + 2, 0.4, ruleLight);
        const sW = boldFont.widthOfTextAtSize(section, 10);
        page.drawText(section, { x: marginLeft + usableWidth / 2 - sW / 2, y: y - 10, size: 10, font: boldFont, color: textPrimary });
        y -= 22;
        lastSection = section;
      }

      // Item (catalog) label row — e.g. "LFT- Liver Function Test"
      if (item.label) {
        if (y - 16 < marginBottom) {
          page = newPage(ord);
          y = contentTop;
          y = drawTableHeader(page, y);
        }
        page.drawText(item.label + (item.sampleType ? ` · ${item.sampleType}` : ""), {
          x: marginLeft, y, size: 9.5, font: boldFont, color: textPrimary,
        });
        y -= 16;
      }

      if (fields.length === 0) {
        page.drawText("No visible fields.", { x: marginLeft, y, size: 9, font: normalFont, color: textSecondary });
        y -= LINE_HEIGHT;
        continue;
      }

      // ------------------------------------------------------------------
      // Field rows
      // ------------------------------------------------------------------
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
        const resultText = `${flagPrefix(flag)}${value || "—"}`;
        const refText = formatReferenceRange(range, field.fieldMaster.unit, true);

        const rowCells = [field.fieldMaster.name, resultText, field.fieldMaster.unit || "—", refText];
        const cellHeights = rowCells.map((cell, idx) =>
          measureHeight(cell, idx === 1 && isAbnormal ? boldFont : normalFont, 9, colWidths[idx] - 6, LINE_HEIGHT),
        );
        const rowHeight = Math.max(...cellHeights, LINE_HEIGHT) + ROW_PADDING;

        if (y - rowHeight < marginBottom) {
          page = newPage(ord);
          y = contentTop;
          y = drawTableHeader(page, y);
        }

        const baseline = y - LINE_HEIGHT + 2;
        for (let i = 0; i < rowCells.length; i++) {
          const color = i === 1 && isAbnormal ? flagRed : textPrimary;
          const font = i === 1 && isAbnormal ? boldFont : normalFont;
          drawWrapped(page, rowCells[i], colX[i], baseline, colWidths[i] - 6, 9, font, LINE_HEIGHT, color);
        }
        y -= rowHeight;
      }

      // Catalog footer note
      if (catalog?.footerNote?.trim()) {
        const fh = measureHeight(catalog.footerNote, normalFont, 7.5, usableWidth, 10) + 6;
        if (y - fh < marginBottom) {
          page = newPage(ord);
          y = contentTop;
        }
        y = drawWrapped(page, catalog.footerNote, marginLeft, y, usableWidth, 7.5, normalFont, 10, textSecondary);
        y -= 6;
      }

      y -= 6;
    }

    // Cancel reason
    if (ord.cancelReason) {
      page.drawText(`Cancellation reason: ${ord.cancelReason}`, { x: marginLeft, y, size: 9, font: normalFont, color: flagRed });
      y -= 16;
    }

    // Ensure there's space for signature + END OF REPORT
    if (y < marginBottom + 50) {
      page = newPage(ord);
      y = contentTop;
    }

    y -= 8;

    // Doctor signature (right-aligned)
    if (ord.orderedByName) {
      const sigLine1 = `Dr. ${ord.orderedByName}`;
      const sigLine2 = "MBBS MD (PATHOLOGY)";
      const w1 = boldFont.widthOfTextAtSize(sigLine1, 9);
      const w2 = normalFont.widthOfTextAtSize(sigLine2, 8.5);
      page.drawText(sigLine1, { x: rightX - w1, y, size: 9, font: boldFont, color: textPrimary });
      page.drawText(sigLine2, { x: rightX - w2, y: y - 13, size: 8.5, font: normalFont, color: textSecondary });
      y -= 28;
    }

    // END OF REPORT — centered bold
    const endLabel = "**END OF REPORT**";
    const endW = boldFont.widthOfTextAtSize(endLabel, 9);
    page.drawText(endLabel, { x: marginLeft + usableWidth / 2 - endW / 2, y, size: 9, font: boldFont, color: textSecondary });
    y -= 28;
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
