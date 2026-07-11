import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/server/auth";
import { sendWhatsAppAsync } from "@/server/whatsapp/service";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Please sign in first." }, { status: 401 });
  }

  try {
    const ctx = await requireModule("pharmacy");
    const body = (await request.json()) as {
      type: "bill" | "po";
      billId?: string;
      patientName?: string;
      uhid?: string;
      total?: number;
      paymentStatus?: string;
      poId?: string;
    };

    if (body.type === "bill") {
      if (!body.uhid || !body.billId || body.total === undefined) {
        return NextResponse.json({ ok: false, error: "UHID, bill id and total are required." }, { status: 400 });
      }
      const patient = await prisma.patient.findFirst({
        where: { uhid: body.uhid, branchId: ctx.branchId },
        select: { name: true, phone: true },
      });
      if (!patient?.phone) {
        return NextResponse.json({ ok: false, error: "Patient phone not found." }, { status: 400 });
      }
      sendWhatsAppAsync(ctx, "pharmacy_bill", patient.phone, {
        patientName: patient.name ?? body.patientName ?? "Patient",
        billId: body.billId,
        amount: body.total.toLocaleString("en-IN"),
        paymentStatus: body.paymentStatus ?? "Pending",
      });
      return NextResponse.json({ ok: true });
    }

    if (body.type === "po") {
      if (!body.poId) {
        return NextResponse.json({ ok: false, error: "PO id is required." }, { status: 400 });
      }
      const po = await prisma.purchaseOrder.findFirst({
        where: { id: body.poId, branchId: ctx.branchId },
        include: { supplier: true },
      });
      if (!po) {
        return NextResponse.json({ ok: false, error: "Purchase order not found." }, { status: 404 });
      }
      if (!po.supplier.phone) {
        return NextResponse.json({ ok: false, error: "Supplier phone not found." }, { status: 400 });
      }
      const lines = (po.lines as { drugId?: string; qtyOrdered?: number; rate?: number }[]) ?? [];
      const total = lines.reduce((s, l) => s + (l.qtyOrdered ?? 0) * (l.rate ?? 0), 0);
      sendWhatsAppAsync(ctx, "purchase_order", po.supplier.phone, {
        supplierName: po.supplier.name,
        poId: po.id,
        items: lines.map((l) => `${l.qtyOrdered ?? 0}× ${l.drugId ?? ""}`).join(", ") || "—",
        total: total.toLocaleString("en-IN"),
        expectedDate: po.expectedAt ? new Date(po.expectedAt).toLocaleDateString("en-IN") : "—",
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Invalid type." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send WhatsApp.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
