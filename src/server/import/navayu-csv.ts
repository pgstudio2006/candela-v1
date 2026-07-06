import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { createId } from "@/lib/id";
import { nextUhid, normalizePhone } from "@/lib/frontdesk-workflow";
import { syncVisitFromOpdVisit } from "@/server/visit-sync";
import type { ServerContext } from "@/server/context";
import { doctorIdFromStaffId } from "@/lib/clinical-roster";

export const NAVAYU_CSV_FILENAME = "databackup-29-Jun-2026_17_30_27.csv";

export type NavayuCsvRow = {
  "User Note": string;
  "Campaign Name": string;
  "Action Created By name": string;
  "Action Created By emailid": string;
  "Action Created At": string;
  Status: string;
  "Lost Reason": string;
  "Assignee name": string;
  "Assignee emailid": string;
  Name: string;
  Phone: string;
  "Alternate Number": string;
  Age: string;
  Gender: string;
  City: string;
  "District Name": string;
  "State and Union Territories": string;
  Country: string;
  Disease: string;
  "Doctor Name Appointment for": string;
  "Appointment Date Date": string;
  "Appointment Date Time": string;
  "Appointment Centre": string;
};

function parseCsvRows(content: string): NavayuCsvRow[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows: NavayuCsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i].split(",");
    const row = {} as Record<string, string>;
    headers.forEach((h, idx) => {
      row[h] = raw[idx]?.trim() ?? "";
    });
    rows.push(row as unknown as NavayuCsvRow);
  }
  return rows;
}

function parsePhoneNumber(value: string): string {
  if (!value || value === "_" || value === "-") return "";
  const num = Number(value);
  if (!Number.isNaN(num)) {
    const str = String(num);
    return str.length <= 10 ? str : str.slice(-10);
  }
  return normalizePhone(value);
}

function parseDate(value: string): Date | null {
  if (!value) return null;
  const parts = value.split("-");
  if (parts.length !== 3) return null;
  const [day, month, year] = parts;
  const d = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseDateTime(dateStr: string, timeStr: string): Date | null {
  const date = parseDate(dateStr);
  if (!date) return null;
  if (!timeStr) return date;
  const [hours, minutes, seconds] = timeStr.split(":").map(Number);
  date.setHours(hours ?? 0, minutes ?? 0, seconds ?? 0, 0);
  return date;
}

function normalizeGender(value: string): "M" | "F" | "O" | null {
  const v = value.trim().toLowerCase();
  if (v === "male" || v === "m") return "M";
  if (v === "female" || v === "f") return "F";
  if (v === "other" || v === "o") return "O";
  return null;
}

function normalizeStatus(value: string): string {
  const v = value.trim().toLowerCase().replace(/\s+/g, "_");
  if (v === "visit_done") return "completed";
  return v || "scheduled";
}

function cleanDoctorName(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b(Orthopaedic|Orthopedic|Spine|Joint|Neuro|Cardio|Gynae|Physician|Surgeon|Dentist|ENT|Eye|Skin|Pediatric)\w*$/i, "")
    .trim();
}

function doctorDepartment(value: string): { id: string; label: string } | null {
  const v = value.toLowerCase();
  if (v.includes("spine") || v.includes("joint") || v.includes("ortho") || v.includes("cervical") || v.includes("sciatica") || v.includes("back") || v.includes("neck") || v.includes("bone")) {
    return { id: "dept_spine", label: "Spine & Joint Care" };
  }
  if (v.includes("wellness") || v.includes("metabolic") || v.includes("diabetes") || v.includes("thyroid")) {
    return { id: "dept_wellness", label: "Wellness & Metabolic" };
  }
  return null;
}

function buildTags(row: NavayuCsvRow): string[] {
  const tags = new Set<string>();
  const disease = row.Disease?.trim();
  if (disease) tags.add(disease);
  const status = row.Status?.trim();
  if (status) tags.add(status);
  const centre = row["Appointment Centre"]?.trim();
  if (centre) tags.add(centre);
  const campaign = row["Campaign Name"]?.trim();
  if (campaign && campaign !== "-") tags.add(campaign);
  const doctor = cleanDoctorName(row["Doctor Name Appointment for"]?.trim() || "");
  if (doctor) tags.add(`Dr: ${doctor}`);
  return Array.from(tags);
}

async function resolveDoctorAndAssignee(
  ctx: ServerContext,
  doctorNameRaw: string,
  assigneeNameRaw: string,
) {
  const cleanDoctor = cleanDoctorName(doctorNameRaw);
  const cleanAssignee = cleanDoctorName(assigneeNameRaw);
  const agents = await prisma.agent.findMany({
    where: { tenantId: ctx.tenantId, branchId: ctx.branchId, active: true },
  });
  const doctor = agents.find((a) => a.role === "doctor" && a.name.toLowerCase() === cleanDoctor.toLowerCase());
  const assignee = agents.find((a) => a.name.toLowerCase() === cleanAssignee.toLowerCase());
  return {
    doctorId: doctor ? doctorIdFromStaffId(doctor.id) : null,
    doctorName: cleanDoctor,
    assigneeId: assignee?.id ?? null,
    assigneeName: cleanAssignee || null,
  };
}

export async function importNavayuCsv(ctx: ServerContext, filePath?: string) {
  const resolvedPath = filePath ?? path.resolve(process.cwd(), NAVAYU_CSV_FILENAME);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`CSV file not found: ${resolvedPath}`);
  }

  const content = fs.readFileSync(resolvedPath, "utf-8");
  const rows = parseCsvRows(content);
  if (rows.length === 0) {
    return { imported: 0, patients: 0, appointments: 0, visits: 0, leads: 0, message: "No rows found" };
  }

  const existingCount = await prisma.patient.count({
    where: { tenantId: ctx.tenantId },
  });
  let counter = existingCount;

  const defaultStage = await prisma.stage.findFirst({
    where: { branchId: ctx.branchId },
    orderBy: { order: "asc" },
  });
  let defaultStageId = defaultStage?.id;
  if (!defaultStageId) {
    defaultStageId = createId("stage");
    const pipelineId = createId("pipeline");
    await prisma.pipeline.create({
      data: {
        id: pipelineId,
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        label: "Imported Pipeline",
        active: true,
      },
    });
    await prisma.stage.create({
      data: {
        id: defaultStageId,
        branchId: ctx.branchId,
        pipelineId,
        label: "Imported",
        order: 0,
      },
    });
  }

  const results: {
    row: number;
    patientId: string;
    opdVisitId: string;
    appointmentId: string;
  }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const phone = parsePhoneNumber(row.Phone);
    if (!phone) {
      console.log(`[navayu-csv] Row ${i + 1}: skipped, no phone`);
      continue;
    }

    const apptDate = row["Appointment Date Date"]?.trim() || "";
    const apptTime = row["Appointment Date Time"]?.trim() || "";
    const doctorNameRaw = row["Doctor Name Appointment for"]?.trim() || "";
    const assigneeNameRaw = row["Assignee name"]?.trim() || "";
    const actionCreatedAt = parseDate(row["Action Created At"]) ?? new Date();
    const actionCreatedByName = row["Action Created By name"]?.trim() || null;
    const actionCreatedByEmail = row["Action Created By emailid"]?.trim() || null;
    const disease = row.Disease?.trim() || "";
    const appointmentCentre = row["Appointment Centre"]?.trim() || "";
    const status = row.Status?.trim() || "";
    const name = row.Name.trim() || "Unknown";
    const age = Number(row.Age);
    const gender = normalizeGender(row.Gender);
    const tags = buildTags(row);
    const dept = doctorDepartment(doctorNameRaw) ?? doctorDepartment(disease);
    const resolved = await resolveDoctorAndAssignee(ctx, doctorNameRaw, assigneeNameRaw);
    const doctorName = resolved.doctorName || doctorNameRaw;
    const doctorId = resolved.doctorId;
    const departmentId = dept?.id ?? null;
    const departmentLabel = dept?.label ?? null;

    const existingAppointment = await prisma.appointment.findFirst({
      where: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        date: apptDate,
        time: apptTime,
        doctorName,
        patient: { phone },
      },
    });
    if (existingAppointment) {
      console.log(`[navayu-csv] Row ${i + 1}: skipped, existing appointment ${existingAppointment.id}`);
      continue;
    }

    const existingPatient = await prisma.patient.findFirst({
      where: { tenantId: ctx.tenantId, branchId: ctx.branchId, phone },
    });

    let patientId: string;
    let patientUhid: string;
    if (existingPatient) {
      patientId = existingPatient.id;
      patientUhid = existingPatient.uhid;
      await prisma.patient.update({
        where: { id: patientId },
        data: {
          fullName: name,
          age: Number.isFinite(age) && age > 0 ? age : existingPatient.age,
          gender: gender ?? existingPatient.gender,
          department: departmentLabel ?? existingPatient.department,
          departmentId: departmentId ?? existingPatient.departmentId,
          departmentLabel: departmentLabel ?? existingPatient.departmentLabel,
          tags: { set: Array.from(new Set([...existingPatient.tags, ...tags])) },
          assignedCounsellorId: resolved.assigneeId ?? existingPatient.assignedCounsellorId,
          assignedCounsellorName: resolved.assigneeName ?? existingPatient.assignedCounsellorName,
          address: {
            ...(typeof existingPatient.address === "object" && existingPatient.address !== null ? existingPatient.address : {}),
            city: row.City?.trim() || null,
            district: row["District Name"]?.trim() || null,
            state: row["State and Union Territories"]?.trim() || null,
            country: row.Country?.trim() || "India",
          },
          meta: {
            ...(typeof existingPatient.meta === "object" && existingPatient.meta !== null ? existingPatient.meta : {}),
            alternatePhone: parsePhoneNumber(row["Alternate Number"]),
            disease: disease || null,
            doctorName: doctorNameRaw || null,
            appointmentCentre: appointmentCentre || null,
            userNote: row["User Note"]?.trim() || null,
            campaignName: row["Campaign Name"]?.trim() || null,
            actionCreatedBy: actionCreatedByName,
            actionCreatedByEmail: actionCreatedByEmail,
            status: status || null,
            lostReason: row["Lost Reason"]?.trim() || null,
            assigneeName: resolved.assigneeName,
            assigneeEmail: row["Assignee emailid"]?.trim() || null,
            source: "navayu_backup",
          },
          updatedAt: new Date(),
        },
      });
    } else {
      let uhid = "";
      let attempts = 0;
      while (attempts < 1000) {
        counter++;
        const candidate = nextUhid(counter, ctx.branchId);
        const existing = await prisma.patient.findUnique({
          where: { tenantId_uhid: { tenantId: ctx.tenantId, uhid: candidate } },
        });
        if (!existing) {
          uhid = candidate;
          break;
        }
        attempts++;
      }
      if (!uhid) throw new Error("Could not generate a unique UHID after 1000 attempts.");
      patientUhid = uhid;
      const created = await prisma.patient.create({
        data: {
          id: createId("pat"),
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          uhid,
          name,
          fullName: name,
          phone,
          age: Number.isFinite(age) && age > 0 ? age : null,
          gender,
          status: "active",
          department: departmentLabel,
          departmentId,
          departmentLabel,
          tags,
          assignedCounsellorId: resolved.assigneeId,
          assignedCounsellorName: resolved.assigneeName,
          address: {
            city: row.City?.trim() || null,
            district: row["District Name"]?.trim() || null,
            state: row["State and Union Territories"]?.trim() || null,
            country: row.Country?.trim() || "India",
          },
          meta: {
            alternatePhone: parsePhoneNumber(row["Alternate Number"]),
            disease: disease || null,
            doctorName: doctorNameRaw || null,
            appointmentCentre: appointmentCentre || null,
            userNote: row["User Note"]?.trim() || null,
            campaignName: row["Campaign Name"]?.trim() || null,
            actionCreatedBy: actionCreatedByName,
            actionCreatedByEmail: actionCreatedByEmail,
            status: status || null,
            lostReason: row["Lost Reason"]?.trim() || null,
            assigneeName: resolved.assigneeName,
            assigneeEmail: row["Assignee emailid"]?.trim() || null,
            source: "navayu_backup",
          },
          createdAt: actionCreatedAt,
        },
      });
      patientId = created.id;
    }

    const opdVisitId = createId("opd");
    const appointmentId = createId("apt");
    const leadId = createId("lead");
    const appointmentDate = parseDateTime(apptDate, apptTime);
    const leadStatus = status.toLowerCase() === "visit done" ? "converted" : "fresh";

    await prisma.$transaction([
      prisma.opdVisit.create({
        data: {
          id: opdVisitId,
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          patientId,
          stage: "completed",
          doctorId,
          doctorName,
          departmentId,
          complaint: disease,
          appointment: true,
          appointmentTime: apptTime,
          checkInAt: apptDate,
          createdAt: actionCreatedAt,
        },
      }),
      prisma.appointment.create({
        data: {
          id: appointmentId,
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          patientId,
          visitId: opdVisitId,
          doctorId,
          doctorName,
          departmentId,
          date: apptDate,
          time: apptTime,
          appointmentDate,
          status: normalizeStatus(status),
          source: "navayu_backup",
          notes: row["User Note"]?.trim() || null,
          createdAt: actionCreatedAt,
        },
      }),
      prisma.lead.create({
        data: {
          id: leadId,
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          stageId: defaultStageId,
          patientId,
          fullName: name,
          phone,
          alternatePhone: parsePhoneNumber(row["Alternate Number"]) || null,
          age: Number.isFinite(age) && age > 0 ? age : null,
          gender: gender ?? null,
          city: row.City?.trim() || null,
          district: row["District Name"]?.trim() || null,
          state: row["State and Union Territories"]?.trim() || null,
          country: row.Country?.trim() || "India",
          doctorName,
          appointmentDate: appointmentDate,
          appointmentTime: apptTime,
          appointmentCentre: appointmentCentre || null,
          source: "navayu_backup",
          sourceDetail: row["Campaign Name"]?.trim() || null,
          notes: row["User Note"]?.trim() || null,
          tags: Array.from(tags),
          leadStatus,
          lostReason: row["Lost Reason"]?.trim() || null,
          assigneeId: resolved.assigneeId,
          uhid: patientUhid,
          createdAt: actionCreatedAt,
          updatedAt: actionCreatedAt,
        },
      }),
    ]);

    const opd = await prisma.opdVisit.findUnique({ where: { id: opdVisitId } });
    if (opd) await syncVisitFromOpdVisit(ctx, opd);

    console.log(`[navayu-csv] Row ${i + 1}: imported patient ${patientId}, appointment ${appointmentId}`);
    results.push({ row: i + 1, patientId, opdVisitId, appointmentId });
  }

  return {
    imported: results.length,
    patients: results.length,
    appointments: results.length,
    visits: results.length,
    leads: results.length,
    rows: results,
  };
}
