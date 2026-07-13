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
    const packages = await prisma.package.findMany({
      where: { tenantId: ctx.tenantId, branchId },
      include: {
        services: {
          include: {
            service: true,
          },
        },
      },
      orderBy: { label: "asc" },
    });

    const serialized = packages.map((pkg: any) => ({
      ...pkg,
      services: (pkg.services || []).map((ps: any) => ({
        serviceId: ps.serviceId,
        label: ps.service.label,
        quantity: ps.quantity,
        rate: Number(ps.service.rate),
      })),
    }));

    return NextResponse.json({ ok: true, data: serializeForClient(serialized) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load packages.";
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
    const { label, amount, sessions, dept, description, services, active } = body;

    // @ts-ignore - description field added to schema
    const pkg: any = await prisma.package.create({
      data: {
        id: `pkg_${Date.now()}`,
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        label,
        amount: amount || 0,
        sessions: sessions ? Number(sessions) : null,
        dept,
        description,
        active: active ?? true,
      },
    });

    // Create package services separately
    if (services && services.length > 0) {
      await prisma.packageService.createMany({
        data: services.map((s: any) => ({
          packageId: pkg.id,
          serviceId: s.serviceId,
          quantity: s.quantity || 1,
        })),
      });
    }

    // Fetch with relations
    const pkgWithServices: any = await prisma.package.findUnique({
      where: { id: pkg.id },
      include: {
        services: {
          include: {
            service: true,
          },
        },
      },
    });

    const serialized = {
      ...pkgWithServices,
      services: (pkgWithServices.services || []).map((ps: any) => ({
        serviceId: ps.serviceId,
        label: ps.service.label,
        quantity: ps.quantity,
        rate: Number(ps.service.rate),
      })),
    };

    return NextResponse.json({ ok: true, data: serializeForClient(serialized) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create package.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
