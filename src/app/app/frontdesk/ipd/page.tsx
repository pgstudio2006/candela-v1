"use client";

import {
  admitPatientAction,
  generateDeathSummaryAction,
  generateDischargeSummaryAction,
  getIpdAdmissionAction,
  getIpdSnapshotAction,
  saveDeathSummaryAction,
  saveDischargeSummaryAction,
  transferIpdAdmissionAction,
  updateIpdAdmissionAction,
} from "@/app/actions/ipd-actions";
import { getPatientInvoicesAction } from "@/app/actions/clinical-actions";
import { listDocumentTemplatesAction } from "@/app/actions/doctor-actions";
import { useSession } from "@/components/candela/session-provider";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, MetricStrip, Panel, StatusBadge } from "@/components/frontdesk/ui";
import { PatientSearchField } from "@/components/frontdesk/patient-search-field";
import { IpdServiceCartPanel } from "@/components/frontdesk/ipd-service-cart-panel";
import { IpdWalletPanel } from "@/components/frontdesk/ipd-wallet-panel";
import { IpdRefundPanel } from "@/components/frontdesk/ipd-refund-panel";
import { IpdFinalBillModal } from "@/components/frontdesk/ipd-final-bill-modal";
import { useToast } from "@/components/ui/toast-provider";
import type { IpdAdmissionDetail, IpdAdmissionStatus, IpdBillingMode, IpdSnapshot } from "@/design-system/ipd-data";
import type { DocumentTemplate } from "@/design-system/document-templates";
import { cn } from "@/lib/utils";
import { printPdfBytes } from "@/lib/invoice-pdf";
import {
  generateIpdDischargeSummaryPdf,
  generateIpdFileStickerPdf,
  generateIpdOverviewPdf,
  generateIpdRoomPlatePdf,
} from "@/lib/ipd-template-pdf";

type DischargeSummaryPayload = {
  admissionDate: string;
  dischargeDate: string;
  diagnosis: string;
  procedures: string;
  medications: string;
  followUp: string;
  notes: string;
  preparedBy: string;
  preparedAt: string;
};

type DeathSummaryPayload = {
  admissionDate: string;
  deathDate: string;
  diagnosis: string;
  causeOfDeath: string;
  contributingConditions: string;
  procedures: string;
  medications: string;
  notes: string;
  preparedBy: string;
  preparedAt: string;
};
import { ArrowRightLeft, BedDouble, Calendar, FileText, Loader2, Pencil, Plus, Printer, Receipt, RefreshCcw, Sparkles, Stethoscope, User, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

const PATAUDI_BRANCH_ID = "branch_pataudi";

export default function FrontdeskIpdPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { session } = useSession();
  const isPataudi = session?.branchId === PATAUDI_BRANCH_ID;
  const [snapshot, setSnapshot] = useState<IpdSnapshot | null>(null);
  const [selectedBed, setSelectedBed] = useState<{ wardId: string; bedId: string } | null>(null);
  const [selectedAdmission, setSelectedAdmission] = useState<IpdAdmissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<"admit" | "edit" | "transfer" | null>(null);
  const [summaryDialog, setSummaryDialog] = useState<"discharge" | "death" | null>(null);
  const [summaryDraft, setSummaryDraft] = useState<DischargeSummaryPayload | DeathSummaryPayload | null>(null);
  const [summaryGenerating, setSummaryGenerating] = useState(false);
  const [summarySaving, setSummarySaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [ipdTab, setIpdTab] = useState<"services" | "advance" | "refund">("services");
  const [finalBillOpen, setFinalBillOpen] = useState(false);
  const [documentTemplates, setDocumentTemplates] = useState<DocumentTemplate[]>([]);

  const refreshAdmission = useCallback(async () => {
    if (!selectedAdmission) return;
    const res = await getIpdAdmissionAction(selectedAdmission.id);
    if (res.ok) setSelectedAdmission(res.data);
    setRefreshKey((k) => k + 1);
  }, [selectedAdmission]);

  const load = useCallback(async () => {
    const result = await getIpdSnapshotAction();
    if (result.ok) {
      setSnapshot(result.data);
    } else {
      toast((result as any).error ?? "Failed to load IPD snapshot", "error");
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (!isPataudi) return;
    void listDocumentTemplatesAction().then((result) => {
      if (result.ok) setDocumentTemplates(result.data);
    });
  }, [isPataudi]);

  useEffect(() => {
    if (selectedBed?.bedId) {
      const ward = snapshot?.wards.find((w) => w.wardId === selectedBed.wardId);
      const bed = ward?.beds.find((b) => b.id === selectedBed.bedId);
      if (bed?.admission) {
        void getIpdAdmissionAction(bed.admission.id).then((res) => {
          if (res.ok) setSelectedAdmission(res.data);
        });
      } else {
        setSelectedAdmission(null);
      }
    }
  }, [selectedBed, snapshot]);

  useEffect(() => {
    if (!selectedAdmission) {
      setPatientInvoices([]);
      return;
    }
    let cancelled = false;
    void getPatientInvoicesAction(selectedAdmission.patientId).then((result) => {
      if (cancelled) return;
      if (result.ok && result.data) setPatientInvoices(result.data.invoices);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedAdmission]);

  const metrics = useMemo(() => {
    if (!snapshot) return [];
    return [
      { label: "Total beds", value: String(snapshot.totalBeds), delta: "", trend: "neutral" as const },
      { label: "Occupied", value: String(snapshot.occupiedBeds), delta: "", trend: "neutral" as const },
      { label: "Free beds", value: String(snapshot.freeBeds), delta: "", trend: "neutral" as const },
    ];
  }, [snapshot]);

  const [selectedPatient, setSelectedPatient] = useState<NonNullable<IpdSnapshot>["patients"][number] | null>(null);
  const [admitWardId, setAdmitWardId] = useState(selectedBed?.wardId ?? (snapshot?.wards[0]?.wardId ?? ""));
  const [transferWardId, setTransferWardId] = useState("");
  const [transferBedId, setTransferBedId] = useState("");
  const [patientInvoices, setPatientInvoices] = useState<Extract<Awaited<ReturnType<typeof getPatientInvoicesAction>>, { ok: true }>["data"]["invoices"]>([]);

  useEffect(() => {
    setAdmitWardId(selectedBed?.wardId ?? (snapshot?.wards[0]?.wardId ?? ""));
    setSelectedPatient(null);
  }, [selectedBed, dialog, snapshot?.wards]);

  useEffect(() => {
    if (dialog === "transfer" && selectedAdmission) {
      setTransferWardId("");
      setTransferBedId("");
    }
  }, [dialog, selectedAdmission]);

  const handleAdmit = async (formData: FormData) => {
    const patientId = formData.get("patientId") as string;
    const doctorId = formData.get("doctorId") as string;
    const departmentId = formData.get("departmentId") as string;
    const diagnosis = formData.get("diagnosis") as string;
    const wardId = formData.get("wardId") as string;
    const bedId = formData.get("bedId") as string;
    const expectedDischarge = formData.get("expectedDischarge") as string;

    const result = await admitPatientAction({
      patientId,
      doctorId,
      departmentId,
      diagnosis,
      wardId,
      bed: bedId,
      expectedDischarge: expectedDischarge || undefined,
    });

    if (result.ok) {
      toast("Patient admitted successfully", "success");
      setDialog(null);
      setSelectedPatient(null);
      setRefreshKey((k) => k + 1);
    } else {
      toast((result as any).error ?? "Admission failed", "error");
    }
  };

  const handleUpdate = async (formData: FormData) => {
    if (!selectedAdmission) return;
    const status = formData.get("status") as IpdAdmissionStatus;
    if (status === "discharged") {
      const confirmed = window.confirm("This will discharge the patient and free the bed. Continue?");
      if (!confirmed) return;
    }
    const expectedDischarge = formData.get("expectedDischarge") as string;
    const result = await updateIpdAdmissionAction(selectedAdmission.id, {
      status,
      expectedDischarge: expectedDischarge || undefined,
    });
    if (result.ok) {
      toast("Admission updated", "success");
      setDialog(null);
      setRefreshKey((k) => k + 1);
      const updated = await getIpdAdmissionAction(selectedAdmission.id);
      if (updated.ok) setSelectedAdmission(updated.data);
    } else {
      toast((result as any).error ?? "Update failed", "error");
    }
  };

  const handleTransfer = async (formData: FormData) => {
    if (!selectedAdmission) return;
    const wardId = formData.get("transferWardId") as string;
    const bedId = formData.get("transferBedId") as string;
    if (!wardId || !bedId) return toast("Select a target ward and bed", "error");
    const result = await transferIpdAdmissionAction(selectedAdmission.id, { wardId, bedId });
    if (result.ok) {
      toast("Patient transferred", "success");
      setDialog(null);
      setTransferWardId("");
      setTransferBedId("");
      setRefreshKey((k) => k + 1);
    } else {
      toast((result as any).error ?? "Transfer failed", "error");
    }
  };

  const handleFinalDischarge = async () => {
    if (!selectedAdmission) return;
    if (!paymentClear) {
      const blockedReason = (selectedAdmission.cart?.length ?? 0) > 0
        ? "Final discharge is blocked until the service cart is empty."
        : "Final discharge is blocked until the IPD bill is cleared.";
      toast(blockedReason, "error");
      return;
    }
    const confirmed = window.confirm("This will discharge the patient and free the bed. Continue?");
    if (!confirmed) return;
    const result = await updateIpdAdmissionAction(selectedAdmission.id, { status: "discharged" });
    if (result.ok) {
      toast("Patient discharged and bed freed", "success");
      setDialog(null);
      const res = await getIpdAdmissionAction(selectedAdmission.id);
      if (res.ok) setSelectedAdmission(res.data);
      setRefreshKey((k) => k + 1);
    } else {
      toast((result as any).error ?? "Discharge failed", "error");
    }
  };

  const printDischargeSummary = async () => {
    if (!selectedAdmission?.dischargeSummary) return;
    try {
      const bytes = await generateIpdDischargeSummaryPdf(
        selectedAdmission,
        selectedAdmission.dischargeSummary as Record<string, string>,
        documentTemplates.find((template) => template.kind === "discharge_summary" && template.isDefault),
      );
      printPdfBytes(bytes, "Discharge Summary");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not generate discharge summary", "error");
    }
  };
  const printDeathSummary = () => {
    if (!selectedAdmission?.deathSummary) return;
    const summary = selectedAdmission.deathSummary as Record<string, string>;
    const printTime = new Date().toISOString();
    const printWindow = window.open("", "_blank");
    if (!printWindow) return toast("Could not open print window", "error");
    printWindow.document.write(`
      <html>
        <head><title>Death Summary - ${selectedAdmission.patientName}</title>
          <style>body{font-family:system-ui,sans-serif;padding:24px;color:#111;}h1{font-size:18px;margin:0 0 8px;}.meta{color:#555;font-size:12px;margin-bottom:16px;}.section{margin-bottom:12px;}.label{font-weight:600;font-size:12px;color:#444;}.value{font-size:12px;white-space:pre-wrap;}</style>
        </head>
        <body>
          <h1>Death Summary</h1>
          <div class="meta">${selectedAdmission.patientName} · ${selectedAdmission.uhid ?? ""} · ${selectedAdmission.ward} Bed ${selectedAdmission.bed}</div>
          <div class="section"><div class="label">Admission date</div><div class="value">${summary.admissionDate ?? ""}</div></div>
          <div class="section"><div class="label">Death date</div><div class="value">${printTime}</div></div>
          <div class="section"><div class="label">Diagnosis</div><div class="value">${summary.diagnosis ?? ""}</div></div>
          <div class="section"><div class="label">Cause of death</div><div class="value">${summary.causeOfDeath ?? ""}</div></div>
          <div class="section"><div class="label">Contributing conditions</div><div class="value">${summary.contributingConditions ?? ""}</div></div>
          <div class="section"><div class="label">Procedures</div><div class="value">${summary.procedures ?? ""}</div></div>
          <div class="section"><div class="label">Medications</div><div class="value">${summary.medications ?? ""}</div></div>
          <div class="section"><div class="label">Notes</div><div class="value">${summary.notes ?? ""}</div></div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  const escapeHtml = (value: string | number | null | undefined) => {
    const s = String(value ?? "");
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  const printFileStickers = async () => {
    if (!selectedAdmission) return;
    try {
      const bytes = await generateIpdFileStickerPdf(
        selectedAdmission,
        documentTemplates.find((template) => template.kind === "file_sticker" && template.isDefault),
      );
      printPdfBytes(bytes, "Patient File Stickers");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not generate file stickers", "error");
    }
  };
  const printRoomPlate = async () => {
    if (!selectedAdmission) return;
    try {
      const bytes = await generateIpdRoomPlatePdf(
        selectedAdmission,
        documentTemplates.find((template) => template.kind === "room_plate" && template.isDefault),
      );
      printPdfBytes(bytes, "Patient Room Plate");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not generate room plate", "error");
    }
  };
  const printIpdFileOverview = async () => {
    if (!selectedAdmission) return;
    try {
      const bytes = await generateIpdOverviewPdf(
        selectedAdmission,
        documentTemplates.find((template) => template.kind === "ipd_overview" && template.isDefault),
      );
      printPdfBytes(bytes, "IPD Patient Overview");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not generate IPD overview", "error");
    }
  };
  const openSummaryEditor = (type: "discharge" | "death") => {
    if (!selectedAdmission) return;
    if (type === "discharge") {
      const existing = (selectedAdmission.dischargeSummary as DischargeSummaryPayload | null) ?? null;
      setSummaryDraft(
        existing ?? {
          admissionDate: selectedAdmission.admittedAt,
          dischargeDate: new Date().toISOString(),
          diagnosis: selectedAdmission.diagnosis ?? "",
          procedures: "",
          medications: "",
          followUp: "",
          notes: "",
          preparedBy: session?.userName ?? "Frontdesk",
          preparedAt: new Date().toISOString(),
        },
      );
    } else {
      const existing = (selectedAdmission.deathSummary as DeathSummaryPayload | null) ?? null;
      setSummaryDraft(
        existing ?? {
          admissionDate: selectedAdmission.admittedAt,
          deathDate: new Date().toISOString(),
          diagnosis: selectedAdmission.diagnosis ?? "",
          causeOfDeath: "",
          contributingConditions: "",
          procedures: "",
          medications: "",
          notes: "",
          preparedBy: session?.userName ?? "Frontdesk",
          preparedAt: new Date().toISOString(),
        },
      );
    }
    setSummaryDialog(type);
  };

  const handleGenerateDischargeSummary = async () => {
    if (!selectedAdmission) return;
    setSummaryGenerating(true);
    try {
      const res = await generateDischargeSummaryAction(selectedAdmission.id);
      if (res.ok && res.data) {
        setSummaryDraft(res.data);
        setSummaryDialog("discharge");
      } else {
        toast((res as any).error ?? "Failed to generate summary", "error");
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Generation failed", "error");
    } finally {
      setSummaryGenerating(false);
    }
  };

  const handleSaveDischargeSummary = async () => {
    if (!selectedAdmission || !summaryDraft || summaryDialog !== "discharge") return;
    setSummarySaving(true);
    try {
      const res = await saveDischargeSummaryAction(selectedAdmission.id, summaryDraft as DischargeSummaryPayload);
      if (res.ok) {
        toast("Discharge summary saved", "success");
        setSummaryDialog(null);
        void refreshAdmission();
      } else {
        toast((res as any).error ?? "Failed to save summary", "error");
      }
    } finally {
      setSummarySaving(false);
    }
  };

  const handleGenerateDeathSummary = async () => {
    if (!selectedAdmission) return;
    setSummaryGenerating(true);
    try {
      const res = await generateDeathSummaryAction(selectedAdmission.id);
      if (res.ok && res.data) {
        setSummaryDraft(res.data);
        setSummaryDialog("death");
      } else {
        toast((res as any).error ?? "Failed to generate summary", "error");
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Generation failed", "error");
    } finally {
      setSummaryGenerating(false);
    }
  };

  const handleSaveDeathSummary = async () => {
    if (!selectedAdmission || !summaryDraft || summaryDialog !== "death") return;
    setSummarySaving(true);
    try {
      const res = await saveDeathSummaryAction(selectedAdmission.id, summaryDraft as DeathSummaryPayload);
      if (res.ok) {
        toast("Death summary saved", "success");
        setSummaryDialog(null);
        void refreshAdmission();
      } else {
        toast((res as any).error ?? "Failed to save summary", "error");
      }
    } finally {
      setSummarySaving(false);
    }
  };

  const invoiceBalance = patientInvoices.reduce((sum, inv) => sum + (inv.balanceAmount ?? 0), 0);
  const invoiceTotal = patientInvoices.reduce((sum, inv) => sum + (inv.totalAmount ?? 0), 0);
  const invoicePaid = patientInvoices.reduce((sum, inv) => sum + (inv.amountPaid ?? 0), 0);
  const isPostpaidAdmission = selectedAdmission?.billingMode === "postpaid";
  const hasFinalInvoice = Boolean(selectedAdmission?.finalInvoiceId);
  const paymentClear =
    selectedAdmission &&
    (selectedAdmission.cart?.length ?? 0) === 0 &&
    (!isPataudi || hasFinalInvoice) &&
    (isPostpaidAdmission ||
      ((selectedAdmission.balanceDue ?? 0) <= 0 &&
        (selectedAdmission.amountPaid ?? 0) >= (selectedAdmission.billAmount ?? 0) &&
        invoiceBalance <= 0 &&
        invoicePaid >= invoiceTotal));

  const selectedWard = snapshot?.wards.find((w) => w.wardId === admitWardId);
  const transferWard = snapshot?.wards.find((w) => w.wardId === transferWardId);

  return (
    <PageChrome
      breadcrumbs={[
        { label: "Front Desk", href: "/app/frontdesk" },
        { label: "IPD" },
      ]}
      title="Inpatient ward"
      meta="Bed map · admissions · live occupancy"
      actions={
        <AttioButton variant="primary" className="gap-1.5" onClick={() => setDialog("admit")}>
          <Plus className="size-3.5" />
          Admit patient
        </AttioButton>
      }
    >
      {loading && !snapshot ? (
        <div className="flex items-center gap-2 py-12 text-[13px] text-[var(--attio-text-tertiary)]">
          <Loader2 className="size-4 animate-spin" />
          Loading IPD snapshot…
        </div>
      ) : (
        <>
          <MetricStrip metrics={metrics} />

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
            <div className="space-y-4">
              {snapshot?.wards.map((ward) => (
                <Panel key={ward.wardId} title={ward.ward}>
                  <div className="flex flex-wrap gap-2">
                    {ward.beds.map((bed) => {
                      const isSelected = selectedBed?.wardId === ward.wardId && selectedBed?.bedId === bed.id;
                      return (
                        <button
                          key={bed.id}
                          type="button"
                          onClick={() => setSelectedBed({ wardId: ward.wardId, bedId: bed.id })}
                          className={cn(
                            "flex min-w-[110px] flex-col gap-1 rounded-lg border px-3 py-2 text-left transition-colors",
                            bed.occupied
                              ? "border-amber-200 bg-amber-50"
                              : "border-emerald-200 bg-emerald-50",
                            isSelected && "ring-2 ring-[var(--attio-accent)]",
                          )}
                        >
                          <span className="flex items-center gap-1.5 text-[12px] font-medium">
                            <BedDouble className="size-3.5" />
                            {bed.label}
                          </span>
                          <span className="text-[11px] text-[var(--attio-text-secondary)]">
                            {bed.occupied ? (
                              <span className="flex items-center gap-1">
                                <span className="size-1.5 rounded-full bg-amber-500" />
                                {bed.admission?.patientName ?? "Occupied"}
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-emerald-600">
                                <span className="size-1.5 rounded-full bg-emerald-500" />
                                Free
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </Panel>
              ))}
            </div>

            <div className="space-y-4">
              {selectedBed ? (
                <>
                  <Panel title="Bed details">
                    {selectedAdmission ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <User className="size-4 text-[var(--attio-accent)]" />
                          <div>
                            <p className="text-[13px] font-medium">{selectedAdmission.patientName}</p>
                            <p className="text-[11px] text-[var(--attio-text-tertiary)]">{selectedAdmission.uhid ?? "—"}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[12px]">
                          <div className="rounded-md bg-[var(--attio-surface)] p-2">
                            <p className="text-[10px] uppercase text-[var(--attio-text-tertiary)]">Doctor</p>
                            <p className="mt-0.5 font-medium">{selectedAdmission.doctorName}</p>
                          </div>
                          <div className="rounded-md bg-[var(--attio-surface)] p-2">
                            <p className="text-[10px] uppercase text-[var(--attio-text-tertiary)]">Status</p>
                            <p className="mt-0.5 font-medium capitalize">{selectedAdmission.status.replace("_", " ")}</p>
                          </div>
                          <div className="rounded-md bg-[var(--attio-surface)] p-2">
                            <p className="text-[10px] uppercase text-[var(--attio-text-tertiary)]">Patient type</p>
                            <p className="mt-0.5 font-medium capitalize">{selectedAdmission.patientType}</p>
                          </div>
                          <div className="rounded-md bg-[var(--attio-surface)] p-2">
                            <p className="text-[10px] uppercase text-[var(--attio-text-tertiary)]">Billing</p>
                            <p className="mt-0.5 font-medium capitalize">{selectedAdmission.billingMode}</p>
                          </div>
                        </div>
                        <div className="rounded-md bg-[var(--attio-surface)] p-2 text-[12px]">
                          <p className="text-[10px] uppercase text-[var(--attio-text-tertiary)]">Diagnosis</p>
                          <p className="mt-0.5">{selectedAdmission.diagnosis}</p>
                        </div>
                        {selectedAdmission.expectedDischarge && (
                          <div className="flex items-center gap-1.5 text-[12px] text-[var(--attio-text-secondary)]">
                            <Calendar className="size-3.5" />
                            Expected discharge: {selectedAdmission.expectedDischarge}
                          </div>
                        )}
                        <div className="flex gap-2 pt-1">
                          <AttioButton variant="secondary" className="gap-1.5" onClick={() => setDialog("edit")}>
                            <Pencil className="size-3.5" />
                            Edit
                          </AttioButton>
                          <AttioButton variant="secondary" className="gap-1.5" onClick={() => setDialog("transfer")}>
                            <ArrowRightLeft className="size-3.5" />
                            Transfer
                          </AttioButton>
                          <AttioButton
                            variant="secondary"
                            className="gap-1.5"
                            onClick={() => router.push(`/app/frontdesk/patients/${selectedAdmission.patientId}`)}
                          >
                            <Stethoscope className="size-3.5" />
                            Profile
                          </AttioButton>
                        </div>

                        {isPataudi && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            <AttioButton variant="secondary" className="!h-7 !text-[11px] gap-1" onClick={() => void printFileStickers()}>
                              <Printer className="size-3" />
                              File stickers
                            </AttioButton>
                            <AttioButton variant="secondary" className="!h-7 !text-[11px] gap-1" onClick={() => void printRoomPlate()}>
                              <Printer className="size-3" />
                              Room plate
                            </AttioButton>
                            <AttioButton variant="secondary" className="!h-7 !text-[11px] gap-1" onClick={() => void printIpdFileOverview()}>
                              <Printer className="size-3" />
                              IPD file
                            </AttioButton>
                          </div>
                        )}

                        {selectedAdmission.status === "discharged" && (
                          <StatusBadge label="Discharged" variant="success" />
                        )}

                        {isPataudi && selectedAdmission.status !== "discharged" && selectedAdmission.status !== "deceased" && (
                          <div className="space-y-3 rounded-lg border border-[var(--attio-border-subtle)] p-3">
                            <p className="text-[12px] font-medium">Discharge summary</p>
                            <div className="flex flex-wrap gap-2">
                              <AttioButton variant="secondary" className="!h-7 !text-[11px] gap-1" onClick={() => void handleGenerateDischargeSummary()} disabled={summaryGenerating}>
                                <Sparkles className="size-3" />
                                {summaryGenerating ? "Generating..." : "Generate with AI"}
                              </AttioButton>
                              <AttioButton variant="secondary" className="!h-7 !text-[11px] gap-1" onClick={() => openSummaryEditor("discharge")}>
                                <FileText className="size-3" />
                                Edit
                              </AttioButton>
                              {Boolean(selectedAdmission.dischargeSummary) && (
                                <AttioButton variant="secondary" className="!h-7 !text-[11px] gap-1" onClick={printDischargeSummary}>
                                  <Printer className="size-3" />
                                  Print
                                </AttioButton>
                              )}
                            </div>
                          </div>
                        )}

                        {isPataudi && selectedAdmission.status !== "discharged" && selectedAdmission.status !== "deceased" && (
                          <div className="space-y-3 rounded-lg border border-[var(--attio-border-subtle)] p-3">
                            <p className="text-[12px] font-medium">Death summary</p>
                            <div className="flex flex-wrap gap-2">
                              <AttioButton variant="secondary" className="!h-7 !text-[11px] gap-1" onClick={() => void handleGenerateDeathSummary()} disabled={summaryGenerating}>
                                <Sparkles className="size-3" />
                                {summaryGenerating ? "Generating..." : "Generate with AI"}
                              </AttioButton>
                              <AttioButton variant="secondary" className="!h-7 !text-[11px] gap-1" onClick={() => openSummaryEditor("death")}>
                                <FileText className="size-3" />
                                Edit
                              </AttioButton>
                              {Boolean(selectedAdmission.deathSummary) && (
                                <AttioButton variant="secondary" className="!h-7 !text-[11px] gap-1" onClick={printDeathSummary}>
                                  <Printer className="size-3" />
                                  Print
                                </AttioButton>
                              )}
                            </div>
                          </div>
                        )}

                        {!isPataudi && Boolean(selectedAdmission.dischargeSummary) && selectedAdmission.status !== "discharged" && (
                          <AttioButton variant="secondary" className="gap-1.5" onClick={printDischargeSummary}>
                            <Printer className="size-3.5" />
                            Print discharge summary
                          </AttioButton>
                        )}

                        {(isPataudi
                          ? selectedAdmission.status !== "discharged" && selectedAdmission.status !== "deceased"
                          : selectedAdmission.status === "doctor_ready") && (
                          <div className="space-y-2">
                            <AttioButton
                              variant="primary"
                              className="w-full"
                              onClick={handleFinalDischarge}
                              disabled={!paymentClear}
                            >
                              Final discharge & free bed
                            </AttioButton>
                            {!paymentClear && (
                              <p className="text-[11px] text-amber-600">
                                Final discharge is blocked until payment is cleared and the service cart is empty.
                              </p>
                            )}
                          </div>
                        )}

                        {!isPataudi && selectedAdmission.status !== "doctor_ready" && selectedAdmission.status !== "discharged" && (
                          <p className="text-[11px] text-[var(--attio-text-tertiary)]">
                            Waiting for doctor to fill the discharge summary and mark ready for discharge.
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-[13px] text-[var(--attio-text-secondary)]">
                          Bed {selectedBed.bedId} is free.
                        </p>
                        <AttioButton variant="primary" onClick={() => setDialog("admit")}>
                          <Plus className="mr-1.5 size-3.5" />
                          Admit here
                        </AttioButton>
                      </div>
                    )}
                  </Panel>

                  {selectedAdmission && (
                    <Panel title="Clinical summary">
                      <div className="space-y-2 text-[12px]">
                        <p className="text-[var(--attio-text-secondary)]">
                          <span className="text-[var(--attio-text-tertiary)]">Admitted on:</span>{" "}
                          {selectedAdmission.admittedAt}
                        </p>
                        <p className="text-[var(--attio-text-secondary)]">
                          <span className="text-[var(--attio-text-tertiary)]">Ward:</span>{" "}
                          {selectedAdmission.ward} · Bed {selectedAdmission.bed}
                        </p>
                        {selectedAdmission.lastRoundNote && (
                          <div className="rounded-md bg-[var(--attio-surface)] p-2">
                            <p className="text-[10px] uppercase text-[var(--attio-text-tertiary)]">Last round</p>
                            <p className="mt-1 whitespace-pre-wrap">{selectedAdmission.lastRoundNote}</p>
                          </div>
                        )}
                      </div>
                    </Panel>
                  )}

                  {selectedAdmission && (
                    <>
                      <div className="flex items-center gap-1 rounded-lg border border-[var(--attio-border)] p-1">
                        {[
                          { id: "services", label: "Services", icon: Receipt },
                          ...(isPataudi
                            ? [
                                { id: "advance", label: "Advance", icon: Wallet },
                                { id: "refund", label: "Refund", icon: RefreshCcw },
                              ]
                            : []),
                        ].map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setIpdTab(t.id as typeof ipdTab)}
                            className={cn(
                              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors",
                              ipdTab === t.id
                                ? "bg-[var(--attio-text)] text-white"
                                : "text-[var(--attio-text-secondary)] hover:bg-[var(--attio-surface)]",
                            )}
                          >
                            <t.icon className="size-3.5" />
                            {t.label}
                          </button>
                        ))}
                      </div>

                      {ipdTab === "services" && (
                        <IpdServiceCartPanel
                          admission={selectedAdmission}
                          onChange={() => void refreshAdmission()}
                          onGenerateFinalBill={() => setFinalBillOpen(true)}
                        />
                      )}

                      {ipdTab === "advance" && <IpdWalletPanel admission={selectedAdmission} onChange={() => void refreshAdmission()} />}

                      {ipdTab === "refund" && <IpdRefundPanel admission={selectedAdmission} onChange={() => void refreshAdmission()} />}

                      {finalBillOpen && (
                        <IpdFinalBillModal
                          admission={selectedAdmission}
                          onClose={() => setFinalBillOpen(false)}
                          onGenerated={() => void refreshAdmission()}
                        />
                      )}
                    </>
                  )}
                </>
              ) : (
                <Panel title="Select a bed">
                  <p className="py-8 text-center text-[13px] text-[var(--attio-text-tertiary)]">
                    Click any bed on the map to view details or admit a patient.
                  </p>
                </Panel>
              )}
            </div>
          </div>
        </>
      )}

      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg overflow-hidden rounded-xl border border-[var(--attio-border)] bg-white shadow-xl">
            <div className="border-b border-[var(--attio-border-subtle)] px-4 py-3">
              <h3 className="text-[15px] font-semibold">
                {dialog === "admit" ? "Admit patient" : dialog === "transfer" ? "Transfer patient" : "Update admission"}
              </h3>
            </div>
            <form
              action={dialog === "admit" ? handleAdmit : dialog === "transfer" ? handleTransfer : handleUpdate}
              className="max-h-[80vh] overflow-y-auto p-4"
            >
              {dialog === "admit" ? (
                <div className="space-y-3">
                  <label className="block text-[12px]">
                    <span className="mb-1 block text-[var(--attio-text-tertiary)]">Patient</span>
                    <PatientSearchField
                      value={selectedPatient?.uhid ?? ""}
                      patients={snapshot?.patients ?? []}
                      placeholder="Search registered patient by name, UHID or phone"
                      onChange={(_, patient) => {
                        if (patient) setSelectedPatient(patient);
                      }}
                    />
                    <input type="hidden" name="patientId" value={selectedPatient?.id ?? ""} />
                    {!selectedPatient && <p className="mt-1 text-[11px] text-amber-600">Select a registered patient to admit.</p>}
                  </label>
                  <label className="block text-[12px]">
                    <span className="mb-1 block text-[var(--attio-text-tertiary)]">Attending doctor</span>
                    <select name="doctorId" required className="h-9 w-full rounded-lg border border-[var(--attio-border)] bg-white px-3" defaultValue="">
                      <option value="">Select doctor</option>
                      {snapshot?.doctors.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-[12px]">
                    <span className="mb-1 block text-[var(--attio-text-tertiary)]">Department</span>
                    <select name="departmentId" required className="h-9 w-full rounded-lg border border-[var(--attio-border)] bg-white px-3" defaultValue="">
                      <option value="">Select department</option>
                      {snapshot?.departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-[12px]">
                    <span className="mb-1 block text-[var(--attio-text-tertiary)]">Diagnosis</span>
                    <input
                      name="diagnosis"
                      type="text"
                      required
                      placeholder="e.g. Total knee replacement"
                      className="h-9 w-full rounded-lg border border-[var(--attio-border)] px-3"
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-[12px]">
                      <span className="mb-1 block text-[var(--attio-text-tertiary)]">Ward</span>
                      <select
                        name="wardId"
                        value={admitWardId}
                        onChange={(e) => setAdmitWardId(e.target.value)}
                        className="h-9 w-full rounded-lg border border-[var(--attio-border)] bg-white px-3"
                      >
                        {snapshot?.wards.map((w) => (
                          <option key={w.wardId} value={w.wardId}>
                            {w.ward}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-[12px]">
                      <span className="mb-1 block text-[var(--attio-text-tertiary)]">Bed</span>
                      <select
                        name="bedId"
                        defaultValue={selectedBed?.bedId}
                        className="h-9 w-full rounded-lg border border-[var(--attio-border)] bg-white px-3"
                      >
                        {selectedWard?.beds.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="block text-[12px]">
                    <span className="mb-1 block text-[var(--attio-text-tertiary)]">Expected discharge</span>
                    <input
                      name="expectedDischarge"
                      type="date"
                      className="h-9 w-full rounded-lg border border-[var(--attio-border)] px-3"
                    />
                  </label>
                </div>
              ) : dialog === "transfer" ? (
                <div className="space-y-3">
                  <p className="text-[13px] text-[var(--attio-text-secondary)]">
                    Transfer {selectedAdmission?.patientName} to a new ward and bed.
                  </p>
                  <label className="block text-[12px]">
                    <span className="mb-1 block text-[var(--attio-text-tertiary)]">Target ward</span>
                    <select
                      name="transferWardId"
                      value={transferWardId}
                      onChange={(e) => {
                        setTransferWardId(e.target.value);
                        setTransferBedId("");
                      }}
                      required
                      className="h-9 w-full rounded-lg border border-[var(--attio-border)] bg-white px-3"
                    >
                      <option value="">Select ward</option>
                      {snapshot?.wards.map((w) => (
                        <option key={w.wardId} value={w.wardId}>
                          {w.ward}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-[12px]">
                    <span className="mb-1 block text-[var(--attio-text-tertiary)]">Target bed</span>
                    <select
                      name="transferBedId"
                      value={transferBedId}
                      onChange={(e) => setTransferBedId(e.target.value)}
                      required
                      className="h-9 w-full rounded-lg border border-[var(--attio-border)] bg-white px-3"
                    >
                      <option value="">Select bed</option>
                      {transferWard?.beds
                        .filter((b) => !b.occupied || b.id === selectedBed?.bedId)
                        .map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.label}
                          </option>
                        ))}
                    </select>
                    {transferWardId && transferWard?.beds.every((b) => b.occupied && b.id !== selectedBed?.bedId) && (
                      <p className="mt-1 text-[11px] text-amber-600">No free beds in this ward.</p>
                    )}
                  </label>
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="block text-[12px]">
                    <span className="mb-1 block text-[var(--attio-text-tertiary)]">Status</span>
                    <select
                      name="status"
                      defaultValue={selectedAdmission?.status ?? "admitted"}
                      className="h-9 w-full rounded-lg border border-[var(--attio-border)] bg-white px-3"
                    >
                      <option value="admitted">Admitted</option>
                      <option value="discharge_planned">Discharge planned</option>
                      <option value="discharged">Discharged</option>
                    </select>
                  </label>
                  <label className="block text-[12px]">
                    <span className="mb-1 block text-[var(--attio-text-tertiary)]">Expected discharge</span>
                    <input
                      name="expectedDischarge"
                      type="date"
                      defaultValue={selectedAdmission?.expectedDischarge ?? ""}
                      className="h-9 w-full rounded-lg border border-[var(--attio-border)] px-3"
                    />
                  </label>
                  {selectedAdmission?.status !== "discharged" && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <p className="text-[12px] font-medium text-amber-900">Direct discharge</p>
                      <p className="text-[11px] text-amber-800">
                        Discharge the patient now and free the bed. Service cart must be empty; billing must be cleared for prepaid admissions.
                      </p>
                      <AttioButton
                        type="button"
                        variant="primary"
                        className="mt-2 w-full bg-red-600 text-white hover:bg-red-700"
                        onClick={handleFinalDischarge}
                        disabled={!paymentClear}
                      >
                        Discharge patient
                      </AttioButton>
                      {!paymentClear && (
                        <p className="mt-1 text-[11px] text-amber-600">
                          {(selectedAdmission?.cart?.length ?? 0) > 0
                            ? "Discharge is blocked until the service cart is empty."
                            : "Discharge is blocked until the IPD bill is cleared."}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-5 flex justify-end gap-2">
                <AttioButton type="button" variant="secondary" onClick={() => setDialog(null)}>
                  Cancel
                </AttioButton>
                <AttioButton type="submit" variant="primary">
                  {dialog === "admit" ? "Admit" : dialog === "transfer" ? "Transfer" : "Save"}
                </AttioButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {summaryDialog && summaryDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-[var(--attio-border)] bg-white shadow-xl">
            <div className="border-b border-[var(--attio-border-subtle)] px-4 py-3">
              <h3 className="text-[15px] font-semibold">
                {summaryDialog === "discharge" ? "Discharge summary" : "Death summary"}
              </h3>
            </div>
            <div className="max-h-[80vh] space-y-3 overflow-y-auto p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-[12px]">
                  <span className="mb-1 block text-[var(--attio-text-tertiary)]">Admission date</span>
                  <input
                    type="datetime-local"
                    className="h-9 w-full rounded-lg border border-[var(--attio-border)] px-3 text-[13px]"
                    value={summaryDraft.admissionDate.slice(0, 16)}
                    onChange={(e) => setSummaryDraft({ ...summaryDraft, admissionDate: new Date(e.target.value).toISOString() })}
                  />
                </label>
                <label className="block text-[12px]">
                  <span className="mb-1 block text-[var(--attio-text-tertiary)]">{summaryDialog === "discharge" ? "Discharge" : "Death"} date</span>
                  <input
                    type="datetime-local"
                    className="h-9 w-full rounded-lg border border-[var(--attio-border)] px-3 text-[13px]"
                    value={(summaryDialog === "discharge" ? (summaryDraft as DischargeSummaryPayload).dischargeDate : (summaryDraft as DeathSummaryPayload).deathDate).slice(0, 16)}
                    onChange={(e) => {
                      const date = new Date(e.target.value).toISOString();
                      if (summaryDialog === "discharge") {
                        setSummaryDraft({ ...summaryDraft, dischargeDate: date } as DischargeSummaryPayload);
                      } else {
                        setSummaryDraft({ ...summaryDraft, deathDate: date } as DeathSummaryPayload);
                      }
                    }}
                  />
                </label>
              </div>
              <label className="block text-[12px]">
                <span className="mb-1 block text-[var(--attio-text-tertiary)]">Diagnosis</span>
                <textarea
                  className="min-h-[60px] w-full rounded-lg border border-[var(--attio-border)] p-2 text-[13px]"
                  value={summaryDraft.diagnosis}
                  onChange={(e) => setSummaryDraft({ ...summaryDraft, diagnosis: e.target.value })}
                />
              </label>
              {summaryDialog === "death" && (
                <>
                  <label className="block text-[12px]">
                    <span className="mb-1 block text-[var(--attio-text-tertiary)]">Cause of death</span>
                    <textarea
                      className="min-h-[60px] w-full rounded-lg border border-[var(--attio-border)] p-2 text-[13px]"
                      value={(summaryDraft as DeathSummaryPayload).causeOfDeath}
                      onChange={(e) => setSummaryDraft({ ...summaryDraft, causeOfDeath: e.target.value } as DeathSummaryPayload)}
                    />
                  </label>
                  <label className="block text-[12px]">
                    <span className="mb-1 block text-[var(--attio-text-tertiary)]">Contributing conditions</span>
                    <textarea
                      className="min-h-[60px] w-full rounded-lg border border-[var(--attio-border)] p-2 text-[13px]"
                      value={(summaryDraft as DeathSummaryPayload).contributingConditions}
                      onChange={(e) => setSummaryDraft({ ...summaryDraft, contributingConditions: e.target.value } as DeathSummaryPayload)}
                    />
                  </label>
                </>
              )}
              {summaryDialog === "discharge" && (
                <label className="block text-[12px]">
                  <span className="mb-1 block text-[var(--attio-text-tertiary)]">Follow up</span>
                  <textarea
                    className="min-h-[60px] w-full rounded-lg border border-[var(--attio-border)] p-2 text-[13px]"
                    value={(summaryDraft as DischargeSummaryPayload).followUp}
                    onChange={(e) => setSummaryDraft({ ...summaryDraft, followUp: e.target.value } as DischargeSummaryPayload)}
                  />
                </label>
              )}
              <label className="block text-[12px]">
                <span className="mb-1 block text-[var(--attio-text-tertiary)]">Procedures</span>
                <textarea
                  className="min-h-[60px] w-full rounded-lg border border-[var(--attio-border)] p-2 text-[13px]"
                  value={summaryDraft.procedures}
                  onChange={(e) => setSummaryDraft({ ...summaryDraft, procedures: e.target.value })}
                />
              </label>
              <label className="block text-[12px]">
                <span className="mb-1 block text-[var(--attio-text-tertiary)]">Medications</span>
                <textarea
                  className="min-h-[60px] w-full rounded-lg border border-[var(--attio-border)] p-2 text-[13px]"
                  value={summaryDraft.medications}
                  onChange={(e) => setSummaryDraft({ ...summaryDraft, medications: e.target.value })}
                />
              </label>
              <label className="block text-[12px]">
                <span className="mb-1 block text-[var(--attio-text-tertiary)]">Notes</span>
                <textarea
                  className="min-h-[80px] w-full rounded-lg border border-[var(--attio-border)] p-2 text-[13px]"
                  value={summaryDraft.notes}
                  onChange={(e) => setSummaryDraft({ ...summaryDraft, notes: e.target.value })}
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--attio-border-subtle)] px-4 py-3">
              <AttioButton variant="secondary" onClick={() => setSummaryDialog(null)}>
                Cancel
              </AttioButton>
              <AttioButton
                variant="secondary"
                onClick={() => void (summaryDialog === "discharge" ? handleGenerateDischargeSummary() : handleGenerateDeathSummary())}
                disabled={summaryGenerating}
              >
                <Sparkles className="size-3" />
                {summaryGenerating ? "Generating..." : "Regenerate with AI"}
              </AttioButton>
              <AttioButton onClick={() => void (summaryDialog === "discharge" ? handleSaveDischargeSummary() : handleSaveDeathSummary())} disabled={summarySaving}>
                {summarySaving ? "Saving..." : "Save"}
              </AttioButton>
            </div>
          </div>
        </div>
      )}
    </PageChrome>
  );
}
