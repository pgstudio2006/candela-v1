import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { IpdAdmissionDetail } from "@/design-system/ipd-data";

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

function safe(value: unknown): string {
  return String(value ?? "—").replace(/[\u0000-\u001f]/g, " ").trim() || "—";
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

export async function generateIpdFileStickerPdf(admission: IpdAdmissionDetail): Promise<Uint8Array> {
  const source = await loadTemplate(TEMPLATES.fileSticker);
  const pdf = await PDFDocument.create();
  const [page] = await pdf.copyPages(source, [0]);
  pdf.addPage(page);
  const { normal, bold } = await fonts(pdf);
  const target = pdf.getPages()[0];
  const width = target.getWidth();
  const height = target.getHeight();
  draw(target, admission.patientName, width * 0.12, height * 0.72, bold, 16);
  draw(target, `UHID: ${safe(admission.uhid)}`, width * 0.12, height * 0.66, normal, 11);
  draw(target, `Ward: ${safe(admission.ward)}   Bed: ${safe(admission.bed)}`, width * 0.12, height * 0.60, normal, 10);
  draw(target, `Admitted: ${safe(new Date(admission.admittedAt).toLocaleDateString("en-IN"))}`, width * 0.12, height * 0.54, normal, 10);
  return pdf.save();
}

export async function generateIpdRoomPlatePdf(admission: IpdAdmissionDetail): Promise<Uint8Array> {
  const source = await loadTemplate(TEMPLATES.roomPlate);
  const pdf = await PDFDocument.create();
  const [page] = await pdf.copyPages(source, [0]);
  pdf.addPage(page);
  const { normal, bold } = await fonts(pdf);
  const target = pdf.getPages()[0];
  const center = target.getWidth() / 2;
  const centerText = (text: string, y: number, size: number, font: PDFFont) => draw(target, text, center - font.widthOfTextAtSize(text, size) / 2, y, font, size);
  centerText(safe(admission.ward), target.getHeight() * 0.76, 24, bold);
  centerText(`BED ${safe(admission.bed)}`, target.getHeight() * 0.60, 42, bold);
  centerText(safe(admission.patientName), target.getHeight() * 0.43, 20, bold);
  centerText(`UHID: ${safe(admission.uhid)}`, target.getHeight() * 0.35, 11, normal);
  return pdf.save();
}

export async function generateIpdOverviewPdf(admission: IpdAdmissionDetail): Promise<Uint8Array> {
  const source = await loadTemplate(TEMPLATES.overview);
  const pdf = await PDFDocument.create();
  const pages = await pdf.copyPages(source, source.getPageIndices().slice(0, 1));
  pdf.addPage(pages[0]);
  const { normal, bold } = await fonts(pdf);
  const page = pdf.getPages()[0];
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

export async function generateIpdDischargeSummaryPdf(admission: IpdAdmissionDetail, summary: IpdDischargeSummary): Promise<Uint8Array> {
  const source = await loadTemplate(TEMPLATES.discharge);
  const pdf = await PDFDocument.create();
  const [page] = await pdf.copyPages(source, [0]);
  pdf.addPage(page);
  const { normal, bold } = await fonts(pdf);
  const target = pdf.getPages()[0];
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
