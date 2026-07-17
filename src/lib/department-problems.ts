export const DEPARTMENT_PROBLEMS: Record<string, { value: string; label: string }[]> = {
  dept_spine: [
    { value: "sciatica_pain", label: "Sciatica Pain" },
    { value: "slip_disc", label: "Slip Disc / Disc Bulge" },
    { value: "knee_osteoarthritis", label: "Knee Osteoarthritis" },
    { value: "frozen_shoulder", label: "Frozen Shoulder" },
    { value: "cervical_spondylosis", label: "Cervical Spondylosis" },
    { value: "ligament_injuries", label: "Ligament Injuries (ACL, Meniscus)" },
    { value: "dscb_injection", label: "DSCB Injection" },
    { value: "eboo_ozone", label: "EBOO Ozone Therapy" },
    { value: "ozone_discectomy", label: "Ozone Discectomy" },
    { value: "prp_gfc_bmac", label: "PRP / GFC / BMAC" },
    { value: "prolozone", label: "Prolozone Therapy" },
    { value: "hydrogen_therapy", label: "Hydrogen Therapy" },
  ],
  dept_wellness: [
    { value: "detox_cellular", label: "Detox & Cellular Healing Therapies" },
    { value: "anti_aging", label: "Anti-Ageing Programs" },
    { value: "energy_vitality", label: "Energy & Vitality Optimization" },
    { value: "diabetes_reversal", label: "Diabetes Management & Reversal" },
    { value: "thyroid_disorders", label: "Thyroid Disorders" },
    { value: "obesity_weight", label: "Obesity & Weight Management" },
  ],
};

export function problemsForDepartment(departmentId?: string): { value: string; label: string }[] {
  if (!departmentId) return [];
  return DEPARTMENT_PROBLEMS[departmentId] ?? [];
}

export function problemLabelForValue(value: string): string {
  for (const problems of Object.values(DEPARTMENT_PROBLEMS)) {
    const found = problems.find((p) => p.value === value);
    if (found) return found.label;
  }
  return value.replace(/_/g, " ");
}
