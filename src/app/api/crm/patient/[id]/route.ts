import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getServerContext } from "@/server/context";
import { defaultPharmacyState } from "@/server/revenue/state-seeds";
import { serializeForClient } from "@/server/serialize";
import { readPharmacyWorkspace } from "@/server/workspace-state";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Please sign in first." }, { status: 401 });
  }

  try {
    const ctx = await getServerContext();
    const { id } = await params;

    const patient = await prisma.patient.findFirst({
      where: { id, branchId: ctx.branchId },
      include: {
        visits: {
          orderBy: { createdAt: "desc" },
          take: 50,
        },
        appointments: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });

    if (!patient) {
      return NextResponse.json({ ok: false, error: "Patient not found." }, { status: 404 });
    }

    // Get prescriptions from visits
    const visitIds = patient.visits.map((v) => v.id);
    const prescriptions = await prisma.prescription.findMany({
      where: { visitId: { in: visitIds } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }).catch(() => []);

    // Get consult notes
    const consultations = await prisma.consultNote.findMany({
      where: { visitId: { in: visitIds } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }).catch(() => []);

    // Get packages purchased via billing handoffs and/or used in counsellor sessions
    const [billingHandoffs, counsellorSessions] = await Promise.all([
      prisma.billingHandoff.findMany({
        where: { patientId: patient.id, packageId: { not: null } },
        include: { package: true },
        orderBy: { sentAt: "asc" },
      }).catch(() => []),
      prisma.counsellorSession.findMany({
        where: { patientId: patient.id, packageId: { not: null } },
        include: { package: true },
        orderBy: { startedAt: "asc" },
      }).catch(() => []),
    ]);

    const packageMap = new Map<string, {
      package: any;
      purchaseCount: number;
      sessionsUsed: number;
      firstAt: Date;
      lastPaymentExpectation: string;
    }>();

    for (const bh of billingHandoffs) {
      if (!bh.packageId || !bh.package) continue;
      const existing = packageMap.get(bh.packageId);
      if (existing) {
        existing.purchaseCount += 1;
        existing.sessionsUsed += 0;
        if (bh.sentAt < existing.firstAt) existing.firstAt = bh.sentAt;
        existing.lastPaymentExpectation = bh.paymentExpectation ?? existing.lastPaymentExpectation;
      } else {
        packageMap.set(bh.packageId, {
          package: bh.package,
          purchaseCount: 1,
          sessionsUsed: 0,
          firstAt: bh.sentAt,
          lastPaymentExpectation: bh.paymentExpectation ?? "",
        });
      }
    }

    for (const cs of counsellorSessions) {
      if (!cs.packageId || !cs.package) continue;
      const existing = packageMap.get(cs.packageId);
      if (existing) {
        existing.sessionsUsed += 1;
      } else {
        packageMap.set(cs.packageId, {
          package: cs.package,
          purchaseCount: 0,
          sessionsUsed: 1,
          firstAt: cs.createdAt,
          lastPaymentExpectation: "",
        });
      }
    }

    const pharmacyState = await readPharmacyWorkspace(ctx, () => defaultPharmacyState({})).catch(() => null);
    const pharmacyBills =
      pharmacyState?.bills.filter(
        (b) => b.uhid === patient.uhid || b.patientName.toLowerCase() === patient.fullName.toLowerCase(),
      ) ?? [];
    const pharmacyPrescriptions =
      pharmacyState?.prescriptions.filter(
        (r) => r.uhid === patient.uhid || r.patientName.toLowerCase() === patient.fullName.toLowerCase(),
      ) ?? [];

    const packages = Array.from(packageMap.entries()).map(([id, entry]) => {
      const pkg = entry.package;
      const baseSessions = pkg.sessions ? Number(pkg.sessions) : null;
      const totalSessions = baseSessions != null ? baseSessions * Math.max(1, entry.purchaseCount) : null;
      return {
        id,
        label: pkg.label ?? "Package",
        amount: pkg.amount ? Number(pkg.amount) : 0,
        sessions: totalSessions,
        sessionsUsed: entry.sessionsUsed,
        purchasedAt: entry.firstAt.toISOString(),
        status: entry.lastPaymentExpectation === "partial" ? "Partial" : "Purchased",
      };
    });

    return NextResponse.json({
      ok: true,
      data: serializeForClient({
        patient: {
          id: patient.id,
          uhid: patient.uhid,
          name: patient.name,
          fullName: patient.fullName,
          phone: patient.phone,
          email: patient.email,
          age: patient.age ? String(patient.age) : null,
          gender: patient.gender,
          assignedCounsellorId: patient.assignedCounsellorId,
          assignedCounsellorName: patient.assignedCounsellorName,
          leadSourceId: patient.leadSourceId,
          createdAt: patient.createdAt.toISOString(),
        },
        visits: patient.visits.map((v) => ({
          id: v.id,
          doctorName: v.doctorName ?? "",
          stage: v.stage,
          token: v.token ?? null,
          billing: v.billingStatus ?? "unbilled",
          billAmount: v.billAmount ? Number(v.billAmount) : null,
          treatmentPath: v.treatmentPath ?? null,
          createdAt: v.createdAt.toISOString(),
        })),
        appointments: patient.appointments.map((a) => ({
          id: a.id,
          doctorName: a.doctorName ?? "",
          doctorId: a.doctorId ?? null,
          date: a.date ?? null,
          time: a.time ?? null,
          status: a.status,
          source: a.source ?? null,
          createdAt: a.createdAt.toISOString(),
        })),
        prescriptions: (prescriptions as any[]).map((p) => ({
          id: p.id,
          visitId: p.visitId,
          medicines: Array.isArray(p.lines) ? p.lines : [],
          notes: p.counselingNotes ?? p.notes ?? "",
          createdAt: p.createdAt.toISOString(),
        })),
        consultations: (consultations as any[]).map((c) => ({
          id: c.id,
          visitId: c.visitId,
          diagnosis: typeof c.diagnosis === "string" ? c.diagnosis : JSON.stringify(c.diagnosis ?? ""),
          treatmentPlan: typeof c.treatment === "string" ? c.treatment : JSON.stringify(c.treatment ?? ""),
          advice: c.doctorAdvice ?? c.notes ?? "",
          createdAt: c.createdAt.toISOString(),
        })),
        pharmacyBills: pharmacyBills.map((b) => ({
          id: b.id,
          total: b.total,
          paid: b.paid,
          paymentMode: b.paymentMode,
          lines: b.lines.map((l) => ({
            drugId: l.drugId,
            qty: l.qty,
            rate: l.rate,
            amount: l.qty * l.rate,
          })),
          createdAt: b.createdAt,
        })),
        pharmacyPrescriptions: pharmacyPrescriptions.map((r) => ({
          id: r.id,
          doctorName: r.doctorName,
          source: r.source,
          status: r.status,
          lines: r.lines.map((l) => ({
            drugId: l.drugId,
            drugName: l.drugName,
            dose: l.dose,
            frequency: l.frequency,
            duration: l.duration,
            qtyPrescribed: l.qtyPrescribed,
            qtyDispensed: l.qtyDispensed,
          })),
          createdAt: r.createdAt,
        })),
        packages,
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load patient.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
