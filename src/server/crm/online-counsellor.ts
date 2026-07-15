import type { CrmCallOutcome, CrmCommission, CrmLead, CrmLeadStatus } from "@/design-system/crm-data";
import { prisma } from "@/lib/prisma";
import { createId } from "@/lib/id";
import type { ServerContext } from "@/server/context";
import { bookAppointment } from "@/server/clinical";
import { writePlatformAudit } from "@/server/platform-audit";
import { sendWhatsAppAsync } from "@/server/whatsapp/service";
import { branchScope } from "@/server/tenancy";
import { ServerActionError } from "@/server/errors";
import { readCrmWorkspace, writeCrmWorkspace } from "@/server/workspace-state";
import { defaultCrmState } from "@/server/revenue/state-seeds";
import { syncCrmLeadToPrisma } from "@/server/crm/sync";
import { PATAUDI_BRANCH_ID } from "@/lib/frontdesk-workflow";

export type LeadToPatientResult = {
  patientId: string;
  uhid: string;
  leadId: string;
};

export type MobileDetectionResult = {
  found: boolean;
  leadId?: string;
  leadName?: string;
  leadStatus?: string;
  assigneeName?: string;
  patientId?: string;
  uhid?: string;
  lead?: Partial<CrmLead> & {
    age?: number | null;
    valueEstimate?: number | null;
  };
};

async function getAgentName(agentId: string): Promise<string | null> {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  return agent?.name ?? null;
}

export async function updateLeadCallOutcome(
  ctx: ServerContext,
  leadId: string,
  callOutcome: CrmCallOutcome,
): Promise<void> {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, branchId: ctx.branchId },
  });
  if (!lead) throw new ServerActionError("NOT_FOUND", "Lead not found.");

  const leadStatus: CrmLeadStatus =
    callOutcome === "picked" ? "call_picked" : callOutcome === "not_picked" ? "call_not_picked" : "fresh";

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      callOutcome,
      leadStatus,
      lastContactAt: new Date(),
    },
  });

  if (callOutcome === "not_picked" && lead.phone) {
    sendWhatsAppAsync(ctx, "call_not_picked", lead.phone, {
      leadName: lead.fullName ?? "there",
    }).catch((e) => {
      console.error("[whatsapp] missed-call message failed:", e);
    });
  }

  await prisma.activity.create({
    data: {
      id: `act_${leadId}_${Date.now()}`,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      leadId,
      actor: "Online Counsellor",
      type: "call",
      summary: `Call outcome: ${callOutcome.replace(/_/g, " ")}`,
      at: new Date(),
    },
  });

  await writePlatformAudit({
    ctx,
    module: "crm",
    action: "lead_call_outcome",
    entityType: "lead",
    entityId: leadId,
    summary: `Call outcome set to ${callOutcome} for lead ${lead.fullName}`,
  });
}

export async function updateLeadStatus(
  ctx: ServerContext,
  leadId: string,
  status: CrmLeadStatus,
  formData?: Record<string, string | number | boolean>,
): Promise<void> {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, branchId: ctx.branchId },
  });
  if (!lead) throw new ServerActionError("NOT_FOUND", "Lead not found.");

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      leadStatus: status,
      ...(formData ? { formData } : {}),
      lastContactAt: new Date(),
    },
  });

  if (status === "lost" && lead.phone) {
    sendWhatsAppAsync(ctx, "lead_lost", lead.phone, {
      leadName: lead.fullName ?? "there",
    }).catch((e) => {
      console.error("[whatsapp] lead-lost message failed:", e);
    });
  }

  await prisma.activity.create({
    data: {
      id: `act_${leadId}_${Date.now()}`,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      leadId,
      actor: "Online Counsellor",
      type: "status_change",
      summary: `Lead status changed to ${status.replace(/_/g, " ")}`,
      at: new Date(),
    },
  });

  await writePlatformAudit({
    ctx,
    module: "crm",
    action: "lead_status_update",
    entityType: "lead",
    entityId: leadId,
    summary: `Lead ${lead.fullName} → ${status}`,
  });
}

async function updateWorkspaceLeadAfterConversion(
  ctx: ServerContext,
  leadId: string,
  patientId: string,
  uhid: string,
  leadStatus: CrmLeadStatus = "patient",
) {
  const state = await readCrmWorkspace(ctx, () => defaultCrmState({}));
  const leadIdx = state.leads.findIndex((l) => l.id === leadId);
  if (leadIdx >= 0) {
    state.leads[leadIdx] = {
      ...state.leads[leadIdx],
      patientId,
      uhid,
      leadStatus,
      updatedAt: new Date().toISOString(),
    };
    const { operatorId: _op, viewAsAgentId: _view, ...payload } = state;
    await writeCrmWorkspace(ctx, payload);
  }
}

async function generateUniqueUhid(branchId: string): Promise<string> {
  const year = new Date().getFullYear();
  const isPataudi = branchId === PATAUDI_BRANCH_ID;
  const prefix = isPataudi ? `Ghtc-${year}-` : `NV-${year}-`;
  const existing = await prisma.patient.findMany({
    where: { branchId, uhid: { startsWith: prefix } },
    select: { uhid: true },
  });
  const used = new Set(existing.map((p) => p.uhid));
  let n = existing.length + 1;
  let uhid = `${prefix}${String(n).padStart(4, "0")}`;
  while (used.has(uhid)) {
    n++;
    uhid = `${prefix}${String(n).padStart(4, "0")}`;
  }
  return uhid;
}

export async function convertLeadToPatient(
  ctx: ServerContext,
  leadId: string,
  options: {
    bookAppointment?: boolean;
    doctorId?: string;
    doctorName?: string;
    appointmentDate?: string;
    appointmentTime?: string;
    source?: string;
  },
): Promise<LeadToPatientResult> {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, branchId: ctx.branchId },
  });
  if (!lead) throw new ServerActionError("NOT_FOUND", "Lead not found.");
  if (!lead.fullName) throw new ServerActionError("VALIDATION", "Lead name is required.");

  const agentName = lead.assigneeId ? await getAgentName(lead.assigneeId).catch(() => null) : null;

  let patientId = "";
  let uhid = "";

  if (lead.phone) {
    const existingPatient = await prisma.patient.findFirst({
      where: { branchId: ctx.branchId, phone: lead.phone },
    });
    if (existingPatient) {
      patientId = existingPatient.id;
      uhid = existingPatient.uhid;
      await prisma.patient.update({
        where: { id: patientId },
        data: {
          name: lead.fullName,
          fullName: lead.fullName,
          assignedCounsellorId: lead.assigneeId ?? null,
          assignedCounsellorName: agentName,
          leadSourceId: leadId,
        },
      });
    }
  }

  if (!uhid) {
    uhid = await generateUniqueUhid(ctx.branchId);
    const created = await prisma.patient.create({
      data: {
        id: createId("pat"),
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        uhid,
        name: lead.fullName,
        fullName: lead.fullName,
        phone: lead.phone ?? "",
        email: lead.email ?? null,
        age: lead.age ?? null,
        gender: lead.gender ?? null,
        assignedCounsellorId: lead.assigneeId ?? null,
        assignedCounsellorName: agentName,
        leadSourceId: leadId,
      },
    });
    patientId = created.id;
  }

  if (!patientId || !uhid) {
    throw new ServerActionError("INTERNAL_ERROR", "Could not create or link patient from lead.");
  }

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      patientId,
      uhid,
      leadStatus: "patient",
    },
  });

  try {
    await updateWorkspaceLeadAfterConversion(ctx, leadId, patientId, uhid, "patient");
  } catch (err) {
    console.error("[convertLeadToPatient] workspace update failed:", err);
  }

  if (options.bookAppointment && options.doctorName) {
    try {
      const bookResult = await bookAppointment(ctx, {
        data: {
          patient: uhid,
          doctor: options.doctorId ?? options.doctorName,
          department: "dept_spine",
          date: options.appointmentDate ?? new Date().toISOString().slice(0, 10),
          time: options.appointmentTime ?? "",
          duration: "15",
          notes: `Booked by ${options.source ?? "online counsellor"}`,
        },
        appointmentId: createId("ap"),
        visitId: createId("v"),
      });

      if (!bookResult.error && bookResult.visitId) {
        await prisma.lead.update({
          where: { id: leadId },
          data: { leadStatus: "appointment_booked" },
        });
        await updateWorkspaceLeadAfterConversion(ctx, leadId, patientId, uhid, "appointment_booked");
      }
    } catch (err) {
      console.error("[convertLeadToPatient] bookAppointment failed:", err);
    }
  }

  try {
    await prisma.activity.create({
      data: {
        id: `act_${leadId}_${Date.now()}`,
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        leadId,
        actor: "Online Counsellor",
        type: "conversion",
        summary: `Lead converted to patient — UHID: ${uhid}${options.bookAppointment ? " + appointment booked" : ""}`,
        at: new Date(),
      },
    });

    if (options.source === "front_desk" && lead.assigneeId) {
      await prisma.activity.create({
        data: {
          id: `act_${leadId}_${Date.now()}_notify`,
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          leadId,
          actor: "Front Desk",
          type: "notification",
          summary: `Patient registered from your lead — UHID: ${uhid}`,
          at: new Date(),
        },
      });
    }

    await writePlatformAudit({
      ctx,
      module: "crm",
      action: "lead_to_patient",
      entityType: "lead",
      entityId: leadId,
      summary: `Lead ${lead.fullName} converted to patient ${uhid}`,
    });
  } catch (err) {
    console.error("[convertLeadToPatient] activity/audit failed:", err);
  }

  return { patientId, uhid, leadId };
}

export async function detectLeadByMobile(
  ctx: ServerContext,
  phone: string,
): Promise<MobileDetectionResult> {
  const normalized = phone.replace(/\s+/g, "").replace(/-/g, "");
  const lead = await prisma.lead.findFirst({
    where: {
      branchId: ctx.branchId,
      OR: [
        { phone: { contains: normalized } },
        { phone: { contains: phone } },
        { alternatePhone: { contains: normalized } },
        { alternatePhone: { contains: phone } },
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  if (!lead) {
    const state = await readCrmWorkspace(ctx, () => defaultCrmState({}));
    const workspaceLead = state.leads.find((l) => {
      const p = l.phone.replace(/\s+/g, "").replace(/-/g, "");
      const alt = l.alternatePhone?.replace(/\s+/g, "").replace(/-/g, "");
      return p.includes(normalized) || p.includes(phone) || alt?.includes(normalized) || alt?.includes(phone);
    });
    if (!workspaceLead) return { found: false };
    const agent = workspaceLead.assigneeId ? state.agents.find((a) => a.id === workspaceLead.assigneeId) : null;
    await syncCrmLeadToPrisma(ctx, workspaceLead, state.agents);
    const syncedLead = await prisma.lead.findUnique({ where: { id: workspaceLead.id } });
    return {
      found: true,
      leadId: workspaceLead.id,
      leadName: workspaceLead.fullName,
      leadStatus: workspaceLead.leadStatus ?? "fresh",
      assigneeName: agent?.name ?? undefined,
      patientId: workspaceLead.patientId ?? undefined,
      uhid: workspaceLead.uhid ?? undefined,
      lead: {
        ...workspaceLead,
        valueEstimate: workspaceLead.valueEstimate ?? undefined,
      },
    };
  }

  const agent = lead.assigneeId ? await prisma.agent.findUnique({ where: { id: lead.assigneeId } }) : null;
  const workspace = await readCrmWorkspace(ctx, () => defaultCrmState({}));
  const workspaceLead = workspace.leads.find((l) => l.id === lead.id);
  const extra = workspaceLead
    ? {
        dob: workspaceLead.dob,
        houseNumber: workspaceLead.houseNumber,
        street: workspaceLead.street,
        locality: workspaceLead.locality,
        landmark: workspaceLead.landmark,
        address: workspaceLead.address,
        pincode: workspaceLead.pincode,
      }
    : {};

  return {
    found: true,
    leadId: lead.id,
    leadName: lead.fullName,
    leadStatus: lead.leadStatus ?? "fresh",
    assigneeName: agent?.name ?? undefined,
    patientId: lead.patientId ?? undefined,
    uhid: lead.uhid ?? undefined,
    lead: {
      id: lead.id,
      fullName: lead.fullName,
      phone: lead.phone,
      alternatePhone: lead.alternatePhone ?? undefined,
      email: lead.email ?? undefined,
      age: lead.age ?? undefined,
      dob: extra.dob,
      gender: (lead.gender as CrmLead["gender"] | undefined) ?? undefined,
      city: lead.city ?? undefined,
      district: lead.district ?? undefined,
      state: lead.state ?? undefined,
      country: lead.country ?? undefined,
      houseNumber: extra.houseNumber,
      street: extra.street,
      locality: extra.locality,
      landmark: extra.landmark,
      address: extra.address,
      pincode: extra.pincode,
      doctorName: lead.doctorName ?? undefined,
      appointmentDate: lead.appointmentDate?.toISOString() ?? undefined,
      appointmentTime: lead.appointmentTime ?? undefined,
      appointmentCentre: lead.appointmentCentre ?? undefined,
      source: lead.source as CrmLead["source"],
      sourceDetail: lead.sourceDetail ?? undefined,
      specialty: lead.specialty ?? undefined,
      valueEstimate: lead.valueEstimate ? Number(lead.valueEstimate) : undefined,
      notes: lead.notes ?? undefined,
      tags: lead.tags,
      leadStatus: (lead.leadStatus ?? "fresh") as CrmLeadStatus,
      assigneeId: lead.assigneeId ?? undefined,
      stageId: lead.stageId,
      formData: (lead.formData ?? undefined) as Record<string, string | number | boolean> | undefined,
    },
  };
}

export async function assignCounsellorToPatient(
  ctx: ServerContext,
  patientId: string,
  counsellorId: string,
  counsellorName: string,
): Promise<void> {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, branchId: ctx.branchId },
  });
  if (!patient) throw new ServerActionError("NOT_FOUND", "Patient not found.");

  await prisma.patient.update({
    where: { id: patientId },
    data: {
      assignedCounsellorId: counsellorId,
      assignedCounsellorName: counsellorName,
    },
  });

  await writePlatformAudit({
    ctx,
    module: "frontdesk",
    action: "counsellor_assigned",
    entityType: "patient",
    entityId: patientId,
    summary: `Counsellor ${counsellorName} assigned to patient ${patient.fullName || patient.name}`,
  });
}

export async function getOnlineCounsellorLeads(ctx: ServerContext, counsellorId: string): Promise<CrmLead[]> {
  const scope = branchScope(ctx);
  const leads = await prisma.lead.findMany({
    where: { ...scope, assigneeId: counsellorId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return leads.map((l) => ({
    id: l.id,
    fullName: l.fullName,
    phone: l.phone,
    alternatePhone: l.alternatePhone ?? undefined,
    email: l.email ?? undefined,
    age: l.age ?? undefined,
    gender: l.gender as CrmLead["gender"] | undefined,
    city: l.city ?? undefined,
    state: l.state ?? undefined,
    country: l.country ?? undefined,
    doctorName: l.doctorName ?? undefined,
    appointmentDate: l.appointmentDate?.toISOString() ?? undefined,
    appointmentTime: l.appointmentTime ?? undefined,
    appointmentCentre: l.appointmentCentre ?? undefined,
    source: l.source as CrmLead["source"],
    sourceDetail: l.sourceDetail ?? undefined,
    stageId: l.stageId,
    assigneeId: l.assigneeId ?? undefined,
    specialty: l.specialty ?? undefined,
    valueEstimate: Number(l.valueEstimate ?? 0),
    priority: (l.priority ?? "medium") as CrmLead["priority"],
    tags: l.tags,
    notes: l.notes ?? "",
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
    lastContactAt: l.lastContactAt?.toISOString(),
    nextFollowUpAt: l.nextFollowUpAt?.toISOString(),
    convertedVisitId: l.convertedVisitId ?? undefined,
    patientId: l.patientId ?? undefined,
    uhid: l.uhid ?? undefined,
    lostReason: l.lostReason ?? undefined,
    leadStatus: (l.leadStatus ?? "fresh") as CrmLeadStatus,
    callOutcome: l.callOutcome as CrmCallOutcome | undefined,
    formData: l.formData as Record<string, string | number | boolean> | undefined,
  }));
}

export async function getCounsellorCommissions(
  ctx: ServerContext,
  counsellorId: string,
): Promise<CrmCommission[]> {
  const rows = await prisma.counsellorCommission.findMany({
    where: { branchId: ctx.branchId, counsellorId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return rows.map((r) => ({
    id: r.id,
    leadId: r.leadId ?? undefined,
    counsellorId: r.counsellorId,
    counsellorName: r.counsellorName,
    patientId: r.patientId ?? undefined,
    patientName: r.patientName ?? undefined,
    visitId: r.visitId ?? undefined,
    billAmount: Number(r.billAmount),
    commissionPercent: Number(r.commissionPercent),
    commissionAmount: Number(r.commissionAmount),
    status: r.status as "pending" | "approved" | "paid",
    paidAt: r.paidAt?.toISOString(),
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function getAllCommissions(ctx: ServerContext): Promise<CrmCommission[]> {
  const scope = branchScope(ctx);
  const rows = await prisma.counsellorCommission.findMany({
    where: scope,
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return rows.map((r) => ({
    id: r.id,
    leadId: r.leadId ?? undefined,
    counsellorId: r.counsellorId,
    counsellorName: r.counsellorName,
    patientId: r.patientId ?? undefined,
    patientName: r.patientName ?? undefined,
    visitId: r.visitId ?? undefined,
    billAmount: Number(r.billAmount),
    commissionPercent: Number(r.commissionPercent),
    commissionAmount: Number(r.commissionAmount),
    status: r.status as "pending" | "approved" | "paid",
    paidAt: r.paidAt?.toISOString(),
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function createCommission(
  ctx: ServerContext,
  input: {
    leadId?: string;
    counsellorId: string;
    counsellorName: string;
    patientId?: string;
    patientName?: string;
    visitId?: string;
    billAmount: number;
    commissionPercent: number;
  },
): Promise<CrmCommission> {
  const commissionAmount = Math.round((input.billAmount * input.commissionPercent) / 100);

  const row = await prisma.counsellorCommission.create({
    data: {
      id: `cm_${Date.now()}`,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      leadId: input.leadId ?? null,
      counsellorId: input.counsellorId,
      counsellorName: input.counsellorName,
      patientId: input.patientId ?? null,
      patientName: input.patientName ?? null,
      visitId: input.visitId ?? null,
      billAmount: input.billAmount,
      commissionPercent: input.commissionPercent,
      commissionAmount,
      status: "pending",
    },
  });

  return {
    id: row.id,
    leadId: row.leadId ?? undefined,
    counsellorId: row.counsellorId,
    counsellorName: row.counsellorName,
    patientId: row.patientId ?? undefined,
    patientName: row.patientName ?? undefined,
    visitId: row.visitId ?? undefined,
    billAmount: Number(row.billAmount),
    commissionPercent: Number(row.commissionPercent),
    commissionAmount: Number(row.commissionAmount),
    status: row.status as "pending" | "approved" | "paid",
    paidAt: row.paidAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function updateCommissionStatus(
  ctx: ServerContext,
  commissionId: string,
  status: "pending" | "approved" | "paid",
): Promise<void> {
  const commission = await prisma.counsellorCommission.findFirst({
    where: { id: commissionId, branchId: ctx.branchId },
  });
  if (!commission) throw new ServerActionError("NOT_FOUND", "Commission record not found.");

  await prisma.counsellorCommission.update({
    where: { id: commissionId },
    data: {
      status,
      ...(status === "paid" ? { paidAt: new Date() } : {}),
    },
  });

  await writePlatformAudit({
    ctx,
    module: "crm",
    action: "commission_status_update",
    entityType: "commission",
    entityId: commissionId,
    summary: `Commission ${commissionId} → ${status}`,
  });
}

export async function resolveWalkInCounsellor(
  ctx: ServerContext,
): Promise<{ id: string; name: string } | null> {
  const state = await readCrmWorkspace(ctx, () => defaultCrmState({}));
  const eligible = state.agents.filter(
    (a) => a.active && (a.role === "counsellor" || a.role === "caller" || a.role === "team_lead") && !a.unavailableUntil,
  );
  if (eligible.length === 0) return null;

  const rule =
    state.rules.find((r) => r.active && r.strategy === "percentage" && r.source === "walk_in") ??
    state.rules.find((r) => r.active && r.strategy === "percentage");

  const weights = eligible.map((a) => {
    const fromRule = rule?.agentWeights?.[a.id] ?? 0;
    const fromAgent = a.leadWeightPercent ?? 0;
    return { agent: a, weight: fromRule > 0 ? fromRule : fromAgent > 0 ? fromAgent : 1 };
  });

  const total = weights.reduce((sum, w) => sum + w.weight, 0);
  if (total === 0) return { id: eligible[0].id, name: eligible[0].name };

  let r = Math.random() * total;
  for (const { agent, weight } of weights) {
    r -= weight;
    if (r <= 0) return { id: agent.id, name: agent.name };
  }
  return { id: weights[0].agent.id, name: weights[0].agent.name };
}
