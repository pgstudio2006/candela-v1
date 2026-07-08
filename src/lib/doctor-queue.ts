import type { Visit } from "@/design-system/frontdesk-data";
import { isInReceptionQueue, isRedFlagVisit } from "@/lib/frontdesk-workflow";

/** Red-flag and appointment patients first, then FIFO by token. */
export function sortDoctorOpdQueue(visits: Visit[]): Visit[] {
  return [...visits].sort((a, b) => {
    const aUrgent = isRedFlagVisit(a) ? 0 : a.appointment ? 1 : 2;
    const bUrgent = isRedFlagVisit(b) ? 0 : b.appointment ? 1 : 2;
    if (aUrgent !== bUrgent) return aUrgent - bUrgent;
    return (a.token ?? 99_999) - (b.token ?? 99_999);
  });
}

/** Match visit to logged-in consultant (handles legacy dr_1 vs staff dr_* ids). */
export function visitAssignedToDoctor(
  visit: Visit,
  doctorId: string,
  doctorName: string,
  departmentIds: readonly string[],
): boolean {
  if (visit.doctorId === doctorId) return true;
  if (doctorName && visit.doctorName && visit.doctorName === doctorName) return true;
  const deptSet = new Set(departmentIds);
  if (visit.exam === "done" && (deptSet.size === 0 || deptSet.has(visit.departmentId))) return true;
  if (!visit.doctorId && (deptSet.size === 0 || deptSet.has(visit.departmentId))) return true;
  return false;
}

/** Whether a visit is in the doctor's active queue (reception queue + assigned to doctor). */
export function isVisitInDoctorQueue(
  visit: Visit,
  doctorId: string,
  doctorName: string,
  departmentIds: readonly string[],
): boolean {
  if (!isInReceptionQueue(visit)) return false;
  return visitAssignedToDoctor(visit, doctorId, doctorName, departmentIds);
}

/** Whether a visit belongs in this doctor's workspace snapshot. */
export function visitVisibleInDoctorWorkspace(
  visit: Visit,
  doctorId: string,
  departmentIds: readonly string[],
  consultVisitIds: ReadonlySet<string>,
  doctorName = "",
): boolean {
  if (consultVisitIds.has(visit.id)) return true;
  return isVisitInDoctorQueue(visit, doctorId, doctorName, departmentIds);
}

export function filterDoctorOpdQueue(
  visits: Visit[],
  doctorId?: string,
  includeDept = false,
  departmentIds: readonly string[] = [],
  doctorName = "",
): Visit[] {
  const filtered = visits.filter((v) => {
    if (!isInReceptionQueue(v)) return false;
    if (includeDept || !doctorId) return true;
    return visitAssignedToDoctor(v, doctorId, doctorName, departmentIds);
  });
  return sortDoctorOpdQueue(filtered);
}

export function isJuniorHandoffReady(visit: Visit): boolean {
  return (visit.stage === "with_doctor" || visit.stage === "junior_exam") && visit.exam === "done";
}
