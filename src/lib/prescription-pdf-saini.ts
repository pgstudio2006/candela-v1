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
  marginLeft: 155,
  marginRight: 575,
  contentTop: 714,
  minRowHeight: 18,
  lineLeading: 11,
  footerMinY: 90,
  sectionGap: 14,
  paragraphGap: 10,
} as const;

/** Cleared area that replaces the pre-printed patient info block on the first page. */
const PATIENT_INFO_RECT = { x: 145, y: 380, width: 440, height: 350 };

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
  "chiefComplaint",
  "historyPresent",
  "pastHistory",
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
  return page;
}

function ensureSpace(
  ctx: PageContext,
  pdfDoc: PDFDocument,
  image: PDFImage,
  required: number,
): boolean {
  if (ctx.y - required < LAYOUT.footerMinY) {
    ctx.page = addSainiPage(pdfDoc, image);
    ctx.y = LAYOUT.contentTop;
    return true;
  }
  return false;
}

function drawClinicalFindings(
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
  drawText(ctx.page, "Clinical Findings", LAYOUT.marginLeft, ctx.y, bold, FONT.tableHead);
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
  const { consult, doctorName, patient } = props;

  const date = formatConsultDate(consult.completedAt ?? consult.startedAt ?? new Date().toISOString());
  const bp = String(consult.examination?.vitalsBp ?? "");
  const pr = String(consult.examination?.vitalsPulse ?? "");
  const weight = String(consult.examination?.vitalsWeight ?? "");
  const spo2 = String(consult.examination?.vitalsSpo2 ?? "");
  const temperature = String(consult.examination?.vitalsTemperature ?? "");
  const allergies = String(consult.examination?.allergies ?? "");

  // 0. Patient Information
  ensureSpace(ctx, pdfDoc, image, 24);
  drawText(ctx.page, "Patient Information", LAYOUT.marginLeft, ctx.y, bold, FONT.title);
  ctx.y -= 16;
  drawHLine(ctx.page, LAYOUT.marginLeft, LAYOUT.marginRight, ctx.y);
  ctx.y -= 12;

  const col1 = LAYOUT.marginLeft;
  const col2 = LAYOUT.marginLeft + 225;
  const rowH = 16;

  drawText(ctx.page, `Name: ${patient.name}`, col1, ctx.y, bold, FONT.body);
  drawText(ctx.page, `Date: ${date}`, col2, ctx.y, font, FONT.body);
  ctx.y -= rowH;

  drawText(ctx.page, `Age/Sex: ${resolvePatientAge(patient.age, patient.dateOfBirth) || "--"}y / ${patient.gender || "--"}`, col1, ctx.y, font, FONT.body);
  drawText(ctx.page, `Mobile: ${patient.phone || "--"}`, col2, ctx.y, font, FONT.body);
  ctx.y -= rowH;

  drawText(ctx.page, `City: ${patient.city || "--"}`, col1, ctx.y, font, FONT.body);
  drawText(ctx.page, `BP: ${bp || "--"}`, col2, ctx.y, font, FONT.body);
  ctx.y -= rowH;

  drawText(ctx.page, `Weight: ${weight ? weight + " kg" : "--"}`, col1, ctx.y, font, FONT.body);
  drawText(ctx.page, `Pulse: ${pr || "--"}`, col2, ctx.y, font, FONT.body);
  ctx.y -= rowH;

  drawText(ctx.page, `SpO2: ${spo2 ? spo2 + "%" : "--"}`, col1, ctx.y, font, FONT.body);
  drawText(ctx.page, `Temp: ${temperature ? temperature + " F" : "--"}`, col2, ctx.y, font, FONT.body);
  ctx.y -= rowH;

  // Allergies
  const allergiesLabel = "Allergies:";
  drawText(ctx.page, allergiesLabel, col1, ctx.y, bold, FONT.body);
  drawText(ctx.page, allergies || "None", col1 + bold.widthOfTextAtSize(allergiesLabel, FONT.body) + 8, ctx.y, font, FONT.body);
  ctx.y -= rowH;

  // Chronic conditions with Yes/No checkboxes
  function isYes(value: unknown): boolean {
    return value === true || value === "Yes" || value === "yes";
  }
  function isNo(value: unknown): boolean {
    return value === false || value === "No" || value === "no";
  }

  const conditions = [
    { label: "Diabetes:", keys: ["diabetes"] as const },
    { label: "Thyroid:", keys: ["thyroidDisorder", "thyroid"] as const },
    { label: "Hypertension:", keys: ["hypertension"] as const },
  ] as const;
  for (const { label, keys } of conditions) {
    const value = keys.map((k) => consult.examination?.[k]).find((v) => !isEmptyValue(v));
    const yesChecked = isYes(value);
    const noChecked = isNo(value);
    drawText(ctx.page, label, col1, ctx.y, bold, FONT.body);
    drawYesNoPair(
      ctx.page,
      col1 + bold.widthOfTextAtSize(label, FONT.body) + 8,
      ctx.y,
      font,
      FONT.body,
      yesChecked,
      noChecked,
    );
    ctx.y -= rowH;
  }

  ctx.y -= LAYOUT.paragraphGap;

  // 1. Chief Complaints
  const chiefComplaint = String(consult.examination?.chiefComplaint ?? "").trim();
  if (chiefComplaint) {
    const ccLines = wrapText(chiefComplaint, font, FONT.body, infoWidth - 12);
    ensureSpace(ctx, pdfDoc, image, 14 + ccLines.length * LAYOUT.lineLeading + LAYOUT.paragraphGap);
    drawText(ctx.page, "Chief Complaints", LAYOUT.marginLeft, ctx.y, bold, FONT.tableHead);
    ctx.y -= 14;
    ccLines.forEach((line) => {
      drawText(ctx.page, `\u2022 ${line}`, LAYOUT.marginLeft + 4, ctx.y, font, FONT.body);
      ctx.y -= LAYOUT.lineLeading;
    });
    ctx.y -= LAYOUT.paragraphGap;
  }

  // 2. Medical History
  const historyPresent = String(consult.examination?.historyPresent ?? "").trim();
  const pastHistory = String(consult.examination?.pastHistory ?? "").trim();
  if (historyPresent || pastHistory) {
    ensureSpace(ctx, pdfDoc, image, 14 + 12 + LAYOUT.paragraphGap);
    drawText(ctx.page, "Medical History", LAYOUT.marginLeft, ctx.y, bold, FONT.tableHead);
    ctx.y -= 14;
    drawHLine(ctx.page, LAYOUT.marginLeft, LAYOUT.marginRight, ctx.y);
    ctx.y -= 12;

    if (historyPresent) {
      const hLines = wrapText(historyPresent, font, FONT.body, infoWidth);
      ensureSpace(ctx, pdfDoc, image, LAYOUT.lineLeading + hLines.length * LAYOUT.lineLeading + 4);
      drawText(ctx.page, "History of present illness:", LAYOUT.marginLeft, ctx.y, bold, FONT.body);
      ctx.y -= LAYOUT.lineLeading;
      hLines.forEach((line) => {
        drawText(ctx.page, line, LAYOUT.marginLeft, ctx.y, font, FONT.body);
        ctx.y -= LAYOUT.lineLeading;
      });
      ctx.y -= 4;
    }

    if (pastHistory) {
      const pLines = wrapText(pastHistory, font, FONT.body, infoWidth);
      ensureSpace(ctx, pdfDoc, image, LAYOUT.lineLeading + pLines.length * LAYOUT.lineLeading + 4);
      drawText(ctx.page, "Past medical / surgical history:", LAYOUT.marginLeft, ctx.y, bold, FONT.body);
      ctx.y -= LAYOUT.lineLeading;
      pLines.forEach((line) => {
        drawText(ctx.page, line, LAYOUT.marginLeft, ctx.y, font, FONT.body);
        ctx.y -= LAYOUT.lineLeading;
      });
      ctx.y -= 4;
    }

    ctx.y -= LAYOUT.paragraphGap;
  }

  // 3. Clinical Findings
  drawClinicalFindings(ctx, pdfDoc, image, consult, font, bold);

  // 4. Diagnosis
  const primaryDiagnosis = String(consult.diagnosis?.primaryDiagnosis ?? "").trim();
  const clinicalImpression = String(consult.diagnosis?.clinicalImpression ?? "").trim();
  if (primaryDiagnosis || clinicalImpression) {
    const diagnosis = primaryDiagnosis || clinicalImpression || "\u2014";
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

  // 5. Investigations
  const investigations = String(
    (consult.treatment as Record<string, unknown>)?.investigations ??
    (consult.examination as Record<string, unknown>)?.investigations ??
    "",
  ).trim();
  if (investigations) {
    const invLines = wrapText(investigations, font, FONT.body, infoWidth - 12);
    ensureSpace(ctx, pdfDoc, image, 14 + invLines.length * LAYOUT.lineLeading + LAYOUT.paragraphGap);
    drawText(ctx.page, "Investigations", LAYOUT.marginLeft, ctx.y, bold, FONT.tableHead);
    ctx.y -= 14;
    invLines.forEach((line) => {
      drawText(ctx.page, `\u2022 ${line}`, LAYOUT.marginLeft + 4, ctx.y, font, FONT.body);
      ctx.y -= LAYOUT.lineLeading;
    });
    ctx.y -= LAYOUT.paragraphGap;
  }

  // 6. Prescription
  const medColX = [
    LAYOUT.marginLeft,
    LAYOUT.marginLeft + 18,
    LAYOUT.marginLeft + 200,
    LAYOUT.marginLeft + 260,
    LAYOUT.marginLeft + 340,
  ];

  const medColWidths = [
    medColX[1] - medColX[0] - 6,
    medColX[2] - medColX[1] - 6,
    medColX[3] - medColX[2] - 6,
    medColX[4] - medColX[3] - 6,
    LAYOUT.marginRight - medColX[4] - 6,
  ];

  function drawMedicationHeader() {
    ensureSpace(ctx, pdfDoc, image, 52);
    drawText(ctx.page, "\u211E Prescription", LAYOUT.marginLeft, ctx.y, bold, FONT.emphasis);
    ctx.y -= 14;

    drawHLine(ctx.page, LAYOUT.marginLeft, LAYOUT.marginRight, ctx.y);
    ctx.y -= 12;
    drawText(ctx.page, "#", medColX[0], ctx.y, bold, FONT.tableHead);
    drawText(ctx.page, "Medicine", medColX[1], ctx.y, bold, FONT.tableHead);
    drawText(ctx.page, "Dose", medColX[2], ctx.y, bold, FONT.tableHead);
    drawText(ctx.page, "Frequency", medColX[3], ctx.y, bold, FONT.tableHead);
    drawText(ctx.page, "Duration", medColX[4], ctx.y, bold, FONT.tableHead);
    ctx.y -= 16;
    drawHLine(ctx.page, LAYOUT.marginLeft, LAYOUT.marginRight, ctx.y);
    ctx.y -= 10;
  }

  drawMedicationHeader();

  if (!consult.prescription?.length) {
    ensureSpace(ctx, pdfDoc, image, 20);
    drawText(ctx.page, "No medicines prescribed", medColX[1], ctx.y, font, FONT.table);
    ctx.y -= 20;
    drawHLine(ctx.page, LAYOUT.marginLeft, LAYOUT.marginRight, ctx.y);
    ctx.y -= 10;
  } else {
    consult.prescription.forEach((line, i) => {
      const medicine = line.drug || "\u2014";
      const dose = line.dose || "";
      const frequency = formatFrequency(line.frequency);
      const duration = formatDuration(line);
      const instructions = line.instructions?.trim() || "";
      const notes = (line as { notes?: string }).notes?.trim() || "";

      const medLines = wrapText(medicine, font, FONT.table, medColWidths[1]);
      const doseLines = dose ? wrapText(dose, font, FONT.table, medColWidths[2]) : [];
      const freqLines = frequency && frequency !== "--" ? wrapText(frequency, font, FONT.table, medColWidths[3]) : [];
      const durLines = duration && duration !== "--" ? wrapText(duration, font, FONT.table, medColWidths[4]) : [];

      const maxLines = Math.max(medLines.length, doseLines.length, freqLines.length, durLines.length, 1);
      const rowHeight = Math.max(LAYOUT.minRowHeight, maxLines * LAYOUT.lineLeading + 6);

      // Sub-lines for instructions and notes
      const instLines = instructions ? wrapText(`Instr: ${instructions}`, font, FONT.caption, infoWidth - 24) : [];
      const noteLines = notes ? wrapText(`Note: ${notes}`, font, FONT.caption, infoWidth - 24) : [];
      const subHeight = (instLines.length + noteLines.length) * (LAYOUT.lineLeading - 1);

      const totalHeight = rowHeight + subHeight + 4;
      const newPage = ensureSpace(ctx, pdfDoc, image, totalHeight + 4);
      if (newPage) drawMedicationHeader();

      const rowTop = ctx.y;
      const serialY = rowTop - ((maxLines - 1) * LAYOUT.lineLeading) / 2 + 3;
      for (let idx = 0; idx < maxLines; idx++) {
        const lineY = rowTop - idx * LAYOUT.lineLeading;
        if (idx < medLines.length) drawText(ctx.page, medLines[idx], medColX[1], lineY, font, FONT.table);
        if (idx < doseLines.length && doseLines[idx]) drawText(ctx.page, doseLines[idx], medColX[2], lineY, font, FONT.table);
        if (idx < freqLines.length && freqLines[idx]) drawText(ctx.page, freqLines[idx], medColX[3], lineY, font, FONT.table);
        if (idx < durLines.length && durLines[idx]) drawText(ctx.page, durLines[idx], medColX[4], lineY, font, FONT.table);
      }
      drawText(ctx.page, String(i + 1), medColX[0], serialY, font, FONT.table);

      ctx.y -= rowHeight;

      // Draw instructions sub-line
      if (instLines.length) {
        instLines.forEach((il) => {
          drawText(ctx.page, `  ${il}`, LAYOUT.marginLeft + 18, ctx.y, font, FONT.caption);
          ctx.y -= LAYOUT.lineLeading - 1;
        });
      }
      // Draw notes sub-line
      if (noteLines.length) {
        noteLines.forEach((nl) => {
          drawText(ctx.page, `  ${nl}`, LAYOUT.marginLeft + 18, ctx.y, font, FONT.caption);
          ctx.y -= LAYOUT.lineLeading - 1;
        });
      }

      ctx.y -= 4;
      drawHLine(ctx.page, LAYOUT.marginLeft, LAYOUT.marginRight, ctx.y);
      ctx.y -= 8;
    });
  }

  // 7. Advice
  if (String(consult.treatment?.plan ?? "").trim()) {
    const planLines = wrapText(String(consult.treatment.plan), font, FONT.body, infoWidth);
    ensureSpace(ctx, pdfDoc, image, 14 + planLines.length * LAYOUT.lineLeading + LAYOUT.paragraphGap);
    drawText(ctx.page, "Advice", LAYOUT.marginLeft, ctx.y, bold, FONT.tableHead);
    ctx.y -= 14;
    planLines.forEach((line) => {
      drawText(ctx.page, line, LAYOUT.marginLeft, ctx.y, font, FONT.body);
      ctx.y -= LAYOUT.lineLeading;
    });
    ctx.y -= LAYOUT.paragraphGap;
  }

  // 8. Follow-up
  const followUp = String(consult.treatment?.followUp ?? "").trim();
  if (followUp) {
    ensureSpace(ctx, pdfDoc, image, 14 + LAYOUT.lineLeading + LAYOUT.paragraphGap);
    drawText(ctx.page, "Follow-up", LAYOUT.marginLeft, ctx.y, bold, FONT.tableHead);
    ctx.y -= 14;
    drawText(ctx.page, followUp, LAYOUT.marginLeft, ctx.y, font, FONT.body);
    ctx.y -= LAYOUT.lineLeading;
    ctx.y -= LAYOUT.paragraphGap;
  }

  // 9. Doctor Notes
  if (consult.doctorAdvice) {
    const adviceLines = wrapText(consult.doctorAdvice, font, FONT.body, infoWidth);
    const blockHeight = 14 + adviceLines.length * LAYOUT.lineLeading + LAYOUT.paragraphGap;
    ensureSpace(ctx, pdfDoc, image, blockHeight);
    drawText(ctx.page, "Doctor Notes", LAYOUT.marginLeft, ctx.y, bold, FONT.tableHead);
    ctx.y -= 14;
    adviceLines.forEach((line) => {
      drawText(ctx.page, line, LAYOUT.marginLeft, ctx.y, font, FONT.body);
      ctx.y -= LAYOUT.lineLeading;
    });
    ctx.y -= LAYOUT.paragraphGap;
  }

  // 10. Signature
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

  // White-out the pre-printed patient info block on the first page only.
  page.drawRectangle({
    x: PATIENT_INFO_RECT.x,
    y: PATIENT_INFO_RECT.y,
    width: PATIENT_INFO_RECT.width,
    height: PATIENT_INFO_RECT.height,
    color: COLORS.white,
    borderColor: COLORS.border,
    borderWidth: 0.5,
  });

  // All content (patient info + prescription) flows from top of cleared area.
  drawPrescriptionContent(pdfDoc, image, page, props, LAYOUT.contentTop, font, bold);

  return pdfDoc.save();
}
