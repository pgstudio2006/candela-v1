import { doctorIdVariants } from "@/lib/clinical-roster";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/server/auth";
import { branchScope } from "@/server/tenancy";
import { NextRequest, NextResponse } from "next/server";

function asRecord(value: unknown): Record<string, string | number | boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, string | number | boolean>;
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth();
    const scope = branchScope(ctx);
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");
    const doctorId = searchParams.get("doctorId");

    const where: any = {
      ...scope,
      status: { not: "cancelled" },
    };
    if (date) where.date = date;
    if (doctorId) where.doctorId = { in: doctorIdVariants(doctorId) };

    const rows = await prisma.appointment.findMany({
      where,
      orderBy: [{ date: "asc" }, { time: "asc" }],
      include: {
        patient: { select: { name: true, fullName: true } },
      },
    });

    const appointments = rows.map((row) => {
      const meta = asRecord(row.meta);
      const mode = meta.mode === "online" ? "online" : meta.mode === "offline" ? "offline" : undefined;
      return {
        id: row.id,
        patientId: row.patientId,
        patientName: row.patient?.fullName || row.patient?.name || "Unknown",
        time: row.time,
        durationMin: row.durationMin ?? 20,
        mode,
        notes: row.notes ?? undefined,
        status: row.status,
      };
    });

    return NextResponse.json({ ok: true, data: appointments });
  } catch (error) {
    console.error("Error fetching doctor appointments:", error);
    return NextResponse.json({ ok: false, error: "Failed to fetch appointments" }, { status: 500 });
  }
}
