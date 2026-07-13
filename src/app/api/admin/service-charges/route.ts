import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireAnyModule, requireModule } from "@/server/auth";
import { serializeForClient } from "@/server/serialize";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Please sign in first." }, { status: 401 });
  }

  try {
    const ctx = await requireAnyModule("admin", "frontdesk", "counsellor", "doctor");
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branchId") || ctx.branchId;
    const charges = await prisma.serviceCharge.findMany({
      where: { tenantId: ctx.tenantId, branchId },
      orderBy: { category: "asc" },
    });
    return NextResponse.json({ ok: true, data: serializeForClient(charges) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load service charges.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Please sign in first." }, { status: 401 });
  }

  try {
    const ctx = await requireModule("admin");
    const body = await request.json();
    const { label, category, description, rate, unit, gstPercent, hsnCode, active } = body;

    const charge = await prisma.serviceCharge.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        label,
        category,
        description,
        rate: rate || 0,
        unit,
        gstPercent: gstPercent ?? 18,
        hsnCode,
        active: active ?? true,
      },
    });

    return NextResponse.json({ ok: true, data: serializeForClient(charge) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create service charge.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
