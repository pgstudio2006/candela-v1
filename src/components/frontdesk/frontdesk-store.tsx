"use client";

import {
  type Patient,
  type Visit,
} from "@/design-system/frontdesk-data";
import { buildActionItems, computeKpis, computeWaitMinutes, findDuplicatePatients, isInReceptionQueue, matchPatientByQuery, nextUhid, nowTime, patientDisplayName, sortQueueVisits, sortVisitsByToken, type Appointment, type FormSubmission, type FrontdeskCounters } from "@/lib/frontdesk-workflow";
import type { PaymentScope } from "@/lib/billing-routing";
import type { BillingHandoffPayload } from "@/design-system/counsellor-data";
import {
  EMPTY_ROSTER,
  resolveDoctorName as rosterDoctorName,
  type ClinicalRoster,
} from "@/lib/clinical-roster";
import { isTransientSessionError, sleep } from "@/lib/session-retry";
import {
  isRetryableWorkspaceError,
  retryWorkspaceLoad,
  WORKSPACE_LOAD_FAILED,
  WORKSPACE_SYNC_MESSAGE,
  workspaceErrorMessage,
} from "@/lib/workspace-load";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { useSession } from "@/components/candela/session-provider";

type FrontdeskState = {
  patients: Patient[];
  visits: Visit[];
  appointments: Appointment[];
  submissions: FormSubmission[];
  counters: FrontdeskCounters;
  billingHandoffs: BillingHandoffPayload[];
  roster: ClinicalRoster;
};

type RegisterInput = Record<string, string | number | boolean>;
type CheckInInput = Record<string, string | number | boolean>;
type BillingInput = Record<string, string | number | boolean>;
type AppointmentInput = Record<string, string | number | boolean>;
type JuniorExamInput = Record<string, string | number | boolean>;

export type CounselBillingInput = {
  paymentScope: PaymentScope;
  collectedAmount: number;
  mode: string;
  convertToIpd: boolean;
  ward?: string;
  bed?: string;
  deferReason?: string;
  handoff: BillingHandoffPayload;
};

export type BillingResult =
  | {
      ok: true;
      routeHref: string;
      routingLabel: string;
      routingNote: string;
      visitId: string;
      invoiceNumber: string;
      paymentMode: string;
      token?: number;
    }
  | { ok: false; error: string };

export type RegisterPatientResult =
  | { ok: true; patientId: string; visitId: string; uhid: string }
  | { ok: false; error: string; code?: string };

type FrontdeskStoreValue = FrontdeskState & {
  ready: boolean;
  error: string | null;
  refresh: (opts?: { silent?: boolean }) => Promise<void>;
  resolveDoctorName: (doctorId: string) => string;
  getBillingHandoff: (visitId: string) => BillingHandoffPayload | undefined;
  registerPatientAsync: (
    data: RegisterInput,
    opts?: { startVisit?: boolean; forceDuplicate?: boolean; emergency?: boolean },
  ) => Promise<RegisterPatientResult>;
  checkInVisit: (
    data: CheckInInput,
    visitId?: string,
  ) => Promise<{ ok: boolean; visitId: string; patientId: string; error?: string }>;
  processBilling: (visitId: string, data: BillingInput) => Promise<BillingResult>;
  processCounselBilling: (visitId: string, input: CounselBillingInput) => Promise<BillingResult>;
  completeJuniorExam: (visitId: string, data: JuniorExamInput) => Promise<{ ok: boolean; error?: string }>;
  bookAppointment: (data: AppointmentInput) => Promise<{ appointmentId: string; visitId: string; error?: string }>;
  cancelAppointment: (appointmentId: string) => Promise<{ ok: boolean; error?: string }>;
  rescheduleAppointment: (
    appointmentId: string,
    input: { date: string; time: string; doctorId?: string; departmentId?: string },
  ) => Promise<{ ok: boolean; error?: string }>;
  updatePatientAsync: (
    patientId: string,
    data: RegisterInput,
  ) => Promise<{ ok: true; patientId: string; uhid: string } | { ok: false; error: string }>;
  saveSubmission: (
    formId: string,
    data: Record<string, string | number | boolean>,
    ctx?: { patientId?: string; visitId?: string },
  ) => Promise<void>;
  getSubmission: (formId: string, visitId: string) => FormSubmission | undefined;
  searchPatients: (q: string) => Patient[];
  findDuplicates: (phone: string, firstName?: string) => Patient[];
  getPatient: (id: string) => Patient | undefined;
  getVisit: (id: string) => Visit | undefined;
  getPatientVisits: (patientId: string) => Visit[];
  getWaitingCheckIns: () => { visit: Visit; patient: Patient }[];
  getPendingBilling: () => { visit: Visit; patient: Patient }[];
  getQueueVisits: (doctorId?: string) => Visit[];
  getJuniorExamVisits: () => Visit[];
  getDashboardKpis: () => ReturnType<typeof computeKpis>;
  getActionItems: () => ReturnType<typeof buildActionItems>;
  resetStore: () => void;
};

const FrontdeskContext = createContext<FrontdeskStoreValue | null>(null);

type ClinicalSnapshotResult = { ok: true; data: any } | { ok: false; code: string; error: string };

async function loadClinicalSnapshot(): Promise<ClinicalSnapshotResult> {
  try {
    const res = await fetch("/api/clinical/snapshot", { cache: "no-store" });
    if (res.ok) {
      return (await res.json()) as ClinicalSnapshotResult;
    }
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return {
      ok: false,
      code: "INTERNAL_ERROR",
      error: body?.error ?? "Failed to load frontdesk workspace.",
    };
  } catch {
    return {
      ok: false,
      code: "INTERNAL_ERROR",
      error: WORKSPACE_LOAD_FAILED,
    };
  }
}

async function clinicalMutate(body: Record<string, unknown>): Promise<{ ok: boolean; data?: any; error?: string; code?: string }> {
  try {
    const res = await fetch("/api/clinical/mutate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await res.json();
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Something went wrong.";
    return { ok: false, error: msg };
  }
}

function hasWorkspaceData(state: FrontdeskState) {
  return state.patients.length > 0 || state.visits.length > 0 || state.appointments.length > 0;
}

function initialState(): FrontdeskState {
  return {
    patients: [],
    visits: [],
    appointments: [],
    submissions: [],
    counters: { patient: 0, visit: 0, token: 0, appointment: 0 },
    billingHandoffs: [],
    roster: EMPTY_ROSTER,
  };
}

function randomId(prefix: string) {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

function cloneState(state: FrontdeskState): FrontdeskState {
  return {
    ...state,
    patients: [...state.patients],
    visits: [...state.visits],
    appointments: [...state.appointments],
    submissions: [...state.submissions],
    billingHandoffs: [...state.billingHandoffs],
    counters: { ...state.counters },
    roster: state.roster,
  };
}

export function FrontdeskStoreProvider({ children }: { children: ReactNode }) {
  const { authReady, session } = useSession();
  const [state, setState] = useState<FrontdeskState>(initialState);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (!silent) setReady(false);
    try {
      const snapshot = await retryWorkspaceLoad(() => loadClinicalSnapshot(), {
        attempts: silent ? 3 : 5,
      });
      if (!snapshot.ok) {
        if (silent && hasWorkspaceData(stateRef.current)) {
          console.warn("Frontdesk refresh failed — keeping cached workspace data.", snapshot.error);
          return;
        }
        setError(
          isRetryableWorkspaceError({ message: snapshot.error })
            ? WORKSPACE_SYNC_MESSAGE
            : snapshot.error,
        );
        return;
      }
      setState({
        patients: snapshot.data.patients,
        visits: snapshot.data.visits,
        appointments: snapshot.data.appointments,
        submissions: snapshot.data.submissions,
        counters: snapshot.data.counters,
        billingHandoffs: snapshot.data.billingHandoffs,
        roster: snapshot.data.roster,
      });
      setError(null);
    } catch (err) {
      console.error("Frontdesk refresh failed:", err);
      if (silent && hasWorkspaceData(stateRef.current)) {
        console.warn("Frontdesk refresh failed — keeping cached workspace data.");
        return;
      }
      setError(workspaceErrorMessage(err));
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!authReady || !session?.branchId) return;

    let cancelled = false;
    const load = async (attempt = 0) => {
      if (cancelled) return;
      if (attempt === 0) {
        await refresh();
        return;
      }
      await sleep(400 * attempt);
      if (cancelled) return;
      try {
        const snapshot = await retryWorkspaceLoad(() => loadClinicalSnapshot(), { attempts: 3 });
        if (cancelled) return;
        if (snapshot.ok) {
          setState({
            patients: snapshot.data.patients,
            visits: snapshot.data.visits,
            appointments: snapshot.data.appointments,
            submissions: snapshot.data.submissions,
            counters: snapshot.data.counters,
            billingHandoffs: snapshot.data.billingHandoffs,
            roster: snapshot.data.roster,
          });
          setError(null);
        } else if (!hasWorkspaceData(stateRef.current)) {
          setError(
            isRetryableWorkspaceError({ message: snapshot.error })
              ? WORKSPACE_SYNC_MESSAGE
              : snapshot.error,
          );
        }
        setReady(true);
      } catch (err) {
        if (cancelled) return;
        if (attempt < 4 && isRetryableWorkspaceError(err)) {
          await load(attempt + 1);
          return;
        }
        console.error("Frontdesk refresh failed:", err);
        if (!hasWorkspaceData(stateRef.current)) {
          setError(workspaceErrorMessage(err));
        }
        setReady(true);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [authReady, session?.branchId, refresh]);

  const update = useCallback((fn: (prev: FrontdeskState) => FrontdeskState) => {
    setState((prev) => fn(cloneState(prev)));
  }, []);

  const registerPatientAsync = useCallback(
    async (
      data: RegisterInput,
      opts?: { startVisit?: boolean; forceDuplicate?: boolean; emergency?: boolean },
    ): Promise<RegisterPatientResult> => {
      const patientId = randomId("p");
      const visitId = opts?.startVisit === false ? "" : randomId("v");
      const uhid = nextUhid(state.counters.patient + 1);

      try {
        const serverResult = await clinicalMutate({
          op: "registerPatient",
          data,
          patientId,
          visitId: visitId || undefined,
          startVisit: opts?.startVisit,
          forceDuplicate: opts?.forceDuplicate,
          emergency: opts?.emergency,
        });
        if (!serverResult.ok) {
          return { ok: false, error: serverResult.error!, code: String(serverResult.code ?? "INTERNAL_ERROR") };
        }
        await refresh();
        return {
          ok: true,
          patientId: serverResult.data.patientId,
          visitId: serverResult.data.visitId,
          uhid: serverResult.data.uhid,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Something went wrong.";
        return { ok: false, error: msg, code: "INTERNAL_ERROR" };
      }
    },
    [refresh, state.counters.patient],
  );

  const checkInVisit = useCallback(
    async (data: CheckInInput, existingVisitId?: string) => {
      const query = String(data.uhid ?? "").trim();
      if (!query) {
        return { ok: false, visitId: "", patientId: "", error: "Search and select a patient by UHID or phone." };
      }
      try {
        const newVisitId = existingVisitId ? undefined : randomId("v");
        const res = await clinicalMutate({
          op: "checkInVisit",
          data,
          existingVisitId,
          newVisitId,
        });
        const result = res.ok ? res.data : null;
        if (!result?.visitId) {
          return {
            ok: false,
            visitId: "",
            patientId: result?.patientId ?? "",
            error: res.error ?? "Patient not found. Select a valid UHID or phone from search.",
          };
        }
        await refresh();
        return { ok: true, visitId: result.visitId, patientId: result.patientId };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Something went wrong.";
        return { ok: false, visitId: "", patientId: "", error: msg };
      }
    },
    [refresh],
  );

  const processBilling = useCallback(
    async (visitId: string, data: BillingInput): Promise<BillingResult> => {
      try {
        const res = await clinicalMutate({ op: "processBilling", visitId, data });
        if (!res.ok) return { ok: false, error: res.error! };
        await refresh({ silent: true });
        return { ok: true, ...res.data };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Something went wrong.";
        return { ok: false, error: msg };
      }
    },
    [refresh],
  );

  const processCounselBilling = useCallback(
    async (visitId: string, input: CounselBillingInput): Promise<BillingResult> => {
      try {
        const res = await clinicalMutate({ op: "processCounselBilling", visitId, input });
        if (!res.ok) return { ok: false, error: res.error! };
        await refresh({ silent: true });
        return { ok: true, ...res.data };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Something went wrong.";
        return { ok: false, error: msg };
      }
    },
    [refresh],
  );

  const completeJuniorExam = useCallback(
    async (visitId: string, data: JuniorExamInput): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await clinicalMutate({ op: "completeJuniorExam", visitId, data });
        if (!res.ok) return { ok: false, error: res.error! };
        update((prev) => ({
          ...prev,
          visits: prev.visits.map((visit) =>
            visit.id === visitId
              ? {
                  ...visit,
                  stage: "with_doctor",
                  exam: "done",
                  routingNote: data.redFlags
                    ? `RED FLAG ESCALATION${data.redFlagNotes ? `: ${String(data.redFlagNotes)}` : ""}`
                    : visit.routingNote,
                }
              : visit,
          ),
        }));
        await refresh({ silent: true });
        return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Something went wrong.";
        return { ok: false, error: msg };
      }
    },
    [refresh, update],
  );

  const bookAppointment = useCallback(
    async (data: AppointmentInput) => {
      const appointmentId = randomId("ap");
      const visitId = randomId("v");
      const res = await clinicalMutate({ op: "bookAppointment", data, appointmentId, visitId });
      const result = res.ok ? res.data : null;
      if (!res.ok || !result?.visitId) {
        return { appointmentId: "", visitId: "", error: res.error ?? result?.error ?? "Could not book appointment" };
      }
      await refresh();
      return { appointmentId: result.appointmentId, visitId: result.visitId };
    },
    [refresh],
  );

  const cancelAppointment = useCallback(
    async (appointmentId: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await clinicalMutate({ op: "cancelAppointment", appointmentId });
        if (!res.ok) return { ok: false, error: res.error! };
        await refresh();
        return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Something went wrong.";
        return { ok: false, error: msg };
      }
    },
    [refresh],
  );

  const rescheduleAppointment = useCallback(
    async (
      appointmentId: string,
      input: { date: string; time: string; doctorId?: string; departmentId?: string },
    ): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await clinicalMutate({ op: "rescheduleAppointment", appointmentId, ...input });
        if (!res.ok) return { ok: false, error: res.error! };
        await refresh();
        return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Something went wrong.";
        return { ok: false, error: msg };
      }
    },
    [refresh],
  );

  const updatePatientAsync = useCallback(
    async (
      patientId: string,
      data: RegisterInput,
    ): Promise<{ ok: true; patientId: string; uhid: string } | { ok: false; error: string }> => {
      try {
        const res = await clinicalMutate({ op: "updatePatient", patientId, data });
        if (!res.ok) return { ok: false, error: res.error! };
        await refresh({ silent: true });
        return { ok: true, ...res.data };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Something went wrong.";
        return { ok: false, error: msg };
      }
    },
    [refresh],
  );

  const saveSubmission = useCallback(
    async (
      formId: string,
      data: Record<string, string | number | boolean>,
      ctx?: { patientId?: string; visitId?: string },
    ) => {
      await clinicalMutate({ op: "saveSubmission", formId, data, ctx });
      await refresh({ silent: true });
    },
    [refresh],
  );

  const value = useMemo<FrontdeskStoreValue>(() => {
    const getPatient = (id: string) => state.patients.find((p) => p.id === id);
    const getVisit = (id: string) => state.visits.find((v) => v.id === id);

    return {
      ...state,
      ready,
      error,
      refresh,
      resolveDoctorName: (doctorId: string) => rosterDoctorName(doctorId, state.roster),
      getBillingHandoff: (visitId) => state.billingHandoffs.find((h) => h.visitId === visitId),
      registerPatientAsync,
      checkInVisit,
      processBilling,
      processCounselBilling,
      completeJuniorExam,
      bookAppointment,
      cancelAppointment,
      rescheduleAppointment,
      updatePatientAsync,
      saveSubmission,
      getSubmission: (formId, visitId) =>
        state.submissions.find((s) => s.formId === formId && s.visitId === visitId),
      searchPatients: (q) => {
        const query = q.trim().toLowerCase();
        if (!query) return state.patients;
        return state.patients.filter(
          (p) =>
            patientDisplayName(p).toLowerCase().includes(query) ||
            p.uhid.toLowerCase().includes(query) ||
            p.phone.includes(query),
        );
      },
      findDuplicates: (phone, firstName) => findDuplicatePatients(state.patients, phone, firstName),
      getPatient,
      getVisit,
      getPatientVisits: (patientId) => state.visits.filter((v) => v.patientId === patientId),
      getWaitingCheckIns: () =>
        state.visits
          .filter((v) => v.stage === "registered" || (v.stage === "checked_in" && !v.checkInAt))
          .map((v) => ({ visit: v, patient: getPatient(v.patientId)! }))
          .filter((x) => x.patient),
      getPendingBilling: () =>
        state.visits
          .filter((v) => v.stage === "billing" || v.billing === "pending" || v.billing === "deferred" || v.billing === "partial")
          .filter((v) => v.billing !== "paid" && (v.billing !== "partial" || (v.balanceDue ?? 0) > 0))
          .filter((v) => v.stage !== "with_doctor" && v.stage !== "completed")
          .map((v) => ({ visit: v, patient: getPatient(v.patientId)! }))
          .filter((x) => x.patient),
      getQueueVisits: (doctorId) =>
        sortQueueVisits(
          state.visits.filter(
            (v) =>
              isInReceptionQueue(v) &&
              (!doctorId || v.doctorId === doctorId),
          ),
        ).map((v) => ({
          ...v,
          waitMin: v.checkInAt ? computeWaitMinutes(v.checkInAt) : v.waitMin,
        })),
      getJuniorExamVisits: () =>
        state.visits.filter(
          (v) => v.stage === "junior_exam" || (v.stage === "with_doctor" && v.exam === "done"),
        ),
      getDashboardKpis: () => computeKpis(state.visits),
      getActionItems: () => buildActionItems(state.visits, state.patients),
      resetStore: () => {
        setState(initialState());
        void refresh();
      },
    };
  }, [state, ready, error, refresh, registerPatientAsync, checkInVisit, processBilling, processCounselBilling, completeJuniorExam, bookAppointment, cancelAppointment, rescheduleAppointment, updatePatientAsync, saveSubmission]);

  return <FrontdeskContext.Provider value={value}>{children}</FrontdeskContext.Provider>;
}

export function useFrontdeskStore() {
  const ctx = useContext(FrontdeskContext);
  if (!ctx) throw new Error("useFrontdeskStore must be used within FrontdeskStoreProvider");
  return ctx;
}
