import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { createId } from "@/lib/id";
import { nextUhid, normalizePhone } from "@/lib/frontdesk-workflow";
import { syncVisitFromOpdVisit } from "@/server/visit-sync";
import type { ServerContext } from "@/server/context";

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

export async function importNavayuCsv(ctx: ServerContext, filePath?: string) {
  const resolvedPath = filePath ?? path.resolve(process.cwd(), NAVAYU_CSV_FILENAME);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`CSV file not found: ${resolvedPath}`);
  }

  const content = fs.readFileSync(resolvedPath, "utf-8");
  const rows = parseCsvRows(content);
  if (rows.length === 0) {
    return { imported: 0, patients: 0, appointments: 0, visits: 0, message: "No rows found" };
  }

  const existingCount = await prisma.patient.count({
    where: { tenantId: ctx.tenantId },
  });
  let counter = existingCount;

  const results: {
    row: number;
    patientId: string;
    opdVisitId: string;
    appointmentId: string;
  }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const phone = parsePhoneNumber(row.Phone);
    if (!phone) continue;

    const apptDate = row["Appointment Date Date"]?.trim() || "";
    const apptTime = row["Appointment Date Time"]?.trim() || "";
    const doctorName = row["Doctor Name Appointment for"]?.trim() || "";

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
    if (existingAppointment) continue;

    const existingPatient = await prisma.patient.findFirst({
      where: { tenantId: ctx.tenantId, branchId: ctx.branchId, phone },
    });

    let patientId: string;
    if (existingPatient) {
      patientId = existingPatient.id;
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
      const name = row.Name.trim() || "Unknown";
      const age = Number(row.Age);
      const gender = normalizeGender(row.Gender);
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
          address: {
            city: row.City?.trim() || null,
            district: row["District Name"]?.trim() || null,
            state: row["State and Union Territories"]?.trim() || null,
            country: row.Country?.trim() || "India",
          },
          meta: {
            alternatePhone: parsePhoneNumber(row["Alternate Number"]),
            disease: row.Disease?.trim() || null,
            doctorName: row["Doctor Name Appointment for"]?.trim() || null,
            appointmentCentre: row["Appointment Centre"]?.trim() || null,
            userNote: row["User Note"]?.trim() || null,
            campaignName: row["Campaign Name"]?.trim() || null,
            actionCreatedBy: row["Action Created By name"]?.trim() || null,
            actionCreatedByEmail: row["Action Created By emailid"]?.trim() || null,
            status: row.Status?.trim() || null,
            lostReason: row["Lost Reason"]?.trim() || null,
            assigneeName: row["Assignee name"]?.trim() || null,
            assigneeEmail: row["Assignee emailid"]?.trim() || null,
            source: "navayu_backup",
          },
          createdAt: parseDate(row["Action Created At"]) ?? new Date(),
        },
      });
      patientId = created.id;
    }

    const opdVisitId = createId("opd");
    const appointmentId = createId("apt");
    const disease = row.Disease?.trim() || "";
    const appointmentDate = parseDateTime(apptDate, apptTime);

    await prisma.opdVisit.create({
      data: {
        id: opdVisitId,
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        patientId,
        stage: "completed",
        doctorName,
        complaint: disease,
        appointment: true,
        appointmentTime: apptTime,
        checkInAt: apptDate,
        createdAt: parseDate(row["Action Created At"]) ?? new Date(),
      },
    });

    await prisma.appointment.create({
      data: {
        id: appointmentId,
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        patientId,
        visitId: opdVisitId,
        doctorName,
        date: apptDate,
        time: apptTime,
        appointmentDate,
        status: normalizeStatus(row.Status),
        source: "navayu_backup",
        notes: row["User Note"]?.trim() || null,
        createdAt: parseDate(row["Action Created At"]) ?? new Date(),
      },
    });

    const opd = await prisma.opdVisit.findUnique({ where: { id: opdVisitId } });
    if (opd) await syncVisitFromOpdVisit(ctx, opd);

    results.push({ row: i + 1, patientId, opdVisitId, appointmentId });
  }

  return {
    imported: results.length,
    patients: results.length,
    appointments: results.length,
    visits: results.length,
    rows: results,
  };
}
