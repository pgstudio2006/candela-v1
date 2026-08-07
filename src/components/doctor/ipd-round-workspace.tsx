"use client";

import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AttioButton, Panel, StatusBadge } from "@/components/frontdesk/ui";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { IpdRoundAiScribe } from "@/components/doctor/ipd-round-ai-scribe";
import { PrescriptionEditor } from "@/components/doctor/prescription-editor";
import { PublishedSchemaForm } from "@/components/candela/published-schema-form";
import { IpdDischargeSummaryPanel } from "@/components/ipd-discharge-summary";
import { useToast } from "@/components/ui/toast-provider";
import { useSession } from "@/components/candela/session-provider";
import { resolvePatientAge } from "@/lib/frontdesk-workflow";
import { getNurseOptionsAction, saveIpdTaskAction, updateIpdTaskStatusAction } from "@/app/actions/ipd-actions";
import { listPatientDocumentsAction, type PatientDocumentListItem } from "@/app/actions/patient-document-actions";
import { listActiveLabCatalogsAction, listPatientLabOrdersAction, generateLabReportPdfAction } from "@/app/actions/lab-actions";
import type { IpdPatient } from "@/design-system/doctor-data";
import type { LabReportCatalog } from "@/design-system/lab-data";
import type { Patient } from "@/design-system/frontdesk-data";
import type { PrescriptionLine } from "@/design-system/doctor-data";
import type { LabOrder } from "@/design-system/lab-data";
import type { IpdRoundRecord } from "@/server/doctor";
import type { FormSchema } from "@/design-system/frontdesk-schemas";
import {
  Activity,
  Calendar,
  Clock,
  FileText,
  FlaskConical,
  LogOut,
  Pill,
  Stethoscope,
  ClipboardList,
  User,
  UploadCloud,
  Eye,
  Printer,
} from "lucide-react";

const PATAUDI_BRANCH_ID = "branch_pataudi";

export type IpdRoundWorkspaceProps = {
  admission: IpdPatient;
  patient?: Patient;
  patientId?: string;
  visitId?: string;
  roundHistory: IpdRoundRecord[];
  schema: FormSchema;
  onSaveRound: (
    data: Record<string, string | number | boolean>,
    medicationLines?: PrescriptionLine[],
  ) => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
};

type VitalsSnapshot = { pulse?: string; bp?: string; spo2?: string; temp?: string };

function parseVitalsFromText(text: string): VitalsSnapshot {
  const normalized = text.replace(/\s+/g, " ");
  const bp = normalized.match(/(?:BP|blood pressure)\s*[:=-]?\s*(\d{2,3}\/\d{2,3})/i)?.[1];
  const pulse = normalized.match(/(?:pulse|P)\s*[:=-]?\s*(\d{2,3})(?:\s*bpm)?/i)?.[1];
  const spo2 = normalized.match(/(?:spo2|SpO2|sao2)\s*[:=-]?\s*(\d{2,3})(?:\s*%)?/i)?.[1];
  const temp = normalized.match(/(?:temp|temperature|T)\s*[:=-]?\s*([\d.]+)(?:\s*[FfCc])?/i)?.[1];
  return { pulse, bp, spo2, temp: temp ? `${temp}°F` : undefined };
}

function latestVitals(rounds: IpdRoundRecord[]): VitalsSnapshot {
  for (const round of rounds) {
    const v = parseVitalsFromText(round.content);
    if (v.pulse || v.bp || v.spo2 || v.temp) return v;
  }
  return {};
}

function parseMedicineLine(line: string): {
  drug?: string;
  dose?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
} {
  const clean = line.trim();
  if (!clean) return {};
  const match = clean.match(
    /^(.*?)\s*(?:[-–:])?\s*(\d+(?:\.\d+)?\s*(?:tab|tabs|cap|caps|ml|mg|g|units?|iu|drops?|inj|syrup|ointment|cream|gel|powder|puff|supp))?\s*(OD|BD|TDS|QID|SOS|HS|STAT)?\s*(?:x|for|×)?\s*(\d+\s*(?:day|days|d|week|weeks|w|month|months|m)?)?\s*(.*)$/i,
  );
  if (!match) return { drug: clean };
  return {
    drug: match[1]?.trim() || clean,
    dose: match[2]?.trim(),
    frequency: match[3]?.trim(),
    duration: match[4]?.trim(),
    instructions: match[5]?.trim(),
  };
}

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function daysSinceAdmission(admittedAt: string) {
  try {
    const start = new Date(admittedAt).getTime();
    const now = Date.now();
    return Math.max(1, Math.ceil((now - start) / (1000 * 60 * 60 * 24)));
  } catch {
    return 1;
  }
}

function latestPlan(rounds: IpdRoundRecord[]): string {
  for (const round of rounds) {
    const fromData = typeof round.data?.plan === "string" ? (round.data.plan as string) : "";
    if (fromData) return fromData;
    const match = round.content.match(/P:\s*(.+?)(?:\n|$)/i);
    if (match?.[1]) return match[1].trim();
  }
  return "Not documented";
}

function latestProgress(rounds: IpdRoundRecord[]): string {
  for (const round of rounds) {
    const fromData = typeof round.data?.progress === "string" ? (round.data.progress as string) : "";
    if (fromData) return fromData;
  }
  return "";
}

function extractMedicines(rounds: IpdRoundRecord[]): string[] {
  const chronological = [...rounds].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );
  const discontinued = new Set<string>();
  const active = new Map<string, string>();

  const collectDiscontinued = (source?: string) => {
    if (!source) return;
    source.split("\n").forEach((line) => {
      const drug = parseMedicineLine(line.trim()).drug?.trim().toLowerCase();
      if (drug) discontinued.add(drug);
    });
  };

  const processMedicineLines = (source?: string) => {
    if (!source) return;
    source.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const drug = parseMedicineLine(trimmed).drug?.trim().toLowerCase();
      if (!drug) return;
      if (discontinued.has(drug)) {
        active.delete(drug);
        return;
      }
      active.set(drug, trimmed);
    });
  };

  for (const round of chronological) {
    collectDiscontinued(
      typeof round.data?.discontinuedMedicines === "string"
        ? (round.data.discontinuedMedicines as string)
        : undefined,
    );
    const contentDiscontinued = round.content.match(
      /Discontinued medicines:\s*([\s\S]*?)(?:\n\n|$)/i,
    );
    if (contentDiscontinued?.[1]) collectDiscontinued(contentDiscontinued[1]);

    processMedicineLines(
      typeof round.data?.medicines === "string"
        ? (round.data.medicines as string)
        : undefined,
    );
    const contentMatch = round.content.match(/Medicines:\s*([\s\S]*?)(?:\n\n|$)/i);
    if (contentMatch?.[1]) processMedicineLines(contentMatch[1]);
  }

  return [...active.values()];
}

function extractLabs(rounds: IpdRoundRecord[]): string[] {
  const out = new Set<string>();
  for (const round of rounds) {
    const text = typeof round.data?.labReports === "string" ? (round.data.labReports as string) : "";
    if (text) {
      text.split("\n").forEach((line) => {
        const trimmed = line.trim();
        if (trimmed) out.add(trimmed);
      });
    }
    const contentMatch = round.content.match(/Lab reports:\s*([\s\S]*?)(?:\n\n|$)/i);
    if (contentMatch?.[1]) {
      contentMatch[1].split("\n").forEach((line) => {
        const trimmed = line.trim();
        if (trimmed) out.add(trimmed);
      });
    }
  }
  return [...out];
}

function extractImaging(rounds: IpdRoundRecord[]): string[] {
  const out = new Set<string>();
  for (const round of rounds) {
    const text = typeof round.data?.radiologyReports === "string" ? (round.data.radiologyReports as string) : "";
    if (text) {
      text.split("\n").forEach((line) => {
        const trimmed = line.trim();
        if (trimmed) out.add(trimmed);
      });
    }
    const contentMatch = round.content.match(/Radiology reports:\s*([\s\S]*?)(?:\n\n|$)/i);
    if (contentMatch?.[1]) {
      contentMatch[1].split("\n").forEach((line) => {
        const trimmed = line.trim();
        if (trimmed) out.add(trimmed);
      });
    }
  }
  return [...out];
}

function extractProcedures(rounds: IpdRoundRecord[]): string[] {
  const out = new Set<string>();
  for (const round of rounds) {
    const text = typeof round.data?.nextProcedure === "string" ? (round.data.nextProcedure as string) : "";
    if (text) out.add(text);
    const contentMatch = round.content.match(/Next procedure:\s*(.+?)(?:\n|$)/i);
    if (contentMatch?.[1]) out.add(contentMatch[1].trim());
  }
  return [...out];
}

function extractTasks(rounds: IpdRoundRecord[]): Array<{
  id: string;
  text: string;
  assignee: string;
  status: "pending" | "completed";
  at: string;
}> {
  return rounds
    .filter((r) => r.kind === "task")
    .map((r) => ({
      id: r.id,
      text: r.content,
      assignee: typeof r.data?.assignee === "string" ? (r.data.assignee as string) : "",
      status: (r.data?.status === "completed" ? "completed" : "pending") as "pending" | "completed",
      at: r.at,
    }))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

function VitalCard({
  label,
  value,
  unit,
  icon,
}: {
  label: string;
  value?: string | number;
  unit?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--attio-border-subtle)] bg-white p-4">
      <div className="flex size-10 items-center justify-center rounded-lg bg-[var(--attio-surface)] text-[var(--attio-accent)]">{icon}</div>
      <div>
        <p className="text-[11px] uppercase text-[var(--attio-text-tertiary)]">{label}</p>
        <p className="text-[18px] font-semibold leading-tight text-[var(--attio-text)]">
          {value ?? "—"}
          {unit && value ? <span className="ml-1 text-[12px] font-normal text-[var(--attio-text-tertiary)]">{unit}</span> : null}
        </p>
      </div>
    </div>
  );
}

export function IpdRoundWorkspace({
  admission,
  patient,
  patientId,
  visitId,
  roundHistory,
  schema,
  onSaveRound,
  onRefresh,
}: IpdRoundWorkspaceProps) {
  const { toast } = useToast();
  const { session } = useSession();
  const isPataudi = session?.branchId === PATAUDI_BRANCH_ID;
  const [activeTab, setActiveTab] = useState("summary");
  const [roundValues, setRoundValues] = useState<Record<string, string | number | boolean>>({});
  const [roundFormKey, setRoundFormKey] = useState(0);

  const [taskText, setTaskText] = useState("");
  const [taskAssignee, setTaskAssignee] = useState("");
  const [taskAssigneeName, setTaskAssigneeName] = useState("");
  const [taskSaving, setTaskSaving] = useState(false);
  const [nurseOptions, setNurseOptions] = useState<Array<{ id: string; name: string }>>([]);

  const [medicationLines, setMedicationLines] = useState<PrescriptionLine[]>([]);
  const [radiologyOrderText, setRadiologyOrderText] = useState("");
  const [orderSaving, setOrderSaving] = useState(false);

  const [labCatalogs, setLabCatalogs] = useState<LabReportCatalog[]>([]);
  const [labCatalogsLoading, setLabCatalogsLoading] = useState(false);
  const [labCatalogSearch, setLabCatalogSearch] = useState("");
  const [selectedLabCatalogs, setSelectedLabCatalogs] = useState<LabReportCatalog[]>([]);

  const [patientReports, setPatientReports] = useState<PatientDocumentListItem[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [labOrders, setLabOrders] = useState<LabOrder[]>([]);
  const [labOrdersLoading, setLabOrdersLoading] = useState(false);
  const [openingOrderId, setOpeningOrderId] = useState<string | null>(null);

  const vitals = useMemo(() => latestVitals(roundHistory), [roundHistory]);
  const doctorRounds = useMemo(
    () => roundHistory.filter((r) => r.kind === "doctor_round").sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()),
    [roundHistory],
  );
  const nurseRounds = useMemo(
    () =>
      roundHistory
        .filter((r) => r.actorRole === "nurse" || r.kind === "nurse_round" || r.kind === "nurse_vitals" || r.kind === "nurse_note")
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()),
    [roundHistory],
  );
  const medicines = useMemo(() => extractMedicines(roundHistory), [roundHistory]);
  const labs = useMemo(() => extractLabs(roundHistory), [roundHistory]);
  const imaging = useMemo(() => extractImaging(roundHistory), [roundHistory]);
  const procedures = useMemo(() => extractProcedures(roundHistory), [roundHistory]);
  const tasks = useMemo(() => extractTasks(roundHistory), [roundHistory]);
  const statusVariant = admission.status === "discharge_planned" ? "warning" : "info";

  // Live sync with nurse vitals / rounds
  useEffect(() => {
    const id = window.setInterval(() => {
      void onRefresh();
    }, 10_000);
    return () => window.clearInterval(id);
  }, [onRefresh]);

  // Load branch nurses for task assignment
  useEffect(() => {
    void getNurseOptionsAction().then((res) => {
      if (res.ok && res.data) setNurseOptions(res.data);
    });
  }, []);

  // Load active lab catalogs for predefined selection
  useEffect(() => {
    const load = async () => {
      setLabCatalogsLoading(true);
      const res = await listActiveLabCatalogsAction();
      if (res.ok) setLabCatalogs(res.data ?? []);
      setLabCatalogsLoading(false);
    };
    void load();
  }, []);

  // Load frontdesk-uploaded patient reports
  const loadReports = async () => {
    if (!patientId) return;
    setReportsLoading(true);
    const [report, lab, radiology] = await Promise.all([
      listPatientDocumentsAction(patientId, "report"),
      listPatientDocumentsAction(patientId, "lab_report"),
      listPatientDocumentsAction(patientId, "radiology_report"),
    ]);
    const all = [
      ...(report.ok ? report.data : []),
      ...(lab.ok ? lab.data : []),
      ...(radiology.ok ? radiology.data : []),
    ].sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    setPatientReports(all);
    setReportsLoading(false);
  };

  const loadLabOrders = async () => {
    if (!patientId) return;
    setLabOrdersLoading(true);
    const res = await listPatientLabOrdersAction(patientId);
    if (res.ok) {
      setLabOrders(res.data.filter((o) => !admission.id || o.admissionId === admission.id));
    } else {
      toast(res.error ?? "Failed to load lab orders", "error");
    }
    setLabOrdersLoading(false);
  };

  const handleViewLabReport = async (order: LabOrder) => {
    if (order.status !== "completed") {
      toast(`Report not available — order is ${order.status.replace("_", " ")}`, "default");
      return;
    }
    setOpeningOrderId(order.id);
    try {
      const res = await generateLabReportPdfAction(order.id, null);
      if (res.ok && res.data?.dataUrl) {
        const win = window.open(res.data.dataUrl, "_blank", "noopener,noreferrer");
        if (!win) toast("Could not open report. Please allow pop-ups.", "error");
      } else if (!res.ok) {
        toast(res.error ?? "Failed to generate report", "error");
      } else {
        toast("Report not available", "error");
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to open report", "error");
    } finally {
      setOpeningOrderId(null);
    }
  };

  useEffect(() => {
    void loadReports();
    void loadLabOrders();
  }, [patientId]);

  const handleSaveRound = async (data: Record<string, string | number | boolean>) => {
    await onSaveRound(data);
    setRoundValues({});
    setRoundFormKey((k) => k + 1);
  };

  const formatMedicinesText = (lines: PrescriptionLine[]) =>
    lines
      .filter((l) => l.drug.trim())
      .map((l) => {
        const parts = [l.drug, l.dose, l.frequency, l.days ? `× ${l.days} days` : "", l.duration, l.instructions].filter(Boolean);
        return parts.join(" - ").replace(/\s+/g, " ").trim();
      })
      .join("\n");

  const addMedicationOrder = async () => {
    const lines = medicationLines.filter((l) => l.drug.trim());
    if (!lines.length) return toast("Add at least one medicine", "error");
    setOrderSaving(true);
    await onSaveRound({ medicines: formatMedicinesText(lines) }, lines);
    toast("Medication ordered and sent to pharmacy", "success");
    setMedicationLines([]);
    setOrderSaving(false);
    await onRefresh();
  };

  const handleDiscontinueMedicine = async (med: string) => {
    if (!confirm(`Discontinue ${parseMedicineLine(med).drug || med}?`)) return;
    setOrderSaving(true);
    await onSaveRound({ discontinuedMedicines: med });
    toast("Medication discontinued", "success");
    setOrderSaving(false);
    await onRefresh();
  };

  const filteredLabCatalogs = useMemo(
    () =>
      labCatalogs.filter(
        (c) =>
          c.name.toLowerCase().includes(labCatalogSearch.toLowerCase()) ||
          c.code.toLowerCase().includes(labCatalogSearch.toLowerCase()),
      ),
    [labCatalogs, labCatalogSearch],
  );

  const toggleLabCatalog = (catalog: LabReportCatalog) => {
    setSelectedLabCatalogs((prev) => {
      if (prev.some((c) => c.id === catalog.id)) {
        return prev.filter((c) => c.id !== catalog.id);
      }
      return [...prev, catalog];
    });
  };

  const addLabOrder = async () => {
    if (selectedLabCatalogs.length === 0) return toast("Select at least one lab test", "error");
    setOrderSaving(true);
    const names = selectedLabCatalogs.map((c) => c.name).join("\n");
    await onSaveRound({ labReports: names });
    toast("Lab order added", "success");
    setSelectedLabCatalogs([]);
    setOrderSaving(false);
    await onRefresh();
  };

  const addRadiologyOrder = async () => {
    if (!radiologyOrderText.trim()) return toast("Enter a radiology order", "error");
    setOrderSaving(true);
    await onSaveRound({ radiologyReports: radiologyOrderText.trim() });
    toast("Radiology order added", "success");
    setRadiologyOrderText("");
    setOrderSaving(false);
    await onRefresh();
  };

  const addTask = async () => {
    if (!taskText.trim()) return toast("Enter a task description", "error");
    setTaskSaving(true);
    const res = await saveIpdTaskAction(admission.id, {
      text: taskText.trim(),
      assignee: taskAssigneeName.trim() || undefined,
      visitId,
      assignedToNurseId: taskAssignee || undefined,
      assignedToNurseName: taskAssigneeName || undefined,
    });
    if (res.ok) {
      toast("Task assigned to nurse", "success");
      setTaskText("");
      setTaskAssignee("");
      setTaskAssigneeName("");
      await onRefresh();
    } else {
      toast((res as { error?: string }).error ?? "Failed to save task", "error");
    }
    setTaskSaving(false);
  };

  const toggleTask = async (taskId: string, current: "pending" | "completed") => {
    const next = current === "pending" ? "completed" : "pending";
    const res = await updateIpdTaskStatusAction(taskId, next);
    if (res.ok) {
      toast(next === "completed" ? "Task completed" : "Task reopened", "success");
      await onRefresh();
    } else {
      toast((res as { error?: string }).error ?? "Failed to update task", "error");
    }
  };

  const printRoundSummary = () => {
    const printWindow = window.open("", "_blank", "width=800,height=600");
    if (!printWindow) return;
    const html = `
      <html>
        <head>
          <title>IPD Round Summary - ${patientName}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
            .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 16px; }
            .header h2 { margin: 0; font-size: 18px; }
            .header p { margin: 4px 0 0; font-size: 12px; color: #444; }
            .section { margin-bottom: 16px; }
            .section-title { font-weight: bold; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-bottom: 8px; font-size: 14px; }
            .row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; }
            .vitals { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
            .vital { border: 1px solid #ccc; padding: 8px; text-align: center; font-size: 12px; }
            ul { margin: 0; padding-left: 16px; font-size: 12px; }
            li { margin-bottom: 2px; }
            .footer { margin-top: 24px; font-size: 11px; color: #555; text-align: right; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>IPD Round Summary</h2>
            <p>${patientName} · ${wardBed} · ${statusLabel} · UHID: ${uhid ?? "—"}</p>
          </div>
          <div class="vitals">
            <div class="vital"><strong>BP</strong><br/>${vitals.bp ?? "—"}</div>
            <div class="vital"><strong>Pulse</strong><br/>${vitals.pulse ?? "—"}</div>
            <div class="vital"><strong>SpO₂</strong><br/>${vitals.spo2 ?? "—"}</div>
            <div class="vital"><strong>Temp</strong><br/>${vitals.temp ?? "—"}</div>
          </div>
          <div class="section">
            <div class="section-title">Diagnosis</div>
            <p style="font-size:12px;margin:0">${admission.diagnosis}</p>
          </div>
          <div class="section">
            <div class="section-title">Current Plan</div>
            <p style="font-size:12px;margin:0">${latestPlan(roundHistory)}</p>
          </div>
          <div class="section">
            <div class="section-title">Progress Notes</div>
            <ul>
              ${doctorRounds.slice(0, 5).map((r) => `<li><strong>${formatDateTime(r.at)}</strong> — ${r.content.replace(/</g, "&lt;")}</li>`).join("")}
            </ul>
          </div>
          <div class="section">
            <div class="section-title">Medication Chart</div>
            <ul>
              ${medicines.map((m) => `<li>${m.replace(/</g, "&lt;")}</li>`).join("") || "<li>No medications</li>"}
            </ul>
          </div>
          <div class="section">
            <div class="section-title">Lab Orders</div>
            <ul>
              ${labs.map((l) => `<li>${l.replace(/</g, "&lt;")}</li>`).join("") || "<li>No lab orders</li>"}
            </ul>
          </div>
          <div class="section">
            <div class="section-title">Imaging Orders</div>
            <ul>
              ${imaging.map((i) => `<li>${i.replace(/</g, "&lt;")}</li>`).join("") || "<li>No imaging orders</li>"}
            </ul>
          </div>
          <div class="section">
            <div class="section-title">Tasks</div>
            <ul>
              ${tasks.map((t) => `<li>${t.text.replace(/</g, "&lt;")} · ${t.assignee || "Unassigned"} · ${t.status}</li>`).join("") || "<li>No tasks</li>"}
            </ul>
          </div>
          <div class="footer">Printed on ${new Date().toLocaleString("en-IN")}</div>
        </body>
      </html>
    `;
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  const patientName = patient?.name ?? admission.patientId;
  const uhid = patient?.uhid;
  const ageGender = patient ? `${resolvePatientAge(patient.age, patient.dateOfBirth) || "—"}y · ${patient.gender}` : "";
  const wardBed = `${admission.ward} · Bed ${admission.bed}`;
  const statusLabel = admission.status.replace(/_/g, " ");

  const TABS = [
    { id: "summary", label: "Summary", icon: <User className="size-3.5" /> },
    { id: "progress", label: "Progress Notes", icon: <FileText className="size-3.5" /> },
    { id: "orders", label: "Orders", icon: <Stethoscope className="size-3.5" /> },
    { id: "medication", label: "Medication Chart", icon: <Pill className="size-3.5" /> },
    { id: "labs", label: "Labs & Reports", icon: <FlaskConical className="size-3.5" /> },
    { id: "tasks", label: "Tasks", icon: <ClipboardList className="size-3.5" /> },
    { id: "discharge", label: "Discharge", icon: <LogOut className="size-3.5" /> },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-xl border border-[var(--attio-border-subtle)] bg-white p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[18px] font-semibold text-[var(--attio-text)]">{patientName}</h1>
              <StatusBadge label={statusLabel} variant={statusVariant} />
            </div>
            <p className="mt-1 text-[13px] text-[var(--attio-text-secondary)]">
              {wardBed} · Day {daysSinceAdmission(admission.admittedAt)} · {ageGender}
              {uhid ? ` · UHID: ${uhid}` : ""}
            </p>
            {admission.lastRoundAt && (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-[var(--attio-text-tertiary)]">
                <Clock className="size-3" />
                Last doctor round: {formatDateTime(admission.lastRoundAt)}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex min-w-[160px] flex-col rounded-lg border border-[var(--attio-border-subtle)] bg-[var(--attio-surface)] px-3 py-2">
              <span className="text-[10px] uppercase text-[var(--attio-text-tertiary)]">Admission diagnosis</span>
              <span className="text-[13px] font-medium text-[var(--attio-text)]">{admission.diagnosis}</span>
            </div>
            <div className="flex min-w-[120px] flex-col rounded-lg border border-[var(--attio-border-subtle)] bg-[var(--attio-surface)] px-3 py-2">
              <span className="text-[10px] uppercase text-[var(--attio-text-tertiary)]">Admitted</span>
              <span className="text-[13px] font-medium text-[var(--attio-text)]">{formatDateTime(admission.admittedAt)}</span>
            </div>
            {isPataudi && (
              <AttioButton variant="secondary" className="gap-1.5" onClick={() => void printRoundSummary()}>
                <Printer className="size-4" />
                Print round summary
              </AttioButton>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <VitalCard label="Pulse" value={vitals.pulse} unit="bpm" icon={<Activity className="size-5" />} />
          <VitalCard label="BP" value={vitals.bp} unit="mmHg" icon={<Stethoscope className="size-5" />} />
          <VitalCard label="SpO₂" value={vitals.spo2} unit="%" icon={<Activity className="size-5" />} />
          <VitalCard label="Temp" value={vitals.temp} icon={<Activity className="size-5" />} />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList variant="line" className="w-full justify-start">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="gap-1.5 text-[13px]">
              {tab.icon}
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="summary" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <Panel title="Patient summary">
              <div className="divide-y divide-[var(--attio-border-subtle)]">
                <SummaryRow label="Diagnosis" value={admission.diagnosis} />
                <SummaryRow label="Admission date" value={formatDateTime(admission.admittedAt)} />
                <SummaryRow label="Current treatment plan" value={latestPlan(roundHistory)} />
                <SummaryRow label="Allergies" value="None documented" />
                <SummaryRow label="Comorbidities" value="None documented" />
                <SummaryRow
                  label="Latest vitals snapshot"
                  value={
                    vitals.pulse || vitals.bp || vitals.spo2 || vitals.temp
                      ? [vitals.bp, vitals.pulse, vitals.spo2, vitals.temp].filter(Boolean).join(" · ")
                      : "Not recorded"
                  }
                />
              </div>
            </Panel>

            <Panel title="Vitals and nursing data">
              <div className="space-y-3">
                {nurseRounds.length === 0 && doctorRounds.length === 0 && (
                  <p className="text-[13px] text-[var(--attio-text-tertiary)]">No vitals or nursing entries yet.</p>
                )}
                {(nurseRounds.length ? nurseRounds : doctorRounds).slice(0, 5).map((round) => {
                  const v = parseVitalsFromText(round.content);
                  return (
                    <div key={round.id} className="rounded-lg border border-[var(--attio-border-subtle)] bg-[var(--attio-surface)] p-3">
                      <div className="mb-1 flex items-center justify-between text-[11px]">
                        <span className="font-medium text-[var(--attio-text)]">
                          {round.actorName} · {round.actorRole}
                        </span>
                        <span className="text-[var(--attio-text-tertiary)]">{formatDateTime(round.at)}</span>
                      </div>
                      <p className="text-[12px] text-[var(--attio-text-secondary)]">
                        {(v.pulse || v.bp || v.spo2 || v.temp) ? (
                          <>
                            BP {v.bp ?? "—"} · Pulse {v.pulse ?? "—"} · SpO₂ {v.spo2 ?? "—"}% · Temp {v.temp ?? "—"}
                          </>
                        ) : (
                          "No structured vitals"
                        )}
                      </p>
                      <pre className="mt-2 whitespace-pre-wrap font-sans text-[11px] text-[var(--attio-text-secondary)]">{round.content}</pre>
                    </div>
                  );
                })}
              </div>
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="progress" className="mt-4 space-y-4">
          <Panel title="AI Scribe — daily progress note">
            <IpdRoundAiScribe
              patientContext={`${patientName} · ${wardBed} · ${admission.diagnosis}`}
              previousRounds={doctorRounds.map((r) => ({ content: r.content, at: r.at, actorName: r.actorName }))}
              onDraftAccepted={(draft) => {
                setRoundValues({ ...draft });
                setRoundFormKey((k) => k + 1);
              }}
            />
          </Panel>

          <Panel title="Add daily progress note (SOAP)">
            <PublishedSchemaForm
              key={`ipd-${admission.id}-${roundFormKey}`}
              schema={schema}
              initialValues={roundValues}
              submitLabel="Save SOAP note"
              onValuesChange={setRoundValues}
              onSubmit={handleSaveRound}
            />
          </Panel>

          <Panel title="Progress notes history">
            {doctorRounds.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-[var(--attio-text-tertiary)]">No progress notes recorded yet.</p>
            ) : (
              <ul className="divide-y divide-[var(--attio-border-subtle)]">
                {doctorRounds.map((round) => (
                  <li key={round.id} className="py-4">
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="font-medium text-[var(--attio-text)]">{round.actorName}</span>
                      <span className="rounded-full border border-[var(--attio-border-subtle)] px-1.5 py-0.5 text-[10px] uppercase text-[var(--attio-text-tertiary)]">
                        {round.actorRole}
                      </span>
                      <span className="text-[var(--attio-text-tertiary)]">{formatDateTime(round.at)}</span>
                    </div>
                    <pre className="whitespace-pre-wrap font-sans text-[12px] text-[var(--attio-text-secondary)]">{round.content}</pre>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="orders" className="mt-4 space-y-4">
          <Panel title="Medication order">
            <p className="mb-3 text-[12px] text-[var(--attio-text-secondary)]">
              Add medicines like a consultation prescription. On ordering, the prescription is pushed to the pharmacy and appears in the Medication Chart.
            </p>
            <PrescriptionEditor lines={medicationLines} onChange={setMedicationLines} />
            <div className="mt-3 flex justify-end">
              <AttioButton onClick={() => void addMedicationOrder()} disabled={orderSaving} variant="primary">
                {orderSaving ? "Ordering…" : "Order medications & send to pharmacy"}
              </AttioButton>
            </div>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Lab order">
              <p className="mb-2 text-[12px] text-[var(--attio-text-secondary)]">
                Select predefined lab reports from the catalog. The round note becomes the lab order source and is matched to the IPD cart.
              </p>
              <Input
                type="text"
                placeholder="Search lab tests…"
                value={labCatalogSearch}
                onChange={(e) => setLabCatalogSearch(e.target.value)}
                className="h-8 text-[12px]"
              />
              <div className="mt-2 max-h-[180px] overflow-y-auto rounded border border-[var(--attio-border-subtle)] p-2">
                {labCatalogsLoading ? (
                  <p className="text-[12px] text-[var(--attio-text-tertiary)]">Loading catalogs…</p>
                ) : filteredLabCatalogs.length === 0 ? (
                  <p className="text-[12px] text-[var(--attio-text-tertiary)]">No lab tests match.</p>
                ) : (
                  <div className="space-y-1">
                    {filteredLabCatalogs.map((c) => {
                      const checked = selectedLabCatalogs.some((s) => s.id === c.id);
                      return (
                        <label
                          key={c.id}
                          className={`flex items-center gap-2 rounded p-2 text-[13px] ${
                            checked
                              ? "border border-[var(--attio-accent)] bg-[var(--attio-accent)]/5"
                              : "border border-transparent"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleLabCatalog(c)}
                          />
                          <span className="font-medium">{c.name}</span>
                          <span className="text-[var(--attio-text-tertiary)]">({c.code})</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
              {selectedLabCatalogs.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {selectedLabCatalogs.map((c) => (
                    <span
                      key={c.id}
                      className="rounded bg-blue-100 px-2 py-0.5 text-[11px] text-blue-700"
                    >
                      {c.name}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-3 flex justify-end">
                <AttioButton onClick={() => void addLabOrder()} disabled={orderSaving || selectedLabCatalogs.length === 0}>
                  {orderSaving ? "Adding…" : "Add lab order"}
                </AttioButton>
              </div>
            </Panel>
            <Panel title="Radiology order">
              <Textarea
                value={radiologyOrderText}
                onChange={(e) => setRadiologyOrderText(e.target.value)}
                placeholder="e.g. Chest X-ray PA view, ultrasound abdomen…"
                className="min-h-[80px] text-[13px]"
              />
              <div className="mt-3 flex justify-end">
                <AttioButton onClick={() => void addRadiologyOrder()} disabled={orderSaving}>
                  {orderSaving ? "Adding…" : "Add radiology order"}
                </AttioButton>
              </div>
            </Panel>
          </div>

          <Panel title="Current order summary">
            <div className="grid gap-4 sm:grid-cols-2">
              <OrderSection title="Current medication orders" items={medicines} icon={<Pill className="size-4" />} />
              <OrderSection title="Lab orders" items={labs} icon={<FlaskConical className="size-4" />} />
              <OrderSection title="Imaging orders" items={imaging} icon={<Stethoscope className="size-4" />} />
              <OrderSection title="Procedure & diet instructions" items={procedures} icon={<ClipboardList className="size-4" />} />
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="medication" className="mt-4">
          <Panel title="Active medications">
            {medicines.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-[var(--attio-text-tertiary)]">No medication chart entries yet.</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {medicines.map((med, i) => {
                  const parsed = parseMedicineLine(med);
                  return (
                    <li key={i} className="rounded-lg border border-[var(--attio-border-subtle)] bg-[var(--attio-surface)] p-3">
                      <div className="mb-2 flex items-center justify-between gap-2 text-[13px] font-medium text-[var(--attio-text)]">
                        <div className="flex items-center gap-2">
                          <Pill className="size-4 text-[var(--attio-accent)]" />
                          {parsed.drug || med}
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleDiscontinueMedicine(med)}
                          disabled={orderSaving}
                          className="text-[11px] font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                          title="Discontinue"
                        >
                          Discontinue
                        </button>
                      </div>
                      {parsed.drug && (
                        <div className="grid grid-cols-2 gap-2 text-[12px] text-[var(--attio-text-secondary)]">
                          {parsed.dose && <div><span className="text-[var(--attio-text-tertiary)]">Dose:</span> {parsed.dose}</div>}
                          {parsed.frequency && <div><span className="text-[var(--attio-text-tertiary)]">Frequency:</span> {parsed.frequency}</div>}
                          {parsed.duration && <div><span className="text-[var(--attio-text-tertiary)]">Duration:</span> {parsed.duration}</div>}
                          {parsed.instructions && <div className="col-span-2"><span className="text-[var(--attio-text-tertiary)]">Instructions:</span> {parsed.instructions}</div>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="labs" className="mt-4 space-y-4">
          <Panel title="Lab orders">
            {labs.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-[var(--attio-text-tertiary)]">No lab orders yet.</p>
            ) : (
              <ul className="divide-y divide-[var(--attio-border-subtle)]">
                {labs.map((lab, i) => (
                  <li key={i} className="flex items-start gap-3 py-3 text-[13px]">
                    <FlaskConical className="mt-0.5 size-4 text-[var(--attio-accent)]" />
                    <span className="text-[var(--attio-text)]">{lab}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Radiology orders">
            {imaging.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-[var(--attio-text-tertiary)]">No imaging orders yet.</p>
            ) : (
              <ul className="divide-y divide-[var(--attio-border-subtle)]">
                {imaging.map((img, i) => (
                  <li key={i} className="flex items-start gap-3 py-3 text-[13px]">
                    <Stethoscope className="mt-0.5 size-4 text-[var(--attio-accent)]" />
                    <span className="text-[var(--attio-text)]">{img}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel
            title="Lab order results"
            action={
              patientId ? (
                <AttioButton variant="secondary" className="h-7 gap-1.5 text-[11px]" onClick={() => void loadLabOrders()} disabled={labOrdersLoading}>
                  <FlaskConical className="size-3.5" />
                  {labOrdersLoading ? "Loading…" : "Refresh"}
                </AttioButton>
              ) : undefined
            }
          >
            {labOrdersLoading ? (
              <p className="py-8 text-center text-[13px] text-[var(--attio-text-tertiary)]">Loading lab orders…</p>
            ) : labOrders.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-[var(--attio-text-tertiary)]">No lab orders found for this admission.</p>
            ) : (
              <ul className="divide-y divide-[var(--attio-border-subtle)]">
                {labOrders.map((order) => (
                  <li key={order.id} className="py-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[13px] font-medium text-[var(--attio-text)]">
                        {new Date(order.orderedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </p>
                      <div className="flex items-center gap-2">
                        <StatusBadge label={order.status} variant={order.status === "completed" ? "success" : "neutral"} />
                        {order.status === "completed" ? (
                          <AttioButton
                            variant="secondary"
                            className="h-7 gap-1.5 text-[11px]"
                            onClick={() => void handleViewLabReport(order)}
                            disabled={openingOrderId === order.id}
                          >
                            <Eye className="size-3.5" />
                            {openingOrderId === order.id ? "Opening…" : "View report"}
                          </AttioButton>
                        ) : (
                          <span className="text-[11px] text-[var(--attio-text-tertiary)]">Report not available</span>
                        )}
                      </div>
                    </div>
                    <p className="text-[11px] text-[var(--attio-text-tertiary)]">
                      {order.items.map((i) => i.label).join(" · ")}
                    </p>
                    {order.status === "completed" && order.items.some((i) => i.results.length > 0) && (
                      <ul className="mt-2 space-y-1">
                        {order.items.flatMap((item) =>
                          item.results.map((r) => (
                            <li key={`${item.id}_${r.fieldMasterId ?? r.id}`} className="text-[12px]">
                              <span className="font-medium">{r.fieldMaster?.name ?? r.fieldMasterId}</span>: {r.value}
                              {r.fieldMaster?.unit ? ` ${r.fieldMaster.unit}` : ""}
                              {r.flag && r.flag !== "normal" && (
                                <span className="ml-1 text-[10px] text-amber-600">({r.flag})</span>
                              )}
                            </li>
                          )),
                        )}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Uploaded reports"
            action={
              patientId ? (
                <AttioButton variant="secondary" className="h-7 gap-1.5 text-[11px]" onClick={() => void loadReports()} disabled={reportsLoading}>
                  <UploadCloud className="size-3.5" />
                  {reportsLoading ? "Loading…" : "Refresh"}
                </AttioButton>
              ) : undefined
            }
          >
            {patientReports.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-[var(--attio-text-tertiary)]">
                No uploaded lab or radiology reports yet. Front desk uploads will appear here.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--attio-border-subtle)]">
                {patientReports.map((doc) => (
                  <li key={doc.id} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-[var(--attio-text)] truncate">{doc.label || doc.fileName}</p>
                      <p className="text-[11px] text-[var(--attio-text-tertiary)]">
                        {doc.fileName} · {doc.category} · {new Date(doc.uploadedAt).toLocaleString("en-IN")}
                        {doc.uploadedBy ? ` · by ${doc.uploadedBy}` : ""}
                      </p>
                    </div>
                    {doc.fileUrl ? (
                      <a
                        href={doc.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-[var(--attio-border)] bg-white px-2 text-[12px] font-medium hover:bg-[var(--attio-surface)]"
                      >
                        <Eye className="size-3.5" />
                        View
                      </a>
                    ) : (
                      <span className="text-[11px] text-[var(--attio-text-tertiary)]">File unavailable</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="tasks" className="mt-4 space-y-4">
          <Panel title="Task and follow-up">
            <div className="grid gap-3 sm:grid-cols-[1fr_180px_120px]">
              <div className="space-y-1">
                <label className="text-[12px] text-[var(--attio-text-tertiary)]">Task for nursing</label>
                <Input value={taskText} onChange={(e) => setTaskText(e.target.value)} placeholder="e.g. Repeat ECG at 2 PM" className="h-9 text-[13px]" />
              </div>
              <div className="space-y-1">
                <label className="text-[12px] text-[var(--attio-text-tertiary)]">Assign to ward nurse</label>
                <select
                  value={taskAssignee}
                  onChange={(e) => {
                    const id = e.target.value;
                    setTaskAssignee(id);
                    setTaskAssigneeName(nurseOptions.find((n) => n.id === id)?.name ?? "");
                  }}
                  className="h-9 w-full rounded-lg border border-[var(--attio-border)] bg-white px-2 text-[13px]"
                >
                  <option value="">Select nurse</option>
                  {nurseOptions.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <AttioButton onClick={() => void addTask()} disabled={taskSaving || !taskText.trim()} className="w-full">
                  {taskSaving ? "Assigning…" : "Assign task"}
                </AttioButton>
              </div>
            </div>
          </Panel>

          <Panel title="Current tasks">
            {tasks.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-[var(--attio-text-tertiary)]">No tasks assigned yet.</p>
            ) : (
              <ul className="divide-y divide-[var(--attio-border-subtle)]">
                {tasks.map((task) => (
                  <li key={task.id} className="flex items-start justify-between gap-3 py-3">
                    <div>
                      <p className="text-[13px] text-[var(--attio-text)]">{task.text}</p>
                      <p className="text-[11px] text-[var(--attio-text-tertiary)]">
                        {task.assignee ? `${task.assignee} · ` : ""}
                        {formatDateTime(task.at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge label={task.status} variant={task.status === "completed" ? "success" : "warning"} />
                      <AttioButton
                        variant="secondary"
                        className="h-7 text-[11px]"
                        onClick={() => void toggleTask(task.id, task.status)}
                      >
                        {task.status === "pending" ? "Mark completed" : "Reopen"}
                      </AttioButton>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="discharge" className="mt-4">
          <IpdDischargeSummaryPanel admissionId={admission.id} onSaved={() => onRefresh()} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-4">
      <span className="min-w-[180px] text-[11px] uppercase text-[var(--attio-text-tertiary)]">{label}</span>
      <span className="text-[13px] font-medium text-[var(--attio-text)]">{value ?? "—"}</span>
    </div>
  );
}

function OrderSection({ title, items, icon }: { title: string; items: string[]; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--attio-border-subtle)] bg-[var(--attio-surface)] p-3">
      <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-[var(--attio-text)]">
        {icon}
        {title}
      </div>
      {items.length === 0 ? (
        <p className="text-[12px] text-[var(--attio-text-tertiary)]">None recorded</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item, i) => (
            <li key={i} className="text-[12px] text-[var(--attio-text-secondary)]">
              · {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
