import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createId } from "@/lib/id";
import { getServerContext } from "@/server/context";
import { serializeForClient } from "@/server/serialize";
import { bookAppointment } from "@/server/clinical";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Please sign in first." }, { status: 401 });
  }

  try {
    const ctx = await getServerContext();
    const branchId = request.nextUrl.searchParams.get("branchId") || ctx.branchId;

    const branches = await prisma.branch.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, name: true },
    }).catch(() => []);
    const selectedBranch = branches.find((b) => b.id === branchId) ?? { id: ctx.branchId, name: ctx.branchName };

    const [departments, doctors, appointments] = await Promise.all([
      prisma.department.findMany({
        where: { branchId: selectedBranch.id },
        select: { id: true, label: true },
      }).catch(() => []),
      prisma.adminStaff.findMany({
        where: { branchId: selectedBranch.id, role: "doctor" },
        select: { id: true, name: true, departmentIds: true },
      }).catch(() => []),
      prisma.appointment.findMany({
        where: { branchId: selectedBranch.id },
        orderBy: [{ date: "asc" }, { time: "asc" }],
        take: 200,
        include: {
          patient: {
            select: { id: true, name: true, uhid: true, phone: true },
          },
        },
      }).catch(() => []),
    ]);

    return NextResponse.json({
      ok: true,
      data: serializeForClient({
        branches,
        selectedBranchId: selectedBranch.id,
        departments: departments.map((d) => ({ id: d.id, label: d.label })),
        doctors: doctors.map((d) => ({
          id: d.id,
          name: d.name,
          department: Array.isArray(d.departmentIds) ? (d.departmentIds as string[]).join(", ") : "",
          departmentIds: Array.isArray(d.departmentIds) ? (d.departmentIds as string[]) : [],
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

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Please sign in first." }, { status: 401 });
  }

  try {
    const ctx = await getServerContext();
    const body = (await request.json()) as {
      patientUhid: string;
      doctorId: string;
      departmentId: string;
      branchId: string;
      date: string;
      time: string;
      duration?: string;
      notes?: string;
    };

    const bookingBranch = await prisma.branch.findFirst({
      where: { id: body.branchId, tenantId: ctx.tenantId },
      select: { id: true, name: true },
    });
    if (!bookingBranch) {
      return NextResponse.json({ ok: false, error: "Selected branch not found." }, { status: 400 });
    }
    const bookingCtx = { ...ctx, branchId: bookingBranch.id, branchName: bookingBranch.name };

    const result = await bookAppointment(bookingCtx, {
      data: {
        patient: body.patientUhid,
        doctor: body.doctorId,
        department: body.departmentId,
        date: body.date,
        time: body.time,
        duration: body.duration ?? "15",
        notes: body.notes ?? "",
      },
      appointmentId: createId("ap"),
      visitId: createId("v"),
    });

    if (result.error || !result.visitId) {
      return NextResponse.json(
        { ok: false, error: result.error ?? "Could not book appointment" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      data: { appointmentId: result.appointmentId, visitId: result.visitId },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to book appointment.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
