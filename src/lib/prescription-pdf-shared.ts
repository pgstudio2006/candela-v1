import { rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { PRESCRIPTION_FREQUENCY_OPTIONS, type PrescriptionLine } from "@/design-system/doctor-data";
import { formatPrescriptionDuration } from "@/lib/doctor-records";

export const COLORS = {
  ink: rgb(0.12, 0.12, 0.14),
  border: rgb(0.72, 0.72, 0.76),
  headerFill: rgb(0.95, 0.96, 0.98),
  white: rgb(1, 1, 1),
} as const;

export const FONT = {
  caption: 9,
  body: 10,
  table: 10,
  tableHead: 10,
  emphasis: 11,
  title: 14,
} as const;

export function pdfSafeText(text: string): string {
  return String(text)
    .replace(/₹/g, "Rs.")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00B7/g, "|")
    .replace(/\u2026/g, "...")
    .replace(/[^\t\n\r\u0020-\u00FF]/g, "");
}

export function formatFrequency(value: string): string {
  return PRESCRIPTION_FREQUENCY_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function formatDuration(line: PrescriptionLine): string {
  const text = formatPrescriptionDuration(line);
  // PDF-safe ASCII fallback (em dash is not latin-1 safe for pdf-lib core fonts).
  return text === "—" ? "--" : text;
}

export function formatConsultDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function drawText(page: PDFPage, text: string, x: number, y: number, font: PDFFont, size: number = FONT.body) {
  page.drawText(pdfSafeText(text), { x, y, size, font, color: COLORS.ink });
}

export function drawRightText(
  page: PDFPage,
  text: string,
  rightX: number,
  y: number,
  font: PDFFont,
  size: number = FONT.body,
  padding = 4,
) {
  const safe = pdfSafeText(text);
  const width = font.widthOfTextAtSize(safe, size);
  page.drawText(safe, { x: rightX - width - padding, y, size, font, color: COLORS.ink });
}

export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const safe = pdfSafeText(text.trim());
  if (!safe) return [""];

  const words = safe.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  const pushLongWord = (word: string) => {
    let chunk = "";
    for (const ch of word) {
      const candidate = chunk + ch;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        chunk = candidate;
      } else {
        if (chunk) lines.push(chunk);
        chunk = ch;
      }
    }
    return chunk;
  };

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = font.widthOfTextAtSize(word, size) <= maxWidth ? word : pushLongWord(word);
  }

  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

export function drawHLine(page: PDFPage, x1: number, x2: number, y: number) {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.6, color: COLORS.border });
}
