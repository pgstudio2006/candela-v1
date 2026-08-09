import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Patient, Visit } from "@/design-system/frontdesk-data";
import type { ConsultationRecord } from "@/design-system/doctor-data";
import { generateSainiPrescriptionPdf } from "@/lib/prescription-pdf-saini";
import type { DocumentLayoutId, DocumentTemplate, DocumentTemplateOverlayField } from "@/design-system/document-templates";
import { resolvePatientAge } from "@/lib/frontdesk-workflow";
import {
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
  uploadedTemplateFileData?: string | null;
  template?: DocumentTemplate | null;
};

export async function generatePrescriptionPdf(props: PrescriptionPdfProps): Promise<Uint8Array> {
  const { patient, visit, consult, doctorName, layout = "navayu-letterhead", branchId, uploadedTemplateFileData, template } = props;
  const effectiveLayout = template?.layout ?? layout;
  const effectiveBranchId = branchId;

  if (effectiveLayout === "dr-sunil-saini-letterhead") {
    return generateSainiPrescriptionPdf({ patient, visit, consult, doctorName });
  }

  const pdfUrl = template?.layout === "uploaded-pdf"
    ? (template.fileData ?? uploadedTemplateFileData)
    : effectiveBranchId === "branch_pataudi"
      ? (uploadedTemplateFileData ?? "/templates/60984.pdf")
      : TEMPLATE_URL;

  if (!pdfUrl) {
    throw new Error("Prescription template PDF not found.");
  }

  const templateBytes = await fetch(pdfUrl).then((res) => {
    if (!res.ok) throw new Error("Prescription template PDF not found.");
    return res.arrayBuffer();
  });

  const pdfDoc = await PDFDocument.load(templateBytes);
  const page = pdfDoc.getPages()[0];
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageHeight = page.getHeight();
  const date = formatConsultDate(consult.completedAt ?? consult.startedAt ?? new Date().toISOString());

  // For Pataudi, leave room for the patient header; otherwise use template marginTop or default.
  const pataudiContentTop = pageHeight - 360;
  const contentTop =
    template?.marginTop != null
      ? pageHeight - template.marginTop
      : effectiveBranchId === "branch_pataudi"
        ? pataudiContentTop
        : LAYOUT.contentTop;

  let currentY: number = contentTop;
  const infoWidth = LAYOUT.marginRight - LAYOUT.marginLeft;
  const midX = LAYOUT.marginLeft + infoWidth / 2;

  const overlayFields = template?.overlayFields;
  if (effectiveBranchId === "branch_pataudi") {
    currentY = drawPataudiPrescriptionHeader(
      page,
      { patient, visit, consult, doctorName, token: visit.token },
      { normal: font, bold },
      pageHeight - 150,
      contentTop,
    );
  } else if (overlayFields?.length) {
    renderOverlayFields(page, overlayFields, { patient, visit, doctorName, date, token: visit.token }, { normal: font, bold });
    currentY = contentTop - 12;
  } else {
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
  }

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

function formatPataudiDateTime(value: string | Date | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (!d || isNaN(d.getTime())) return String(value);
  return d
    .toLocaleString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    })
    .replace(", ", "/");
}

function pataudiPatientAddress(patient: Patient): string {
  if (patient.address) return patient.address;
  const parts = [
    patient.houseNumber,
    patient.street,
    patient.locality,
    patient.landmark,
    patient.city,
    patient.district,
    patient.state,
    patient.pincode,
  ].filter(Boolean);
  return parts.join(", ");
}

function pataudiPatientType(visit: Visit, patient: Patient): string {
  return visit.patientType ?? (patient.lastVisit ? "OLD PATIENT" : "NEW PATIENT");
}

function pataudiExamValue(consult: ConsultationRecord, keys: string[]): string {
  for (const key of keys) {
    const value = consult.examination[key];
    if (value !== undefined && value !== null && value !== "") return String(value);
  }
  return "";
}

function pataudiYesNo(value: unknown): string {
  if (value === true || value === "yes" || value === "Yes" || value === "YES") return "Yes";
  if (value === false || value === "no" || value === "No" || value === "NO") return "No";
  return value === undefined || value === null || value === "" ? "No" : String(value);
}

function drawPataudiPrescriptionHeader(
  page: PDFPage,
  data: {
    patient: Patient;
    visit: Visit;
    consult: ConsultationRecord;
    doctorName: string;
    token?: number | string | null;
  },
  fonts: { normal: PDFFont; bold: PDFFont },
  startY: number,
  endY: number,
): number {
  const left = 42;
  const right = page.getWidth() - 42;
  const mid = left + (right - left) / 2;
  const labelWidth = 82;
  const rowHeight = 18;
  let y = startY;

  const dt = formatPataudiDateTime(data.consult.completedAt ?? data.consult.startedAt ?? new Date().toISOString());
  const age = resolvePatientAge(data.patient.age, data.patient.dateOfBirth);
  const ageGender = `${age ? `${age}Yrs.` : "—"} / ${data.patient.gender || "—"}`;
  const address = pataudiPatientAddress(data.patient);
  const patientType = pataudiPatientType(data.visit, data.patient);
  const mobile = data.patient.phone || "";
  const alternate = data.patient.alternatePhone || "";
  const email = data.patient.email || "";
  const opdTiming = "Mon.,Wed.,Fri. 10:00AM-01:00PM";

  const weight = pataudiExamValue(data.consult, ["weight", "wt"]);
  const dm = pataudiYesNo(pataudiExamValue(data.consult, ["dm", "diabetes"]) || false);
  const height = pataudiExamValue(data.consult, ["height", "ht"]);
  const bp = pataudiExamValue(data.consult, ["bp", "bloodPressure"]);
  const cadHtn = pataudiYesNo(
    pataudiExamValue(data.consult, ["cadHtn"]) ||
      pataudiExamValue(data.consult, ["cad"]) ||
      pataudiExamValue(data.consult, ["htn"]) ||
      false,
  );
  const drugAllergy = pataudiYesNo(pataudiExamValue(data.consult, ["drugAllergy", "allergy"]) || false);
  const drugAllergyDetail = pataudiExamValue(data.consult, ["drugAllergyDetail", "allergyDetail"]);

  const row = (label: string, value: string, label2?: string, value2?: string) => {
    if (y < endY) return;
    drawText(page, label, left, y, fonts.bold, 9);
    drawText(page, value, left + labelWidth, y, fonts.normal, 9);
    if (label2) {
      drawText(page, label2, mid, y, fonts.bold, 9);
      drawText(page, value2 ?? "", mid + labelWidth, y, fonts.normal, 9);
    }
    y -= rowHeight;
  };

  row("UHID No. :", data.patient.uhid || "—", "Date :", dt);
  row("Name :", data.patient.name, "Token No. :", data.token ? `#${data.token}` : "—");
  row("Address :", address || "—", "Age/Sex :", ageGender);
  row("Patient Type :", patientType, "Mobile :", mobile || "—");
  row("Doctor :", data.doctorName, "Alternate No. :", alternate || "—");
  row("OPD Timing :", opdTiming, "Email Id. :", email || "—");

  if (y >= endY) {
    const vitals: [string, string][] = [
      ["Wt. :", weight],
      ["DM :", dm],
      ["Ht. :", height],
      ["CAD/HTN :", cadHtn],
      ["BP :", bp],
    ];
    const startXs = [left, left + 100, left + 185, left + 270, left + 370];
    for (let i = 0; i < vitals.length; i++) {
      const [label, value] = vitals[i];
      drawText(page, label, startXs[i], y, fonts.bold, 9);
      drawText(page, value || "_____", startXs[i] + 28, y, fonts.normal, 9);
    }
    y -= rowHeight;
  }

  if (y >= endY) {
    const allergyLine = `Any Known Drug Allergy/Drug Reaction : ${drugAllergy}`;
    drawText(page, allergyLine, left, y, fonts.bold, 9);
    const detailText = drugAllergyDetail ? `If Yes : ${drugAllergyDetail}` : "If Yes : ___________";
    drawText(page, detailText, left + 250, y, fonts.normal, 9);
    y -= rowHeight;
  }

  if (y >= endY + 40) {
    y -= 8;
    drawRightText(page, data.doctorName, right, y, fonts.bold, 9);
    y -= 12;
    drawRightText(page, "Consultant", right, y, fonts.normal, 9);
  }

  return Math.max(y, endY);
}

function prescriptionOverlayValue(
  field: DocumentTemplateOverlayField,
  data: { patient: Patient; visit: Visit; doctorName: string; date: string; token?: number | string | null },
): string {
  switch (field.key) {
    case "patientName":
      return data.patient.name;
    case "uhid":
      return data.patient.uhid ?? "";
    case "ageGender": {
      const resolvedAge = resolvePatientAge(data.patient.age, data.patient.dateOfBirth);
      return `${resolvedAge ? `${resolvedAge}y` : "—"} / ${data.patient.gender || "—"}`;
    }
    case "mobileNo":
      return data.patient.phone ?? "";
    case "doctorName":
      return data.doctorName;
    case "token":
      return data.token ? `#${data.token}` : "";
    case "date":
      return data.date;
    case "address":
      return data.patient.address ?? "";
    default:
      return field.label;
  }
}

function renderOverlayFields(
  page: PDFPage,
  fields: DocumentTemplateOverlayField[],
  data: { patient: Patient; visit: Visit; doctorName: string; date: string; token?: number | string | null },
  fonts: { normal: PDFFont; bold: PDFFont },
) {
  const width = page.getWidth();
  const height = page.getHeight();
  for (const field of fields) {
    const value = prescriptionOverlayValue(field, data);
    const font = field.key === "patientName" || field.key === "doctorName" ? fonts.bold : fonts.normal;
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
