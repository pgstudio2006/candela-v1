"use client";

import { useSession } from "@/components/candela/session-provider";
import { useRequireClientSession } from "@/hooks/use-require-client-session";
import { StoreGate } from "@/components/candela/store-gate";
import { FrontdeskCommandPalette } from "@/components/frontdesk/command-palette";
import { useFrontdeskStore } from "@/components/frontdesk/frontdesk-store";
import { CopilotPanel } from "@/components/frontdesk/copilot-panel";
import { WorkspaceSidebar } from "@/components/frontdesk/sidebar";
import { getFrontdeskNavItem } from "@/design-system/frontdesk-nav";
import { WORKSPACE_SIGN_IN_PATH } from "@/lib/auth-storage";
import { normalizeRegisterPatientInput } from "@/lib/frontdesk-validation";
import type { CopilotAction } from "@/lib/ai/scribe-types";
import { useToast } from "@/components/ui/toast-provider";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Patient } from "@/design-system/frontdesk-data";
import type { ClinicalRoster } from "@/lib/clinical-roster";
import { doctorsForDepartment } from "@/lib/clinical-roster";

type FrontdeskStore = Omit<ReturnType<typeof useFrontdeskStore>, "ready" | "error" | "refresh">;
type ToastFn = ReturnType<typeof useToast>["toast"];
type Router = ReturnType<typeof useRouter>;

function resolveDoctorId(value: string | undefined, roster: ClinicalRoster, deptId?: string): string | undefined {
  const v = (value ?? "").trim();
  if (!v) {
    if (deptId) {
      const fallback = doctorsForDepartment(roster, deptId)[0]?.id;
      if (fallback) return fallback;
    }
    return roster.allDoctors[0]?.id;
  }
  if (v.startsWith("dr_") || v.startsWith("st_")) return v;
  const lower = v.toLowerCase();
  const match = roster.allDoctors.find(
    (d) => d.name.toLowerCase().includes(lower) || d.id.toLowerCase() === lower,
  );
  return match?.id;
}

function resolveDepartmentId(value: string | undefined, roster: ClinicalRoster): string | undefined {
  const v = (value ?? "").trim();
  if (!v) return undefined;
  if (v.startsWith("dept_")) return v;
  const lower = v.toLowerCase();
  const match = roster.departments.find(
    (d) => d.label.toLowerCase().includes(lower) || d.id.toLowerCase() === lower,
  );
  return match?.id;
}

function findSinglePatient(store: FrontdeskStore, query: string): Patient | undefined {
  const q = query.trim();
  if (!q) return undefined;
  const matches = store.searchPatients(q);
  if (matches.length === 0) return undefined;
  if (matches.length === 1) return matches[0];
  const qNorm = q.toLowerCase();
  const qDigits = q.replace(/\D/g, "");
  const byUhid = matches.find((p) => p.uhid.toLowerCase() === qNorm);
  if (byUhid) return byUhid;
  const byPhone = matches.find((p) => p.phone.replace(/\D/g, "").slice(-10) === qDigits.slice(-10));
  if (byPhone) return byPhone;
  return matches[0];
}

async function handleFrontdeskAction(action: CopilotAction, store: FrontdeskStore, router: Router, toast: ToastFn) {
  switch (action.type) {
    case "register_patient": {
      const data = normalizeRegisterPatientInput(action.data);
      if (!data.department) data.department = "dept_spine";
      const result = await store.registerPatientAsync(data, { startVisit: true });
      if (!result.ok) {
        toast(result.error ?? "Registration failed", "error");
        if (result.code === "DUPLICATE_PHONE" || result.code === "DUPLICATE_PATIENT") {
          router.push("/app/frontdesk/check-in");
        } else {
          router.push("/app/frontdesk/registration");
        }
        return;
      }
      if (result.visitId) {
        await store.saveSubmission("registration", data, { patientId: result.patientId, visitId: result.visitId });
      }
      toast(`Registered ${result.uhid}`, "success");
      router.push(
        result.visitId
          ? `/app/frontdesk/check-in?visit=${result.visitId}&patient=${result.patientId}`
          : `/app/frontdesk/patients/${result.patientId}`,
      );
      return;
    }
    case "check_in": {
      const patient = findSinglePatient(store, action.query);
      if (!patient) {
        toast("No matching patient found. Please check the UHID/phone and try again.", "error");
        router.push("/app/frontdesk/check-in");
        return;
      }
      const deptId = resolveDepartmentId(action.department ?? "", store.roster) ?? patient.departmentId ?? "dept_spine";
      const doctorId = resolveDoctorId(action.doctor ?? "", store.roster, deptId);
      if (!doctorId) {
        toast("Please add or select a doctor for this check-in.", "error");
        router.push("/app/frontdesk/check-in");
        return;
      }
      const data = { uhid: patient.uhid, department: deptId, doctor: doctorId };
      const result = await store.checkInVisit(data, action.visitId);
      if (!result.ok) {
        toast(result.error ?? "Check-in failed", "error");
        router.push("/app/frontdesk/check-in");
        return;
      }
      toast(`Checked in ${patient.name}`, "success");
      router.push(`/app/frontdesk/queue?visit=${result.visitId}&patient=${result.patientId}`);
      return;
    }
    case "process_billing": {
      const data = {
        ...action.data,
        paymentScope: String(action.data.paymentScope ?? "full"),
        amount: Number(action.data.amount ?? 0),
        collectedAmount: Number(action.data.collectedAmount ?? action.data.amount ?? 0),
        mode: String(action.data.mode ?? "cash"),
        customLine: String(action.data.customLine ?? ""),
        discount: Number(action.data.discount ?? 0),
      };
      const result = await store.processBilling(action.visitId, data);
      if (!result.ok) {
        toast(result.error ?? "Billing failed", "error");
        router.push("/app/frontdesk/billing");
        return;
      }
      toast(`Billing ${result.routingLabel} (${result.paymentMode})`, "success");
      router.push(`${result.routeHref}?visit=${result.visitId}`);
      return;
    }
    case "book_appointment": {
      const patient = findSinglePatient(store, action.patientQuery);
      if (!patient) {
        toast("No matching patient found for appointment.", "error");
        router.push("/app/frontdesk/appointments");
        return;
      }
      const deptId = resolveDepartmentId(action.department ?? "", store.roster) ?? "dept_spine";
      const doctorId = resolveDoctorId(action.doctor ?? "", store.roster, deptId);
      const data = {
        patient: patient.id,
        department: deptId,
        doctor: doctorId ?? "",
        date: action.date ?? new Date().toISOString().slice(0, 10),
        time: action.time ?? "",
        duration: action.duration ?? 20,
        notes: action.notes ?? "",
      };
      const result = await store.bookAppointment(data);
      if (result.error || !result.visitId) {
        toast(result.error ?? "Could not book appointment", "error");
        router.push("/app/frontdesk/appointments");
        return;
      }
      toast(`Appointment booked for ${patient.name}`, "success");
      router.push(`/app/frontdesk/appointments?visit=${result.visitId}&patient=${patient.id}`);
      return;
    }
    case "complete_junior_exam": {
      const result = await store.completeJuniorExam(action.visitId, action.data);
      if (!result.ok) {
        toast(result.error ?? "Junior exam failed", "error");
        router.push("/app/frontdesk/junior-exam");
        return;
      }
      toast("Junior exam completed", "success");
      router.push(`/app/frontdesk/junior-exam?visit=${action.visitId}`);
      return;
    }
    case "save_submission": {
      await store.saveSubmission(action.formId, action.data, { visitId: action.visitId });
      toast("Form saved", "success");
      return;
    }
    case "update_patient": {
      const patient = store.getPatient(action.patientId) ?? findSinglePatient(store, action.patientId);
      if (!patient) {
        toast("Patient not found", "error");
        router.push("/app/frontdesk/patients");
        return;
      }
      const data = normalizeRegisterPatientInput(action.data);
      const result = await store.updatePatientAsync(patient.id, data);
      if (!result.ok) {
        toast(result.error ?? "Update failed", "error");
        router.push(`/app/frontdesk/patients/${patient.id}`);
        return;
      }
      toast(`Updated ${patient.name}`, "success");
      router.push(`/app/frontdesk/patients/${patient.id}`);
      return;
    }
    case "cancel_appointment": {
      const result = await store.cancelAppointment(action.appointmentId);
      if (!result.ok) {
        toast(result.error ?? "Cancel failed", "error");
      } else {
        toast("Appointment cancelled", "success");
      }
      router.push("/app/frontdesk/appointments");
      return;
    }
    case "reschedule_appointment": {
      const input = {
        date: action.date,
        time: action.time,
        doctorId: action.doctor ? resolveDoctorId(action.doctor, store.roster) : undefined,
        departmentId: action.department ? resolveDepartmentId(action.department, store.roster) : undefined,
      };
      const result = await store.rescheduleAppointment(action.appointmentId, input);
      if (!result.ok) {
        toast(result.error ?? "Reschedule failed", "error");
      } else {
        toast("Appointment rescheduled", "success");
      }
      router.push("/app/frontdesk/appointments");
      return;
    }
    default:
      return;
  }
}

export function FrontdeskShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, signOut, setCommandOpen, commandOpen } = useSession();
  const { loading: sessionLoading } = useRequireClientSession();
  const { ready, error, refresh, ...store } = useFrontdeskStore();
  const { toast } = useToast();
  const [copilotOpen, setCopilotOpen] = useState(false);
  const settingsRef = useRef<HTMLButtonElement>(null);
  const current = getFrontdeskNavItem(pathname);
  const isDisplayBoard = pathname.startsWith("/app/frontdesk/display");

  useEffect(() => {
    if (sessionLoading || !session) return;
    if (session.role !== "frontdesk") router.replace(`/app/${session.role}`);
  }, [session, sessionLoading, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandOpen(!commandOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commandOpen, setCommandOpen]);

  const openSettings = useCallback(() => {
    settingsRef.current?.scrollIntoView({ block: "nearest" });
    settingsRef.current?.focus();
  }, []);

  const handleCopilotAction = useCallback(
    (action: CopilotAction) => {
      void handleFrontdeskAction(action, store, router, toast);
    },
    [store, router, toast],
  );

  if (sessionLoading || !session) return null;

  if (isDisplayBoard) {
    return (
      <div className="min-h-screen bg-[#0f172a] text-white" data-candela-app>
        <StoreGate ready={ready} error={error} onRetry={() => void refresh()}>
          {children}
        </StoreGate>
      </div>
    );
  }

  return (
    <div
      className="flex h-screen overflow-hidden bg-[var(--attio-canvas)] text-[var(--attio-text)]"
      data-candela-app
    >
      <WorkspaceSidebar
        branchName={session.branchName}
        userName={session.userName}
        copilotOpen={copilotOpen}
        settingsRef={settingsRef}
        onToggleCopilot={() => setCopilotOpen((o) => !o)}
        onOpenCommand={() => setCommandOpen(true)}
        onSignOut={() => { signOut(); router.push(WORKSPACE_SIGN_IN_PATH); }}
      />

      <div className="flex min-h-0 min-w-0 flex-1">
        <main className="scrollbar-none min-w-0 flex-1 overflow-y-auto">
          <StoreGate ready={ready} error={error} onRetry={() => void refresh()}>
            {children}
          </StoreGate>
        </main>
        <CopilotPanel
          open={copilotOpen}
          onClose={() => setCopilotOpen(false)}
          context={current.label}
          module="frontdesk"
          page={pathname}
          onAgentAction={handleCopilotAction}
        />
      </div>

      <FrontdeskCommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        onOpenSettings={openSettings}
      />
    </div>
  );
}
