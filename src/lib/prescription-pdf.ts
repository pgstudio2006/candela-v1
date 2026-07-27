import { PDFDocument, StandardFonts } from "pdf-lib";
import type { Patient, Visit } from "@/design-system/frontdesk-data";
import type { ConsultationRecord } from "@/design-system/doctor-data";
import { generateSainiPrescriptionPdf } from "@/lib/prescription-pdf-saini";
import type { DocumentLayoutId } from "@/design-system/document-templates";
import { resolvePatientAge } from "@/lib/frontdesk-workflow";
import {
  COLORS,
  FONT,
  drawText,
  drawRightText,
  wrapText,
  drawHLine,
  formatConsultDate,
  formatFrequency,
  formatDuration,
} from "@/lib/prescription-pdf-shared";

const TEMPLATE_URL = "/templates/navayu-invoice-template.pdf";

const LAYOUT = {
  marginLeft: 42,
  marginRight: 553,
  contentTop: 650,
  minRowHeight: 17,
  lineLeading: 11,
  footerMinY: 80,
  sectionGap: 16,
  paragraphGap: 12,
} as const;

type PrescriptionPdfProps = {
  patient: Patient;
  visit: Visit;
  consult: ConsultationRecord;
  doctorName: string;
  layout?: DocumentLayoutId;
  branchId?: string;
};

export async function generatePrescriptionPdf(props: PrescriptionPdfProps): Promise<Uint8Array> {
  const { patient, visit, consult, doctorName, layout = "navayu-letterhead", branchId } = props;

  if (layout === "dr-sunil-saini-letterhead") {
    return generateSainiPrescriptionPdf({ patient, visit, consult, doctorName });
  }

  const templateUrl = branchId === "branch_pataudi" ? "/templates/60984.pdf" : TEMPLATE_URL;
  const templateBytes = await fetch(templateUrl).then((res) => {
    if (!res.ok) throw new Error("Invoice template PDF not found.");
    return res.arrayBuffer();
  });

  const pdfDoc = await PDFDocument.load(templateBytes);
  const page = pdfDoc.getPages()[0];
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const date = formatConsultDate(consult.completedAt ?? consult.startedAt ?? new Date().toISOString());

  let currentY: number = LAYOUT.contentTop;
  const infoWidth = LAYOUT.marginRight - LAYOUT.marginLeft;
  const midX = LAYOUT.marginLeft + infoWidth / 2;

  // Header
  drawText(page, "PRESCRIPTION", LAYOUT.marginLeft, currentY, bold, FONT.title);
  drawRightText(page, `Date: ${date}`, LAYOUT.marginRight, currentY, font, FONT.body);
  currentY -= 28;

  // Patient info card
  drawHLine(page, LAYOUT.marginLeft, LAYOUT.marginRight, currentY);
  currentY -= 16;
  drawText(page, `Patient: ${patient.name}`, LAYOUT.marginLeft, currentY, bold, FONT.body);
  drawText(page, `UHID: ${patient.uhid}`, midX, currentY, bold, FONT.body);
  currentY -= 16;
  const resolvedAge = resolvePatientAge(patient.age, patient.dateOfBirth);
  drawText(page, `Age / Sex: ${resolvedAge ? `${resolvedAge}y` : "—"} / ${patient.gender || "—"}`, LAYOUT.marginLeft, currentY, font, FONT.body);
  drawText(page, `Phone: ${patient.phone || "—"}`, midX, currentY, font, FONT.body);
  currentY -= 16;
  drawText(page, `Doctor: ${doctorName}`, LAYOUT.marginLeft, currentY, font, FONT.body);
  drawText(page, `Token: #${visit.token ?? "—"}`, midX, currentY, font, FONT.body);
  currentY -= 14;
  drawHLine(page, LAYOUT.marginLeft, LAYOUT.marginRight, currentY);
  currentY -= LAYOUT.sectionGap;

  // Diagnosis
  const primaryDiagnosis = String(consult.diagnosis.primaryDiagnosis ?? "").trim();
  const clinicalImpression = String(consult.diagnosis.clinicalImpression ?? "").trim();
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

  if (consult.prescription.length === 0) {
    drawText(page, "No medicines prescribed", LAYOUT.marginLeft, currentY, font, FONT.body);
    currentY -= 16;
  } else {
    const colX: number[] = [
      LAYOUT.marginLeft,
      LAYOUT.marginLeft + 30,
      LAYOUT.marginLeft + 180,
      LAYOUT.marginLeft + 270,
      LAYOUT.marginLeft + 350,
      LAYOUT.marginLeft + 430,
    ];
    const rowHeight = 16;
    const topY = currentY;
    drawHLine(page, LAYOUT.marginLeft, LAYOUT.marginRight, currentY);
    currentY -= 14;
    drawText(page, "#", colX[0], currentY, bold, FONT.tableHead);
    drawText(page, "Medicine", colX[1], currentY, bold, FONT.tableHead);
    drawText(page, "Dose", colX[2], currentY, bold, FONT.tableHead);
    drawText(page, "Frequency", colX[3], currentY, bold, FONT.tableHead);
    drawText(page, "Duration", colX[4], currentY, bold, FONT.tableHead);
    drawText(page, "Instructions", colX[5], currentY, bold, FONT.tableHead);
    currentY -= rowHeight;
    drawHLine(page, LAYOUT.marginLeft, LAYOUT.marginRight, currentY + rowHeight - 2);

    consult.prescription.forEach((line, i) => {
      const instructions = line.instructions ?? "—";
      const instructionLines = wrapText(instructions, font, FONT.table, infoWidth - (colX[5] - LAYOUT.marginLeft));
      const rowLines = Math.max(1, instructionLines.length);
      const rowY = currentY;
      drawText(page, String(i + 1), colX[0], currentY, font, FONT.table);
      drawText(page, line.drug || "—", colX[1], currentY, font, FONT.table);
      drawText(page, line.dose, colX[2], currentY, font, FONT.table);
      drawText(page, formatFrequency(line.frequency), colX[3], currentY, font, FONT.table);
      drawText(page, formatDuration(line), colX[4], currentY, font, FONT.table);
      instructionLines.forEach((instLine, idx) => {
        drawText(page, instLine, colX[5], currentY - idx * LAYOUT.lineLeading, font, FONT.table);
      });
      currentY -= Math.max(rowHeight, rowLines * LAYOUT.lineLeading + 4);
      drawHLine(page, LAYOUT.marginLeft, LAYOUT.marginRight, currentY);
    });
    currentY -= LAYOUT.paragraphGap;
  }

  // Advice
  if (String(consult.treatment.plan ?? "")) {
    drawText(page, "Advice", LAYOUT.marginLeft, currentY, bold, FONT.tableHead);
    currentY -= 14;
    const planLines = wrapText(String(consult.treatment.plan), font, FONT.body, infoWidth);
    planLines.forEach((line) => {
      drawText(page, line, LAYOUT.marginLeft, currentY, font, FONT.body);
      currentY -= LAYOUT.lineLeading;
    });
    if (String(consult.treatment.followUp ?? "")) {
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

  return pdfDoc.save();
}

export function printPdfBytes(bytes: Uint8Array, title = "Prescription") {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.title = title;
  iframe.src = url;
  const cleanup = () => {
    URL.revokeObjectURL(url);
    iframe.remove();
  };
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      window.setTimeout(cleanup, 60_000);
    }
  };
  document.body.appendChild(iframe);
}
