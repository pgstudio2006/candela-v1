import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getServerContext } from "@/server/context";
import { createLead, assignLeadManual } from "@/server/crm";
import { serializeForClient } from "@/server/serialize";
import type { CrmLeadSource } from "@/design-system/crm-data";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Please sign in first." }, { status: 401 });
  }

  try {
    const ctx = await getServerContext();
    const body = (await request.json()) as {
      fullName: string;
      phone: string;
      source?: string;
      notes?: string;
      assigneeId: string;
    };

    if (!body.fullName?.trim() || !body.phone?.trim() || !body.assigneeId) {
      return NextResponse.json({ ok: false, error: "Name, phone and counsellor are required." }, { status: 400 });
    }

    const agent = await prisma.agent.findFirst({
      where: { branchId: ctx.branchId, id: body.assigneeId, active: true },
    });
    if (!agent) {
      return NextResponse.json({ ok: false, error: "Selected counsellor not found." }, { status: 400 });
    }

    const lead = await createLead(ctx, agent.id, {
      fullName: body.fullName.trim(),
      phone: body.phone.trim(),
      source: (body.source ?? "walk_in") as CrmLeadSource,
      sourceDetail: "Offline lead created from front desk",
      notes: body.notes ?? "",
      assigneeId: agent.id,
      stageId: "",
      valueEstimate: 0,
      priority: "medium",
      tags: ["offline"],
    });

    await assignLeadManual(ctx, agent.id, lead.leadId, agent.id);

    return NextResponse.json({ ok: true, data: serializeForClient(lead) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create offline lead.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
