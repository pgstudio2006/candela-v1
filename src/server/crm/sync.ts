import type { Prisma } from "@prisma/client";
import type { CrmAgent, CrmLead } from "@/design-system/crm-data";
import { prisma } from "@/lib/prisma";
import type { ServerContext } from "@/server/context";

function toDate(value?: string | Date | null): Date | undefined {
  if (!value) return undefined;
  const d = typeof value === "string" ? new Date(value) : value;
  return isNaN(d.getTime()) ? undefined : d;
}

export async function ensureCrmPipelineAndStage(ctx: ServerContext) {
  const pipelineId = `crm_pipeline_${ctx.branchId}`;
  const stageId = `crm_stage_${ctx.branchId}`;
  await prisma.pipeline.upsert({
    where: { id: pipelineId },
    create: {
      id: pipelineId,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      label: "CRM Leads",
      active: true,
    },
    update: {},
  });
  await prisma.stage.upsert({
    where: { id: stageId },
    create: {
      id: stageId,
      pipelineId,
      branchId: ctx.branchId,
      label: "CRM",
      order: 0,
    },
    update: {},
  });
  return { pipelineId, stageId };
}

export async function syncCrmAgentToPrisma(ctx: ServerContext, agent: CrmAgent) {
  if (!agent) return;
  await prisma.agent.upsert({
    where: { id: agent.id },
    create: {
      id: agent.id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      name: agent.name,
      email: agent.email.toLowerCase(),
      role: agent.role,
      active: agent.active,
      specialtyTags: agent.specialtyTags,
      maxOpenLeads: agent.maxOpenLeads,
      backupAgentId: agent.backupAgentId,
      leadWeightPercent: agent.leadWeightPercent ?? 0,
    },
    update: {
      name: agent.name,
      email: agent.email.toLowerCase(),
      role: agent.role,
      active: agent.active,
      specialtyTags: agent.specialtyTags,
      maxOpenLeads: agent.maxOpenLeads,
      backupAgentId: agent.backupAgentId,
      leadWeightPercent: agent.leadWeightPercent ?? 0,
    },
  });
}

export async function syncCrmLeadToPrisma(ctx: ServerContext, lead: CrmLead) {
  if (!lead) return;
  const { stageId, pipelineId } = await ensureCrmPipelineAndStage(ctx);
  if (lead.assigneeId) {
    // No agent object available here; sync will be handled separately by agent hooks.
  }
  await prisma.lead.upsert({
    where: { id: lead.id },
    create: {
      id: lead.id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      pipelineId,
      stageId,
      assigneeId: lead.assigneeId ?? null,
      patientId: lead.patientId ?? null,
      fullName: lead.fullName,
      phone: lead.phone,
      alternatePhone: lead.alternatePhone ?? null,
      email: lead.email ?? null,
      age: lead.age ?? null,
      gender: lead.gender ?? null,
      city: lead.city ?? null,
      district: lead.district ?? null,
      state: lead.state ?? null,
      country: lead.country ?? null,
      doctorName: lead.doctorName ?? null,
      appointmentDate: toDate(lead.appointmentDate),
      source: lead.source,
      sourceDetail: lead.sourceDetail ?? null,
      integrationId: lead.integrationId ?? null,
      specialty: lead.specialty ?? null,
      valueEstimate: lead.valueEstimate ?? null,
      priority: lead.priority,
      tags: lead.tags,
      notes: lead.notes ?? null,
      convertedVisitId: lead.convertedVisitId ?? null,
      uhid: lead.uhid ?? null,
      lostReason: lead.lostReason ?? null,
      leadStatus: lead.leadStatus ?? "fresh",
      callOutcome: lead.callOutcome ?? null,
      ...(lead.formData ? { formData: lead.formData as Prisma.InputJsonValue } : {}),
      appointmentTime: lead.appointmentTime ?? null,
      appointmentCentre: lead.appointmentCentre ?? null,
      createdAt: toDate(lead.createdAt) ?? new Date(),
      updatedAt: toDate(lead.updatedAt) ?? new Date(),
      lastContactAt: toDate(lead.lastContactAt),
      nextFollowUpAt: toDate(lead.nextFollowUpAt),
    },
    update: {
      stageId,
      assigneeId: lead.assigneeId ?? null,
      patientId: lead.patientId ?? null,
      fullName: lead.fullName,
      phone: lead.phone,
      alternatePhone: lead.alternatePhone ?? null,
      email: lead.email ?? null,
      age: lead.age ?? null,
      gender: lead.gender ?? null,
      city: lead.city ?? null,
      district: lead.district ?? null,
      state: lead.state ?? null,
      country: lead.country ?? null,
      doctorName: lead.doctorName ?? null,
      appointmentDate: toDate(lead.appointmentDate),
      source: lead.source,
      sourceDetail: lead.sourceDetail ?? null,
      integrationId: lead.integrationId ?? null,
      specialty: lead.specialty ?? null,
      valueEstimate: lead.valueEstimate ?? null,
      priority: lead.priority,
      tags: lead.tags,
      notes: lead.notes ?? null,
      convertedVisitId: lead.convertedVisitId ?? null,
      uhid: lead.uhid ?? null,
      lostReason: lead.lostReason ?? null,
      leadStatus: lead.leadStatus ?? "fresh",
      callOutcome: lead.callOutcome ?? null,
      ...(lead.formData ? { formData: lead.formData as Prisma.InputJsonValue } : {}),
      appointmentTime: lead.appointmentTime ?? null,
      appointmentCentre: lead.appointmentCentre ?? null,
      updatedAt: toDate(lead.updatedAt) ?? new Date(),
      lastContactAt: toDate(lead.lastContactAt),
      nextFollowUpAt: toDate(lead.nextFollowUpAt),
    },
  });
}

export async function removeCrmLeadFromPrisma(ctx: ServerContext, leadId: string) {
  await prisma.lead.deleteMany({ where: { id: leadId, branchId: ctx.branchId } });
}
