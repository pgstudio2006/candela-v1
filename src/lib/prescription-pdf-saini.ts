import { PDFDocument, PDFImage, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Patient, Visit } from "@/design-system/frontdesk-data";
import type { ConsultationRecord } from "@/design-system/doctor-data";
import { DOCTOR_EXAMINATION_SCHEMA } from "@/design-system/doctor-schemas";
import { resolvePatientAge } from "@/lib/frontdesk-workflow";
import {
  COLORS,
  FONT as BASE_FONT,
  drawHLine,
  drawRightText,
  drawText,
  formatConsultDate,
  formatDuration,
  formatFrequency,
  wrapText,
} from "@/lib/prescription-pdf-shared";

const SAINI_IMAGE_URL = "/templates/Letterhead Dr. Sunil Saini.jpg.jpeg";

const FONT = {
  ...BASE_FONT,
  caption: 8,
  body: 9,
  table: 9,
  tableHead: 9,
  emphasis: 10,
  title: 11,
} as const;

const PAGE = { width: 595.2, height: 841.9 };

const LAYOUT = {
  marginLeft: 200,
  marginRight: 560,
  contentTop: 380,
  minRowHeight: 16,
  lineLeading: 10,
  footerMinY: 100,
  sectionGap: 14,
  paragraphGap: 10,
} as const;

/** Cleared area that replaces the pre-printed patient info block on every page. */
const PATIENT_INFO_RECT = { x: 140, y: 400, width: 440, height: 215 };

const EXAM_FIELD_LABELS: Record<string, string> = Object.fromEntries(
  DOCTOR_EXAMINATION_SCHEMA.sections.flatMap((section) =>
    section.fields.map((field) => [field.id, field.label]),
  ),
);

const SHOWN_IN_PATIENT_INFO = new Set([
  "vitalsBp",
  "vitalsPulse",
  "vitalsWeight",
  "vitalsSpo2",
  "vitalsTemperature",
  "allergies",
  "diabetes",
  "thyroidDisorder",
  "hypertension",
]);

function formatFieldValue(value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

function humanizeKey(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

type SainiProps = {
  patient: Patient;
  visit: Visit;
  consult: ConsultationRecord;
  doctorName: string;
};

type PageContext = {
  page: PDFPage;
  y: number;
};

function drawCheckbox(page: PDFPage, x: number, y: number, size = 7, checked = false) {
  page.drawRectangle({
    x,
    y: y - 2,
    width: size,
    height: size,
    borderWidth: 0.5,
    borderColor: COLORS.ink,
    color: COLORS.white,
  });
  if (checked) {
    page.drawLine({
      start: { x: x + 1, y: y + 1 },
      end: { x: x + size - 1, y: y + size - 3 },
      thickness: 0.5,
      color: COLORS.ink,
    });
    page.drawLine({
      start: { x: x + 1, y: y + size - 3 },
      end: { x: x + size - 1, y: y + 1 },
      thickness: 0.5,
      color: COLORS.ink,
    });
  }
}

function drawYesNoPair(
  page: PDFPage,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  yesChecked = false,
  noChecked = false,
) {
  const boxSize = 7;
  const spacing = 4;
  let cx = x;
  drawCheckbox(page, cx, y, boxSize, yesChecked);
  cx += boxSize + 2;
  drawText(page, "Yes", cx, y, font, size);
  cx += font.widthOfTextAtSize("Yes", size) + spacing;
  drawCheckbox(page, cx, y, boxSize, noChecked);
  cx += boxSize + 2;
  drawText(page, "No", cx, y, font, size);
}

function addSainiPage(pdfDoc: PDFDocument, image: PDFImage): PDFPage {
  const page = pdfDoc.addPage([PAGE.width, PAGE.height]);
  page.drawImage(image, { x: 0, y: 0, width: PAGE.width, height: PAGE.height });
  // White-out the pre-printed patient info block on every page so it doesn't show through.
  page.drawRectangle({
    x: PATIENT_INFO_RECT.x,
    y: PATIENT_INFO_RECT.y,
    width: PATIENT_INFO_RECT.width,
    height: PATIENT_INFO_RECT.height,
    color: COLORS.white,
    borderColor: COLORS.border,
    borderWidth: 0.5,
  });
  return page;
}

function ensureSpace(
  ctx: PageContext,
  pdfDoc: PDFDocument,
  image: PDFImage,
  required: number,
): void {
  if (ctx.y - required < LAYOUT.footerMinY) {
    ctx.page = addSainiPage(pdfDoc, image);
    ctx.y = LAYOUT.contentTop;
  }
}

function drawExaminationSection(
  ctx: PageContext,
  pdfDoc: PDFDocument,
  image: PDFImage,
  consult: ConsultationRecord,
  font: PDFFont,
  bold: PDFFont,
): void {
  const entries = Object.entries(consult.examination ?? {})
    .filter(([key, value]) => !SHOWN_IN_PATIENT_INFO.has(key) && !isEmptyValue(value))
    .sort(([a], [b]) => {
      const order = Object.keys(EXAM_FIELD_LABELS);
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    });

  if (entries.length === 0) return;

  const infoWidth = LAYOUT.marginRight - LAYOUT.marginLeft;
  const labelWidth = infoWidth * 0.35;
  const valueX = LAYOUT.marginLeft + labelWidth + 8;

  ensureSpace(ctx, pdfDoc, image, 24);
  drawText(ctx.page, "Examination / Vitals", LAYOUT.marginLeft, ctx.y, bold, FONT.tableHead);
  ctx.y -= 14;
  drawHLine(ctx.page, LAYOUT.marginLeft, LAYOUT.marginRight, ctx.y);
  ctx.y -= 12;

  for (const [key, value] of entries) {
    const label = EXAM_FIELD_LABELS[key] ?? humanizeKey(key);
    const text = formatFieldValue(value);
    const labelLines = wrapText(`${label}:`, bold, FONT.body, labelWidth);
    const valueLines = wrapText(text, font, FONT.body, infoWidth - labelWidth - 16);
    const maxLines = Math.max(labelLines.length, valueLines.length);
    const blockHeight = maxLines * LAYOUT.lineLeading + 6;

    ensureSpace(ctx, pdfDoc, image, blockHeight);
    const topY = ctx.y;
    for (let i = 0; i < maxLines; i++) {
      const y = topY - i * LAYOUT.lineLeading;
      if (i < labelLines.length) drawText(ctx.page, labelLines[i], LAYOUT.marginLeft, y, bold, FONT.body);
      if (i < valueLines.length) drawText(ctx.page, valueLines[i], valueX, y, font, FONT.body);
    }
    ctx.y -= blockHeight;
  }
  ctx.y -= LAYOUT.paragraphGap;
}

function drawPrescriptionContent(
  pdfDoc: PDFDocument,
  image: PDFImage,
  startPage: PDFPage,
  props: SainiProps,
  startY: number,
  font: PDFFont,
  bold: PDFFont,
): void {
  const ctx: PageContext = { page: startPage, y: startY };
  const infoWidth = LAYOUT.marginRight - LAYOUT.marginLeft;
  const { consult, doctorName } = props;

  // Diagnosis
  const primaryDiagnosis = String(consult.diagnosis?.primaryDiagnosis ?? "").trim();
  const clinicalImpression = String(consult.diagnosis?.clinicalImpression ?? "").trim();
  if (primaryDiagnosis || clinicalImpression) {
    const diagnosis = primaryDiagnosis || clinicalImpression || "—";
    const lines = wrapText(diagnosis, font, FONT.body, infoWidth);
    ensureSpace(ctx, pdfDoc, image, 14 + lines.length * LAYOUT.lineLeading + LAYOUT.paragraphGap);
    drawText(ctx.page, "Diagnosis", LAYOUT.marginLeft, ctx.y, bold, FONT.tableHead);
    ctx.y -= 14;
    lines.forEach((line) => {
      drawText(ctx.page, line, LAYOUT.marginLeft, ctx.y, font, FONT.body);
      ctx.y -= LAYOUT.lineLeading;
    });
    ctx.y -= LAYOUT.paragraphGap;
  }

  // Examination
  drawExaminationSection(ctx, pdfDoc, image, consult, font, bold);

  // Medications
  const medColX = [
    LAYOUT.marginLeft,
    LAYOUT.marginLeft + 25,
    LAYOUT.marginLeft + 170,
    LAYOUT.marginLeft + 270,
  ];

  const medColWidths = [
    medColX[1] - medColX[0] - 6,
    medColX[2] - medColX[1] - 6,
    medColX[3] - medColX[2] - 6,
    LAYOUT.marginRight - medColX[3] - 6,
  ];

  ensureSpace(ctx, pdfDoc, image, 52);
  drawText(ctx.page, "℞ Medications", LAYOUT.marginLeft, ctx.y, bold, FONT.emphasis);
  ctx.y -= 14;

  drawHLine(ctx.page, LAYOUT.marginLeft, LAYOUT.marginRight, ctx.y);
  ctx.y -= 12;
  drawText(ctx.page, "#", medColX[0], ctx.y, bold, FONT.tableHead);
  drawText(ctx.page, "Medicine", medColX[1], ctx.y, bold, FONT.tableHead);
  drawText(ctx.page, "Dosage", medColX[2], ctx.y, bold, FONT.tableHead);
  drawText(ctx.page, "Instructions", medColX[3], ctx.y, bold, FONT.tableHead);
  ctx.y -= 16;
  drawHLine(ctx.page, LAYOUT.marginLeft, LAYOUT.marginRight, ctx.y);
  ctx.y -= 10;

  if (!consult.prescription?.length) {
    ensureSpace(ctx, pdfDoc, image, 20);
    drawText(ctx.page, "No medicines prescribed", medColX[1], ctx.y, font, FONT.table);
    ctx.y -= 20;
    drawHLine(ctx.page, LAYOUT.marginLeft, LAYOUT.marginRight, ctx.y);
    ctx.y -= 6;
  } else {
    consult.prescription.forEach((line, i) => {
      const medicine = line.drug || "—";
      const dosageParts = [line.dose, formatFrequency(line.frequency), formatDuration(line)].filter(
        (part) => part && part !== "—",
      );
      const dosage = dosageParts.length ? dosageParts.join(" — ") : "—";
      const instructions = line.instructions?.trim() || "—";

      const medLines = wrapText(medicine, font, FONT.table, medColWidths[1]);
      const doseLines = wrapText(dosage, font, FONT.table, medColWidths[2]);
      const instLines = wrapText(instructions, font, FONT.table, medColWidths[3]);

      const maxLines = Math.max(medLines.length, doseLines.length, instLines.length);
      const rowHeight = Math.max(LAYOUT.minRowHeight, maxLines * LAYOUT.lineLeading + 4);

      ensureSpace(ctx, pdfDoc, image, rowHeight + 4);

      const rowTop = ctx.y;
      for (let idx = 0; idx < maxLines; idx++) {
        const lineY = rowTop - idx * LAYOUT.lineLeading;
        if (idx < medLines.length) drawText(ctx.page, medLines[idx], medColX[1], lineY, font, FONT.table);
        if (idx < doseLines.length) drawText(ctx.page, doseLines[idx], medColX[2], lineY, font, FONT.table);
        if (idx < instLines.length) drawText(ctx.page, instLines[idx], medColX[3], lineY, font, FONT.table);
      }
      drawText(ctx.page, String(i + 1), medColX[0], rowTop, font, FONT.table);

      ctx.y -= rowHeight;
      drawHLine(ctx.page, LAYOUT.marginLeft, LAYOUT.marginRight, ctx.y);
      ctx.y -= 6;
    });
  }

  // Advice
  if (String(consult.treatment?.plan ?? "")) {
    const planLines = wrapText(String(consult.treatment.plan), font, FONT.body, infoWidth);
    const followUp = String(consult.treatment?.followUp ?? "");
    const blockHeight = 14 + planLines.length * LAYOUT.lineLeading + (followUp ? 4 + LAYOUT.lineLeading : 0) + LAYOUT.paragraphGap;
    ensureSpace(ctx, pdfDoc, image, blockHeight);
    drawText(ctx.page, "Advice", LAYOUT.marginLeft, ctx.y, bold, FONT.tableHead);
    ctx.y -= 14;
    planLines.forEach((line) => {
      drawText(ctx.page, line, LAYOUT.marginLeft, ctx.y, font, FONT.body);
      ctx.y -= LAYOUT.lineLeading;
    });
    if (followUp) {
      ctx.y -= 4;
      drawText(ctx.page, `Follow-up: ${followUp}`, LAYOUT.marginLeft, ctx.y, font, FONT.body);
      ctx.y -= LAYOUT.lineLeading;
    }
    ctx.y -= LAYOUT.paragraphGap;
  }

  // Doctor advice
  if (consult.doctorAdvice) {
    const adviceLines = wrapText(consult.doctorAdvice, font, FONT.body, infoWidth);
    const blockHeight = 14 + adviceLines.length * LAYOUT.lineLeading + LAYOUT.paragraphGap;
    ensureSpace(ctx, pdfDoc, image, blockHeight);
    drawText(ctx.page, "Doctor advice", LAYOUT.marginLeft, ctx.y, bold, FONT.tableHead);
    ctx.y -= 14;
    adviceLines.forEach((line) => {
      drawText(ctx.page, line, LAYOUT.marginLeft, ctx.y, font, FONT.body);
      ctx.y -= LAYOUT.lineLeading;
    });
    ctx.y -= LAYOUT.paragraphGap;
  }

  // Signature
  ensureSpace(ctx, pdfDoc, image, 72);
  ctx.y -= 26;
  const sigX = LAYOUT.marginRight - 180;
  const sigRight = LAYOUT.marginRight - 8;
  drawHLine(ctx.page, sigX, sigRight, ctx.y);
  ctx.y -= 14;
  drawRightText(ctx.page, doctorName, sigRight, ctx.y, font, FONT.caption, 0);
  ctx.y -= 15;
  drawRightText(ctx.page, "Consultant Signature", sigRight, ctx.y, font, FONT.caption, 0);
}

export async function generateSainiPrescriptionPdf(props: SainiProps): Promise<Uint8Array> {
  const { patient, visit, consult, doctorName } = props;

  const imageBytes = await fetch(SAINI_IMAGE_URL).then((res) => {
    if (!res.ok) throw new Error("Saini letterhead image not found.");
    return res.arrayBuffer();
  });

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE.width, PAGE.height]);
  const image = await pdfDoc.embedJpg(imageBytes);
  page.drawImage(image, { x: 0, y: 0, width: PAGE.width, height: PAGE.height });

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const date = formatConsultDate(consult.completedAt ?? consult.startedAt ?? new Date().toISOString());

  // White-out the pre-printed patient info block on the first page.
  page.drawRectangle({
    x: PATIENT_INFO_RECT.x,
    y: PATIENT_INFO_RECT.y,
    width: PATIENT_INFO_RECT.width,
    height: PATIENT_INFO_RECT.height,
    color: COLORS.white,
    borderColor: COLORS.border,
    borderWidth: 0.5,
  });

  // Draw system patient info inside the cleared area.
  let infoY = PATIENT_INFO_RECT.y + PATIENT_INFO_RECT.height - 16;
  const col1 = PATIENT_INFO_RECT.x + 12;
  const col2 = PATIENT_INFO_RECT.x + 190;
  const rowH = 21;

  const bp = String(consult.examination?.vitalsBp ?? "");
  const pr = String(consult.examination?.vitalsPulse ?? "");
  const weight = String(consult.examination?.vitalsWeight ?? "");
  const spo2 = String(consult.examination?.vitalsSpo2 ?? "");
  const temperature = String(consult.examination?.vitalsTemperature ?? "");
  const allergies = String(consult.examination?.allergies ?? "");

  drawText(page, "Patient Information", col1, infoY, bold, FONT.title);
  infoY -= 18;

  drawText(page, `Name: ${patient.name}`, col1, infoY, bold, FONT.body);
  drawText(page, `Mobile: ${patient.phone || "—"}`, col2, infoY, font, FONT.body);
  infoY -= rowH;

  drawText(page, `Age / Sex: ${resolvePatientAge(patient.age, patient.dateOfBirth) || "—"}y / ${patient.gender || "—"}`, col1, infoY, font, FONT.body);
  drawText(page, `Date: ${date}`, col2, infoY, font, FONT.body);
  infoY -= rowH;

  drawText(page, `City: ${patient.city || "—"}`, col1, infoY, font, FONT.body);
  drawText(page, `BP: ${bp || "—"}`, col2, infoY, font, FONT.body);
  infoY -= rowH;

  drawText(page, `Weight: ${weight ? weight + " kg" : "—"}`, col1, infoY, font, FONT.body);
  drawText(page, `PR: ${pr || "—"}`, col2, infoY, font, FONT.body);
  infoY -= rowH;

  drawText(page, `SpO₂: ${spo2 ? spo2 + "%" : "—"}`, col1, infoY, font, FONT.body);
  drawText(page, `Temperature: ${temperature ? temperature + " °F" : "—"}`, col2, infoY, font, FONT.body);
  infoY -= rowH;

  const allergiesLabel = "Allergies:";
  drawText(page, allergiesLabel, col1, infoY, bold, FONT.body);
  drawText(page, allergies || "None", col1 + bold.widthOfTextAtSize(allergiesLabel, FONT.body) + 8, infoY, font, FONT.body);
  infoY -= rowH;

  const conditions = [
    { label: "Diabetes:", key: "diabetes" },
    { label: "Thyroid disorder:", key: "thyroidDisorder" },
    { label: "Hypertension:", key: "hypertension" },
  ] as const;
  for (const { label, key } of conditions) {
    const value = consult.examination?.[key];
    const status = isEmptyValue(value) ? "—" : formatFieldValue(value);
    drawText(page, label, col1, infoY, bold, FONT.body);
    drawText(page, status, col1 + bold.widthOfTextAtSize(label, FONT.body) + 8, infoY, font, FONT.body);
    infoY -= rowH;
  }

  drawPrescriptionContent(pdfDoc, image, page, props, LAYOUT.contentTop, font, bold);

  return pdfDoc.save();
}
