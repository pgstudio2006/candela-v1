/** Department + doctor roster resolved from admin DB */

import { stripLegacyDemoDoctorIds } from "@/lib/legacy-demo-doctors";

export type DoctorOption = { id: string; name: string };
export type DeptOption = { id: string; label: string };

export type ClinicalRoster = {
  departments: DeptOption[];
  doctorsByDept: Record<string, DoctorOption[]>;
  doctorNames: Record<string, string>;
  allDoctors: DoctorOption[];
};

export function doctorIdFromStaffId(staffId: string) {
  return `dr_${staffId.replace(/^st_/, "")}`;
}

export function staffIdFromDoctorId(doctorId: string) {
  return doctorId.startsWith("dr_") ? `st_${doctorId.slice(3)}` : null;
}

export function doctorIdVariants(doctorId: string): string[] {
  const variants = [doctorId];
  if (doctorId.startsWith("dr_")) {
    variants.push(doctorId.replace("dr_", "st_"));
  } else if (doctorId.startsWith("st_")) {
    variants.push(doctorId.replace("st_", "dr_"));
  }
  return variants;
}

export function resolveDoctorName(doctorId: string, roster?: ClinicalRoster | null) {
  if (roster?.doctorNames[doctorId]) return roster.doctorNames[doctorId];
  const staffId = staffIdFromDoctorId(doctorId);
  if (staffId && roster) {
    const match = roster.allDoctors.find((d) => d.id === doctorId);
    if (match) return match.name;
  }
  return doctorId.replace(/^dr_/, "Dr. ");
}

export function deptLabelFromRoster(deptId: string, roster?: ClinicalRoster | null): string {
  const fromRoster = roster?.departments.find((d) => d.id === deptId)?.label;
  if (fromRoster) return fromRoster;
  return deptId.replace(/^dept_/, "").replace(/_/g, " ");
}

export function buildClinicalRoster(
  departments: { id: string; label: string; doctorIds: string[]; active?: boolean }[],
  staff: { id: string; name: string; role: string; departmentIds?: string[] }[],
): ClinicalRoster {
  const doctorNames: Record<string, string> = {};

  for (const member of staff) {
    if (member.role === "doctor") {
      doctorNames[doctorIdFromStaffId(member.id)] = member.name;
    }
  }

  const activeDepts = departments.filter((d) => d.active !== false);
  const doctorsByDept: Record<string, DoctorOption[]> = {};

  for (const dept of activeDepts) {
    const ids = stripLegacyDemoDoctorIds(dept.doctorIds);
    doctorsByDept[dept.id] = ids.map((id) => ({
      id,
      name: doctorNames[id] ?? resolveDoctorName(id),
    }));
  }

  for (const member of staff) {
    if (member.role !== "doctor") continue;
    const drId = doctorIdFromStaffId(member.id);
    for (const deptId of member.departmentIds ?? []) {
      if (!doctorsByDept[deptId]) doctorsByDept[deptId] = [];
      if (!doctorsByDept[deptId].some((d) => d.id === drId)) {
        doctorsByDept[deptId].unshift({ id: drId, name: member.name });
      }
    }
  }

  const allFromDepts = Object.values(doctorsByDept).flat();
  const allDoctors = [
    ...allFromDepts,
    ...staff
      .filter((s) => s.role === "doctor")
      .map((s) => ({
        id: doctorIdFromStaffId(s.id),
        name: s.name,
      })),
  ].filter((d, i, arr) => arr.findIndex((x) => x.id === d.id) === i);

  return {
    departments: activeDepts.map((d) => ({ id: d.id, label: d.label })),
    doctorsByDept,
    doctorNames,
    allDoctors,
  };
}

export function doctorsForDepartment(roster: ClinicalRoster, deptId: string): DoctorOption[] {
  return roster.doctorsByDept[deptId] ?? roster.allDoctors;
}

export const EMPTY_ROSTER: ClinicalRoster = buildClinicalRoster(
  [
    { id: "dept_spine", label: "Spine & Joint Care", doctorIds: [], active: true },
    { id: "dept_wellness", label: "Wellness & Metabolic", doctorIds: [], active: true },
  ],
  [],
);
