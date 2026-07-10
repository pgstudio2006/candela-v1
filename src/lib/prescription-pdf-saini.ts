import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Patient, Visit } from "@/design-system/frontdesk-data";
import type { ConsultationRecord } from "@/design-system/doctor-data";
import {
  COLORS,
  FONT as BASE_FONT,
  drawHLine,
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
  footerMinY: 120,
  sectionGap: 14,
  paragraphGap: 10,
} as const;

type SainiProps = {
  patient: Patient;
  visit: Visit;
  consult: ConsultationRecord;
  doctorName: string;
};

function drawPrescriptionContent(
  page: PDFPage,
  props: SainiProps,
  startY: number,
  font: PDFFont,
  bold: PDFFont,
): void {
  let currentY = startY;
  const infoWidth = LAYOUT.marginRight - LAYOUT.marginLeft;
  const { consult, doctorName } = props;

  // Diagnosis
  const primaryDiagnosis = String(consult.diagnosis?.primaryDiagnosis ?? "").trim();
  const clinicalImpression = String(consult.diagnosis?.clinicalImpression ?? "").trim();
  if (primaryDiagnosis || clinicalImpression) {
    drawText(page, "Diagnosis", LAYOUT.marginLeft, currentY, bold, FONT.tableHead);
    currentY -= 14;
    const diagnosis = primaryDiagnosis || clinicalImpression || "—";
    const lines = wrapText(diagnosis, font, FONT.body, infoWidth);
    lines.forEach((line) => {
      drawText(page, line, LAYOUT.marginLeft, currentY, font, FONT.body);
      currentY -= LAYOUT.lineLeading;
    });
    currentY -= LAYOUT.paragraphGap;
  }

  // Medications
  drawText(page, "℞ Medications", LAYOUT.marginLeft, currentY, bold, FONT.emphasis);
  currentY -= 16;

  if (!consult.prescription?.length) {
    drawText(page, "No medicines prescribed", LAYOUT.marginLeft, currentY, font, FONT.body);
    currentY -= 16;
  } else {
    consult.prescription.forEach((line, i) => {
      const header = `${line.drug || "—"} — ${line.dose} — ${formatFrequency(line.frequency)} — ${formatDuration(line)}`;
      drawText(page, `${i + 1}. ${header}`, LAYOUT.marginLeft, currentY, font, FONT.body);
      currentY -= 14;
      const instructions = line.instructions?.trim();
      if (instructions) {
        const instLines = wrapText(`Instructions: ${instructions}`, font, FONT.body, infoWidth - 14);
        instLines.forEach((instLine) => {
          drawText(page, instLine, LAYOUT.marginLeft + 14, currentY, font, FONT.body);
          currentY -= LAYOUT.lineLeading;
        });
      }
      currentY -= 6;
    });
    currentY -= LAYOUT.paragraphGap;
  }

  // Advice
  if (String(consult.treatment?.plan ?? "")) {
    drawText(page, "Advice", LAYOUT.marginLeft, currentY, bold, FONT.tableHead);
    currentY -= 14;
    const planLines = wrapText(String(consult.treatment.plan), font, FONT.body, infoWidth);
    planLines.forEach((line) => {
      drawText(page, line, LAYOUT.marginLeft, currentY, font, FONT.body);
      currentY -= LAYOUT.lineLeading;
    });
    if (String(consult.treatment?.followUp ?? "")) {
      currentY -= 4;
      drawText(page, `Follow-up: ${String(consult.treatment.followUp)}`, LAYOUT.marginLeft, currentY, font, FONT.body);
      currentY -= LAYOUT.lineLeading;
    }
    currentY -= LAYOUT.paragraphGap;
  }

  // Doctor advice
  if (consult.doctorAdvice) {
    drawText(page, "Doctor advice", LAYOUT.marginLeft, currentY, bold, FONT.tableHead);
    currentY -= 14;
    const adviceLines = wrapText(consult.doctorAdvice, font, FONT.body, infoWidth);
    adviceLines.forEach((line) => {
      drawText(page, line, LAYOUT.marginLeft, currentY, font, FONT.body);
      currentY -= LAYOUT.lineLeading;
    });
    currentY -= LAYOUT.paragraphGap;
  }

  // Signature
  currentY = Math.max(currentY, LAYOUT.footerMinY + 32);
  const sigX = LAYOUT.marginRight - 180;
  drawHLine(page, sigX, LAYOUT.marginRight, currentY);
  currentY -= 4;
  drawText(page, doctorName, sigX + 90, currentY, font, FONT.caption);
  currentY -= 10;
  drawText(page, "Consultant Signature", sigX + 90, currentY, font, FONT.caption);
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

  // White-out the pre-printed patient info block while preserving the rest of the letterhead.
  const patientInfoRect = { x: 140, y: 400, width: 440, height: 215 };
  page.drawRectangle({
    x: patientInfoRect.x,
    y: patientInfoRect.y,
    width: patientInfoRect.width,
    height: patientInfoRect.height,
    color: COLORS.white,
    borderColor: COLORS.border,
    borderWidth: 0.5,
  });

  // Draw system patient info inside the cleared area.
  let infoY = patientInfoRect.y + patientInfoRect.height - 16;
  const col1 = patientInfoRect.x + 12;
  const col2 = patientInfoRect.x + 190;
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

  drawPrescriptionContent(page, props, LAYOUT.contentTop, font, bold);

  return pdfDoc.save();
}
