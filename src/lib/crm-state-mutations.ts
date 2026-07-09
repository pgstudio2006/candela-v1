import type {
  CrmActivity,
  CrmAgent,
  CrmAssignmentRule,
  CrmFollowUp,
  CrmIntegration,
  CrmIntegrationId,
  CrmLead,
  CrmPipelineStage,
} from "@/design-system/crm-data";
import { CRM_MANAGER_ID } from "@/lib/crm-auth";
import { channelLabel, syncLeadNextFollowUpAt } from "@/lib/crm-follow-ups";
import {
  assignLead,
  pickTransferTarget,
  simulateInboundLead,
} from "@/lib/crm-platform";
import { generateAgentPassword } from "@/lib/crm-auth";
import { ServerActionError } from "@/server/errors";
import type { CrmStateShape } from "@/server/revenue/state-seeds";

const MAX_ACTIVITIES = 200;

export function resolveCrmOperator(state: CrmStateShape, operatorId: string): CrmAgent {
  const agent = state.agents.find((a) => a.id === operatorId);
  if (!agent) {
    throw new ServerActionError("FORBIDDEN", "CRM operator not found in workspace.");
  }
  if (!agent.active) {
    throw new ServerActionError("FORBIDDEN", "This CRM operator account is inactive.");
  }
  return agent;
}

function firstStageId(stages: CrmPipelineStage[]) {
  return [...stages].sort((a, b) => a.order - b.order)[0]?.id ?? "new";
}

function appendActivity(
  state: CrmStateShape,
  activity: Omit<CrmActivity, "id">,
): CrmActivity[] {
  return [{ ...activity, id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }, ...state.activities].slice(
    0,
    MAX_ACTIVITIES,
  );
}

export function mutateAddLead(
  state: CrmStateShape,
  operator: CrmAgent,
  partial: Omit<CrmLead, "id" | "createdAt" | "updatedAt" | "stageId" | "assigneeId"> &
    Partial<Pick<CrmLead, "stageId" | "assigneeId">>,
): { state: CrmStateShape; leadId: string } {
  const now = new Date().toISOString();
  const assigneeId = partial.assigneeId ?? assignLead(partial, state.rules, state.agents, state.leads);
  const lead: CrmLead = {
    fullName: partial.fullName,
    phone: partial.phone,
    alternatePhone: partial.alternatePhone,
    email: partial.email,
    age: partial.age,
    gender: partial.gender,
    city: partial.city,
    district: partial.district,
    state: partial.state,
    country: partial.country,
    doctorName: partial.doctorName,
    appointmentDate: partial.appointmentDate,
    appointmentTime: partial.appointmentTime,
    appointmentCentre: partial.appointmentCentre,
    source: partial.source,
    sourceDetail: partial.sourceDetail,
    integrationId: partial.integrationId,
    specialty: partial.specialty,
    valueEstimate: partial.valueEstimate ?? 50000,
    priority: partial.priority ?? "medium",
    tags: partial.tags ?? [],
    notes: partial.notes ?? "",
    lostReason: partial.lostReason,
    id: `ld_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    stageId: partial.stageId ?? firstStageId(state.stages),
    assigneeId,
    createdAt: now,
    updatedAt: now,
  };

  const assigneeName = state.agents.find((a) => a.id === assigneeId)?.name ?? "unassigned";
  return {
    leadId: lead.id,
    state: {
      ...state,
      leads: [lead, ...state.leads],
      activities: appendActivity(state, {
        leadId: lead.id,
        at: now,
        actor: operator.name,
        type: "created",
        summary: `Lead created · ${lead.fullName} · assigned to ${assigneeName}`,
      }),
    },
  };
}

export function mutateUpdateLead(state: CrmStateShape, leadId: string, patch: Partial<CrmLead>): CrmStateShape {
  return {
    ...state,
    leads: state.leads.map((l) =>
      l.id === leadId ? { ...l, ...patch, updatedAt: new Date().toISOString() } : l,
    ),
  };
}

export function mutateAssignLeadManual(
  state: CrmStateShape,
  operator: CrmAgent,
  leadId: string,
  agentId: string,
): CrmStateShape {
  const agent = state.agents.find((a) => a.id === agentId);
  const now = new Date().toISOString();
  return {
    ...state,
    leads: state.leads.map((l) => (l.id === leadId ? { ...l, assigneeId: agentId, updatedAt: now } : l)),
    activities: appendActivity(state, {
      leadId,
      at: now,
      actor: operator.name,
      type: "assigned",
      summary: `Reassigned to ${agent?.name ?? agentId}`,
    }),
  };
}

export function mutateMoveLeadStage(
  state: CrmStateShape,
  operator: CrmAgent,
  leadId: string,
  stageId: string,
): CrmStateShape {
  const now = new Date().toISOString();
  const stage = state.stages.find((s) => s.id === stageId);
  return {
    ...state,
    leads: state.leads.map((l) =>
      l.id === leadId ? { ...l, stageId, updatedAt: now, lastContactAt: now } : l,
    ),
    activities: appendActivity(state, {
      leadId,
      at: now,
      actor: operator.name,
      type: "stage",
      summary: `Moved to ${stage?.label ?? stageId}`,
    }),
  };
}

export function mutateIngestFromIntegration(
  state: CrmStateShape,
  integrationId: CrmIntegrationId,
  payload: { name: string; phone: string; specialty?: string; notes?: string },
  actorLabel: string = integrationId,
): { state: CrmStateShape; leadId: string | null; duplicate: boolean } {
  if (!state.integrations.find((i) => i.id === integrationId)?.connected) {
    return { state, leadId: null, duplicate: false };
  }

  const phoneNorm = payload.phone.replace(/\D/g, "").slice(-10);
  const duplicate = state.leads.find((l) => l.phone.replace(/\D/g, "").slice(-10) === phoneNorm);
  if (duplicate) {
    return { state, leadId: duplicate.id, duplicate: true };
  }

  const now = new Date().toISOString();
  const partial = simulateInboundLead(integrationId, payload);
  const assigneeId = assignLead(partial, state.rules, state.agents, state.leads);
  const lead: CrmLead = {
    ...partial,
    id: `ld_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    stageId: firstStageId(state.stages),
    assigneeId,
    createdAt: now,
    updatedAt: now,
  };

  return {
    leadId: lead.id,
    duplicate: false,
    state: {
      ...state,
      leads: [lead, ...state.leads],
      integrations: state.integrations.map((i) =>
        i.id === integrationId ? { ...i, leadsToday: i.leadsToday + 1, lastEventAt: now } : i,
      ),
      activities: appendActivity(state, {
        leadId: lead.id,
        at: now,
        actor: actorLabel,
        type: "inbound",
        summary: `Inbound from ${integrationId}`,
      }),
    },
  };
}

export function mutateToggleIntegration(
  state: CrmStateShape,
  id: CrmIntegrationId,
  connected: boolean,
): CrmStateShape {
  return {
    ...state,
    integrations: state.integrations.map((i) => (i.id === id ? { ...i, connected } : i)),
  };
}

export function mutateUpdateRule(state: CrmStateShape, id: string, patch: Partial<CrmAssignmentRule>): CrmStateShape {
  return { ...state, rules: state.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) };
}

export function mutateAddRule(state: CrmStateShape, rule: Omit<CrmAssignmentRule, "id">): CrmStateShape {
  return { ...state, rules: [...state.rules, { ...rule, id: `rule_${Date.now()}` }] };
}

export function mutateAddAgent(
  state: CrmStateShape,
  agent: Omit<CrmAgent, "id">,
  password?: string,
  id?: string,
): { state: CrmStateShape; agentId: string; password: string } {
  const agentId = id?.trim() || `ag_${Date.now().toString(36)}`;
  const pwd = password?.trim() || generateAgentPassword();
  return {
    agentId,
    password: pwd,
    state: {
      ...state,
      agents: [...state.agents, { ...agent, id: agentId }],
      agentPasswords: { ...state.agentPasswords, [agentId]: pwd },
    },
  };
}

export function mutateUpdateAgent(state: CrmStateShape, id: string, patch: Partial<CrmAgent>): CrmStateShape {
  return { ...state, agents: state.agents.map((a) => (a.id === id ? { ...a, ...patch } : a)) };
}

export function mutateSetAgentPassword(state: CrmStateShape, id: string, password: string): CrmStateShape {
  return { ...state, agentPasswords: { ...state.agentPasswords, [id]: password.trim() } };
}

export function mutateRemoveAgent(state: CrmStateShape, id: string, fallbackOperatorId: string): CrmStateShape {
  if (id === CRM_MANAGER_ID) return state;
  const { [id]: _, ...restPasswords } = state.agentPasswords;
  return {
    ...state,
    agents: state.agents.filter((a) => a.id !== id),
    agentPasswords: restPasswords,
    leads: state.leads.map((l) => (l.assigneeId === id ? { ...l, assigneeId: undefined } : l)),
    followUps: state.followUps.filter((f) => f.assigneeId !== id),
    operatorId: state.operatorId === id ? fallbackOperatorId : state.operatorId,
    rules: state.rules.map((r) => ({
      ...r,
      assignToAgentIds: r.assignToAgentIds.filter((aid) => aid !== id),
    })),
  };
}

export function mutateUpdateStage(state: CrmStateShape, id: string, patch: Partial<CrmPipelineStage>): CrmStateShape {
  return { ...state, stages: state.stages.map((s) => (s.id === id ? { ...s, ...patch } : s)) };
}

export function mutateAddStage(state: CrmStateShape, label: string, color = "#6366f1"): CrmStateShape {
  const maxOrder = Math.max(...state.stages.map((s) => s.order), -1);
  const slug =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 20) || "stage";
  const id = `st_${slug}_${Date.now().toString(36)}`;
  return { ...state, stages: [...state.stages, { id, label: label.trim(), color, order: maxOrder + 1 }] };
}

export function mutateRemoveStage(state: CrmStateShape, id: string): CrmStateShape {
  const ordered = [...state.stages].sort((a, b) => a.order - b.order);
  const idx = ordered.findIndex((s) => s.id === id);
  const fallback = ordered[idx - 1]?.id ?? ordered[idx + 1]?.id ?? ordered[0]?.id;
  if (!fallback || ordered.length <= 2) return state;
  return {
    ...state,
    stages: state.stages.filter((s) => s.id !== id),
    leads: state.leads.map((l) => (l.stageId === id ? { ...l, stageId: fallback } : l)),
  };
}

export function mutateReorderStage(state: CrmStateShape, id: string, dir: -1 | 1): CrmStateShape {
  const ordered = [...state.stages].sort((a, b) => a.order - b.order);
  const idx = ordered.findIndex((s) => s.id === id);
  const swap = ordered[idx + dir];
  if (!swap) return state;
  const next = ordered.map((s) => {
    if (s.id === id) return { ...s, order: swap.order };
    if (s.id === swap.id) return { ...s, order: ordered[idx].order };
    return s;
  });
  return { ...state, stages: next };
}

export function mutateUpdateStages(state: CrmStateShape, stages: CrmPipelineStage[]): CrmStateShape {
  return { ...state, stages: [...stages].sort((a, b) => a.order - b.order) };
}

export function mutateAddFollowUp(
  state: CrmStateShape,
  operator: CrmAgent,
  fu: Omit<CrmFollowUp, "id" | "status"> & { status?: CrmFollowUp["status"] },
): CrmStateShape {
  const now = new Date().toISOString();
  const entry: CrmFollowUp = { ...fu, status: fu.status ?? "pending", id: `fu_${Date.now()}` };
  const followUps = [...state.followUps, entry];
  const leads = syncLeadNextFollowUpAt(state.leads, followUps, fu.leadId);
  const when = new Date(entry.scheduledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  return {
    ...state,
    followUps,
    leads,
    activities: appendActivity(state, {
      leadId: fu.leadId,
      at: now,
      actor: operator.name,
      type: "follow_up",
      summary: `Follow-up scheduled (${channelLabel(entry.channel)}) · ${when}${entry.notes ? ` — ${entry.notes}` : ""}`,
    }),
  };
}

export function mutateCompleteFollowUp(
  state: CrmStateShape,
  operator: CrmAgent,
  id: string,
  outcome: string,
): CrmStateShape {
  const now = new Date().toISOString();
  const target = state.followUps.find((f) => f.id === id);
  if (!target) return state;
  const followUps = state.followUps.map((f) => (f.id === id ? { ...f, status: "done" as const, outcome } : f));
  const leads = syncLeadNextFollowUpAt(state.leads, followUps, target.leadId);
  return {
    ...state,
    followUps,
    leads,
    activities: appendActivity(state, {
      leadId: target.leadId,
      at: now,
      actor: operator.name,
      type: "follow_up",
      summary: `Follow-up completed — ${outcome}`,
    }),
  };
}

export function mutateRescheduleFollowUp(
  state: CrmStateShape,
  operator: CrmAgent,
  id: string,
  scheduledAt: string,
  notes?: string,
): CrmStateShape {
  const now = new Date().toISOString();
  const target = state.followUps.find((f) => f.id === id);
  if (!target) return state;
  const followUps = state.followUps.map((f) =>
    f.id === id ? { ...f, scheduledAt, status: "pending" as const, notes: notes ?? f.notes, outcome: undefined } : f,
  );
  const leads = syncLeadNextFollowUpAt(state.leads, followUps, target.leadId);
  const when = new Date(scheduledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  return {
    ...state,
    followUps,
    leads,
    activities: appendActivity(state, {
      leadId: target.leadId,
      at: now,
      actor: operator.name,
      type: "follow_up",
      summary: `Follow-up rescheduled to ${when}`,
    }),
  };
}

export function mutateMarkMissedFollowUp(
  state: CrmStateShape,
  operator: CrmAgent,
  id: string,
  reason?: string,
): CrmStateShape {
  const now = new Date().toISOString();
  const target = state.followUps.find((f) => f.id === id);
  if (!target) return state;
  const followUps = state.followUps.map((f) =>
    f.id === id ? { ...f, status: "missed" as const, outcome: reason ?? "No contact" } : f,
  );
  const leads = syncLeadNextFollowUpAt(state.leads, followUps, target.leadId);
  return {
    ...state,
    followUps,
    leads,
    activities: appendActivity(state, {
      leadId: target.leadId,
      at: now,
      actor: operator.name,
      type: "follow_up",
      summary: `Follow-up marked missed${reason ? ` — ${reason}` : ""}`,
    }),
  };
}

export function mutateMarkAgentUnavailable(
  state: CrmStateShape,
  operator: CrmAgent,
  agentId: string,
  until: string,
  reason: string,
  transferLeads = true,
): CrmStateShape {
  const now = new Date().toISOString();
  let nextLeads = state.leads;
  let nextState = state;

  if (transferLeads) {
    const toId = pickTransferTarget(agentId, state.agents, state.leads, state.rules);
    if (toId) {
      const toAgent = state.agents.find((a) => a.id === toId);
      let transferCount = 0;
      nextLeads = state.leads.map((l) => {
        if (l.assigneeId !== agentId || ["won", "lost"].includes(l.stageId)) return l;
        transferCount += 1;
        return { ...l, assigneeId: toId, updatedAt: now };
      });
      if (transferCount > 0) {
        nextState = {
          ...nextState,
          activities: appendActivity(nextState, {
            leadId: "system",
            at: now,
            actor: operator.name,
            type: "transfer",
            summary: `${transferCount} lead(s) transferred from ${state.agents.find((a) => a.id === agentId)?.name} → ${toAgent?.name} (absence)`,
          }),
        };
      }
    }
  }

  return {
    ...nextState,
    leads: nextLeads,
    agents: state.agents.map((a) =>
      a.id === agentId ? { ...a, unavailableUntil: until, unavailableReason: reason } : a,
    ),
  };
}

export function mutateClearAgentUnavailable(state: CrmStateShape, agentId: string): CrmStateShape {
  return {
    ...state,
    agents: state.agents.map((a) =>
      a.id === agentId ? { ...a, unavailableUntil: undefined, unavailableReason: undefined } : a,
    ),
  };
}

export function mutateTransferOpenLeads(
  state: CrmStateShape,
  operator: CrmAgent,
  fromAgentId: string,
  toAgentId?: string,
): { state: CrmStateShape; count: number } {
  const now = new Date().toISOString();
  const target = toAgentId ?? pickTransferTarget(fromAgentId, state.agents, state.leads, state.rules);
  if (!target) return { state, count: 0 };

  const toAgent = state.agents.find((a) => a.id === target);
  const fromAgent = state.agents.find((a) => a.id === fromAgentId);
  let count = 0;
  const nextLeads = state.leads.map((l) => {
    if (l.assigneeId !== fromAgentId || ["won", "lost"].includes(l.stageId)) return l;
    count += 1;
    return { ...l, assigneeId: target, updatedAt: now };
  });

  if (count === 0) return { state, count: 0 };

  return {
    count,
    state: {
      ...state,
      leads: nextLeads,
      activities: appendActivity(state, {
        leadId: "system",
        at: now,
        actor: operator.name,
        type: "transfer",
        summary: `Manager transferred ${count} lead(s) from ${fromAgent?.name} → ${toAgent?.name}`,
      }),
    },
  };
}

export function mutateLogActivity(
  state: CrmStateShape,
  operator: CrmAgent,
  leadId: string,
  summary: string,
  type = "note",
): CrmStateShape {
  const now = new Date().toISOString();
  return {
    ...state,
    activities: appendActivity(state, {
      leadId,
      at: now,
      actor: operator.name,
      type,
      summary,
    }),
  };
}

export function requireLead(state: CrmStateShape, leadId: string): CrmLead {
  const lead = state.leads.find((l) => l.id === leadId);
  if (!lead) throw new ServerActionError("NOT_FOUND", "Lead not found.");
  return lead;
}

export function requireFollowUp(state: CrmStateShape, id: string): CrmFollowUp {
  const fu = state.followUps.find((f) => f.id === id);
  if (!fu) throw new ServerActionError("NOT_FOUND", "Follow-up not found.");
  return fu;
}

export type CrmIntegrationPatch = CrmIntegration;
