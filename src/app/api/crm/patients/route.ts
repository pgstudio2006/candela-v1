import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getServerContext } from "@/server/context";
import { serializeForClient } from "@/server/serialize";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Please sign in first." }, { status: 401 });
  }

  try {
    const ctx = await getServerContext();
    const counsellorId = (session as any).crmOperatorId;
    const branchId = new URL(request.url).searchParams.get("branchId") || ctx.branchId;
    const scope = { tenantId: ctx.tenantId, branchId };

    // If a manager is viewing, optionally return all patients. Default to assigned only.
    const all = new URL(request.url).searchParams.get("all") === "1";
    const where = all ? scope : { ...scope, assignedCounsellorId: counsellorId ?? "" };

    const patients = await prisma.patient.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 500,
      include: {
        visits: {
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            token: true,
            stage: true,
            doctorName: true,
            createdAt: true,
            billAmount: true,
            amountPaid: true,
            balanceDue: true,
          },
        },
      },
    });

    return NextResponse.json({
      ok: true,
      data: serializeForClient(
        patients.map((p) => ({
          id: p.id,
          uhid: p.uhid,
          name: p.name,
          fullName: p.fullName,
          phone: p.phone,
          age: p.age,
          gender: p.gender,
          assignedCounsellorId: p.assignedCounsellorId,
          assignedCounsellorName: p.assignedCounsellorName,
          createdAt: p.createdAt.toISOString(),
          visits: p.visits.map((v) => ({
            id: v.id,
            token: v.token,
            stage: v.stage,
            doctorName: v.doctorName,
            createdAt: v.createdAt.toISOString(),
            billAmount: Number(v.billAmount ?? 0),
            amountPaid: Number(v.amountPaid ?? 0),
            balanceDue: Number(v.balanceDue ?? 0),
          })),
        })),
      ),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load patients.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
