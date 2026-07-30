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
const MARGIN = 50;
const HEADER_BODY_PADDING = 16;
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
      // Long word: flush the current line, then break the word into character chunks.
      if (line) {
        lines.push(line);
        line = "";
      }
      let remaining = word;
      while (remaining.length) {
        let i = 1;
        while (i <= remaining.length && font.widthOfTextAtSize(remaining.slice(0, i), size) <= maxWidth) {
          i++;
        }
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

function hexToRgb(hex: string | undefined): Color | undefined {
  if (!hex) return undefined;
  const sanitized = hex.replace("#", "");
  if (sanitized.length !== 3 && sanitized.length !== 6) return undefined;
  const full = sanitized.length === 3 ? sanitized.split("").map((c) => c + c).join("") : sanitized;
  const int = Number.parseInt(full, 16);
  if (Number.isNaN(int)) return undefined;
  return rgb(((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255);
}

type OverlayFontMap = {
  normal: any;
  bold: any;
  italic: any;
  boldItalic: any;
};

function overlayFont(field: LabTemplateOverlayField, fonts: OverlayFontMap) {
  if (field.fontStyle === "bold-italic") return fonts.boldItalic;
  if (field.fontStyle === "italic") return fonts.italic;
  if (field.fontStyle === "bold") return fonts.bold;
  return fonts.normal;
}

function overlayFieldValue(
  field: LabTemplateOverlayField,
  patient: LabReportPdfPatient,
  order?: LabOrder,
): string {
  const value = (() => {
    switch (field.key) {
      case "hospitalName":
        return CLINIC_BRAND.name;
      case "hospitalAddress":
        return CLINIC_BRAND.address;
      case "hospitalPhone":
        return CLINIC_BRAND.phone;
      case "hospitalEmail":
        return CLINIC_BRAND.email;
      case "hospitalGst":
        return CLINIC_BRAND.gstNumber ? `GST: ${CLINIC_BRAND.gstNumber}` : "";
      case "patientName":
        return patient.name;
      case "uhid":
      case "uhidNo":
        return patient.uhid;
      case "phone":
      case "mobileNo":
        return patient.phone ?? "";
      case "bloodGroup":
        return patient.bloodGroup ?? "";
      case "ageGender": {
        const age = resolveAge(patient, new Date());
        const gender = patient.gender?.toUpperCase() ?? "—";
        const pregnant = patient.gender?.toLowerCase() === "female" && order?.pregnancy ? " (Pregnant)" : "";
        return `${formatAge(age)} / ${gender}${pregnant}`;
      }
      case "collectionTime":
        return order?.sampleCollectedAt ? dateLabel(order.sampleCollectedAt) : "";
      case "receivingTime":
        return order?.sampleCollectedAt ? dateLabel(order.sampleCollectedAt) : "";
      case "reportingTime":
        return order?.completedAt ? dateLabel(order.completedAt) : dateLabel(new Date().toISOString());
      case "sampleId":
      case "orderId":
        return order?.id ?? "";
      case "doctorName":
        return order?.orderedByName ?? "";
      case "generatedOn":
        return dateLabel(new Date().toISOString());
      case "sampleType":
        return order?.items.map((i) => i.sampleType).filter(Boolean).join(", ") ?? "";
      case "pregnancy":
        return order?.pregnancy ? "Pregnant" : "";
      case "orderDate":
        return order?.orderedAt ? dateLabel(order.orderedAt) : "";
      case "dateOfBirth":
        return patient.dateOfBirth ? dateLabel(String(patient.dateOfBirth)) : "";
      case "branchName":
        return CLINIC_BRAND.name;
      case "branchAddress":
        return CLINIC_BRAND.address;
      case "branchPhone":
        return CLINIC_BRAND.phone;
      case "orderedBy":
        return order?.orderedByName ?? "";
      default:
        return "";
    }
  })();
  if (!field.label) return value;
  return value ? `${field.label}: ${value}` : field.label;
}

function drawOverlayFields(
  page: PDFPage,
  fields: LabTemplateOverlayField[],
  patient: LabReportPdfPatient,
  order: LabOrder | undefined,
  fonts: OverlayFontMap,
) {
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

    if (field.wrap) {
      drawWrapped(page, text, x, yTop - fontSize * 0.2, maxWidth, fontSize, font, lineHeight, color);
      continue;
    }

    const textWidth = font.widthOfTextAtSize(text, fontSize);
    let drawX = x;
    if (field.align === "center") drawX = x + maxWidth / 2 - textWidth / 2;
    if (field.align === "right") drawX = x + maxWidth - textWidth;
    if (textWidth > maxWidth) {
      drawWrapped(page, text, x, yTop - fontSize * 0.2, maxWidth, fontSize, font, lineHeight, color);
    } else {
      page.drawText(text, { x: Math.max(0, drawX), y: yTop - fontSize * 0.2, size: fontSize, font, color });
    }
  }
}

function dateLabel(dateStr?: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? String(dateStr) : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

type CTM = [number, number, number, number, number, number];

function cleanContentStream(input: string): string {
  let out = "";
  let i = 0;
  const n = input.length;
  while (i < n) {
    const c = input[i];
    if (c === "(") {
      // Balanced literal string with \-escapes
      let depth = 1;
      i++;
      while (i < n && depth > 0) {
        const ch = input[i];
        if (ch === "\\") {
          i += 2;
          continue;
        }
        if (ch === "(") depth++;
        if (ch === ")") depth--;
        i++;
      }
      continue;
    }
    if (c === "<") {
      if (input[i + 1] === "<") {
        // Dictionary
        let depth = 1;
        i += 2;
        while (i < n && depth > 0) {
          if (i + 1 < n && input[i] === "<" && input[i + 1] === "<") {
            depth++;
            i += 2;
          } else if (i + 1 < n && input[i] === ">" && input[i + 1] === ">") {
            depth--;
            i += 2;
          } else {
            i++;
          }
        }
      } else {
        // Hex string
        while (i < n && input[i] !== ">") i++;
        i++;
      }
      continue;
    }
    if (c === "[") {
      // Array, may contain nested strings
      let depth = 1;
      i++;
      while (i < n && depth > 0) {
        if (input[i] === "(") {
          let pDepth = 1;
          i++;
          while (i < n && pDepth > 0) {
            const ch = input[i];
            if (ch === "\\") {
              i += 2;
              continue;
            }
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
    if (c === "%") {
      while (i < n && input[i] !== "\n" && input[i] !== "\r") i++;
      continue;
    }
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

function transformX(ctm: CTM, x: number, y: number) {
  return ctm[0] * x + ctm[1] * y + ctm[4];
}

function transformY(ctm: CTM, x: number, y: number) {
  return ctm[2] * x + ctm[3] * y + ctm[5];
}

async function computeTemplateHeaderHeight(templateBytes: Uint8Array): Promise<number | undefined> {
  let sourceDoc;
  try {
    sourceDoc = await PDFDocument.load(templateBytes);
  } catch {
    return undefined;
  }
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
    try {
      de = zlib.inflateSync(raw).toString("latin1");
    } catch {
      de = Buffer.from(raw).toString("latin1");
    }
    const cleaned = cleanContentStream(de);
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    allTokens.push(...tokens);
  }

  const ctmStack: CTM[] = [];
  let ctm: CTM = [1, 0, 0, 1, 0, 0];
  const fullWidthLines: { minTop: number; maxTop: number }[] = [];
  const paintOps = new Set(["f", "F", "s", "S", "b", "B", "f*", "B*", "b*"]);

  for (let i = 0; i < allTokens.length; i++) {
    const t = allTokens[i];
    if (t === "q") {
      ctmStack.push(ctm);
      continue;
    }
    if (t === "Q") {
      ctm = ctmStack.pop() ?? ctm;
      continue;
    }
    if (t === "cm" && i >= 6) {
      const a = Number(allTokens[i - 6]);
      const b = Number(allTokens[i - 5]);
      const c = Number(allTokens[i - 4]);
      const d = Number(allTokens[i - 3]);
      const e = Number(allTokens[i - 2]);
      const f = Number(allTokens[i - 1]);
      if (!Number.isNaN(a + b + c + d + e + f)) {
        ctm = multiplyCTM(ctm, [a, b, c, d, e, f]);
      }
      continue;
    }
    if (t === "re" && i >= 4) {
      const x = Number(allTokens[i - 4]);
      const y = Number(allTokens[i - 3]);
      const w = Number(allTokens[i - 2]);
      const h = Number(allTokens[i - 1]);
      if (!Number.isNaN(x + y + w + h)) {
        const paint = allTokens[i + 1];
        if (paintOps.has(paint)) {
          const ys = [
            transformY(ctm, x, y),
            transformY(ctm, x + w, y),
            transformY(ctm, x, y + h),
            transformY(ctm, x + w, y + h),
          ];
          const xs = [
            transformX(ctm, x, y),
            transformX(ctm, x + w, y),
            transformX(ctm, x, y + h),
            transformX(ctm, x + w, y + h),
          ];
          const minPageY = Math.min(...ys);
          const maxTop = pageH - minPageY;
          const maxPageY = Math.max(...ys);
          const minTop = pageH - maxPageY;
          const width = Math.max(...xs) - Math.min(...xs);
          const height = maxTop - minTop;
          if (width >= pageW * FULL_WIDTH_LINE_MIN_RATIO && height < LINE_MAX_HEIGHT) {
            fullWidthLines.push({ minTop, maxTop });
          }
        }
      }
      continue;
    }
  }

  if (fullWidthLines.length === 0) return undefined;

  fullWidthLines.sort((a, b) => a.minTop - b.minTop);
  let headerBottom = fullWidthLines[0].maxTop;
  for (let k = 1; k < fullWidthLines.length; k++) {
    if (fullWidthLines[k].minTop - fullWidthLines[k - 1].minTop > HEADER_CLUSTER_GAP) {
      break;
    }
    headerBottom = Math.max(headerBottom, fullWidthLines[k].maxTop);
  }

  return (headerBottom / pageH) * PAGE_HEIGHT;
}

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

  const primary = rgb(0.12, 0.12, 0.12);
  const secondary = rgb(0.4, 0.4, 0.4);
  const critical = rgb(0.75, 0.1, 0.1);

  let marginLeft = MARGIN;
  let marginRight = MARGIN;
  let marginTop = MARGIN;
  let marginBottom = MARGIN;
  let embeddedTemplate: any = undefined;
  let embeddedImage: any = undefined;

  if (template?.fileData) {
    const bytes = await loadTemplateFile(template.fileData);
    let headerHeightFromTemplate: number | undefined;
    if (bytes) {
      const mime = (template.mimeType ?? "application/pdf").toLowerCase();
      if (mime === "application/pdf") {
        headerHeightFromTemplate = await computeTemplateHeaderHeight(bytes);
        const [first] = await pdfDoc.embedPdf(bytes, [0]);
        embeddedTemplate = first;
      } else if (mime === "image/png") {
        embeddedImage = await pdfDoc.embedPng(bytes);
      } else if (mime === "image/jpeg" || mime === "image/jpg") {
        embeddedImage = await pdfDoc.embedJpg(bytes);
      }
      const headerOverlayBottom = template.overlayFields
        ?.filter((f) => f.y < 50)
        .reduce((max, f) => Math.max(max, ((f.y + (f.height ?? 0)) / 100) * PAGE_HEIGHT), 0) ?? 0;
      marginTop = Math.max(
        template.marginTop,
        headerOverlayBottom + 20,
        (headerHeightFromTemplate ?? 0) + HEADER_BODY_PADDING,
      );
      marginBottom = template.marginBottom;
      marginLeft = template.marginLeft;
      marginRight = template.marginRight;
    }
  }

  const top = PAGE_HEIGHT - marginTop;
  const bottom = marginBottom;
  const usableWidth = PAGE_WIDTH - marginLeft - marginRight;
  const rightX = PAGE_WIDTH - marginRight;

  function newPage(orderForOverlay?: LabOrder): PDFPage {
    const p = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    if (embeddedTemplate) {
      p.drawPage(embeddedTemplate, { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT });
    }
    if (embeddedImage) {
      p.drawImage(embeddedImage, { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT });
    }
    if (template?.overlayFields?.length) {
      drawOverlayFields(p, template.overlayFields, patient, orderForOverlay, overlayFonts);
    }
    return p;
  }

  let page = newPage(orders[0]);
  let y = top;

  if (orders.length === 0) {
    page.drawText("No laboratory orders to display.", { x: marginLeft, y, size: 11, font: normalFont, color: secondary });
    return pdfDoc.save();
  }

  const colWidths = [usableWidth * 0.42, usableWidth * 0.18, usableWidth * 0.16, usableWidth * 0.24];
  const colX = [
    marginLeft,
    marginLeft + colWidths[0],
    marginLeft + colWidths[0] + colWidths[1],
    marginLeft + colWidths[0] + colWidths[1] + colWidths[2],
  ];
  const headers = ["Test Name", "Result", "Unit", "Normal Value"];
  const lineHeight = 12;
  const rowPadding = 5;
  const flagRed = rgb(0.78, 0.08, 0.08);
  const ruleColor = rgb(0.2, 0.2, 0.2);

  function flagPrefix(flag?: LabResultFlag): string {
    if (flag === "critical_low") return "LL ";
    if (flag === "critical_high") return "HH ";
    if (flag === "low") return "L ";
    if (flag === "high") return "H ";
    return "";
  }

  function drawTableHeader(p: PDFPage, yPos: number): number {
    p.drawLine({ start: { x: marginLeft, y: yPos + 3 }, end: { x: rightX, y: yPos + 3 }, thickness: 0.75, color: ruleColor });
    for (let i = 0; i < headers.length; i++) {
      p.drawText(headers[i], { x: colX[i], y: yPos - 10, size: 9.5, font: boldFont, color: primary });
    }
    const afterY = yPos - 14;
    p.drawLine({ start: { x: marginLeft, y: afterY }, end: { x: rightX, y: afterY }, thickness: 0.75, color: ruleColor });
    return afterY - 12;
  }

  function ageGenderText(order: LabOrder): string {
    const age = resolveAge(patient, new Date());
    const gender = patient.gender ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1).toLowerCase() : "—";
    const pregnant = patient.gender?.toLowerCase() === "female" && order.pregnancy ? " (Pregnant)" : "";
    return `${formatAge(age)} / ${gender}${pregnant}`;
  }

  function drawPatientInfoBlock(p: PDFPage, yPos: number, order: LabOrder): number {
    const half = usableWidth / 2;
    const labelWidth = 78;
    const rowGap = 14;
    const leftRows: [string, string][] = [
      ["UHID No.", patient.uhid || "—"],
      ["Patient Name", patient.name || "—"],
      ["Age/Gender", ageGenderText(order)],
      ["Mobile No", patient.phone || "—"],
    ];
    const rightRows: [string, string][] = [
      ["Collection Time", order.sampleCollectedAt ? dateLabel(order.sampleCollectedAt) : "—"],
      ["Receiving Time", order.sampleCollectedAt ? dateLabel(order.sampleCollectedAt) : "—"],
      ["Reporting Time", order.completedAt ? dateLabel(order.completedAt) : dateLabel(new Date().toISOString())],
      ["Sample ID", order.id.slice(-8).toUpperCase()],
    ];
    let rowY = yPos;
    for (let i = 0; i < leftRows.length; i++) {
      const [leftLabel, leftValue] = leftRows[i];
      p.drawText(`${leftLabel} :`, { x: marginLeft, y: rowY, size: 9, font: boldFont, color: primary });
      p.drawText(leftValue, { x: marginLeft + labelWidth, y: rowY, size: 9, font: normalFont, color: primary });
      const [rightLabel, rightValue] = rightRows[i];
      p.drawText(`${rightLabel} :`, { x: marginLeft + half, y: rowY, size: 9, font: boldFont, color: primary });
      p.drawText(rightValue, { x: marginLeft + half + labelWidth, y: rowY, size: 9, font: normalFont, color: primary });
      rowY -= rowGap;
    }
    rowY -= 4;
    p.drawLine({ start: { x: marginLeft, y: rowY }, end: { x: rightX, y: rowY }, thickness: 0.75, color: ruleColor });
    return rowY - 16;
  }

  for (const order of orders) {
    if (y < bottom + 140) {
      page = newPage(order);
      y = top;
    }

    y = drawPatientInfoBlock(page, y, order);
    y = drawTableHeader(page, y);

    let lastSection = "";
    for (const item of order.items) {
      const catalog = item.reportCatalog;
      const fields = catalog?.fields.filter((f) => f.isVisible) ?? [];

      const section = fields.find((f) => f.section?.trim())?.section?.trim() ?? "";
      if (section && section !== lastSection) {
        if (y - 20 < bottom) {
          page = newPage(order);
          y = top;
          y = drawTableHeader(page, y);
        }
        const sectionWidth = boldFont.widthOfTextAtSize(section, 10.5);
        page.drawText(section, { x: marginLeft + usableWidth / 2 - sectionWidth / 2, y, size: 10.5, font: boldFont, color: primary });
        y -= 18;
        lastSection = section;
      }

      if (y - 16 < bottom) {
        page = newPage(order);
        y = top;
        y = drawTableHeader(page, y);
      }
      page.drawText(`${item.label}${item.sampleType ? ` · ${item.sampleType}` : ""}`, {
        x: marginLeft,
        y,
        size: 9.5,
        font: boldFont,
        color: primary,
      });
      y -= 16;

      if (fields.length === 0) {
        page.drawText("No visible fields.", { x: marginLeft, y, size: 9, font: normalFont, color: secondary });
        y -= 16;
        continue;
      }

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
            { gender: patient.gender, dateOfBirth: patient.dateOfBirth, age: patient.age, sampleType: item.sampleType, pregnancy: order.pregnancy },
            recordedAt,
          );
        }
        const range = getApplicableRange(
          field.fieldMaster,
          { gender: patient.gender, dateOfBirth: patient.dateOfBirth, age: patient.age, pregnancy: order.pregnancy },
          result ? new Date(result.recordedAt) : recordedAt,
          item.sampleType,
        );
        const isAbnormal = Boolean(flag && flag !== "normal");
        const resultText = `${flagPrefix(flag)}${value || "—"}`;

        const rowCells = [
          field.fieldMaster.name,
          resultText,
          field.fieldMaster.unit || "—",
          formatReferenceRange(range, field.fieldMaster.unit, true),
        ];

        const cellHeights = rowCells.map((cell, idx) =>
          measureHeight(cell, idx === 1 && isAbnormal ? boldFont : normalFont, 9, colWidths[idx] - 8, lineHeight),
        );
        const rowHeight = Math.max(...cellHeights, lineHeight) + rowPadding;

        if (y - rowHeight < bottom) {
          page = newPage(order);
          y = top;
          y = drawTableHeader(page, y);
        }

        const baseline = y - lineHeight + 2;
        for (let i = 0; i < rowCells.length; i++) {
          const color = i === 1 && isAbnormal ? flagRed : primary;
          const font = i === 1 && isAbnormal ? boldFont : normalFont;
          drawWrapped(page, rowCells[i], colX[i], baseline, colWidths[i] - 8, 9, font, lineHeight, color);
        }
        y -= rowHeight;
      }

      if (catalog?.footerNote?.trim()) {
        const footerHeight = measureHeight(catalog.footerNote, normalFont, 8, usableWidth, 10) + 6;
        if (y - footerHeight < bottom) {
          page = newPage(order);
          y = top;
        }
        y = drawWrapped(page, catalog.footerNote, marginLeft, y, usableWidth, 8, normalFont, 10, secondary);
        y -= 6;
      }

      y -= 8;
    }

    if (order.cancelReason) {
      page.drawText(`Cancellation reason: ${order.cancelReason}`, { x: marginLeft, y, size: 9, font: normalFont, color: critical });
      y -= 16;
    }

    if (y - 40 < bottom) {
      page = newPage(order);
      y = top;
    }
    y -= 10;
    if (order.orderedByName) {
      const authorizedLabel = `Authorized by: ${order.orderedByName}`;
      const authorizedWidth = normalFont.widthOfTextAtSize(authorizedLabel, 9);
      page.drawText(authorizedLabel, { x: rightX - authorizedWidth, y, size: 9, font: normalFont, color: secondary });
      y -= 14;
    }
    const endLabel = "**END OF REPORT**";
    const endWidth = boldFont.widthOfTextAtSize(endLabel, 9);
    page.drawText(endLabel, { x: marginLeft + usableWidth / 2 - endWidth / 2, y, size: 9, font: boldFont, color: secondary });
    y -= 24;
  }

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
