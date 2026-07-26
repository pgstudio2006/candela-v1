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

export function ageAt(
  dateOfBirth: Date | undefined,
  at: Date,
): { years: number; months: number; days: number } {
  if (!dateOfBirth) return { years: 0, months: 0, days: 0 };
  const end = at.getTime();
  const start = dateOfBirth.getTime();
  const totalDays = Math.floor((end - start) / (1000 * 60 * 60 * 24));
  return {
    years: Math.floor(totalDays / 365.25),
    months: Math.floor(totalDays / 30.44),
    days: totalDays,
  };
}

/**
 * Resolves a patient's age object from whichever data is available.
 * Priority: integer `age` field → computed from `dateOfBirth`.
 * Returns `undefined` when neither is available.
 * When only the integer `age` is available, months and days are approximated
 * so that range matching on `ageUnit: "months"` or `"days"` still works correctly.
 */
export function resolveAge(
  patient: { dateOfBirth?: Date | string | null; age?: number | null },
  at: Date,
): { years: number; months: number; days: number } | undefined {
  // Prefer stored integer age (entered at registration)
  if (patient.age != null && Number.isFinite(patient.age) && patient.age >= 0) {
    const ageYears = Math.floor(patient.age);
    return {
      years: ageYears,
      months: Math.round(ageYears * 12),
      days: Math.round(ageYears * 365.25),
    };
  }
  // Fall back to computed age from date of birth
  const dob = parseDob(patient.dateOfBirth);
  return dob ? ageAt(dob, at) : undefined;
}

/**
 * Returns true if this range applies for the given patient attributes.
 * IMPORTANT: When `age` is `undefined` (patient age unknown), ranges with
 * explicit ageMin or ageMax bounds are SKIPPED.  We never fall back to
 * age = 0 which would wrongly match a "Newborn" range.
 */
export function matchesRange(
  range: LabFieldRange,
  gender?: string | null,
  age?: { years: number; months: number; days: number } | null,
  sampleType?: string,
): boolean {
  if (range.gender && range.gender !== "all" && range.gender !== (gender ?? "")) return false;

  if (age != null) {
    const ageUnit = range.ageUnit ?? "years";
    const ageValue =
      ageUnit === "years" ? age.years : ageUnit === "months" ? age.months : age.days;
    if (range.ageMin != null && ageValue < range.ageMin) return false;
    if (range.ageMax != null && ageValue > range.ageMax) return false;
  } else {
    // Age is unknown — skip any range that has age bounds
    if (range.ageMin != null || range.ageMax != null) return false;
  }

  if (sampleType && range.sampleType && range.sampleType !== sampleType) return false;
  return true;
}

/**
 * Returns the most applicable reference range for a field, given the patient context.
 * Falls back to the `isDefault` range when no age-specific range matches.
 */
export function getApplicableRange(
  fieldMaster: LabFieldMaster,
  patient: { gender?: string | null; dateOfBirth?: Date | string | null; age?: number | null },
  recordedAt: Date,
  sampleType?: string,
): LabFieldRange | undefined {
  const age = resolveAge(patient, recordedAt);
  const matched = fieldMaster.ranges
    .filter((r) => matchesRange(r, patient.gender, age, sampleType))
    // Prefer isDefault among matched ranges
    .sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0));

  if (matched.length > 0) return matched[0];
  // No range matched — only fall back to a default range if that default
  // itself passes the non-age filters (gender/sampleType) and, crucially,
  // does not require an age we do not have. This stops "Newborn" from
  // appearing for patients whose age is unknown.
  return fieldMaster.ranges.find(
    (r) => r.isDefault && matchesRange(r, patient.gender, age, sampleType),
  );
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

export function formatAge(age?: { years: number; months: number; days: number } | null): string {
  if (!age) return "—";
  if (age.years > 0) return `${age.years}y`;
  if (age.months > 0) return `${age.months}m`;
  if (age.days > 0) return `${age.days}d`;
  return "0y";
}
