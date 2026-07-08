"use client";

import type { Patient, Visit } from "@/design-system/frontdesk-data";
import {
  CARE_PACKAGES,
  DEMO_DOCTOR_ID,
  type DoctorProfile,
  type ConsultationRecord,
  type CounsellorQueueItem,
  type DoctorTemplate,
  type IpdPatient,
  type PrescriptionLine,
  type TreatmentMode,
} from "@/design-system/doctor-data";
import type { DocumentTemplate } from "@/design-system/document-templates";
import type { DoctorSnapshot } from "@/server/doctor";
import type { ScribeDraft } from "@/lib/ai/scribe-types";
import { computeDoctorChartAnalytics } from "@/lib/doctor-analytics-data";
import { filterDoctorOpdQueue } from "@/lib/doctor-queue";
import { patientDisplayName } from "@/lib/frontdesk-workflow";
import { sleep } from "@/lib/session-retry";
import {
  isRetryableWorkspaceError,
  retryWorkspaceLoad,
  WORKSPACE_LOAD_FAILED,
  WORKSPACE_SYNC_MESSAGE,
  workspaceErrorMessage,
} from "@/lib/workspace-load";
import type { ActionResult } from "@/server/action-result";
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
import { useSession } from "@/components/candela/session-provider";

type DoctorState = {
  patients: Patient[];
  visits: Visit[];
  consultations: ConsultationRecord[];
  counsellorQueue: CounsellorQueueItem[];
  ipdPatients: IpdPatient[];
  activeDoctorId: string;
  profile: DoctorProfile;
  templates: DoctorTemplate[];
  documentTemplates: DocumentTemplate[];
  packages: typeof CARE_PACKAGES;
  juniorSubmissions: Record<string, Record<string, string | number | boolean>>;
};

type DoctorStoreValue = {
  ready: boolean;
  error: string | null;
  refresh: (opts?: { silent?: boolean }) => Promise<void>;
  patients: Patient[];
  visits: Visit[];
  activeDoctorId: string;
  profile: DoctorProfile;
  consultations: ConsultationRecord[];
  counsellorQueue: CounsellorQueueItem[];
  ipdPatients: IpdPatient[];
  templates: DoctorTemplate[];
  packages: typeof CARE_PACKAGES;
  documentTemplates: DocumentTemplate[];
  getJuniorSubmission: (visitId: string) => Record<string, string | number | boolean> | undefined;
  addDocumentTemplate: (kind: DocumentTemplate["kind"], label: string, description: string) => void;
  saveDocumentTemplate: (template: DocumentTemplate) => void;
  getPatientConsultations: (patientId: string) => ConsultationRecord[];
  createDoctorTemplate: (tpl: Omit<DoctorTemplate, "id" | "doctorId">) => DoctorTemplate;
  updateDoctorTemplate: (id: string, patch: Partial<DoctorTemplate>) => void;
  deleteDoctorTemplate: (id: string) => void;
  getPatient: (id: string) => Patient | undefined;
  getVisit: (id: string) => Visit | undefined;
  getOpdQueue: (doctorId?: string, includeDept?: boolean) => Visit[];
  getConsultation: (visitId: string) => ConsultationRecord | undefined;
  startConsultation: (visitId: string) => Promise<ConsultationRecord | undefined>;
  skipConsultation: (visitId: string) => Promise<{ ok: boolean; token?: number }>;
  updateConsultation: (visitId: string, patch: Partial<ConsultationRecord>) => void;
  saveConsultSection: (
    visitId: string,
    section: "examination" | "diagnosis" | "treatment",
    data: Record<string, string | number | boolean>,
  ) => void;
  patchConsultSectionLocal: (
    visitId: string,
    section: "examination" | "diagnosis" | "treatment",
    data: Record<string, string | number | boolean>,
  ) => void;
  setPrescription: (visitId: string, lines: PrescriptionLine[]) => void;
  applyTemplate: (visitId: string, templateId: string) => void;
  setScribeTranscript: (visitId: string, transcript: string, language: string) => void;
  persistScribeTranscript: (visitId: string, transcript: string, language: string) => void;
  applyScribeDraft: (visitId: string, draft: ScribeDraft) => void;
  applyScribeToExamination: (visitId: string) => void;
  completeConsultation: (visitId: string, opts: {
    treatmentMode: TreatmentMode;
    recommendCounsellor: boolean;
    skipCounsellor: boolean;
    handoff: Record<string, string | number | boolean>;
    sendWhatsapp: boolean;
  }) => Promise<{ ok: boolean; error?: string }>;
  saveIpdRound: (ipdId: string, note: Record<string, string | number | boolean>) => void;
  getDashboardKpis: () => { label: string; value: string; delta: string; trend: "up" | "down" | "neutral" }[];
  getAnalytics: () => {
    consultsToday: number;
    avgMinutes: number;
    counsellorRate: number;
    topDiagnoses: { label: string; count: number }[];
    templateUsage: { label: string; count: number }[];
  };
  getChartAnalytics: () => ReturnType<typeof computeDoctorChartAnalytics>;
  searchPatients: (q: string) => Patient[];
};

const DoctorContext = createContext<DoctorStoreValue | null>(null);

function initialDoctorState(): DoctorState {
  return {
    patients: [],
    visits: [],
    consultations: [],
    counsellorQueue: [],
    ipdPatients: [],
    activeDoctorId: DEMO_DOCTOR_ID,
    profile: {
      doctorId: DEMO_DOCTOR_ID,
      staffId: "",
      name: "Doctor",
      email: "",
      departmentIds: [],
      departmentLabels: [],
    },
    templates: [],
    documentTemplates: [],
    packages: CARE_PACKAGES,
    juniorSubmissions: {},
  };
}

function mapJuniorSubmissions(
  rows: { visitId: string; data: Record<string, string | number | boolean> }[],
): Record<string, Record<string, string | number | boolean>> {
  const out: Record<string, Record<string, string | number | boolean>> = {};
  for (const row of rows) out[row.visitId] = row.data;
  return out;
}

function applySnapshot(snapshot: DoctorSnapshot): DoctorState {
  return {
    patients: snapshot.patients,
    visits: snapshot.visits,
    consultations: snapshot.consultations,
    counsellorQueue: snapshot.counsellorQueue,
    ipdPatients: snapshot.ipdPatients,
    activeDoctorId: snapshot.activeDoctorId,
    profile: snapshot.profile,
    templates: snapshot.templates,
    documentTemplates: snapshot.documentTemplates,
    packages: snapshot.packages,
    juniorSubmissions: mapJuniorSubmissions(snapshot.juniorSubmissions),
  };
}

type DoctorSnapshotResult = { ok: true; data: DoctorSnapshot } | { ok: false; code: string; error: string };

async function loadDoctorSnapshot(): Promise<DoctorSnapshotResult> {
  try {
    const res = await fetch("/api/doctor/snapshot", { cache: "no-store" });
    if (res.ok) {
      return (await res.json()) as DoctorSnapshotResult;
    }
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return {
      ok: false,
      code: "INTERNAL_ERROR",
      error: body?.error ?? "Failed to load doctor workspace.",
    };
  } catch {
    return {
      ok: false,
      code: "INTERNAL_ERROR",
      error: WORKSPACE_LOAD_FAILED,
    };
  }
}

async function doctorMutate(body: Record<string, unknown>): Promise<{ ok: boolean; data?: any; error?: string }> {
  try {
    const res = await fetch("/api/doctor/mutate", {
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

function hasDoctorWorkspaceData(state: DoctorState) {
  return state.patients.length > 0 || state.visits.length > 0 || state.consultations.length > 0;
}

export function DoctorStoreProvider({ children }: { children: ReactNode }) {
  const { authReady, session } = useSession();
  const [doctor, setDoctor] = useState<DoctorState>(initialDoctorState);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doctorRef = useRef(doctor);
  doctorRef.current = doctor;

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (!silent) setReady(false);
    try {
      const result = await retryWorkspaceLoad(() => loadDoctorSnapshot(), {
        attempts: silent ? 3 : 5,
      });
      if (result.ok) {
        setDoctor(applySnapshot(result.data));
        setError(null);
      } else if (silent && hasDoctorWorkspaceData(doctorRef.current)) {
        console.warn("Doctor refresh failed — keeping cached workspace data.", result.error);
      } else {
        setError(
          isRetryableWorkspaceError({ message: result.error })
            ? WORKSPACE_SYNC_MESSAGE
            : result.error,
        );
      }
    } catch (err) {
      if (silent && hasDoctorWorkspaceData(doctorRef.current)) {
        console.warn("Doctor refresh failed — keeping cached workspace data.");
        return;
      }
      setError(workspaceErrorMessage(err));
    } finally {
      setReady(true);
    }
  }, []);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      void refresh({ silent: true });
    }, 800);
  }, [refresh]);

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
        const result = await retryWorkspaceLoad(() => loadDoctorSnapshot(), { attempts: 3 });
        if (cancelled) return;
        if (result.ok) {
          setDoctor(applySnapshot(result.data));
          setError(null);
        } else if (!hasDoctorWorkspaceData(doctorRef.current)) {
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
          await load(attempt + 1);
          return;
        }
        if (!hasDoctorWorkspaceData(doctorRef.current)) {
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

  const syncDoctor = useCallback((fn: (prev: DoctorState) => DoctorState) => {
    setDoctor((prev) => {
      const next = fn(prev);
      return next;
    });
  }, []);

  const value = useMemo<DoctorStoreValue>(() => {
    const { patients, visits } = doctor;
    const doctorId = doctor.activeDoctorId;

    const getPatient = (id: string) => patients.find((p) => p.id === id);
    const getVisit = (id: string) => visits.find((v) => v.id === id);

    const getOpdQueue = (id = doctorId, includeDept = false) =>
      filterDoctorOpdQueue(
        visits,
        includeDept ? undefined : id,
        includeDept,
        doctor.profile.departmentIds,
        doctor.profile.name,
      );

    const getJuniorSubmission = (visitId: string) => doctor.juniorSubmissions[visitId];

    const getConsultation = (visitId: string) =>
      doctor.consultations.find((c) => c.visitId === visitId);

    const startConsultation = async (visitId: string) => {
      const visit = getVisit(visitId);
      if (!visit) throw new Error("Visit not found");
      const existing = getConsultation(visitId);
      if (existing?.status === "completed") return existing;

      try {
        const record = await doctorMutate({ op: "startConsultation", visitId });
        if (!record.ok) {
          setError(record.error!);
          throw new Error(record.error);
        }
        const data = record.data;
        if (data) {
          syncDoctor((prev) => {
            const idx = prev.consultations.findIndex((c) => c.visitId === visitId);
            const next = [...prev.consultations];
            if (idx >= 0) next[idx] = data;
            else next.push(data);
            return { ...prev, consultations: next };
          });
        }
        return data ?? getConsultation(visitId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Something went wrong.";
        setError(msg);
        throw err;
      }
    };

    const skipConsultation = async (visitId: string) => {
      const visit = getVisit(visitId);
      if (!visit) throw new Error("Visit not found");

      try {
        const res = await doctorMutate({ op: "skipConsultation", visitId });
        if (!res.ok) {
          setError(res.error!);
          throw new Error(res.error);
        }
        syncDoctor((prev) => {
          const maxToken = prev.visits.reduce((max, v) => Math.max(max, v.token ?? 0), 0);
          return {
            ...prev,
            visits: prev.visits.map((v) =>
              v.id === visitId
                ? { ...v, token: maxToken + 1, routingNote: `Skipped by ${doctor.profile.name}` }
                : v,
            ),
          };
        });
        scheduleRefresh();
        return { ok: true, token: res.data?.token as number | undefined };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Something went wrong.";
        setError(msg);
        throw err;
      }
    };

    const updateConsultation = (visitId: string, patch: Partial<ConsultationRecord>) => {
      syncDoctor((prev) => ({
        ...prev,
        consultations: prev.consultations.map((c) =>
          c.visitId === visitId ? { ...c, ...patch } : c,
        ),
      }));
      void doctorMutate({ op: "updateConsultation", visitId, patch: patch as Record<string, unknown> }).then(() =>
        scheduleRefresh(),
      );
    };

    const saveConsultSection = (
      visitId: string,
      section: "examination" | "diagnosis" | "treatment",
      data: Record<string, string | number | boolean>,
    ) => {
      syncDoctor((prev) => ({
        ...prev,
        consultations: prev.consultations.map((c) =>
          c.visitId === visitId ? { ...c, [section]: { ...c[section], ...data } } : c,
        ),
      }));
      void doctorMutate({ op: "saveConsultSection", visitId, section, data }).then(() => scheduleRefresh());
    };

    const patchConsultSectionLocal = (
      visitId: string,
      section: "examination" | "diagnosis" | "treatment",
      data: Record<string, string | number | boolean>,
    ) => {
      syncDoctor((prev) => ({
        ...prev,
        consultations: prev.consultations.map((c) =>
          c.visitId === visitId ? { ...c, [section]: { ...c[section], ...data } } : c,
        ),
      }));
    };

    const setPrescription = (visitId: string, lines: PrescriptionLine[]) => {
      syncDoctor((prev) => ({
        ...prev,
        consultations: prev.consultations.map((c) =>
          c.visitId === visitId ? { ...c, prescription: lines } : c,
        ),
      }));
      void doctorMutate({ op: "setPrescription", visitId, lines }).then(() => scheduleRefresh());
    };

    const applyTemplate = (visitId: string, templateId: string) => {
      const all = doctor.templates;
      const tpl = all.find((t) => t.id === templateId);
      if (!tpl) return;
      updateConsultation(visitId, {
        templateId,
        diagnosis: { ...tpl.diagnosis },
        treatment: { ...tpl.treatment },
        prescription: tpl.prescription.map((p) => ({ ...p, id: `${p.id}_${Date.now()}` })),
      });
    };

    const setScribeTranscript = (visitId: string, transcript: string, language: string) => {
      syncDoctor((prev) => ({
        ...prev,
        consultations: prev.consultations.map((c) =>
          c.visitId === visitId ? { ...c, scribeTranscript: transcript, scribeLanguage: language } : c,
        ),
      }));
    };

    const persistScribeTranscript = (visitId: string, transcript: string, language: string) => {
      setScribeTranscript(visitId, transcript, language);
      void doctorMutate({ op: "updateConsultation", visitId, patch: { scribeTranscript: transcript, scribeLanguage: language } }).then(
        () => scheduleRefresh(),
      );
    };

    const applyScribeDraft = (visitId: string, draft: ScribeDraft) => {
      const c = getConsultation(visitId);
      if (draft.examination && Object.keys(draft.examination).length) {
        saveConsultSection(visitId, "examination", draft.examination);
      }
      if (draft.diagnosis && Object.keys(draft.diagnosis).length) {
        saveConsultSection(visitId, "diagnosis", draft.diagnosis);
      }
      if (draft.treatment && Object.keys(draft.treatment).length) {
        saveConsultSection(visitId, "treatment", draft.treatment);
      }
      if (draft.prescription.length) {
        setPrescription(
          visitId,
          draft.prescription.map((line, i) => ({
            ...line,
            id: `rx_scribe_${Date.now()}_${i}`,
          })),
        );
      }
      updateConsultation(visitId, { scribeAppliedAt: new Date().toISOString() });
      if (c?.scribeTranscript?.trim()) {
        persistScribeTranscript(visitId, c.scribeTranscript, c.scribeLanguage ?? "en");
      }
    };

    const applyScribeToExamination = (visitId: string) => {
      const c = getConsultation(visitId);
      if (!c?.scribeTranscript) return;
      saveConsultSection(visitId, "examination", {
        chiefComplaint: c.scribeTranscript.slice(0, 500),
        historyPresent: c.scribeTranscript,
      });
      updateConsultation(visitId, { scribeAppliedAt: new Date().toISOString() });
    };

    const completeConsultation = async (
      visitId: string,
      opts: {
        treatmentMode: TreatmentMode;
        recommendCounsellor: boolean;
        skipCounsellor: boolean;
        handoff: Record<string, string | number | boolean>;
        sendWhatsapp: boolean;
      },
    ): Promise<{ ok: boolean; error?: string }> => {
      try {
        const c = getConsultation(visitId);
        if (c?.scribeTranscript?.trim()) {
          await doctorMutate({ op: "updateConsultation", visitId, patch: { scribeTranscript: c.scribeTranscript, scribeLanguage: c.scribeLanguage ?? "en" } });
        }
        const result = await doctorMutate({ op: "completeConsultation", visitId, opts });
        if (!result.ok) {
          return { ok: false, error: result.error };
        }
        await refresh();
        return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Something went wrong.";
        return { ok: false, error: msg };
      }
    };

    const saveIpdRound = (ipdId: string, note: Record<string, string | number | boolean>) => {
      const text = `S: ${note.subjective}\nO: ${note.objective}\nA: ${note.assessment}\nP: ${note.plan}`;
      syncDoctor((prev) => ({
        ...prev,
        ipdPatients: prev.ipdPatients.map((ip) =>
          ip.id === ipdId
            ? { ...ip, lastRoundAt: new Date().toISOString(), lastRoundNote: text }
            : ip,
        ),
      }));
      void doctorMutate({ op: "saveIpdRound", ipdId, note }).then(() => refresh({ silent: true }));
    };

    const completed = doctor.consultations.filter((c) => c.status === "completed");
    const avgMinutes = (() => {
      const durations = completed
        .filter((c) => c.completedAt && c.startedAt)
        .map((c) => (new Date(c.completedAt!).getTime() - new Date(c.startedAt).getTime()) / 60_000);
      if (!durations.length) return 0;
      return Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    })();

    const allTemplates = doctor.templates;

    const createDoctorTemplate = (tpl: Omit<DoctorTemplate, "id" | "doctorId">) => {
      const created: DoctorTemplate = {
        ...tpl,
        id: `tpl_custom_${Date.now()}`,
        doctorId,
      };
      syncDoctor((prev) => ({
        ...prev,
        templates: [...prev.templates, created],
      }));
      void doctorMutate({ op: "createDoctorTemplate", doctorId, tpl }).then(() => refresh({ silent: true }));
      return created;
    };

    const updateDoctorTemplate = (id: string, patch: Partial<DoctorTemplate>) => {
      syncDoctor((prev) => ({
        ...prev,
        templates: prev.templates.map((t) =>
          t.id === id ? { ...t, ...patch } : t,
        ),
      }));
      void doctorMutate({ op: "updateDoctorTemplate", id, templatePatch: patch }).then(() => refresh({ silent: true }));
    };

    const deleteDoctorTemplate = (id: string) => {
      syncDoctor((prev) => ({
        ...prev,
        templates: prev.templates.filter((t) => t.id !== id),
      }));
      void doctorMutate({ op: "deleteDoctorTemplate", id }).then(() => refresh({ silent: true }));
    };

    const getPatientConsultations = (patientId: string) =>
      doctor.consultations
        .filter((c) => c.patientId === patientId && c.doctorId === doctorId)
        .sort((a, b) => (b.startedAt > a.startedAt ? 1 : -1));

    return {
      ready,
      error,
      refresh,
      patients,
      visits,
      activeDoctorId: doctorId,
      profile: doctor.profile,
      consultations: doctor.consultations,
      counsellorQueue: doctor.counsellorQueue,
      ipdPatients: doctor.ipdPatients,
      templates: allTemplates,
      packages: doctor.packages,
      documentTemplates: doctor.documentTemplates,
      getJuniorSubmission,
      addDocumentTemplate: (kind, label, description) => {
        syncDoctor((prev) => ({
          ...prev,
          documentTemplates: [
            ...prev.documentTemplates,
            {
              id: `doc_custom_${Date.now()}`,
              kind,
              label,
              layout: "navayu-letterhead",
              description,
              enabled: true,
              isSystem: false,
            },
          ],
        }));
        void doctorMutate({ op: "addDocumentTemplate", kind, label, description }).then(() => refresh({ silent: true }));
      },
      saveDocumentTemplate: (template) => {
        syncDoctor((prev) => ({
          ...prev,
          documentTemplates: prev.documentTemplates.map((t) =>
            t.id === template.id ? template : t,
          ),
        }));
        void doctorMutate({ op: "saveDocumentTemplate", template }).then(() => refresh({ silent: true }));
      },
      getPatientConsultations,
      createDoctorTemplate,
      updateDoctorTemplate,
      deleteDoctorTemplate,
      getPatient,
      getVisit,
      getOpdQueue,
      getConsultation,
      startConsultation,
      skipConsultation,
      updateConsultation,
      saveConsultSection,
      patchConsultSectionLocal,
      setPrescription,
      applyTemplate,
      setScribeTranscript,
      persistScribeTranscript,
      applyScribeDraft,
      applyScribeToExamination,
      completeConsultation,
      saveIpdRound,
      getDashboardKpis: () => {
        const queue = getOpdQueue().length;
        const done = completed.length;
        const ipdDue = doctor.ipdPatients.filter((i) => i.attendingDoctorId === doctorId && !i.lastRoundAt).length;
        const pendingHandoff = doctor.counsellorQueue.length;
        return [
          { label: "OPD queue", value: String(queue), delta: queue ? "Patients waiting" : "Clear", trend: queue > 2 ? "down" as const : "neutral" as const },
          { label: "Consults today", value: String(done), delta: `${done} completed`, trend: "up" as const },
          { label: "IPD rounds due", value: String(ipdDue), delta: "Ward rounds", trend: ipdDue ? "down" as const : "neutral" as const },
          { label: "Counsellor queue", value: String(pendingHandoff), delta: "Awaiting counsel", trend: "neutral" as const },
          { label: "Avg consult", value: avgMinutes ? `${avgMinutes}m` : "—", delta: "Target 15m", trend: avgMinutes > 15 ? "down" as const : "neutral" as const },
          { label: "Templates used", value: String(completed.filter((c) => c.templateId).length), delta: "This session", trend: "neutral" as const },
        ];
      },
      getAnalytics: () => {
        const dxMap = new Map<string, number>();
        for (const c of completed) {
          const dx = String(c.diagnosis.primaryDiagnosis ?? "Unspecified");
          dxMap.set(dx, (dxMap.get(dx) ?? 0) + 1);
        }
        const tplMap = new Map<string, number>();
        for (const c of completed) {
          if (!c.templateId) continue;
          const t = allTemplates.find((x) => x.id === c.templateId)?.label ?? c.templateId;
          tplMap.set(t, (tplMap.get(t) ?? 0) + 1);
        }
        const sent = completed.filter((c) => c.recommendCounsellor && !c.skipCounsellor).length;
        return {
          consultsToday: completed.length,
          avgMinutes: avgMinutes || 0,
          counsellorRate: completed.length ? Math.round((sent / completed.length) * 100) : 0,
          topDiagnoses: [...dxMap.entries()].map(([label, count]) => ({ label, count })).slice(0, 5),
          templateUsage: [...tplMap.entries()].map(([label, count]) => ({ label, count })),
        };
      },
      getChartAnalytics: () =>
        computeDoctorChartAnalytics(patients, visits, doctor.consultations, doctorId),
      searchPatients: (q: string) => {
        const query = q.trim().toLowerCase();
        const mine = patients;
        if (!query) return mine;
        return mine.filter(
          (p) =>
            patientDisplayName(p).toLowerCase().includes(query) ||
            p.uhid.toLowerCase().includes(query),
        );
      },
    };
  }, [doctor, ready, error, refresh, scheduleRefresh, syncDoctor]);

  return <DoctorContext.Provider value={value}>{children}</DoctorContext.Provider>;
}

export function useDoctorStore() {
  const ctx = useContext(DoctorContext);
  if (!ctx) throw new Error("useDoctorStore must be used within DoctorStoreProvider");
  return ctx;
}
