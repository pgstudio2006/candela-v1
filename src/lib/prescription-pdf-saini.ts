import { PDFDocument, PDFImage, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
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
  pdfSafeText,
  wrapText,
} from "@/lib/prescription-pdf-shared";

const SAINI_IMAGE_URL = "/templates/saini-letterhead.png";

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
  marginLeft: 148,
  marginRight: 560,
  contentTop: 570,
  minRowHeight: 14,
  lineLeading: 11,
  footerMinY: 110,
  sectionGap: 8,
  paragraphGap: 6,
} as const;

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
  "allergyKnown",
  "allergies",
  "diabetes",
  "thyroidDisorder",
  "hypertension",
  "chiefComplaint",
  "historyPresent",
  "pastHistory",
  "investigations",
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

function fitSingleLine(text: string, font: PDFFont, size: number, maxWidth: number): string {
  const safe = text.trim() ? pdfSafeText(text.trim()) : "--";
  if (font.widthOfTextAtSize(safe, size) <= maxWidth) return safe;

  const ellipsis = "...";
  let end = safe.length;
  while (end > 1 && font.widthOfTextAtSize(`${safe.slice(0, end)}${ellipsis}`, size) > maxWidth) {
    end -= 1;
  }
  return `${safe.slice(0, Math.max(1, end)).trimEnd()}${ellipsis}`;
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

function drawPatientValue(
  page: PDFPage,
  x: number,
  y: number,
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
) {
  drawText(page, fitSingleLine(text, font, size, maxWidth), x, y, font, size);
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
  const allergies = String(consult.examination?.allergies ?? "");

  const panelLeft = 148;
  const panelRight = 562;
  const panelTop = 586;
  const leftLabelX = panelLeft + 10;
  const leftValueX = panelLeft + 92;
  const rightLabelX = panelLeft + 215;
  const rightValueX = panelLeft + 300;
  const lineGap = 22;
  let panelY = panelTop - 18;

  drawText(ctx.page, "PATIENT DETAILS", leftLabelX, panelY, bold, FONT.tableHead);
  drawHLine(ctx.page, leftLabelX, panelRight - 6, panelY - 4);
  panelY -= 14;

  drawText(ctx.page, "Patient Name:", leftLabelX, panelY, font, FONT.body);
  drawPatientValue(ctx.page, leftValueX, panelY, patient.name, font, FONT.body, 255);
  panelY -= lineGap;

  drawText(ctx.page, "Age/Sex:", leftLabelX, panelY, font, FONT.body);
  drawPatientValue(
    ctx.page,
    leftValueX,
    panelY,
    `${resolvePatientAge(patient.age, patient.dateOfBirth) || "--"} / ${patient.gender || "--"}`,
    font,
    FONT.body,
    95,
  );
  drawText(ctx.page, "Mobile No.:", rightLabelX, panelY, font, FONT.body);
  drawPatientValue(ctx.page, rightValueX, panelY, patient.phone || "--", font, FONT.body, 90);
  panelY -= lineGap;

  drawText(ctx.page, "City:", leftLabelX, panelY, font, FONT.body);
  drawPatientValue(ctx.page, leftValueX, panelY, patient.city || "--", font, FONT.body, 255);
  drawText(ctx.page, "Date:", rightLabelX, panelY, font, FONT.body);
  drawPatientValue(ctx.page, rightValueX, panelY, date, font, FONT.body, 90);
  panelY -= lineGap;

  drawText(ctx.page, "BP:", leftLabelX, panelY, font, FONT.body);
  drawPatientValue(ctx.page, leftValueX, panelY, bp || "--", font, FONT.body, 80);
  drawText(ctx.page, "PR:", rightLabelX, panelY, font, FONT.body);
  drawPatientValue(ctx.page, rightValueX, panelY, pr || "--", font, FONT.body, 90);
  panelY -= lineGap;

  const explicitAllergyKnown = consult.examination?.allergyKnown;
  const allergyText = allergies.trim().toLowerCase();
  const hasTextAllergy =
    !!allergyText &&
    !["none", "nkda", "nil", "no", "--", "-"].includes(allergyText);
  const hasAllergy =
    isYes(explicitAllergyKnown)
      ? true
      : isNo(explicitAllergyKnown)
        ? false
        : hasTextAllergy;

  function isYes(value: unknown): boolean {
    return value === true || value === "Yes" || value === "yes";
  }
  function isNo(value: unknown): boolean {
    return value === false || value === "No" || value === "no";
  }

  const checkboxYesX = leftLabelX + 105;
  const checkboxNoX = leftLabelX + 145;
  const allergyDetailX = checkboxNoX + 40;

  drawText(ctx.page, "Allergy:", leftLabelX, panelY, font, FONT.body);
  drawCheckbox(ctx.page, checkboxYesX, panelY, 7, hasAllergy);
  drawText(ctx.page, "Yes", checkboxYesX + 12, panelY, font, FONT.body);
  drawCheckbox(ctx.page, checkboxNoX, panelY, 7, !hasAllergy);
  drawText(ctx.page, "No", checkboxNoX + 12, panelY, font, FONT.body);
  if (hasAllergy) {
    drawPatientValue(ctx.page, allergyDetailX, panelY, allergies.trim(), font, FONT.body, LAYOUT.marginRight - allergyDetailX - 8);
  }
  panelY -= lineGap + 2;

  const conditions = [
    { label: "Diabetes", keys: ["diabetes"] as const, y: panelY },
    { label: "Thyroid Disorder", keys: ["thyroidDisorder", "thyroid"] as const, y: panelY - lineGap },
    { label: "Hypertension", keys: ["hypertension"] as const, y: panelY - lineGap * 2 },
  ] as const;
  const conditionLabelX = leftLabelX;

  for (const { label, keys, y } of conditions) {
    const value = keys.map((k) => consult.examination?.[k]).find((v) => !isEmptyValue(v));
    const yesChecked = isYes(value);
    const noChecked = isNo(value);
    drawText(ctx.page, `${label}:`, conditionLabelX, y, font, FONT.body);
    drawCheckbox(ctx.page, checkboxYesX, y, 7, yesChecked);
    drawText(ctx.page, "Yes", checkboxYesX + 12, y, font, FONT.body);
    drawCheckbox(ctx.page, checkboxNoX, y, 7, noChecked);
    drawText(ctx.page, "No", checkboxNoX + 12, y, font, FONT.body);
  }
  // Move below the last condition row with just enough gap for the next section
  ctx.y = conditions[conditions.length - 1].y - lineGap - 4;

  // 1. Chief Complaints
  const chiefComplaint = String(consult.examination?.chiefComplaint ?? "").trim();
  if (chiefComplaint) {
    const ccLines = wrapText(chiefComplaint, font, FONT.body, infoWidth);
    ensureSpace(ctx, pdfDoc, image, 12 + ccLines.length * LAYOUT.lineLeading + LAYOUT.paragraphGap);
    drawText(ctx.page, "Chief Complaints", LAYOUT.marginLeft, ctx.y, bold, FONT.tableHead);
    ctx.y -= 18;
    ccLines.forEach((line) => {
      drawText(ctx.page, line, LAYOUT.marginLeft, ctx.y, font, FONT.body);
      ctx.y -= LAYOUT.lineLeading;
    });
    ctx.y -= LAYOUT.paragraphGap;
  }

  // 2. Medical History
  const historyPresent = String(consult.examination?.historyPresent ?? "").trim();
  const pastHistory = String(consult.examination?.pastHistory ?? "").trim();
  if (historyPresent || pastHistory) {
    ensureSpace(ctx, pdfDoc, image, 12 + LAYOUT.paragraphGap);
    drawText(ctx.page, "Medical History", LAYOUT.marginLeft, ctx.y, bold, FONT.tableHead);
    ctx.y -= 12;

    if (historyPresent) {
      const hLines = wrapText(historyPresent, font, FONT.body, infoWidth - 8);
      ensureSpace(ctx, pdfDoc, image, hLines.length * LAYOUT.lineLeading + 6);
      drawText(ctx.page, "HPI:", LAYOUT.marginLeft, ctx.y, bold, FONT.body);
      ctx.y -= LAYOUT.lineLeading;
      hLines.forEach((line) => {
        drawText(ctx.page, line, LAYOUT.marginLeft + 8, ctx.y, font, FONT.body);
        ctx.y -= LAYOUT.lineLeading;
      });
    }

    if (pastHistory) {
      const pLines = wrapText(pastHistory, font, FONT.body, infoWidth - 8);
      ensureSpace(ctx, pdfDoc, image, pLines.length * LAYOUT.lineLeading + 6);
      drawText(ctx.page, "Past Hx:", LAYOUT.marginLeft, ctx.y, bold, FONT.body);
      ctx.y -= LAYOUT.lineLeading;
      pLines.forEach((line) => {
        drawText(ctx.page, line, LAYOUT.marginLeft + 8, ctx.y, font, FONT.body);
        ctx.y -= LAYOUT.lineLeading;
      });
    }

    ctx.y -= LAYOUT.paragraphGap;
  }

  // 3. Clinical Findings
  drawClinicalFindings(ctx, pdfDoc, image, consult, font, bold);

  // 4. Diagnosis
  const primaryDiagnosis = String(consult.diagnosis?.primaryDiagnosis ?? "").trim();
  const clinicalImpression = String(consult.diagnosis?.clinicalImpression ?? "").trim();
  if (primaryDiagnosis || clinicalImpression) {
    const diagnosis = primaryDiagnosis || clinicalImpression;
    const lines = wrapText(diagnosis, font, FONT.body, infoWidth);
    ensureSpace(ctx, pdfDoc, image, 12 + lines.length * LAYOUT.lineLeading + LAYOUT.paragraphGap);
    drawText(ctx.page, "Diagnosis", LAYOUT.marginLeft, ctx.y, bold, FONT.tableHead);
    ctx.y -= 12;
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
    const invLines = wrapText(investigations, font, FONT.body, infoWidth);
    ensureSpace(ctx, pdfDoc, image, 12 + invLines.length * LAYOUT.lineLeading + LAYOUT.paragraphGap);
    drawText(ctx.page, "Investigations", LAYOUT.marginLeft, ctx.y, bold, FONT.tableHead);
    ctx.y -= 12;
    invLines.forEach((line) => {
      drawText(ctx.page, line, LAYOUT.marginLeft, ctx.y, font, FONT.body);
      ctx.y -= LAYOUT.lineLeading;
    });
    ctx.y -= LAYOUT.paragraphGap;
  }

  // 6. Prescription — 5 columns with proper proportions
  const medColX = [
    LAYOUT.marginLeft,           // #
    LAYOUT.marginLeft + 22,      // Medicine
    LAYOUT.marginLeft + 170,     // Dose
    LAYOUT.marginLeft + 260,     // Frequency
    LAYOUT.marginLeft + 350,     // Duration
  ];

  const medColWidths = [
    12,                          // #
    medColX[2] - medColX[1] - 8, // Medicine
    medColX[3] - medColX[2] - 8, // Dose
    medColX[4] - medColX[3] - 8, // Frequency
    LAYOUT.marginRight - medColX[4] - 8, // Duration
  ];

  function drawMedicationHeader() {
    ensureSpace(ctx, pdfDoc, image, 42);
    ctx.y -= 4;
    drawText(ctx.page, "Rx", LAYOUT.marginLeft, ctx.y, bold, 12);
    ctx.y -= 14;
    drawHLine(ctx.page, LAYOUT.marginLeft, LAYOUT.marginRight, ctx.y);
    ctx.y -= 12;
    drawText(ctx.page, "#", medColX[0], ctx.y, bold, FONT.tableHead);
    drawText(ctx.page, "Medicine", medColX[1], ctx.y, bold, FONT.tableHead);
    drawText(ctx.page, "Dose", medColX[2], ctx.y, bold, FONT.tableHead);
    drawText(ctx.page, "Frequency", medColX[3], ctx.y, bold, FONT.tableHead);
    drawText(ctx.page, "Duration", medColX[4], ctx.y, bold, FONT.tableHead);
    ctx.y -= 12;
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
      const rowHeight = Math.max(LAYOUT.minRowHeight, maxLines * LAYOUT.lineLeading + 4);

      const instLines = instructions ? wrapText(instructions, font, FONT.caption, medColWidths[1]) : [];
      const noteLines = notes ? wrapText(notes, font, FONT.caption, medColWidths[1]) : [];
      const subHeight = (instLines.length + noteLines.length) * 10;

      const totalHeight = rowHeight + subHeight + 2;
      const newPage = ensureSpace(ctx, pdfDoc, image, totalHeight + 4);
      if (newPage) drawMedicationHeader();

      const rowTop = ctx.y;
      for (let idx = 0; idx < maxLines; idx++) {
        const lineY = rowTop - idx * LAYOUT.lineLeading;
        if (idx < medLines.length) drawText(ctx.page, medLines[idx], medColX[1], lineY, font, FONT.table);
        if (idx < doseLines.length && doseLines[idx]) drawText(ctx.page, doseLines[idx], medColX[2], lineY, font, FONT.table);
        if (idx < freqLines.length && freqLines[idx]) drawText(ctx.page, freqLines[idx], medColX[3], lineY, font, FONT.table);
        if (idx < durLines.length && durLines[idx]) drawText(ctx.page, durLines[idx], medColX[4], lineY, font, FONT.table);
      }
      drawText(ctx.page, String(i + 1), medColX[0], rowTop, font, FONT.table);

      ctx.y -= rowHeight;

      if (instLines.length) {
        instLines.forEach((il) => {
          drawText(ctx.page, il, medColX[1], ctx.y, font, FONT.caption);
          ctx.y -= 10;
        });
      }
      if (noteLines.length) {
        noteLines.forEach((nl) => {
          drawText(ctx.page, nl, medColX[1], ctx.y, font, FONT.caption);
          ctx.y -= 10;
        });
      }

      ctx.y -= 2;
      drawHLine(ctx.page, LAYOUT.marginLeft, LAYOUT.marginRight, ctx.y);
      ctx.y -= 10;
    });
  }

  // 7. Follow-up
  const followUp = String(consult.treatment?.followUp ?? "").trim();
  if (followUp) {
    ensureSpace(ctx, pdfDoc, image, 12 + LAYOUT.lineLeading + LAYOUT.paragraphGap);
    drawText(ctx.page, "Follow-up", LAYOUT.marginLeft, ctx.y, bold, FONT.tableHead);
    ctx.y -= 12;
    drawText(ctx.page, followUp, LAYOUT.marginLeft, ctx.y, font, FONT.body);
    ctx.y -= LAYOUT.lineLeading;
    ctx.y -= LAYOUT.paragraphGap;
  }

  // 8. Advice — doctor's advice to the patient (NOT the internal treatment plan)
  if (consult.doctorAdvice) {
    const adviceLines = wrapText(consult.doctorAdvice, font, FONT.body, infoWidth);
    const blockHeight = 12 + adviceLines.length * LAYOUT.lineLeading + LAYOUT.paragraphGap;
    ensureSpace(ctx, pdfDoc, image, blockHeight);
    drawText(ctx.page, "Advice", LAYOUT.marginLeft, ctx.y, bold, FONT.tableHead);
    ctx.y -= 12;
    adviceLines.forEach((line) => {
      drawText(ctx.page, line, LAYOUT.marginLeft, ctx.y, font, FONT.body);
      ctx.y -= LAYOUT.lineLeading;
    });
    ctx.y -= LAYOUT.paragraphGap;
  }

  // 10. Signature
  ensureSpace(ctx, pdfDoc, image, 50);
  ctx.y -= 16;
  const sigRight = LAYOUT.marginRight;
  const sigWidth = Math.max(
    font.widthOfTextAtSize(pdfSafeText(doctorName), FONT.body),
    font.widthOfTextAtSize("Consultant", FONT.caption),
  ) + 20;
  const sigX = sigRight - sigWidth;
  drawHLine(ctx.page, sigX, sigRight, ctx.y);
  ctx.y -= 12;
  drawRightText(ctx.page, doctorName, sigRight, ctx.y, font, FONT.body, 0);
  ctx.y -= 11;
  drawRightText(ctx.page, "Consultant", sigRight, ctx.y, font, FONT.caption, 0);
}

export async function generateSainiPrescriptionPdf(props: SainiProps): Promise<Uint8Array> {
  const imageBytes = await fetch(SAINI_IMAGE_URL).then((res) => {
    if (!res.ok) throw new Error("Saini letterhead image not found.");
    return res.arrayBuffer();
  });

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE.width, PAGE.height]);
  const image = SAINI_IMAGE_URL.toLowerCase().endsWith(".png")
    ? await pdfDoc.embedPng(imageBytes)
    : await pdfDoc.embedJpg(imageBytes);
  page.drawImage(image, { x: 0, y: 0, width: PAGE.width, height: PAGE.height });

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  drawPrescriptionContent(pdfDoc, image, page, props, LAYOUT.contentTop, font, bold);

  return pdfDoc.save();
}
