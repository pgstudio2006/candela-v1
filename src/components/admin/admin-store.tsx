"use client";

import type {
  AdminPlatformSettings,
  DepartmentConfig,
  DiseaseCluster,
  DiseaseMapNode,
  ExpenseEntry,
  MisReport,
  MrdRequest,
  ReferralDoctor,
  RevenueSharePolicy,
  StaffMember,
} from "@/design-system/admin-data";
import type { Patient, Visit } from "@/design-system/frontdesk-data";
import {
  computeCommandKpis,
  computeHawkEye,
  computeLeakageFlags,
  simulateRevenueShare,
} from "@/lib/admin-platform";
import type { DataMiningSnapshot } from "@/lib/admin-analytics";
import { doctorIdFromStaffId } from "@/lib/healthcare-roles";
import { sleep } from "@/lib/session-retry";
import {
  isRetryableWorkspaceError,
  retryWorkspaceLoad,
  WORKSPACE_LOAD_FAILED,
  WORKSPACE_SYNC_MESSAGE,
  workspaceErrorMessage,
} from "@/lib/workspace-load";
import type { AdminSnapshot } from "@/server/admin/index";
import { useSession } from "@/components/candela/session-provider";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type AdminStoreValue = Omit<
  AdminSnapshot,
  "patients" | "visits"
> & {
  ready: boolean;
  error: string | null;
  patients: Patient[];
  visits: Visit[];
  refresh: (opts?: { silent?: boolean }) => Promise<void>;
  hydrateSnapshot: (snapshot: AdminSnapshot) => void;
  removeStaffLocal: (staffId: string) => void;
  getAuditLog: () => AdminSnapshot["auditEvents"];
  getCommandKpis: () => ReturnType<typeof computeCommandKpis>;
  getHawkEye: () => ReturnType<typeof computeHawkEye>;
  getLeakageFlags: () => ReturnType<typeof computeLeakageFlags>;
  getActiveLeakageFlags: () => ReturnType<typeof computeLeakageFlags>;
  getPrevalence: () => DataMiningSnapshot["livePrevalence"];
  simulateShare: (policyId: string) => ReturnType<typeof simulateRevenueShare>;
  updateStaff: (id: string, patch: Partial<StaffMember>) => Promise<void>;
  addStaff: (member: Omit<StaffMember, "id">) => Promise<void>;
  removeStaff: (id: string) => Promise<void>;
  updateDepartment: (id: string, patch: Partial<DepartmentConfig>) => Promise<void>;
  addDepartment: (dept: Omit<DepartmentConfig, "id">) => Promise<void>;
  removeDepartment: (id: string) => Promise<void>;
  updateDiseaseNode: (id: string, patch: Partial<DiseaseMapNode>) => Promise<void>;
  addDiseaseNode: (node: Omit<DiseaseMapNode, "id">) => Promise<void>;
  removeDiseaseNode: (id: string) => Promise<void>;
  updateSettings: (patch: Partial<AdminPlatformSettings>) => Promise<void>;
  resolveLeakageFlag: (id: string) => Promise<void>;
  addExpense: (entry: Omit<ExpenseEntry, "id">) => Promise<void>;
  approveExpense: (id: string, approved: boolean) => Promise<void>;
  updateRevenuePolicy: (id: string, patch: Partial<RevenueSharePolicy>) => Promise<void>;
  addRevenuePolicy: (policy: Omit<RevenueSharePolicy, "id">) => Promise<void>;
  updateMrdStatus: (id: string, status: MrdRequest["status"]) => Promise<void>;
  addMrdRequest: (req: Omit<MrdRequest, "id" | "requestedAt" | "status">) => Promise<void>;
  updateReferralDoctor: (id: string, patch: Partial<ReferralDoctor>) => Promise<void>;
  addReferralDoctor: (doctor: Omit<ReferralDoctor, "id">) => Promise<void>;
  removeReferralDoctor: (id: string) => Promise<void>;
  runMisReport: (id: string) => Promise<{ csv: string; filename: string }>;
  exportRevenueShare: (
    policyId: string,
    doctorName: string,
    gross: number,
    share: number,
    packagesClosed: number,
  ) => Promise<{ csv: string; filename: string }>;
  logAdminAction: (summary: string) => Promise<void>;
};

const AdminContext = createContext<AdminStoreValue | null>(null);

type AdminSnapshotLoadResult =
  | { ok: true; data: AdminSnapshot }
  | { ok: false; code: string; error: string };

async function loadAdminSnapshot(): Promise<AdminSnapshotLoadResult> {
  try {
    const res = await fetch("/api/admin/snapshot", { cache: "no-store", credentials: "include" });
    const json = (await res.json()) as AdminSnapshotLoadResult;
    if (res.ok && json.ok) return json;
    if (!res.ok) {
      return {
        ok: false,
        code: "INTERNAL_ERROR",
        error: (!json.ok && json.error) || "Failed to load admin workspace.",
      };
    }
    if (!json.ok) return json;
  } catch {
    /* fall through */
  }

  return {
    ok: false,
    code: "INTERNAL_ERROR",
    error: WORKSPACE_LOAD_FAILED,
  };
}

async function adminMutate(body: Record<string, unknown>): Promise<{ ok: boolean; data?: any; error?: string }> {
  try {
    const res = await fetch("/api/admin/mutate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Something went wrong.";
    return { ok: false, error: msg };
  }
}

export function AdminStoreProvider({ children }: { children: ReactNode }) {
  const { authReady, session } = useSession();
  const [state, setState] = useState<AdminSnapshot | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const hasAdminData = (snapshot: AdminSnapshot | null) =>
    Boolean(
      snapshot &&
        (snapshot.staff.length > 0 ||
          snapshot.patients.length > 0 ||
          snapshot.departments.length > 0),
    );

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (!silent) setReady(false);
    try {
      const result = await retryWorkspaceLoad(() => loadAdminSnapshot(), {
        attempts: silent ? 3 : 5,
      });
      if (result.ok) {
        setState(result.data);
        setError(null);
      } else if (silent && hasAdminData(stateRef.current)) {
        console.warn("Admin refresh failed — keeping cached workspace data.", result.error);
      } else {
        setError(
          isRetryableWorkspaceError({ message: result.error })
            ? WORKSPACE_SYNC_MESSAGE
            : result.error,
        );
      }
    } catch (err) {
      if (silent && hasAdminData(stateRef.current)) {
        console.warn("Admin refresh failed — keeping cached workspace data.");
        return;
      }
      setError(workspaceErrorMessage(err));
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!authReady || session?.role !== "admin") return;
    let cancelled = false;

    const load = async (attempt = 0) => {
      if (cancelled) return;
      try {
        const result = await retryWorkspaceLoad(() => loadAdminSnapshot(), { attempts: 3 });
        if (cancelled) return;
        if (result.ok) {
          setState(result.data);
          setError(null);
        } else if (!hasAdminData(stateRef.current)) {
          setError(
            isRetryableWorkspaceError({ message: result.error })
              ? WORKSPACE_SYNC_MESSAGE
              : result.error,
          );
        }
        setReady(true);
      } catch (err) {
        if (cancelled) return;
        if (attempt < 4 && isRetryableWorkspaceError(err)) {
          await sleep(400 * (attempt + 1));
          await load(attempt + 1);
          return;
        }
        if (!hasAdminData(stateRef.current)) {
          setError(workspaceErrorMessage(err));
        }
        setReady(true);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [authReady, session?.role]);

  const hydrateSnapshot = useCallback((snapshot: AdminSnapshot) => {
    setState(snapshot);
    setError(null);
    setReady(true);
  }, []);

  const removeStaffLocal = useCallback((staffId: string) => {
    setState((prev) =>
      prev ? { ...prev, staff: prev.staff.filter((s) => s.id !== staffId) } : prev,
    );
    setError(null);
    setReady(true);
  }, []);

  const run = useCallback(
    async (fn: () => Promise<{ ok: boolean; data?: any; error?: string }>) => {
      try {
        const res = await fn();
        if (!res.ok) throw new Error(res.error);
        if (res.data) setState(res.data as AdminSnapshot);
        setError(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Something went wrong.";
        setError(msg);
        throw err;
      }
    },
    [],
  );

  const value = useMemo<AdminStoreValue>(() => {
    const data = state ?? {
      staff: [] as StaffMember[],
      departments: [] as DepartmentConfig[],
      diseaseMap: [] as DiseaseMapNode[],
      diseaseClusters: [] as DiseaseCluster[],
      geo: [],
      expenses: [],
      revenuePolicies: [],
      referralDoctors: [],
      mrdRequests: [],
      misReports: [],
      settings: {
        kAnonymityMin: 5,
        geoAggregateOnly: true,
        auditRetentionYears: 7,
        outbreakAlerts: true,
        autoMisDaily: true,
        whatsappConsentFlag: false,
      },
      resolvedLeakageIds: [],
      auditEvents: [],
      patients: [],
      visits: [],
      dataMining: {
        kpis: [],
        prevalenceBars: [],
        ageGender: [],
        treatmentOutcomes: [],
        livePrevalence: [],
        dataSources: [],
      },
      documentTemplates: [],
      activeOperatorId: "",
      activeOperatorName: "Admin",
      activeOperatorRole: "super_admin",
      isSuperAdmin: true,
      canManageConfig: true,
      canManageFinance: true,
      isViewer: false,
      branchId: session?.branchId ?? "",
    };

    const { patients, visits, ...admin } = data;

    return {
      ...admin,
      ready,
      error,
      patients,
      visits,
      refresh,
      hydrateSnapshot,
      removeStaffLocal,
      getAuditLog: () => data.auditEvents,
      getCommandKpis: () =>
        computeCommandKpis(visits, data.staff, data.mrdRequests, patients, data.auditEvents.length, (data as any).payments ?? []),
      getHawkEye: () => computeHawkEye(visits),
      getLeakageFlags: () => computeLeakageFlags(visits, patients),
      getActiveLeakageFlags: () =>
        computeLeakageFlags(visits, patients).filter((f) => !data.resolvedLeakageIds.includes(f.id)),
      getPrevalence: () => data.dataMining.livePrevalence,
      simulateShare: (policyId) => {
        const policy = data.revenuePolicies.find((p) => p.id === policyId)!;
        const doctorStaff =
          data.staff.find(
            (s) => s.role === "doctor" && doctorIdFromStaffId(s.id) === policy.doctorId,
          ) ?? data.staff.find((s) => s.role === "doctor");
        const doctorId = policy.doctorId || (doctorStaff ? doctorIdFromStaffId(doctorStaff.id) : "");
        const name = doctorStaff?.name ?? policy.label;
        return simulateRevenueShare(doctorId, name, policy, visits);
      },
      updateStaff: (id, patch) => run(() => adminMutate({ op: "updateStaff", id, patch })),
      addStaff: (member) => run(() => adminMutate({ op: "addStaff", input: member })),
      removeStaff: (id) => run(() => adminMutate({ op: "removeStaff", id })),
      updateDepartment: (id, patch) => run(() => adminMutate({ op: "updateDepartment", id, patch })),
      addDepartment: (dept) => run(() => adminMutate({ op: "addDepartment", input: dept })),
      removeDepartment: (id) => run(() => adminMutate({ op: "removeDepartment", id })),
      updateDiseaseNode: (id, patch) => run(() => adminMutate({ op: "updateDiseaseNode", id, patch })),
      addDiseaseNode: (node) => run(() => adminMutate({ op: "addDiseaseNode", input: node })),
      removeDiseaseNode: (id) => run(() => adminMutate({ op: "removeDiseaseNode", id })),
      updateSettings: (patch) => run(() => adminMutate({ op: "updateAdminSettings", patch })),
      resolveLeakageFlag: (id) => run(() => adminMutate({ op: "resolveLeakageFlag", flagId: id })),
      addExpense: (entry) => run(() => adminMutate({ op: "addExpense", input: entry })),
      approveExpense: (id, approved) => run(() => adminMutate({ op: "approveExpense", id, approved })),
      updateRevenuePolicy: (id, patch) => run(() => adminMutate({ op: "updateRevenuePolicy", id, patch })),
      addRevenuePolicy: (policy) => run(() => adminMutate({ op: "addRevenuePolicy", input: policy })),
      updateMrdStatus: (id, status) => run(() => adminMutate({ op: "updateMrdStatus", id, status })),
      addMrdRequest: (req) => run(() => adminMutate({ op: "addMrdRequest", input: req })),
      updateReferralDoctor: (id, patch) => run(() => adminMutate({ op: "updateReferralDoctor", id, patch })),
      addReferralDoctor: (doctor) => run(() => adminMutate({ op: "addReferralDoctor", input: doctor })),
      removeReferralDoctor: (id) => run(() => adminMutate({ op: "removeReferralDoctor", id })),
      runMisReport: async (id) => {
        try {
          const res = await adminMutate({ op: "runMisReport", id });
          if (!res.ok) throw new Error(res.error);
          if (res.data?.snapshot) setState(res.data.snapshot);
          setError(null);
          return { csv: res.data?.csv ?? "", filename: res.data?.filename ?? "" };
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Something went wrong.";
          setError(msg);
          throw err;
        }
      },
      exportRevenueShare: async (policyId, doctorName, gross, share, packagesClosed) => {
        const res = await adminMutate({ op: "exportRevenueShareCsv", policyId, doctorName, gross, share, packagesClosed });
        if (!res.ok) throw new Error(res.error);
        return { csv: res.data?.csv ?? "", filename: res.data?.filename ?? "" };
      },
      logAdminAction: (summary) => run(() => adminMutate({ op: "logAdminAction", summary })),
    };
  }, [state, ready, error, refresh, hydrateSnapshot, removeStaffLocal, run, session?.branchId]);

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdminStore() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdminStore must be used within AdminStoreProvider");
  return ctx;
}
