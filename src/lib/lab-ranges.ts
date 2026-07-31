import type { LabFieldMaster, LabFieldRange } from "@/design-system/lab-data";

export function normalizeGender(value?: string | null): "M" | "F" | "O" | "all" {
  const raw = (value ?? "").toString().trim().toLowerCase();
  if (raw === "male" || raw === "m" || raw === "boy" || raw === "b") return "M";
  if (raw === "female" || raw === "f" || raw === "girl" || raw === "g") return "F";
  if (raw === "other" || raw === "o" || raw === "transgender") return "O";
  return "all";
}

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

export function resolveAge(
  patient: { dateOfBirth?: Date | string | null; age?: number | null },
  at: Date,
): { years: number; months: number; days: number } | undefined {
  const dob = parseDob(patient.dateOfBirth);
  if (dob) return ageAt(dob, at);
  if (patient.age != null && Number.isFinite(patient.age)) {
    return { years: Math.floor(patient.age), months: 0, days: 0 };
  }
  return undefined;
}

export function matchesRange(
  range: LabFieldRange,
  gender?: string | null,
  age: { years: number; months: number; days: number } = { years: 0, months: 0, days: 0 },
  sampleType?: string,
  pregnancy?: boolean,
): boolean {
  const rangeGender = normalizeGender(range.gender);
  const patientGender = normalizeGender(gender);
  if (rangeGender !== "all" && rangeGender !== patientGender) return false;
  const ageUnit = range.ageUnit ?? "years";
  const ageValue = ageUnit === "years" ? age.years : ageUnit === "months" ? age.months : age.days;
  if (range.ageMin != null && ageValue < range.ageMin) return false;
  if (range.ageMax != null && ageValue > range.ageMax) return false;
  if (sampleType && range.sampleType) {
    const normalizedItem = sampleType.trim().toLowerCase();
    const normalizedRange = range.sampleType.trim().toLowerCase();
    if (normalizedItem !== normalizedRange && !normalizedItem.includes(normalizedRange) && !normalizedRange.includes(normalizedItem)) {
      return false;
    }
  }
  if (range.pregnancy != null && range.pregnancy !== Boolean(pregnancy)) return false;
  return true;
}

export function rangeSpecificity(range: LabFieldRange): number {
  let score = 0;
  if (normalizeGender(range.gender) !== "all") score += 3;
  if (range.ageMin != null || range.ageMax != null) score += 2;
  if (range.sampleType && range.sampleType.trim()) score += 1;
  if (range.pregnancy != null) score += 1;
  return score;
}

export function getApplicableRange(
  fieldMaster: LabFieldMaster,
  patient: { gender?: string | null; dateOfBirth?: Date | string | null; age?: number | null; pregnancy?: boolean },
  recordedAt: Date,
  sampleType?: string,
): LabFieldRange | undefined {
  const age = resolveAge(patient, recordedAt);
  const exactMatches = fieldMaster.ranges.filter((r) =>
    matchesRange(r, patient.gender, age, sampleType, patient.pregnancy),
  );
  const demographicMatches = fieldMaster.ranges.filter((r) =>
    matchesRange(r, patient.gender, age, undefined, patient.pregnancy),
  );
  const defaultRanges = fieldMaster.ranges.filter((r) => r.isDefault);
  const matching =
    exactMatches.length > 0
      ? exactMatches
      : demographicMatches.length > 0
        ? demographicMatches
        : defaultRanges.length > 0
          ? defaultRanges
          : fieldMaster.ranges;
  const sorted = matching.sort((a, b) => {
    const specDiff = rangeSpecificity(b) - rangeSpecificity(a);
    if (specDiff !== 0) return specDiff;
    // Among equally specific ranges, prefer non-default (intentionally specific) over default
    return (a.isDefault ? 1 : 0) - (b.isDefault ? 1 : 0);
  });
  return sorted[0] ?? undefined;
}

export function formatReferenceRange(
  range: LabFieldRange | undefined,
  unit?: string | null,
  includeQualifiers = false,
): string {
  if (!range) return "—";
  const parts: string[] = [];
  if (range.low != null && range.high != null) parts.push(`${range.low} – ${range.high}`);
  else if (range.low != null) parts.push(`≥ ${range.low}`);
  else if (range.high != null) parts.push(`≤ ${range.high}`);
  if (unit && parts.length > 0) parts.push(unit);
  const numericRange = parts.join(" ");
  const label = range.displayLabel?.trim();
  const main = numericRange || label || "—";

  if (!includeQualifiers) {
    const crit: string[] = [];
    if (range.criticalLow != null) crit.push(`critical < ${range.criticalLow}`);
    if (range.criticalHigh != null) crit.push(`critical > ${range.criticalHigh}`);
    return crit.length ? `${main} (${crit.join("; ")})` : main;
  }

  const qualifiers: string[] = [];
  const gender = (range.gender ?? "").trim().toLowerCase();
  if (gender && gender !== "all") qualifiers.push(gender.toUpperCase());

  const ageUnit = range.ageUnit ?? "years";
  if (range.ageMin != null || range.ageMax != null) {
    const min = range.ageMin ?? "";
    const max = range.ageMax ?? "";
    if (min !== "" && max !== "") qualifiers.push(`${min}-${max} ${ageUnit}`);
    else if (min !== "") qualifiers.push(`≥ ${min} ${ageUnit}`);
    else if (max !== "") qualifiers.push(`≤ ${max} ${ageUnit}`);
  }

  if (range.pregnancy != null) qualifiers.push(range.pregnancy ? "Pregnant" : "Non-pregnant");
  if (range.sampleType?.trim()) qualifiers.push(range.sampleType.trim());
  if (range.condition?.trim()) qualifiers.push(range.condition.trim());

  const qualifierText = qualifiers.join(" · ");
  const base = qualifierText ? `${main} · ${qualifierText}` : main;

  const crit: string[] = [];
  if (range.criticalLow != null) crit.push(`critical < ${range.criticalLow}`);
  if (range.criticalHigh != null) crit.push(`critical > ${range.criticalHigh}`);
  return crit.length ? `${base} (${crit.join("; ")})` : base;
}

export function formatAge(age?: { years: number; months: number; days: number } | null): string {
  if (!age) return "—";
  if (age.years > 0) return `${age.years}y`;
  if (age.months > 0) return `${age.months}m`;
  if (age.days > 0) return `${age.days}d`;
  return "0y";
}
