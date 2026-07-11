"use client";

import {
  type CrmActivity,
  type CrmAgent,
  type CrmAssignmentRule,
  type CrmFollowUp,
  type CrmIntegration,
  type CrmIntegrationId,
  type CrmLead,
  type CrmPipelineStage,
} from "@/design-system/crm-data";
import type { CrmSnapshot } from "@/server/crm/index";

async function fetchCrmSnapshot(operatorId: string): Promise<{ ok: true; data: CrmSnapshot } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/crm/snapshot?operatorId=${encodeURIComponent(operatorId)}`, {
      cache: "no-store",
      credentials: "include",
    });
    const json = await res.json();
    if (res.ok && json.ok) {
      return { ok: true, data: json.data as CrmSnapshot };
    }
    return { ok: false, error: json.error || "Failed to load CRM workspace." };
  } catch {
    return { ok: false, error: "Failed to connect to CRM workspace. Please refresh the page." };
  }
}

async function crmMutate(body: Record<string, unknown>): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/crm/mutate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (res.ok && json.ok) {
      return { ok: true, data: json.data };
    }
    return { ok: false, error: json.error || "Failed to save." };
  } catch {
    return { ok: false, error: "Failed to connect. Please try again." };
  }
}
import { useSession } from "@/components/candela/session-provider";
import { CRM_MANAGER_ID } from "@/lib/crm-auth";
import {
  computeAgentKpis,
  computeLeadDistribution,
  computeWorkspaceKpis,
  type AgentDistributionStat,
  type AgentKpi,
} from "@/lib/crm-platform";
import { isTransientSessionError, sleep } from "@/lib/session-retry";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export { CRM_MANAGER_ID };

type CrmStoreValue = Omit<CrmSnapshot, "isManager" | "viewAsAgentId"> & {
  ready: boolean;
  error: string | null;
  viewAsAgentId: string | null;
  refresh: (opts?: { silent?: boolean }) => Promise<void>;
  isManager: () => boolean;
  isTeamLead: () => boolean;
  isHierarchyLead: () => boolean;
  getOperator: () => CrmAgent | undefined;
  setViewAsAgent: (agentId: string | null) => void;
  getWorkspaceKpis: () => ReturnType<typeof computeWorkspaceKpis>;
  getMyKpis: () => AgentKpi | null;
  getAgentKpis: () => AgentKpi[];
  getFilteredLeads: () => CrmLead[];
  getFilteredFollowUps: () => CrmFollowUp[];
  addLead: (
    partial: Omit<CrmLead, "id" | "createdAt" | "updatedAt" | "stageId" | "assigneeId"> &
      Partial<Pick<CrmLead, "stageId" | "assigneeId">>,
  ) => Promise<void>;
  updateLead: (id: string, patch: Partial<CrmLead>) => Promise<void>;
  assignLeadManual: (leadId: string, agentId: string) => Promise<void>;
  moveLeadStage: (leadId: string, stageId: string) => Promise<void>;
  ingestFromIntegration: (
    integrationId: CrmIntegrationId,
    payload: { name: string; phone: string; specialty?: string; notes?: string },
  ) => Promise<void>;
  toggleIntegration: (id: CrmIntegrationId, connected: boolean) => Promise<void>;
  updateRule: (id: string, patch: Partial<CrmAssignmentRule>) => Promise<void>;
  addRule: (rule: Omit<CrmAssignmentRule, "id">) => Promise<void>;
  addAgent: (agent: Omit<CrmAgent, "id">, password?: string) => Promise<string>;
  updateAgent: (id: string, patch: Partial<CrmAgent>) => Promise<void>;
  setAgentPassword: (id: string, password: string) => Promise<void>;
  getAgentPassword: (id: string) => string | undefined;
  removeAgent: (id: string) => Promise<void>;
  updateStage: (id: string, patch: Partial<CrmPipelineStage>) => Promise<void>;
  addStage: (label: string, color?: string) => Promise<void>;
  removeStage: (id: string) => Promise<void>;
  reorderStage: (id: string, dir: -1 | 1) => Promise<void>;
  updateStages: (stages: CrmPipelineStage[]) => Promise<void>;
  addFollowUp: (fu: Omit<CrmFollowUp, "id" | "status"> & { status?: CrmFollowUp["status"] }) => Promise<void>;
  completeFollowUp: (id: string, outcome: string) => Promise<void>;
  rescheduleFollowUp: (id: string, scheduledAt: string, notes?: string) => Promise<void>;
  markMissedFollowUp: (id: string, reason?: string) => Promise<void>;
  logActivity: (leadId: string, summary: string, type?: string) => Promise<void>;
  getLeadDistribution: () => AgentDistributionStat[];
  markAgentUnavailable: (agentId: string, until: string, reason: string, transferLeads?: boolean) => Promise<void>;
  clearAgentUnavailable: (agentId: string) => Promise<void>;
  transferOpenLeads: (fromAgentId: string, toAgentId?: string) => Promise<number>;
};

const CrmContext = createContext<CrmStoreValue | null>(null);

function requireOperatorId(operatorId: string) {
  if (!operatorId) throw new Error("CRM operator not selected. Return to workspace login.");
  return operatorId;
}

export function CrmStoreProvider({ children }: { children: ReactNode }) {
  const { authReady, session } = useSession();
  const operatorId = session?.crmOperatorId ?? "";
  const [state, setState] = useState<CrmSnapshot | null>(null);
  const [viewAsAgentId, setViewAsAgentId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!operatorId) return;
      const silent = opts?.silent ?? false;
      if (!silent) setReady(false);
      try {
        const result = await fetchCrmSnapshot(operatorId);
        if (result.ok) {
          setState(result.data);
          setError(null);
        } else {
          setError(result.error);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to refresh CRM workspace.");
      } finally {
        setReady(true);
      }
    },
    [operatorId],
  );

  useEffect(() => {
    if (!authReady || !session?.crmOperatorId) return;
    let cancelled = false;

    const load = async (attempt = 0) => {
      if (cancelled) return;
      try {
        const result = await fetchCrmSnapshot(session.crmOperatorId!);
        if (cancelled) return;
        if (result.ok) {
          setState(result.data);
          setError(null);
        } else {
          setError(result.error);
        }
        setReady(true);
      } catch (err) {
        if (cancelled) return;
        if (attempt < 2 && isTransientSessionError(err)) {
          await sleep(400 * (attempt + 1));
          await load(attempt + 1);
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load CRM workspace.");
        setReady(true);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [authReady, session?.crmOperatorId]);

  const value = useMemo<CrmStoreValue>(() => {
    const raw = state ?? {
      leads: [],
      followUps: [],
      agents: [],
      agentPasswords: {},
      integrations: [] as CrmIntegration[],
      stages: [],
      rules: [],
      activities: [] as CrmActivity[],
      operatorId: "",
      viewAsAgentId: null,
      activeOperatorId: operatorId,
      activeOperatorName: "CRM Agent",
      activeOperatorRole: "agent",
      isManager: false,
    };

    const { isManager: _snapshotManager, ...data } = raw;

    const opId = () => requireOperatorId(data.activeOperatorId || operatorId);
    const isManager = () => _snapshotManager ?? data.activeOperatorRole === "manager";
    const isTeamLead = () => data.activeOperatorRole === "team_lead";
    const isHierarchyLead = () => isManager() || isTeamLead();
    const getOperator = () => data.agents.find((a) => a.id === data.activeOperatorId);
    const filterAgentId = isHierarchyLead() ? viewAsAgentId : data.activeOperatorId;

    const getFilteredLeads = () => {
      if (!filterAgentId) return data.leads;
      return data.leads.filter((l) => l.assigneeId === filterAgentId);
    };

    const getFilteredFollowUps = () => {
      const leadIds = new Set(getFilteredLeads().map((l) => l.id));
      return data.followUps.filter((f) => leadIds.has(f.leadId));
    };

    const run = async (fn: () => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>) => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error);
        throw new Error(result.error);
      }
      await refresh({ silent: true });
    };

    return {
      ...data,
      viewAsAgentId,
      ready,
      error,
      refresh,
      isManager,
      isTeamLead,
      isHierarchyLead,
      getOperator,
      setViewAsAgent: setViewAsAgentId,
      getWorkspaceKpis: () => computeWorkspaceKpis(getFilteredLeads(), data.integrations, getFilteredFollowUps()),
      getMyKpis: () => {
        if (isHierarchyLead() && !viewAsAgentId) return null;
        const id = filterAgentId ?? CRM_MANAGER_ID;
        const agent = data.agents.find((a) => a.id === id);
        if (!agent) return null;
        return computeAgentKpis(agent.id, agent.name, data.leads, data.followUps, data.stages);
      },
      getAgentKpis: () =>
        data.agents
          .filter((a) => a.role !== "manager")
          .map((a) => computeAgentKpis(a.id, a.name, data.leads, data.followUps, data.stages)),
      getFilteredLeads,
      getFilteredFollowUps,
      addLead: (partial) => run(() => crmMutate({ op: "createLead", operatorId: opId(), partial })),
      updateLead: (id, patch) => run(() => crmMutate({ op: "updateLead", operatorId: opId(), leadId: id, patch })),
      assignLeadManual: (leadId, agentId) => run(() => crmMutate({ op: "assignLeadManual", operatorId: opId(), leadId, agentId })),
      moveLeadStage: (leadId, stageId) => run(() => crmMutate({ op: "moveLeadStage", operatorId: opId(), leadId, agentId: stageId })),
      ingestFromIntegration: (integrationId, payload) =>
        run(() => crmMutate({ op: "ingestFromIntegration", operatorId: opId(), integrationId, payload })),
      toggleIntegration: (id, connected) => run(() => crmMutate({ op: "toggleIntegration", operatorId: opId(), integrationId: id, connected })),
      updateRule: (id, patch) => run(() => crmMutate({ op: "updateRule", operatorId: opId(), id, patch })),
      addRule: (rule) => run(() => crmMutate({ op: "addRule", operatorId: opId(), rule })),
      addAgent: async (agent, password) => {
        const result = await crmMutate({ op: "addAgent", operatorId: opId(), agent, password });
        if (!result.ok) {
          setError(result.error);
          throw new Error(result.error);
        }
        await refresh({ silent: true });
        return (result.data as { agentId: string; password: string }).password;
      },
      updateAgent: (id, patch) => run(() => crmMutate({ op: "updateAgent", operatorId: opId(), id, patch })),
      setAgentPassword: (id, password) => run(() => crmMutate({ op: "setAgentPassword", operatorId: opId(), id, password })),
      getAgentPassword: (id) => data.agentPasswords[id],
      removeAgent: (id) => run(() => crmMutate({ op: "removeAgent", operatorId: opId(), id })),
      updateStage: (id, patch) => run(() => crmMutate({ op: "updateStage", operatorId: opId(), id, patch })),
      addStage: (label, color) => run(() => crmMutate({ op: "addStage", operatorId: opId(), label, color })),
      removeStage: (id) => run(() => crmMutate({ op: "removeStage", operatorId: opId(), id })),
      reorderStage: (id, dir) => run(() => crmMutate({ op: "reorderStage", operatorId: opId(), id, dir })),
      updateStages: (stages) => run(() => crmMutate({ op: "updateStages", operatorId: opId(), stages })),
      addFollowUp: (fu) => run(() => crmMutate({ op: "addFollowUp", operatorId: opId(), fu })),
      completeFollowUp: (id, outcome) => run(() => crmMutate({ op: "completeFollowUp", operatorId: opId(), id, outcome })),
      rescheduleFollowUp: (id, scheduledAt, notes) => run(() => crmMutate({ op: "rescheduleFollowUp", operatorId: opId(), id, scheduledAt, notes })),
      markMissedFollowUp: (id, reason) => run(() => crmMutate({ op: "markMissedFollowUp", operatorId: opId(), id, reason })),
      logActivity: (leadId, summary, type) => run(() => crmMutate({ op: "logActivity", operatorId: opId(), leadId, outcome: summary, reason: type })),
      getLeadDistribution: () => {
        const pctRule =
          data.rules.find((r) => r.active && r.strategy === "percentage") ??
          data.rules.find((r) => r.strategy === "percentage");
        if (!pctRule) return [];
        return computeLeadDistribution(pctRule, data.agents, data.leads);
      },
      markAgentUnavailable: (agentId, until, reason, transferLeads) =>
        run(() => crmMutate({ op: "markAgentUnavailable", operatorId: opId(), agentId, until, reason, transferLeads })),
      clearAgentUnavailable: (agentId) => run(() => crmMutate({ op: "clearAgentUnavailable", operatorId: opId(), agentId })),
      transferOpenLeads: async (fromAgentId, toAgentId) => {
        const result = await crmMutate({ op: "transferOpenLeads", operatorId: opId(), fromAgentId, toAgentId });
        if (!result.ok) {
          setError(result.error);
          throw new Error(result.error);
        }
        await refresh({ silent: true });
        return (result.data as { count: number }).count;
      },
    };
  }, [state, ready, error, refresh, operatorId, viewAsAgentId]);

  return <CrmContext.Provider value={value}>{children}</CrmContext.Provider>;
}

export function useCrmStore() {
  const ctx = useContext(CrmContext);
  if (!ctx) throw new Error("useCrmStore must be used within CrmStoreProvider");
  return ctx;
}
