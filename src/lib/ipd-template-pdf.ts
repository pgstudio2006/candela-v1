import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { IpdAdmissionDetail } from "@/design-system/ipd-data";
import type { DocumentTemplate, DocumentTemplateOverlayField } from "@/design-system/document-templates";

export type IpdDischargeSummary = {
  admissionDate?: string;
  dischargeDate?: string;
  diagnosis?: string;
  procedures?: string;
  medications?: string;
  followUp?: string;
  notes?: string;
};

const TEMPLATES = {
  fileSticker: "/templates/filepagesticker.pdf",
  roomPlate: "/templates/patientroomsticker.pdf",
  overview: "/templates/1.pdf",
  discharge: "/templates/KAMLESH%2068YRS%2020-07-26.pdf",
} as const;

async function loadTemplate(path: string): Promise<PDFDocument> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Template not found: ${path}`);
  return PDFDocument.load(await response.arrayBuffer());
}

async function loadSource(template: DocumentTemplate | undefined, fallback: string): Promise<PDFDocument> {
  if (template?.fileData) return PDFDocument.load(await fetch(template.fileData).then((response) => response.arrayBuffer()));
  return loadTemplate(fallback);
}

function safe(value: unknown): string {
  return String(value ?? "—").replace(/[\u0000-\u001f]/g, " ").trim() || "—";
}

function formatDate(value: unknown): string {
  if (!value) return "";
  const d = typeof value === "string" || typeof value === "number" ? new Date(value) : null;
  return d && !isNaN(d.getTime()) ? d.toLocaleDateString("en-IN") : String(value);
}

function overlayValue(field: DocumentTemplateOverlayField, admission: IpdAdmissionDetail, summary?: IpdDischargeSummary): string {
  switch (field.key) {
    case "patientName":
      return admission.patientName;
    case "uhid":
      return admission.uhid ?? "";
    case "ageGender":
      return `${safe(admission.age)} / ${safe(admission.gender)}`;
    case "mobileNo":
      return admission.phone ?? "";
    case "ward":
      return admission.ward;
    case "bed":
      return admission.bed;
    case "doctorName":
      return admission.doctorName;
    case "diagnosis":
      return admission.diagnosis;
    case "admissionDate":
      return formatDate(admission.admittedAt);
    case "dischargeDate":
      return summary ? formatDate(summary.dischargeDate) : "";
    case "procedures":
      return summary?.procedures ?? "";
    case "medications":
      return summary?.medications ?? "";
    case "followUp":
      return summary?.followUp ?? "";
    case "notes":
      return summary?.notes ?? "";
    default:
      return field.label;
  }
}

function renderOverlayFields(
  page: PDFPage,
  fields: DocumentTemplateOverlayField[],
  admission: IpdAdmissionDetail,
  summary: IpdDischargeSummary | undefined,
  normal: PDFFont,
  bold: PDFFont,
) {
  const width = page.getWidth();
  const height = page.getHeight();
  for (const field of fields) {
    const value = overlayValue(field, admission, summary);
    const font = field.key === "patientName" || field.key === "doctorName" || field.key === "ward" ? bold : normal;
    const size = Math.max(6, Math.min(16, field.fontSize ?? 10));
    const boxLeft = (field.x / 100) * width;
    const boxTop = height - (field.y / 100) * height;
    const boxWidth = (field.width / 100) * width;
    const textWidth = font.widthOfTextAtSize(value, size);
    let x = boxLeft;
    if (field.align === "center") x = boxLeft + boxWidth / 2 - textWidth / 2;
    if (field.align === "right") x = boxLeft + boxWidth - textWidth;
    const y = boxTop - size;
    page.drawText(value, { x: Math.max(0, x), y: Math.max(0, y), size, font, color: rgb(0.08, 0.08, 0.08) });
  }
}

function draw(page: PDFPage, text: unknown, x: number, y: number, font: PDFFont, size = 10, bold = false) {
  page.drawText(safe(text), { x, y, size, font, color: rgb(0.08, 0.08, 0.08) });
}

function drawLines(page: PDFPage, text: unknown, x: number, y: number, width: number, font: PDFFont, size = 9, lineHeight = 12) {
  const words = safe(text).split(/\s+/);
  let line = "";
  let row = 0;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > width && line) {
      draw(page, line, x, y - row * lineHeight, font, size);
      row += 1;
      line = word;
    } else line = candidate;
  }
  if (line) draw(page, line, x, y - row * lineHeight, font, size);
}

function patientMeta(admission: IpdAdmissionDetail): string {
  return `${safe(admission.patientName)}  |  UHID: ${safe(admission.uhid)}  |  ${safe(admission.ward)}  |  Bed: ${safe(admission.bed)}`;
}

async function fonts(pdf: PDFDocument) {
  return {
    normal: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
}

export async function generateIpdFileStickerPdf(admission: IpdAdmissionDetail, template?: DocumentTemplate): Promise<Uint8Array> {
  const source = await loadSource(template, TEMPLATES.fileSticker);
  const pdf = await PDFDocument.create();
  const [page] = await pdf.copyPages(source, [0]);
  pdf.addPage(page);
  const { normal, bold } = await fonts(pdf);
  const target = pdf.getPages()[0];
  if (template?.overlayFields?.length) {
    renderOverlayFields(target, template.overlayFields, admission, undefined, normal, bold);
  } else {
    const width = target.getWidth();
    const height = target.getHeight();
    draw(target, admission.patientName, width * 0.12, height * 0.72, bold, 16);
    draw(target, `UHID: ${safe(admission.uhid)}`, width * 0.12, height * 0.66, normal, 11);
    draw(target, `Ward: ${safe(admission.ward)}   Bed: ${safe(admission.bed)}`, width * 0.12, height * 0.60, normal, 10);
    draw(target, `Admitted: ${safe(new Date(admission.admittedAt).toLocaleDateString("en-IN"))}`, width * 0.12, height * 0.54, normal, 10);
  }
  return pdf.save();
}

export async function generateIpdRoomPlatePdf(admission: IpdAdmissionDetail, template?: DocumentTemplate): Promise<Uint8Array> {
  const source = await loadSource(template, TEMPLATES.roomPlate);
  const pdf = await PDFDocument.create();
  const [page] = await pdf.copyPages(source, [0]);
  pdf.addPage(page);
  const { normal, bold } = await fonts(pdf);
  const target = pdf.getPages()[0];
  if (template?.overlayFields?.length) {
    renderOverlayFields(target, template.overlayFields, admission, undefined, normal, bold);
  } else {
    const center = target.getWidth() / 2;
    const centerText = (text: string, y: number, size: number, font: PDFFont) => draw(target, text, center - font.widthOfTextAtSize(text, size) / 2, y, font, size);
    centerText(safe(admission.ward), target.getHeight() * 0.76, 24, bold);
    centerText(`BED ${safe(admission.bed)}`, target.getHeight() * 0.60, 42, bold);
    centerText(safe(admission.patientName), target.getHeight() * 0.43, 20, bold);
    centerText(`UHID: ${safe(admission.uhid)}`, target.getHeight() * 0.35, 11, normal);
  }
  return pdf.save();
}

export async function generateIpdOverviewPdf(admission: IpdAdmissionDetail, template?: DocumentTemplate): Promise<Uint8Array> {
  const source = await loadSource(template, TEMPLATES.overview);
  const pdf = await PDFDocument.create();
  const pages = await pdf.copyPages(source, source.getPageIndices().slice(0, 1));
  pdf.addPage(pages[0]);
  const { normal, bold } = await fonts(pdf);
  const page = pdf.getPages()[0];
  if (template?.overlayFields?.length) {
    renderOverlayFields(page, template.overlayFields, admission, undefined, normal, bold);
    return pdf.save();
  }
  const left = 58;
  let y = page.getHeight() - 150;
  draw(page, "IPD PATIENT OVERVIEW", left, y, bold, 16);
  y -= 30;
  drawLines(page, patientMeta(admission), left, y, page.getWidth() - 116, normal, 10);
  y -= 30;
  const fields: Array<[string, unknown]> = [
    ["Admission date", new Date(admission.admittedAt).toLocaleString("en-IN")],
    ["Patient type", admission.patientType],
    ["Billing mode", admission.billingMode],
    ["Attending doctor", admission.doctorName],
    ["Diagnosis", admission.diagnosis],
    ["Phone", admission.phone],
    ["Age / Gender", `${safe(admission.age)} / ${safe(admission.gender)}`],
    ["Expected discharge", admission.expectedDischarge],
    ["Status", admission.status],
  ];
  for (const [label, value] of fields) {
    draw(page, `${label}:`, left, y, bold, 10);
    drawLines(page, value, left + 125, y, page.getWidth() - 185, normal, 10);
    y -= 25;
  }
  return pdf.save();
}

export async function generateIpdDischargeSummaryPdf(admission: IpdAdmissionDetail, summary: IpdDischargeSummary, template?: DocumentTemplate): Promise<Uint8Array> {
  const source = await loadSource(template, TEMPLATES.discharge);
  const pdf = await PDFDocument.create();
  const [page] = await pdf.copyPages(source, [0]);
  pdf.addPage(page);
  const { normal, bold } = await fonts(pdf);
  const target = pdf.getPages()[0];
  if (template?.overlayFields?.length) {
    renderOverlayFields(target, template.overlayFields, admission, summary, normal, bold);
    return pdf.save();
  }
  const left = 58;
  let y = target.getHeight() - 150;
  draw(target, "DISCHARGE SUMMARY", left, y, bold, 16);
  y -= 24;
  drawLines(target, patientMeta(admission), left, y, target.getWidth() - 116, normal, 10);
  y -= 30;
  const fields: Array<[string, unknown]> = [
    ["Admission date", summary.admissionDate],
    ["Discharge date", summary.dischargeDate ?? new Date().toISOString()],
    ["Diagnosis", summary.diagnosis],
    ["Procedures", summary.procedures],
    ["Medications", summary.medications],
    ["Follow up", summary.followUp],
    ["Notes", summary.notes],
  ];
  for (const [label, value] of fields) {
    draw(target, `${label}:`, left, y, bold, 10);
    drawLines(target, value, left + 105, y, target.getWidth() - 165, normal, 10);
    y -= 28;
  }
  return pdf.save();
}
