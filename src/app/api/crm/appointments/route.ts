import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getServerContext } from "@/server/context";
import { serializeForClient } from "@/server/serialize";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Please sign in first." }, { status: 401 });
  }

  try {
    const ctx = await getServerContext();

    // Get all doctors for this branch
    const doctors = await prisma.adminStaff.findMany({
      where: { branchId: ctx.branchId, role: "doctor" },
      select: { id: true, name: true, departmentIds: true },
    }).catch(() => []);

    // Get all appointments for this branch
    const appointments = await prisma.appointment.findMany({
      where: {
        branchId: ctx.branchId,
      },
      orderBy: [{ date: "asc" }, { time: "asc" }],
      take: 200,
      include: {
        patient: {
          select: { id: true, name: true, uhid: true, phone: true },
        },
      },
    }).catch(() => []);

    return NextResponse.json({
      ok: true,
      data: serializeForClient({
        doctors: doctors.map((d) => ({
          id: d.id,
          name: d.name,
          department: Array.isArray(d.departmentIds) ? (d.departmentIds as string[]).join(", ") : "",
        })),
        appointments: appointments.map((a) => ({
          id: a.id,
          patientId: a.patientId,
          patientName: a.patient?.name ?? "",
          patientUhid: a.patient?.uhid ?? "",
          patientPhone: a.patient?.phone ?? "",
          doctorId: a.doctorId ?? null,
          doctorName: a.doctorName ?? "",
          date: a.date ?? null,
          time: a.time ?? null,
          status: a.status,
          source: a.source ?? null,
        })),
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load appointments.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
