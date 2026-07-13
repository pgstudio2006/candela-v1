"use client";

import type { Patient, Visit } from "@/design-system/frontdesk-data";
import {
  computeQuote,
  type BillingHandoffPayload,
  type CounselOutcome,
  type CounselQuote,
  type CounselSession,
  type DiscountApproval,
  type DiscountPolicy,
} from "@/design-system/counsellor-data";
import type { CounsellorQueueItem } from "@/design-system/doctor-data";
import type { CounsellorSnapshot } from "@/server/counsellor/index";
import { patientDisplayName } from "@/lib/frontdesk-workflow";
import { isTransientSessionError, sleep } from "@/lib/session-retry";

async function fetchCounsellorSnapshot(): Promise<{ ok: true; data: CounsellorSnapshot } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/counsellor/snapshot", { cache: "no-store", credentials: "include" });
    const json = await res.json();
    if (res.ok && json.ok) {
      return { ok: true, data: json.data as CounsellorSnapshot };
    }
    return { ok: false, error: json.error || "Failed to load counsellor workspace." };
  } catch {
    return { ok: false, error: "Failed to connect to counsellor workspace. Please refresh the page." };
  }
}

async function counsellorMutate(body: Record<string, unknown>): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/counsellor/mutate", {
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
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "@/components/candela/session-provider";

type CounsellorState = {
  patients: Patient[];
  visits: Visit[];
  queue: CounsellorQueueItem[];
  sessions: CounselSession[];
  approvals: DiscountApproval[];
  approvedDiscounts: DiscountApproval[];
  billingHandoffs: BillingHandoffPayload[];
  packages: CounsellorSnapshot["packages"];
  discountPolicy: DiscountPolicy;
  seniorMode: boolean;
  activeCounsellorId: string;
  activeCounsellorName: string;
  branchId: string;
};

type CounsellorStoreValue = {
  ready: boolean;
  error: string | null;
  refresh: (opts?: { silent?: boolean }) => Promise<void>;
  patients: Patient[];
  visits: Visit[];
  queue: CounsellorQueueItem[];
  sessions: CounselSession[];
  approvals: DiscountApproval[];
  approvedDiscounts: DiscountApproval[];
  discountPolicy: DiscountPolicy;
  activeCounsellorId: string;
  activeCounsellorName: string;
  activeBranchId: string;
  seniorMode: boolean;
  packages: CounsellorState["packages"];
  getPatient: (id: string) => Patient | undefined;
  getVisit: (id: string) => Visit | undefined;
  getQueueItem: (visitId: string) => CounsellorQueueItem | undefined;
  getSession: (visitId: string) => CounselSession | undefined;
  getFilteredQueue: (opts?: { priority?: string; doctorId?: string }) => CounsellorQueueItem[];
  claimSession: (visitId: string) => Promise<CounselSession>;
  buildQuote: (
    visitId: string,
    packageId: string,
    addonIds: string[],
    discountPercent: number,
    discountReason?: string,
    tier?: CounselQuote["tier"],
    customLines?: CounselQuote["lineItems"],
    gstPercent?: number,
  ) => CounselQuote;
  requestDiscountApproval: (visitId: string, quote: CounselQuote, reason: string) => Promise<void>;
  resolveApproval: (approvalId: string, approved: boolean) => Promise<void>;
  completeSession: (
    visitId: string,
    outcome: CounselOutcome,
    opts: {
      quote?: CounselQuote;
      internalNotes: string;
      objections: string[];
      callbackAt?: string;
      sendToBilling?: boolean;
      paymentExpectation?: BillingHandoffPayload["paymentExpectation"];
      consentCaptured?: boolean;
      whatsappSent?: boolean;
      voiceNote?: string;
      aiScript?: string;
    },
  ) => Promise<{ ok: boolean; error?: string }>;
  getBillingHandoffs: () => BillingHandoffPayload[];
  getDashboardKpis: () => { label: string; value: string; delta: string; trend: "up" | "down" | "neutral" }[];
  getAnalytics: () => {
    conversionRate: number;
    avgDiscount: number;
    avgCloseMin: number;
    pipelineValue: number;
    outcomes: { label: string; count: number }[];
    packageMix: { label: string; count: number }[];
    lostReasons: { label: string; count: number }[];
  };
  searchPatients: (q: string) => Patient[];
  getPatientCommercialHistory: (patientId: string) => CounselSession[];
  maxDiscountPercent: () => number;
  setSeniorMode: (v: boolean) => void;
};

const CounsellorContext = createContext<CounsellorStoreValue | null>(null);

function applySnapshot(snapshot: CounsellorSnapshot): CounsellorState {
  return {
    patients: snapshot.patients,
    visits: snapshot.visits,
    queue: snapshot.queue,
    sessions: snapshot.sessions,
    approvals: snapshot.approvals,
    approvedDiscounts: snapshot.approvedDiscounts,
    billingHandoffs: snapshot.billingHandoffs,
    packages: snapshot.packages,
    discountPolicy: snapshot.discountPolicy,
    seniorMode: snapshot.seniorMode,
    activeCounsellorId: snapshot.activeCounsellorId,
    activeCounsellorName: snapshot.activeCounsellorName,
    branchId: snapshot.branchId,
  };
}

export function CounsellorStoreProvider({ children }: { children: ReactNode }) {
  const { authReady, session } = useSession();
  const [state, setState] = useState<CounsellorState | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (!silent) setReady(false);
    try {
      const result = await fetchCounsellorSnapshot();
      if (result.ok) {
        setState(applySnapshot(result.data));
        setError(null);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh counsellor workspace.");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!authReady || !session?.branchId) return;
    let cancelled = false;

    const load = async (attempt = 0) => {
      if (cancelled) return;
      try {
        const result = await fetchCounsellorSnapshot();
        if (cancelled) return;
        if (result.ok) {
          setState(applySnapshot(result.data));
          setError(null);
        } else {
          setError(result.error);
        }
        setReady(true);
      } catch (err) {
        if (cancelled) return;
        if (attempt < 2 && isTransientSessionError(err)) {
          await sleep(400 * attempt);
          await load(attempt + 1);
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load counsellor workspace.");
        setReady(true);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [authReady, session?.branchId]);

  const value = useMemo<CounsellorStoreValue>(() => {
    const data = state ?? {
      patients: [],
      visits: [],
      queue: [],
      sessions: [],
      approvals: [],
      approvedDiscounts: [],
      billingHandoffs: [],
      packages: [],
      discountPolicy: { counsellorMaxPercent: 100, seniorMaxPercent: 100, managerApprovalAbove: 100, requireReasonAbove: 100 },
      seniorMode: false,
      activeCounsellorId: "",
      activeCounsellorName: "Counsellor",
      branchId: "",
    };

    const getPatient = (id: string) => data.patients.find((p) => p.id === id);
    const getVisit = (id: string) => data.visits.find((v) => v.id === id);
    const getQueueItem = (visitId: string) => data.queue.find((q) => q.visitId === visitId);
    const getSession = (visitId: string) =>
      data.sessions.find((s) => s.visitId === visitId && !s.completedAt);

    const getFilteredQueue = (opts?: { priority?: string; doctorId?: string }) =>
      [...data.queue]
        .filter((q) => !opts?.priority || q.priority === opts.priority)
        .filter((q) => !opts?.doctorId || q.doctorId === opts.doctorId)
        .sort((a, b) => {
          if (a.priority === "high" && b.priority !== "high") return -1;
          if (b.priority === "high" && a.priority !== "high") return 1;
          return new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime();
        });

    const maxDiscountPercent = () =>
      data.seniorMode ? data.discountPolicy.seniorMaxPercent : data.discountPolicy.counsellorMaxPercent;

    const buildQuote = (
      visitId: string,
      packageId: string,
      addonIds: string[],
      discountPercent: number,
      discountReason?: string,
      tier: CounselQuote["tier"] = "better",
      customLines: CounselQuote["lineItems"] = [],
      gstPercent = 0,
    ): CounselQuote => {
      const item = getQueueItem(visitId);
      const base = computeQuote(packageId, addonIds, discountPercent, customLines, data.packages, gstPercent);
      const limit = maxDiscountPercent();
      let approvalStatus: CounselQuote["approvalStatus"] = "none";
      if (discountPercent > data.discountPolicy.managerApprovalAbove) approvalStatus = "pending";
      else if (discountPercent > limit) approvalStatus = "pending";

      return {
        visitId,
        patientId: item?.patientId ?? "",
        ...base,
        tier,
        discountReason,
        approvalStatus,
        consentCaptured: false,
        whatsappSent: false,
      };
    };

    const completedSessions = data.sessions.filter((s) => s.completedAt);
    const converted = completedSessions.filter((s) => s.outcome === "converted");

    return {
      ready,
      error,
      refresh,
      patients: data.patients,
      visits: data.visits,
      queue: data.queue,
      sessions: data.sessions,
      approvals: data.approvals,
      approvedDiscounts: data.approvedDiscounts,
      discountPolicy: data.discountPolicy,
      activeCounsellorId: data.activeCounsellorId,
      activeCounsellorName: data.activeCounsellorName,
      activeBranchId: data.branchId,
      seniorMode: data.seniorMode,
      packages: data.packages,
      getPatient,
      getVisit,
      getQueueItem,
      getSession,
      getFilteredQueue,
      claimSession: async (visitId) => {
        const result = await counsellorMutate({ op: "claimSession", visitId });
        if (!result.ok) throw new Error(result.error);
        await refresh({ silent: true });
        return result.data as CounselSession;
      },
      buildQuote,
      requestDiscountApproval: async (visitId, quote, reason) => {
        const result = await counsellorMutate({ op: "requestDiscountApproval", visitId, quote, reason });
        if (!result.ok) throw new Error(result.error);
        await refresh({ silent: true });
      },
      resolveApproval: async (approvalId, approved) => {
        const result = await counsellorMutate({ op: "resolveDiscountApproval", approvalId, approved });
        if (!result.ok) throw new Error(result.error);
        await refresh({ silent: true });
      },
      completeSession: async (visitId, outcome, opts) => {
        const result = await counsellorMutate({
          op: "completeSession",
          visitId,
          outcome,
          quote: opts.quote,
          internalNotes: opts.internalNotes,
          objections: opts.objections,
          callbackAt: opts.callbackAt,
          sendToBilling: Boolean(opts.sendToBilling),
          paymentExpectation: opts.paymentExpectation ?? "desk",
          consentCaptured: opts.consentCaptured,
          whatsappSent: opts.whatsappSent,
          voiceNote: opts.voiceNote,
          aiScript: opts.aiScript,
        });
        if (!result.ok) return { ok: false, error: result.error };
        await refresh();
        return { ok: true };
      },
      getBillingHandoffs: () => data.billingHandoffs,
      maxDiscountPercent,
      setSeniorMode: (v) => {
        void counsellorMutate({ op: "savePrefs", prefs: { seniorMode: v } }).then(() => refresh({ silent: true }));
        setState((prev) => (prev ? { ...prev, seniorMode: v } : prev));
      },
      getDashboardKpis: () => {
        const waiting = data.queue.length;
        const pipeline = data.queue.reduce(
          (s, q) => s + (data.packages.find((p) => p.id === (q.packageId ?? "pkg_basic"))?.amount ?? 0),
          0,
        );
        const todayConverted = converted.filter((s) => {
          const d = new Date(s.completedAt!);
          return d.toDateString() === new Date().toDateString();
        }).length;
        const pendingApprovals = data.approvals.length;
        return [
          { label: "Queue waiting", value: String(waiting), delta: waiting ? "Needs counsel" : "Clear", trend: waiting > 2 ? "down" as const : "neutral" as const },
          { label: "Converted today", value: String(todayConverted), delta: "Packages sold", trend: "up" as const },
          { label: "Pipeline value", value: `₹${(pipeline / 1000).toFixed(0)}K`, delta: "In queue", trend: "neutral" as const },
          { label: "Discount approvals", value: String(pendingApprovals), delta: "Pending manager", trend: pendingApprovals ? "down" as const : "neutral" as const },
          { label: "Conversion rate", value: completedSessions.length ? `${Math.round((converted.length / completedSessions.length) * 100)}%` : "—", delta: "Outcomes", trend: "neutral" as const },
          { label: "Counsellor", value: data.activeCounsellorName.split(" ")[0] ?? "—", delta: "Signed in", trend: "neutral" as const },
        ];
      },
      getAnalytics: () => {
        const outcomes = new Map<string, number>();
        for (const s of completedSessions) {
          outcomes.set(s.outcome ?? "deferred", (outcomes.get(s.outcome ?? "deferred") ?? 0) + 1);
        }
        const pkgMix = new Map<string, number>();
        for (const s of converted) {
          const l = s.quote?.packageLabel ?? "Unknown";
          pkgMix.set(l, (pkgMix.get(l) ?? 0) + 1);
        }
        const lost = new Map<string, number>();
        for (const s of completedSessions.filter((x) => x.outcome !== "converted")) {
          for (const o of s.patientObjections) lost.set(o, (lost.get(o) ?? 0) + 1);
        }
        const discounts = converted.map((s) => s.quote?.discountPercent ?? 0);
        const closeTimes = completedSessions
          .filter((s) => s.completedAt)
          .map((s) => (new Date(s.completedAt!).getTime() - new Date(s.startedAt).getTime()) / 60000);
        return {
          conversionRate: completedSessions.length ? Math.round((converted.length / completedSessions.length) * 100) : 0,
          avgDiscount: discounts.length ? Math.round(discounts.reduce((a, b) => a + b, 0) / discounts.length) : 0,
          avgCloseMin: closeTimes.length ? Math.round(closeTimes.reduce((a, b) => a + b, 0) / closeTimes.length) : 0,
          pipelineValue: data.queue.reduce(
            (s, q) => s + (data.packages.find((p) => p.id === (q.packageId ?? "pkg_basic"))?.amount ?? 0),
            0,
          ),
          outcomes: [...outcomes.entries()].map(([label, count]) => ({ label, count })),
          packageMix: [...pkgMix.entries()].map(([label, count]) => ({ label, count })),
          lostReasons: [...lost.entries()].map(([label, count]) => ({ label, count })).slice(0, 6),
        };
      },
      searchPatients: (q: string) => {
        const query = q.trim().toLowerCase();
        if (!query) return data.patients;
        return data.patients.filter(
          (p) =>
            patientDisplayName(p).toLowerCase().includes(query) ||
            p.uhid.toLowerCase().includes(query),
        );
      },
      getPatientCommercialHistory: (patientId: string) =>
        data.sessions
          .filter((s) => s.patientId === patientId && s.completedAt)
          .sort((a, b) => (b.completedAt! > a.completedAt! ? 1 : -1)),
    };
  }, [state, ready, error, refresh]);

  return <CounsellorContext.Provider value={value}>{children}</CounsellorContext.Provider>;
}

export function useCounsellorStore() {
  const ctx = useContext(CounsellorContext);
  if (!ctx) throw new Error("useCounsellorStore must be used within CounsellorStoreProvider");
  return ctx;
}
