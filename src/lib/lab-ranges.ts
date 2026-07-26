import type { LabFieldMaster, LabFieldRange } from "@/design-system/lab-data";

export function parseNumber(value: string): number | null {
  const v = value.replace(/,/g, "").trim();
  if (v === "" || v === "-" || v.toLowerCase() === "nil") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function parseDob(value?: Date | string | null): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
}

export function ageAt(dateOfBirth: Date | undefined, at: Date): { years: number; months: number; days: number } {
  if (!dateOfBirth) return { years: 0, months: 0, days: 0 };
  const end = at.getTime();
  const start = dateOfBirth.getTime();
  const days = Math.floor((end - start) / (1000 * 60 * 60 * 24));
  return { years: Math.floor(days / 365.25), months: Math.floor(days / 30.44), days };
}

export function dobFromAge(ageYears: number, at: Date): Date {
  return new Date(at.getFullYear() - ageYears, at.getMonth(), at.getDate());
}

export function resolveAge(
  patient: { dateOfBirth?: Date | string | null; age?: number | null },
  at: Date,
): { years: number; months: number; days: number } {
  let dob = parseDob(patient.dateOfBirth);
  if (!dob && patient.age != null && patient.age > 0) {
    dob = dobFromAge(patient.age, at);
  }
  return dob ? ageAt(dob, at) : { years: 0, months: 0, days: 0 };
}

export function matchesRange(
  range: LabFieldRange,
  gender?: string | null,
  age: { years: number; months: number; days: number } = { years: 0, months: 0, days: 0 },
  sampleType?: string,
): boolean {
  if (range.gender && range.gender !== "all" && range.gender !== (gender ?? "")) return false;
  const ageUnit = range.ageUnit ?? "years";
  const ageValue = ageUnit === "years" ? age.years : ageUnit === "months" ? age.months : age.days;
  if (range.ageMin != null && ageValue < range.ageMin) return false;
  if (range.ageMax != null && ageValue > range.ageMax) return false;
  if (sampleType && range.sampleType && range.sampleType !== sampleType) return false;
  return true;
}

export function getApplicableRange(
  fieldMaster: LabFieldMaster,
  patient: { gender?: string | null; dateOfBirth?: Date | string | null; age?: number | null },
  recordedAt: Date,
  sampleType?: string,
): LabFieldRange | undefined {
  const age = resolveAge(patient, recordedAt);
  const ranges = fieldMaster.ranges
    .filter((r) => matchesRange(r, patient.gender, age, sampleType))
    .sort((a, b) => (b.isDefault ? 0 : 1) - (a.isDefault ? 0 : 1));
  return ranges[0] ?? fieldMaster.ranges.find((r) => r.isDefault);
}

export function formatReferenceRange(range: LabFieldRange | undefined, unit?: string | null): string {
  if (!range) return "—";
  if (range.displayLabel) return range.displayLabel;
  const parts: string[] = [];
  if (range.low != null && range.high != null) parts.push(`${range.low} – ${range.high}`);
  else if (range.low != null) parts.push(`≥ ${range.low}`);
  else if (range.high != null) parts.push(`≤ ${range.high}`);
  if (unit) parts.push(unit);
  const main = parts.join(" ") || "—";
  const crit: string[] = [];
  if (range.criticalLow != null) crit.push(`critical < ${range.criticalLow}`);
  if (range.criticalHigh != null) crit.push(`critical > ${range.criticalHigh}`);
  return crit.length ? `${main} (${crit.join("; ")})` : main;
}

export function formatAge(age: { years: number; months: number; days: number }): string {
  if (age.years > 0) return `${age.years}y`;
  if (age.months > 0) return `${age.months}m`;
  if (age.days > 0) return `${age.days}d`;
  return "—";
}
