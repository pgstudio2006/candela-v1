import { doctorIdVariants } from "@/lib/clinical-roster";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/server/auth";
import { branchScope } from "@/server/tenancy";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth();
    const scope = branchScope(ctx);
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");
    const doctorId = searchParams.get("doctorId");

    const where: any = { ...scope };
    if (date) where.date = date;
    if (doctorId) where.doctorId = { in: doctorIdVariants(doctorId) };

    const slots = await prisma.slot.findMany({
      where,
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });

    return NextResponse.json({ ok: true, data: slots });
  } catch (error) {
    console.error("Error fetching slots:", error);
    return NextResponse.json({ ok: false, error: "Failed to fetch slots" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth();
    const body = await req.json();
    const scope = branchScope(ctx);

    // Bulk create: body contains { slots: [...] }
    if (Array.isArray(body.slots)) {
      const slotsToCreate = body.slots.filter(
        (s: any) => s.date && s.startTime && s.endTime,
      );

      if (slotsToCreate.length === 0) {
        return NextResponse.json({ ok: false, error: "No valid slots to create" }, { status: 400 });
      }

      const data = slotsToCreate.map((s: any) => ({
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        doctorId: s.doctorId || null,
        doctorName: s.doctorName || null,
        departmentId: s.departmentId || null,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        capacity: s.capacity || 1,
        booked: 0,
        status: s.status || "available",
        notes: s.notes || null,
      }));

      const result = await prisma.slot.createMany({ data, skipDuplicates: true });

      return NextResponse.json({ ok: true, created: result.count, total: slotsToCreate.length });
    }

    // Single slot create
    const { doctorId, doctorName, departmentId, date, startTime, endTime, capacity, status, notes } = body;

    if (!date || !startTime || !endTime) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    const slot = await prisma.slot.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        doctorId,
        doctorName,
        departmentId,
        date,
        startTime,
        endTime,
        capacity: capacity || 1,
        booked: 0,
        status: status || "available",
        notes,
      },
    });

    return NextResponse.json({ ok: true, data: slot });
  } catch (error) {
    console.error("Error creating slot:", error);
    return NextResponse.json({ ok: false, error: "Failed to create slot" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const ctx = await requireAuth();
    const scope = branchScope(ctx);
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");
    const doctorId = searchParams.get("doctorId");
    const clearAll = searchParams.get("all") === "true";

    const where: any = { ...scope };
    if (date) where.date = date;
    if (doctorId) where.doctorId = { in: doctorIdVariants(doctorId) };
    if (!clearAll && !date) {
      return NextResponse.json({ ok: false, error: "Specify date or all=true" }, { status: 400 });
    }

    // Cancel linked appointments for booked slots
    const slotsToDelete = await prisma.slot.findMany({ where });
    for (const slot of slotsToDelete) {
      if (slot.booked > 0) {
        await prisma.appointment.updateMany({
          where: {
            branchId: scope.branchId,
            doctorId: slot.doctorId ?? undefined,
            date: slot.date,
            time: slot.startTime,
            status: { not: "cancelled" },
          },
          data: { status: "cancelled" },
        });
      }
    }

    const result = await prisma.slot.deleteMany({ where });

    return NextResponse.json({ ok: true, deleted: result.count });
  } catch (error) {
    console.error("Error bulk deleting slots:", error);
    const msg = error instanceof Error ? error.message : "Failed to delete slots";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
