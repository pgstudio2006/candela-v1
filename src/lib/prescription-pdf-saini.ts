import { PDFDocument, PDFImage, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Patient, Visit } from "@/design-system/frontdesk-data";
import type { ConsultationRecord } from "@/design-system/doctor-data";
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

  // Medications
  ensureSpace(ctx, pdfDoc, image, 16 + 16);
  drawText(ctx.page, "℞ Medications", LAYOUT.marginLeft, ctx.y, bold, FONT.emphasis);
  ctx.y -= 16;

  if (!consult.prescription?.length) {
    drawText(ctx.page, "No medicines prescribed", LAYOUT.marginLeft, ctx.y, font, FONT.body);
    ctx.y -= 16;
  } else {
    consult.prescription.forEach((line, i) => {
      const header = `${line.drug || "—"} — ${line.dose} — ${formatFrequency(line.frequency)} — ${formatDuration(line)}`;
      const instructions = line.instructions?.trim();
      const instLines = instructions
        ? wrapText(`Instructions: ${instructions}`, font, FONT.body, infoWidth - 14)
        : [];
      const blockHeight = 14 + instLines.length * LAYOUT.lineLeading + 6;

      // Ensure the whole medication block fits; if not, start a new page.
      ensureSpace(ctx, pdfDoc, image, blockHeight);

      drawText(ctx.page, `${i + 1}. ${header}`, LAYOUT.marginLeft, ctx.y, font, FONT.body);
      ctx.y -= 14;

      instLines.forEach((instLine) => {
        // Keep instructions with their header; page-break within long instructions if needed.
        if (ctx.y - LAYOUT.lineLeading < LAYOUT.footerMinY) {
          ctx.page = addSainiPage(pdfDoc, image);
          ctx.y = LAYOUT.contentTop;
        }
        drawText(ctx.page, instLine, LAYOUT.marginLeft + 14, ctx.y, font, FONT.body);
        ctx.y -= LAYOUT.lineLeading;
      });
      ctx.y -= 6;
    });
    ctx.y -= LAYOUT.paragraphGap;
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
  ensureSpace(ctx, pdfDoc, image, 42);
  const sigX = LAYOUT.marginRight - 180;
  const sigRight = LAYOUT.marginRight - 8;
  drawHLine(ctx.page, sigX, sigRight, ctx.y);
  ctx.y -= 12;
  drawRightText(ctx.page, doctorName, sigRight, ctx.y, font, FONT.caption, 0);
  ctx.y -= 14;
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

  drawText(page, "Patient Information", col1, infoY, bold, FONT.title);
  infoY -= 18;

  drawText(page, `Name: ${patient.name}`, col1, infoY, bold, FONT.body);
  drawText(page, `Mobile: ${patient.phone || "—"}`, col2, infoY, font, FONT.body);
  infoY -= rowH;

  drawText(page, `Age / Sex: ${patient.age ?? "—"}y / ${patient.gender || "—"}`, col1, infoY, font, FONT.body);
  drawText(page, `Date: ${date}`, col2, infoY, font, FONT.body);
  infoY -= rowH;

  drawText(page, `City: ${patient.city || "—"}`, col1, infoY, font, FONT.body);
  drawText(page, `BP: —`, col2, infoY, font, FONT.body);
  infoY -= rowH;

  drawText(page, `Allergies: —`, col1, infoY, font, FONT.body);
  drawText(page, `PR: —`, col2, infoY, font, FONT.body);
  infoY -= rowH;

  drawText(page, `Diabetes: —`, col1, infoY, font, FONT.body);
  infoY -= rowH;
  drawText(page, `Thyroid disorder: —`, col1, infoY, font, FONT.body);
  infoY -= rowH;
  drawText(page, `Hypertension: —`, col1, infoY, font, FONT.body);

  drawPrescriptionContent(pdfDoc, image, page, props, LAYOUT.contentTop, font, bold);

  return pdfDoc.save();
}
