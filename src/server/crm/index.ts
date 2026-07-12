import type {
  CrmAgent,
  CrmAssignmentRule,
  CrmFollowUp,
  CrmIntegration,
  CrmIntegrationId,
  CrmLead,
  CrmPipelineStage,
} from "@/design-system/crm-data";
import type { CounselQuote, CounselSession } from "@/design-system/counsellor-data";
import type { PharmacyBill, Prescription } from "@/design-system/pharmacy-data";
import { formatStageStatus } from "@/lib/frontdesk-workflow";
import { stripDemoFollowUps } from "@/lib/crm-follow-ups";
import {
  mutateAddAgent,
  mutateAddFollowUp,
  mutateAddLead,
  mutateAddRule,
  mutateAddStage,
  mutateAssignLeadManual,
  mutateClearAgentUnavailable,
  mutateCompleteFollowUp,
  mutateIngestFromIntegration,
  mutateLogActivity,
  mutateMarkAgentUnavailable,
  mutateMarkMissedFollowUp,
  mutateMoveLeadStage,
  mutateRemoveAgent,
  mutateRemoveStage,
  mutateReorderStage,
  mutateRescheduleFollowUp,
  mutateSetAgentPassword,
  mutateToggleIntegration,
  mutateTransferOpenLeads,
  mutateUpdateAgent,
  mutateUpdateLead,
  mutateUpdateRule,
  mutateUpdateStage,
  mutateUpdateStages,
  resolveCrmOperator,
} from "@/lib/crm-state-mutations";
import {
  validateFollowUpInput,
  validateInboundLead,
  validateLeadPartial,
  validateOutcome,
  validateRuleWeights,
} from "@/lib/crm-validation";
import { prisma } from "@/lib/prisma";
import type { ServerContext } from "@/server/context";
import { assertAssignableAgent, assertLeadAccess, assertManager, requireAgent, requireLead } from "@/server/crm/guards";
import { syncCrmAgentToPrisma, syncCrmLeadToPrisma } from "@/server/crm/sync";
import { writePlatformAudit } from "@/server/platform-audit";
import { sendWhatsAppAsync } from "@/server/whatsapp/service";
import { ensureRevenueSeeded } from "@/server/revenue/bootstrap";
import { hashPassword } from "@/server/revenue/password";
import { defaultCrmState, defaultPharmacyState, type CrmStateShape } from "@/server/revenue/state-seeds";
import { readCrmWorkspace, readPharmacyWorkspace, writeCrmWorkspace } from "@/server/workspace-state";
import { ServerActionError } from "@/server/errors";
import type { CrmLead as CrmLeadType } from "@/design-system/crm-data";

export type CrmSnapshot = CrmStateShape & {
  activeOperatorId: string;
  activeOperatorName: string;
  activeOperatorRole: string;
  isManager: boolean;
};

export type CrmPatientHistory = {
  matchType: "patient_id" | "phone" | "name" | "visit" | "none";
  patient:
    | {
        id: string;
        uhid: string;
        name: string;
        phone: string;
        age: number;
        gender: string;
        department?: string | null;
        referrer?: string | null;
        lastVisit?: string | null;
      }
    | undefined;
  visits: Array<{
    id: string;
    doctorName: string;
    stage: string;
    billing: string;
    token?: number;
    billAmount: number | null;
    amountPaid: number | null;
    balanceDue: number | null;
    counselPackageLabel?: string;
    deferredReason?: string;
  }>;
  pharmacyRx: Prescription[];
  pharmacyBills: PharmacyBill[];
  counselSessions: CounselSession[];
  crmActivities: CrmStateShape["activities"];
  followUps: CrmStateShape["followUps"];
  timeline: Array<{
    id: string;
    at: string;
    category: "crm" | "visit" | "billing" | "pharmacy" | "counselling" | "follow_up";
    title: string;
    detail: string;
    amount?: number;
    status?: string;
  }>;
  billing: {
    totalBilled: number;
    totalPaid: number;
    outstanding: number;
    visitCount: number;
    pharmacyTotal: number;
    pharmacyPaid: number;
  };
};

export const DEFAULT_WEBHOOK_TENANT_ID = process.env.CRM_WEBHOOK_TENANT_ID ?? "tenant_navayu";
export const DEFAULT_WEBHOOK_BRANCH_ID = process.env.CRM_WEBHOOK_BRANCH_ID ?? "branch_gurgaon";

function mapCounsellorSession(row: {
  id: string;
  visitId: string;
  patientId: string;
  counsellorId: string;
  counsellorName: string;
  branchId: string;
  startedAt: Date;
  completedAt: Date | null;
  outcome: string | null;
  quote: unknown;
  internalNotes: string | null;
}): CounselSession {
  return {
    id: row.id,
    visitId: row.visitId,
    patientId: row.patientId,
    queueItemId: row.id,
    counsellorId: row.counsellorId,
    counsellorName: row.counsellorName,
    branchId: row.branchId,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString(),
    outcome: (row.outcome ?? undefined) as CounselSession["outcome"],
    quote: row.quote ? (row.quote as CounselQuote) : undefined,
    internalNotes: row.internalNotes ?? "",
    patientObjections: [],
    sentToBilling: false,
  };
}

async function mergeIntegrations(state: CrmStateShape): Promise<CrmStateShape> {
  const configs = await prisma.crmWebhookConfig.findMany();
  state.integrations = configs.map((c) => ({
    id: c.id as CrmIntegration["id"],
    label: c.label,
    description: c.description,
    icon: c.icon as CrmIntegration["icon"],
    connected: c.connected,
    webhookUrl: c.webhookUrl,
    lastEventAt: c.lastEventAt ?? undefined,
    leadsToday: c.leadsToday,
  }));
  return state;
}

export async function readState(ctx: ServerContext): Promise<CrmStateShape> {
  try {
    await ensureRevenueSeeded();
  } catch {
    // Bootstrap may fail if DB schema isn't synced yet
  }
  const state = await readCrmWorkspace(ctx, () => defaultCrmState({}));
  const cleanedFollowUps = stripDemoFollowUps(state.followUps);
  if (cleanedFollowUps.length !== state.followUps.length) {
    state.followUps = cleanedFollowUps;
    const { operatorId: _drop, viewAsAgentId: _v, ...payload } = state;
    await writeCrmWorkspace(ctx, payload);
  }
  return mergeIntegrations(state);
}

async function persistState(ctx: ServerContext, state: CrmStateShape) {
  const { operatorId: _drop, viewAsAgentId: _v, ...payload } = state;
  await writeCrmWorkspace(ctx, payload);
  await syncIntegrationsFromState(state.integrations);
}

async function syncIntegrationsFromState(integrations: CrmIntegration[]) {
  await Promise.all(
    integrations.map((integration) =>
      prisma.crmWebhookConfig.upsert({
        where: { id: integration.id },
        create: {
          id: integration.id,
          label: integration.label,
          description: integration.description,
          icon: integration.icon,
          connected: integration.connected,
          webhookUrl: integration.webhookUrl,
          lastEventAt: integration.lastEventAt ?? null,
          leadsToday: integration.leadsToday,
        },
        update: {
          label: integration.label,
          description: integration.description,
          icon: integration.icon,
          connected: integration.connected,
          webhookUrl: integration.webhookUrl,
          lastEventAt: integration.lastEventAt ?? null,
          leadsToday: integration.leadsToday,
        },
      }),
    ),
  );
}

async function upsertAgentCredential(agent: CrmAgent, password?: string) {
  const explicitPassword = password?.trim();
  const passwordFields = explicitPassword ? { passwordHash: await hashPassword(explicitPassword) } : {};
  await prisma.crmOperatorCredential.upsert({
    where: { id: agent.id },
    create: {
      id: agent.id,
      name: agent.name,
      email: agent.email.toLowerCase(),
      role: agent.role,
      active: agent.active,
      specialtyTags: agent.specialtyTags,
      maxOpenLeads: agent.maxOpenLeads,
      backupAgentId: agent.backupAgentId,
      leadWeightPct: agent.leadWeightPercent ?? 0,
      passwordHash: await hashPassword(explicitPassword || "welcome123"),
    },
    update: {
      name: agent.name,
      email: agent.email.toLowerCase(),
      role: agent.role,
      active: agent.active,
      specialtyTags: agent.specialtyTags,
      maxOpenLeads: agent.maxOpenLeads,
      backupAgentId: agent.backupAgentId,
      leadWeightPct: agent.leadWeightPercent ?? 0,
      ...passwordFields,
    },
  });
}

async function ensureCrmUser(
  ctx: ServerContext,
  email: string,
  name: string,
  password: string,
) {
  const normalizedEmail = email.trim().toLowerCase();
  const tenantEmailKey = { tenantId: ctx.tenantId, email: normalizedEmail };
  const existingUser = await prisma.user.findUnique({ where: { tenantId_email: tenantEmailKey } });
  if (existingUser && existingUser.activeRoleId) {
    const role = await prisma.role.findUnique({ where: { id: existingUser.activeRoleId } });
    if (role && role.key !== "crm") {
      throw new ServerActionError(
        "CONFLICT",
        "This email already belongs to another role. Use Admin → Staff to assign a CRM role instead.",
      );
    }
  }
  const crmRole = await prisma.role.findFirst({ where: { key: "crm" } });
  if (!crmRole) throw new ServerActionError("NOT_FOUND", "CRM role not found.");
  const passwordHash = await hashPassword(password);
  await prisma.user.upsert({
    where: { tenantId_email: tenantEmailKey },
    create: {
      id: `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      email: normalizedEmail,
      name,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      activeRoleId: crmRole.id,
      status: "ACTIVE",
      passwordHash,
    },
    update: {
      name,
      activeRoleId: crmRole.id,
      status: "ACTIVE",
      passwordHash,
    },
  });
}

async function withOperator(
  ctx: ServerContext,
  operatorId: string,
  fn: (state: CrmStateShape, operator: CrmAgent) => Promise<CrmStateShape>,
) {
  const state = await readState(ctx);
  const operator = resolveCrmOperator(state, operatorId);
  const next = await fn(state, operator);
  await persistState(ctx, next);
  return next;
}

function isManagerOperator(operator: CrmAgent) {
  return operator.role === "manager" || operator.id === "crm_mgr";
}

export async function getCrmSnapshot(ctx: ServerContext, operatorId: string): Promise<CrmSnapshot> {
  const state = await readState(ctx);
  let activeOperatorId = operatorId;
  let activeOperatorName = "CRM Agent";
  let activeOperatorRole = "agent";
  let isManager = false;

  if (operatorId) {
    try {
      const op = resolveCrmOperator(state, operatorId);
      activeOperatorId = op.id;
      activeOperatorName = op.name;
      activeOperatorRole = op.role;
      isManager = isManagerOperator(op);
    } catch {
      /* client may not have operator yet */
    }
  }

  return {
    ...state,
    operatorId: activeOperatorId,
    viewAsAgentId: state.viewAsAgentId ?? null,
    activeOperatorId,
    activeOperatorName,
    activeOperatorRole,
    isManager,
  };
}

export async function listCrmAuditLogs(ctx: ServerContext, input: { limit?: number; cursor?: string }) {
  const limit = Math.min(100, Math.max(10, input.limit ?? 50));
  const rows = await prisma.auditLog.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      module: "crm",
      ...(input.cursor ? { createdAt: { lt: new Date(input.cursor) } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map((r) => ({
    id: r.id,
    at: r.createdAt.toISOString(),
    actor: r.actor,
    actorRole: r.actorRole ?? "",
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    summary: r.summary,
    severity: r.severity,
  }));
}

export async function createLead(
  ctx: ServerContext,
  operatorId: string,
  partial: Parameters<typeof mutateAddLead>[2],
) {
  validateLeadPartial(partial);
  let leadId = "";
  await withOperator(ctx, operatorId, async (state, operator) => {
    const result = mutateAddLead(state, operator, partial);
    leadId = result.leadId;
    const lead = result.state.leads.find((l) => l.id === result.leadId);
    if (lead) await syncCrmLeadToPrisma(ctx, lead);
    await writePlatformAudit({
      ctx,
      module: "crm",
      action: "lead_created",
      entityType: "lead",
      entityId: result.leadId,
      summary: `Lead created: ${partial.fullName}`,
      payload: { assigneeId: lead?.assigneeId },
    });
    return result.state;
  });

  // WhatsApp: send greeting to new lead (Gurgaon only)
  try {
    const phone = partial.phone?.trim();
    if (phone) {
      await sendWhatsAppAsync(ctx, "lead_greeting", phone, {
        leadName: partial.fullName ?? "there",
      });
    }
  } catch (e) {
    console.error("[whatsapp] lead greeting trigger failed:", e);
  }

  return { leadId };
}

export async function updateLead(ctx: ServerContext, operatorId: string, leadId: string, patch: Partial<CrmLead>) {
  await withOperator(ctx, operatorId, async (state, operator) => {
    const lead = requireLead(state, leadId);
    assertLeadAccess(operator, lead, isManagerOperator(operator));
    const next = mutateUpdateLead(state, leadId, patch);
    const updatedLead = next.leads.find((l) => l.id === leadId);
    if (updatedLead) await syncCrmLeadToPrisma(ctx, updatedLead, next.agents);
    await writePlatformAudit({
      ctx,
      module: "crm",
      action: "lead_updated",
      entityType: "lead",
      entityId: leadId,
      summary: `Lead updated: ${lead.fullName}`,
    });
    return next;
  });
}

export async function assignLeadManual(ctx: ServerContext, operatorId: string, leadId: string, agentId: string) {
  await withOperator(ctx, operatorId, async (state, operator) => {
    assertManager(operator);
    const agent = requireAgent(state, agentId);
    assertAssignableAgent(agent);
    requireLead(state, leadId);
    const next = mutateAssignLeadManual(state, operator, leadId, agentId);
    const updatedLead = next.leads.find((l) => l.id === leadId);
    if (updatedLead) await syncCrmLeadToPrisma(ctx, updatedLead, next.agents);
    await writePlatformAudit({
      ctx,
      module: "crm",
      action: "lead_assigned",
      entityType: "lead",
      entityId: leadId,
      summary: `Lead reassigned to ${agent.name}`,
    });
    return next;
  });
}

export async function moveLeadStage(ctx: ServerContext, operatorId: string, leadId: string, stageId: string) {
  await withOperator(ctx, operatorId, async (state, operator) => {
    const lead = requireLead(state, leadId);
    assertLeadAccess(operator, lead, isManagerOperator(operator));
    const stage = state.stages.find((s) => s.id === stageId);
    if (!stage) throw new ServerActionError("NOT_FOUND", "Stage not found.");
    const next = mutateMoveLeadStage(state, operator, leadId, stageId);
    const updatedLead = next.leads.find((l) => l.id === leadId);
    if (updatedLead) await syncCrmLeadToPrisma(ctx, updatedLead, next.agents);
    await writePlatformAudit({
      ctx,
      module: "crm",
      action: "lead_stage_moved",
      entityType: "lead",
      entityId: leadId,
      summary: `Lead ${lead.fullName} → ${stage.label}`,
    });
    return next;
  });
}

export async function ingestFromIntegration(
  ctx: ServerContext,
  operatorId: string,
  integrationId: CrmIntegrationId,
  payload: { name: string; phone: string; specialty?: string; notes?: string },
) {
  validateInboundLead(payload);
  let leadId: string | null = null;
  let duplicate = false;
  await withOperator(ctx, operatorId, async (state, operator) => {
    const result = mutateIngestFromIntegration(state, integrationId, payload, integrationId);
    leadId = result.leadId;
    duplicate = result.duplicate;
    if (result.leadId && !result.duplicate) {
      const lead = result.state.leads.find((l) => l.id === result.leadId);
      if (lead) await syncCrmLeadToPrisma(ctx, lead, result.state.agents);
      await writePlatformAudit({
        ctx,
        module: "crm",
        action: "lead_ingested",
        entityType: "lead",
        entityId: result.leadId,
        summary: `Inbound lead from ${integrationId}: ${payload.name}`,
      });
    }
    return result.state;
  });
  return { leadId, duplicate };
}

export async function ingestInboundLeadWebhook(
  ctx: ServerContext,
  integrationId: CrmIntegrationId,
  payload: { name: string; phone: string; email?: string; specialty?: string; notes?: string },
  sourceLabel: string,
) {
  validateInboundLead(payload);
  const state = await readState(ctx);
  const result = mutateIngestFromIntegration(state, integrationId, payload, sourceLabel);
  if (result.duplicate) {
    return { ok: true as const, duplicate: true, leadId: result.leadId };
  }
  if (!result.leadId) {
    return { ok: false as const, error: "Integration not connected" };
  }
  const lead = result.state.leads.find((l) => l.id === result.leadId);
  if (lead) await syncCrmLeadToPrisma(ctx, lead, result.state.agents);
  await persistState(ctx, result.state);
  await writePlatformAudit({
    ctx,
    module: "crm",
    action: "webhook_lead_ingested",
    entityType: "lead",
    entityId: result.leadId,
    summary: `Webhook lead from ${sourceLabel}: ${payload.name}`,
    payload,
  });
  return { ok: true as const, duplicate: false, leadId: result.leadId };
}

export async function toggleIntegration(ctx: ServerContext, operatorId: string, id: CrmIntegrationId, connected: boolean) {
  await withOperator(ctx, operatorId, async (state, operator) => {
    assertManager(operator);
    const next = mutateToggleIntegration(state, id, connected);
    await writePlatformAudit({
      ctx,
      module: "crm",
      action: connected ? "integration_connected" : "integration_disconnected",
      entityType: "integration",
      entityId: id,
      summary: `${id} ${connected ? "connected" : "disconnected"}`,
    });
    return next;
  });
}

export async function updateRule(ctx: ServerContext, operatorId: string, id: string, patch: Partial<CrmAssignmentRule>) {
  await withOperator(ctx, operatorId, async (state, operator) => {
    assertManager(operator);
    if (patch.strategy === "percentage" && patch.agentWeights) {
      const rule = state.rules.find((r) => r.id === id);
      const ids = patch.assignToAgentIds ?? rule?.assignToAgentIds ?? [];
      validateRuleWeights(patch.agentWeights, ids);
    }
    const next = mutateUpdateRule(state, id, patch);
    await writePlatformAudit({ ctx, module: "crm", action: "rule_updated", entityType: "rule", entityId: id, summary: `Routing rule updated` });
    return next;
  });
}

export async function addRule(ctx: ServerContext, operatorId: string, rule: Omit<CrmAssignmentRule, "id">) {
  await withOperator(ctx, operatorId, async (state, operator) => {
    assertManager(operator);
    if (rule.strategy === "percentage" && rule.agentWeights) {
      validateRuleWeights(rule.agentWeights, rule.assignToAgentIds);
    }
    const next = mutateAddRule(state, rule);
    await writePlatformAudit({ ctx, module: "crm", action: "rule_added", entityType: "rule", entityId: "new", summary: `Routing rule added: ${rule.label}` });
    return next;
  });
}

export async function addAgent(
  ctx: ServerContext,
  operatorId: string,
  agent: Omit<CrmAgent, "id">,
  password?: string,
) {
  let agentId = "";
  let pwd = "";
  await withOperator(ctx, operatorId, async (state, operator) => {
    assertManager(operator);
    const existing = await prisma.crmOperatorCredential.findUnique({
      where: { email: agent.email.trim().toLowerCase() },
    });
    if (existing && state.agents.some((a) => a.id === existing.id || a.email === agent.email.trim().toLowerCase())) {
      throw new ServerActionError("CONFLICT", "A CRM agent with this email already exists. Edit the existing agent instead.");
    }
    const id = existing?.id;
    const result = mutateAddAgent(state, agent, password, id);
    agentId = result.agentId;
    pwd = result.password;
    const created = result.state.agents.find((a) => a.id === agentId)!;
    await upsertAgentCredential(created, pwd);
    await syncCrmAgentToPrisma(ctx, created);
    await ensureCrmUser(ctx, created.email, created.name, pwd);
    await writePlatformAudit({
      ctx,
      module: "crm",
      action: "agent_added",
      entityType: "agent",
      entityId: agentId,
      summary: `CRM agent added: ${agent.name}`,
    });
    return result.state;
  });
  return { agentId, password: pwd };
}

export async function updateAgent(ctx: ServerContext, operatorId: string, id: string, patch: Partial<CrmAgent>) {
  await withOperator(ctx, operatorId, async (state, operator) => {
    assertManager(operator);
    const next = mutateUpdateAgent(state, id, patch);
    const updated = next.agents.find((a) => a.id === id);
    if (updated) {
      await upsertAgentCredential(updated);
      await syncCrmAgentToPrisma(ctx, updated);
    }
    await writePlatformAudit({ ctx, module: "crm", action: "agent_updated", entityType: "agent", entityId: id, summary: `CRM agent updated` });
    return next;
  });
}

export async function setAgentPassword(ctx: ServerContext, operatorId: string, id: string, password: string) {
  await withOperator(ctx, operatorId, async (state, operator) => {
    assertManager(operator);
    const agent = requireAgent(state, id);
    const next = mutateSetAgentPassword(state, id, password);
    await upsertAgentCredential(agent, password);
    await ensureCrmUser(ctx, agent.email, agent.name, password);
    await writePlatformAudit({ ctx, module: "crm", action: "agent_password_set", entityType: "agent", entityId: id, summary: `Password reset for ${agent.name}` });
    return next;
  });
}

export async function removeAgent(ctx: ServerContext, operatorId: string, id: string) {
  await withOperator(ctx, operatorId, async (state, operator) => {
    assertManager(operator);
    const agent = state.agents.find((a) => a.id === id);
    const next = mutateRemoveAgent(state, id, operatorId);
    await prisma.crmOperatorCredential.deleteMany({ where: { id } });
    if (agent) {
      await prisma.user.updateMany({
        where: { tenantId: ctx.tenantId, email: agent.email.trim().toLowerCase() },
        data: { status: "INACTIVE" },
      });
    }
    await writePlatformAudit({ ctx, module: "crm", action: "agent_removed", entityType: "agent", entityId: id, summary: `CRM agent removed`, severity: "warning" });
    return next;
  });
}

export async function updateStage(ctx: ServerContext, operatorId: string, id: string, patch: Partial<CrmPipelineStage>) {
  await withOperator(ctx, operatorId, async (state, operator) => {
    assertManager(operator);
    const next = mutateUpdateStage(state, id, patch);
    await writePlatformAudit({ ctx, module: "crm", action: "stage_updated", entityType: "stage", entityId: id, summary: `Pipeline stage updated` });
    return next;
  });
}

export async function addStage(ctx: ServerContext, operatorId: string, label: string, color?: string) {
  await withOperator(ctx, operatorId, async (state, operator) => {
    assertManager(operator);
    const next = mutateAddStage(state, label, color);
    await writePlatformAudit({ ctx, module: "crm", action: "stage_added", entityType: "stage", entityId: label, summary: `Pipeline stage added: ${label}` });
    return next;
  });
}

export async function removeStage(ctx: ServerContext, operatorId: string, id: string) {
  await withOperator(ctx, operatorId, async (state, operator) => {
    assertManager(operator);
    const next = mutateRemoveStage(state, id);
    await writePlatformAudit({ ctx, module: "crm", action: "stage_removed", entityType: "stage", entityId: id, summary: `Pipeline stage removed`, severity: "warning" });
    return next;
  });
}

export async function reorderStage(ctx: ServerContext, operatorId: string, id: string, dir: -1 | 1) {
  await withOperator(ctx, operatorId, async (state, operator) => {
    assertManager(operator);
    return mutateReorderStage(state, id, dir);
  });
}

export async function updateStages(ctx: ServerContext, operatorId: string, stages: CrmPipelineStage[]) {
  await withOperator(ctx, operatorId, async (state, operator) => {
    assertManager(operator);
    return mutateUpdateStages(state, stages);
  });
}

export async function addFollowUp(
  ctx: ServerContext,
  operatorId: string,
  fu: Omit<CrmFollowUp, "id" | "status"> & { status?: CrmFollowUp["status"] },
) {
  validateFollowUpInput(fu);
  await withOperator(ctx, operatorId, async (state, operator) => {
    requireLead(state, fu.leadId);
    const next = mutateAddFollowUp(state, operator, fu);
    await writePlatformAudit({ ctx, module: "crm", action: "follow_up_scheduled", entityType: "follow_up", entityId: fu.leadId, summary: `Follow-up scheduled for lead ${fu.leadId}` });
    return next;
  });
}

export async function completeFollowUp(ctx: ServerContext, operatorId: string, id: string, outcome: string) {
  const validated = validateOutcome(outcome);
  await withOperator(ctx, operatorId, async (state, operator) => {
    const fu = state.followUps.find((f) => f.id === id);
    const next = mutateCompleteFollowUp(state, operator, id, validated);
    await writePlatformAudit({ ctx, module: "crm", action: "follow_up_completed", entityType: "follow_up", entityId: id, summary: `Follow-up completed: ${validated}`, payload: { leadId: fu?.leadId } });
    return next;
  });
}

export async function rescheduleFollowUp(ctx: ServerContext, operatorId: string, id: string, scheduledAt: string, notes?: string) {
  await withOperator(ctx, operatorId, async (state, operator) => {
    const next = mutateRescheduleFollowUp(state, operator, id, scheduledAt, notes);
    await writePlatformAudit({ ctx, module: "crm", action: "follow_up_rescheduled", entityType: "follow_up", entityId: id, summary: `Follow-up rescheduled to ${scheduledAt}` });
    return next;
  });
}

export async function markMissedFollowUp(ctx: ServerContext, operatorId: string, id: string, reason?: string) {
  await withOperator(ctx, operatorId, async (state, operator) => {
    const next = mutateMarkMissedFollowUp(state, operator, id, reason);
    await writePlatformAudit({ ctx, module: "crm", action: "follow_up_missed", entityType: "follow_up", entityId: id, summary: `Follow-up marked missed`, severity: "warning" });
    return next;
  });
}

export async function markAgentUnavailable(
  ctx: ServerContext,
  operatorId: string,
  agentId: string,
  until: string,
  reason: string,
  transferLeads = true,
) {
  await withOperator(ctx, operatorId, async (state, operator) => {
    assertManager(operator);
    const next = mutateMarkAgentUnavailable(state, operator, agentId, until, reason, transferLeads);
    await writePlatformAudit({ ctx, module: "crm", action: "agent_unavailable", entityType: "agent", entityId: agentId, summary: `Agent marked unavailable until ${until}`, severity: "warning" });
    return next;
  });
}

export async function clearAgentUnavailable(ctx: ServerContext, operatorId: string, agentId: string) {
  await withOperator(ctx, operatorId, async (state, operator) => {
    assertManager(operator);
    const next = mutateClearAgentUnavailable(state, agentId);
    await writePlatformAudit({ ctx, module: "crm", action: "agent_available", entityType: "agent", entityId: agentId, summary: `Agent marked available again` });
    return next;
  });
}

export async function transferOpenLeads(ctx: ServerContext, operatorId: string, fromAgentId: string, toAgentId?: string) {
  let count = 0;
  await withOperator(ctx, operatorId, async (state, operator) => {
    assertManager(operator);
    const result = mutateTransferOpenLeads(state, operator, fromAgentId, toAgentId);
    count = result.count;
    if (count > 0) {
      await writePlatformAudit({
        ctx,
        module: "crm",
        action: "leads_transferred",
        entityType: "agent",
        entityId: fromAgentId,
        summary: `${count} lead(s) transferred from ${fromAgentId}`,
      });
    }
    return result.state;
  });
  return { count };
}

export async function logActivity(ctx: ServerContext, operatorId: string, leadId: string, summary: string, type = "note") {
  await withOperator(ctx, operatorId, async (state, operator) => {
    requireLead(state, leadId);
    return mutateLogActivity(state, operator, leadId, summary, type);
  });
}

export async function transferCrmAbsence(
  ctx: ServerContext,
  input: { crmAgentId: string; until: string; reason: string; transferLeads: boolean },
) {
  const state = await readState(ctx);
  const manager = state.agents.find((a) => a.role === "manager" && a.active);
  const operatorId = manager?.id ?? "crm_mgr";
  let transferred = 0;

  await withOperator(ctx, operatorId, async (s, operator) => {
    let next = mutateMarkAgentUnavailable(s, operator, input.crmAgentId, input.until, input.reason, input.transferLeads);
    if (input.transferLeads) {
      const result = mutateTransferOpenLeads(next, operator, input.crmAgentId);
      transferred = result.count;
      next = result.state;
    }
    await writePlatformAudit({
      ctx,
      module: "crm",
      action: "absence_transfer",
      entityType: "agent",
      entityId: input.crmAgentId,
      summary: `HR absence: ${transferred} lead(s) transferred`,
      severity: "warning",
    });
    return next;
  });

  return { transferred };
}

export async function clearCrmAbsence(ctx: ServerContext, crmAgentId: string) {
  const state = await readState(ctx);
  const manager = state.agents.find((a) => a.role === "manager" && a.active);
  const operatorId = manager?.id ?? "crm_mgr";
  await withOperator(ctx, operatorId, async (s, operator) => {
    assertManager(operator);
    return mutateClearAgentUnavailable(s, crmAgentId);
  });
}

function normalizePhone(input?: string) {
  return (input ?? "").replace(/\D/g, "").slice(-10);
}

function normalizeName(input?: string) {
  return (input ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export async function getCrmLeadClinicalHistory(ctx: ServerContext, lead: CrmLeadType): Promise<CrmPatientHistory> {
  const state = await readState(ctx);
  const pharmacyState = await readPharmacyWorkspace(ctx, () => defaultPharmacyState({}));

  const allPatients = await prisma.patient.findMany({
    where: { branchId: ctx.branchId, tenantId: ctx.tenantId },
  });
  let patient = null as (typeof allPatients)[number] | null;

  if (lead.patientId) patient = allPatients.find((p) => p.id === lead.patientId) ?? null;
  if (!patient && lead.uhid) patient = allPatients.find((p) => p.uhid === lead.uhid) ?? null;
  if (!patient) {
    const leadPhones = [normalizePhone(lead.phone), normalizePhone(lead.alternatePhone)].filter(Boolean);
    patient = allPatients.find((p) => leadPhones.includes(normalizePhone(p.phone))) ?? null;
  }
  if (!patient) {
    patient = allPatients.find((p) => normalizeName(p.fullName) === normalizeName(lead.fullName)) ?? null;
  }

  const visits = patient
    ? await prisma.visit.findMany({
        where: { patientId: patient.id, branchId: patient.branchId ?? undefined },
        orderBy: { updatedAt: "desc" },
      })
    : lead.convertedVisitId
      ? await prisma.visit.findMany({ where: { id: lead.convertedVisitId } })
      : [];

  const visitIds = visits.map((v) => v.id);
  const patientIds = patient ? [patient.id] : lead.patientId ? [lead.patientId] : [];

  const counselRows = await prisma.counsellorSession.findMany({
    where: {
      branchId: ctx.branchId,
      OR: [
        ...(patientIds.length ? [{ patientId: { in: patientIds } }] : []),
        ...(visitIds.length ? [{ visitId: { in: visitIds } }] : []),
      ],
    },
    orderBy: { startedAt: "desc" },
    take: 50,
  });

  const uhid = lead.uhid ?? patient?.uhid;
  const leadName = normalizeName(lead.fullName);

  const prescriptions = (pharmacyState.prescriptions ?? []).filter(
    (rx) =>
      (uhid && rx.uhid === uhid) ||
      (patient?.uhid && rx.uhid === patient.uhid) ||
      normalizeName(rx.patientName) === leadName,
  );
  const bills = (pharmacyState.bills ?? []).filter(
    (bill) =>
      (uhid && bill.uhid === uhid) ||
      normalizeName(bill.patientName) === leadName ||
      prescriptions.some((rx) => rx.id === bill.prescriptionId),
  );

  const sessions = counselRows.map(mapCounsellorSession);
  const leadActivities = state.activities.filter((activity) => activity.leadId === lead.id);
  const leadFollowUps = state.followUps.filter((followUp) => followUp.leadId === lead.id);

  let matchType: CrmPatientHistory["matchType"] = "none";
  if (lead.patientId && patient) matchType = "patient_id";
  else if (patient && normalizePhone(patient.phone) === normalizePhone(lead.phone)) matchType = "phone";
  else if (patient) matchType = "name";
  else if (lead.convertedVisitId) matchType = "visit";

  const visitEvents = visits.map((visit) => ({
    id: `visit-${visit.id}`,
    at: visit.checkInAt ? visit.checkInAt.toISOString() : new Date().toISOString(),
    category: (visit.billAmount ? "billing" : "visit") as "billing" | "visit",
    title: `Visit — ${visit.doctorName || "Unassigned"}`,
    detail: [
      `Stage: ${formatStageStatus(visit.stage)}`,
      visit.token != null ? `Token #${visit.token}` : null,
      visit.packageLabel ?? null,
      visit.routingNote ?? null,
      visit.deferredReason ? `Deferred: ${visit.deferredReason}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    amount: visit.billAmount != null ? Number(visit.billAmount) : undefined,
    status: visit.billingStatus ?? undefined,
  }));

  const pharmacyEvents = [
    ...prescriptions.map((rx) => ({
      id: `rx-${rx.id}`,
      at: rx.createdAt,
      category: "pharmacy" as const,
      title: `Prescription — ${rx.status.replace(/_/g, " ")}`,
      detail: `${rx.lines.length} item(s) · Dr. ${rx.doctorName} · ${rx.source.toUpperCase()}`,
      status: rx.status,
      amount: undefined,
    })),
    ...bills.map((bill) => ({
      id: `ph-bill-${bill.id}`,
      at: bill.createdAt,
      category: "pharmacy" as const,
      title: `Pharmacy bill ${bill.id}`,
      detail: `${bill.lines.length} item(s) · GST ₹${bill.gstTotal.toFixed(0)}`,
      amount: bill.total,
      status: bill.paid ? "paid" : "pending",
    })),
  ];

  const counselEvents = sessions.map((session) => ({
    id: `counsel-${session.id}`,
    at: session.completedAt ?? session.startedAt,
    category: "counselling" as const,
    title: session.quote ? `Counselling — ${session.quote.packageLabel}` : "Counselling session",
    detail: [
      session.outcome ? `Outcome: ${session.outcome}` : "In progress",
      session.quote ? `Net ₹${session.quote.netAmount.toLocaleString("en-IN")}` : null,
      session.internalNotes ? session.internalNotes.slice(0, 80) : null,
    ]
      .filter(Boolean)
      .join(" · "),
    amount: session.quote?.netAmount,
    status: session.outcome,
  }));

  const crmEvents = [
    ...leadActivities.map((item) => ({
      id: `crm-${item.id}`,
      at: item.at,
      category: "crm" as const,
      title: item.type.charAt(0).toUpperCase() + item.type.slice(1),
      detail: `${item.actor}: ${item.summary}`,
      amount: undefined,
      status: undefined,
    })),
    ...leadFollowUps.map((item) => ({
      id: `fu-${item.id}`,
      at: item.scheduledAt,
      category: "follow_up" as const,
      title: `Follow-up (${item.channel})`,
      detail: [item.notes, item.outcome, `Status: ${item.status}`].filter(Boolean).join(" · "),
      amount: undefined,
      status: item.status,
    })),
  ];

  const timeline = [...crmEvents, ...visitEvents, ...counselEvents, ...pharmacyEvents].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );

  const visitBilled = visits.reduce((n, visit) => n + Number(visit.billAmount ?? 0), 0);
  const visitPaid = visits.reduce(
    (n, visit) =>
      n + Number(visit.amountPaid ?? ((visit.billingStatus ?? "pending") === "paid" ? (visit.billAmount ?? 0) : 0)),
    0,
  );
  const visitOutstanding = visits.reduce((n, visit) => n + Number(visit.balanceDue ?? 0), 0);
  const pharmacyTotal = bills.reduce((n, bill) => n + bill.total, 0);
  const pharmacyPaid = bills.filter((bill) => bill.paid).reduce((n, bill) => n + bill.total, 0);
  const outstanding = Math.max(visitOutstanding, Number(patient?.balance ?? 0)) + pharmacyTotal - pharmacyPaid;

  return {
    matchType,
    patient: patient
      ? {
          id: patient.id,
          uhid: patient.uhid,
          name: patient.fullName,
          phone: patient.phone,
          age: patient.age ?? 0,
          gender: patient.gender ?? "O",
          department: patient.departmentLabel ?? null,
          referrer: patient.referrer ?? null,
          lastVisit: patient.lastVisitAt ? patient.lastVisitAt.toISOString().slice(0, 10) : null,
        }
      : undefined,
    visits: visits.map((visit) => ({
      id: visit.id,
      doctorName: visit.doctorName ?? "Doctor",
      stage: visit.stage,
      billing: visit.billingStatus ?? "pending",
      token: visit.token ?? undefined,
      billAmount: visit.billAmount != null ? Number(visit.billAmount) : null,
      amountPaid: visit.amountPaid != null ? Number(visit.amountPaid) : null,
      balanceDue: visit.balanceDue != null ? Number(visit.balanceDue) : null,
      counselPackageLabel: visit.packageLabel ?? undefined,
      deferredReason: visit.deferredReason ?? undefined,
    })),
    pharmacyRx: prescriptions,
    pharmacyBills: bills,
    counselSessions: sessions,
    crmActivities: leadActivities,
    followUps: leadFollowUps,
    timeline,
    billing: {
      totalBilled: visitBilled + pharmacyTotal,
      totalPaid: visitPaid + pharmacyPaid,
      outstanding,
      visitCount: visits.length,
      pharmacyTotal,
      pharmacyPaid,
    },
  };
}

export function resolveWebhookContext(url: URL): ServerContext {
  return {
    userId: "webhook",
    tenantId: url.searchParams.get("tenantId") ?? DEFAULT_WEBHOOK_TENANT_ID,
    branchId: url.searchParams.get("branchId") ?? DEFAULT_WEBHOOK_BRANCH_ID,
    branchName: "",
    role: "system",
    sessionToken: "",
  };
}

export function mapWebhookSourceToIntegration(source: string): CrmIntegrationId {
  const normalized = source.toLowerCase();
  if (normalized.includes("whatsapp")) return "whatsapp_business";
  if (normalized.includes("google") || normalized.includes("form")) return "google_forms";
  if (normalized.includes("meta") || normalized.includes("facebook")) return "meta_lead_ads";
  if (normalized.includes("zapier")) return "website_widget";
  return "website_widget";
}
