"use client";

import { PublishedSchemaForm } from "@/components/candela/published-schema-form";
import { AiScribePanel } from "@/components/doctor/ai-scribe-panel";
import { useDoctorStore } from "@/components/doctor/doctor-store";
import { PrescriptionEditor } from "@/components/doctor/prescription-editor";
import { useDoctorFormSchema } from "@/components/doctor/use-doctor-form-schema";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, Panel, StatusBadge } from "@/components/frontdesk/ui";
import { useSession } from "@/components/candela/session-provider";
import type { ConsultationCartItem, TreatmentMode } from "@/design-system/doctor-data";
import { useDoctorPoll } from "@/hooks/use-doctor-poll";
import { isRedFlagVisit } from "@/lib/frontdesk-workflow";
import {
  fetchBillingPackagesFromAPI,
  fetchServiceChargesFromAPI,
  type BillingPackage,
} from "@/lib/billing-packages";
import { generatePrescriptionPdf, printPdfBytes } from "@/lib/prescription-pdf";
import type { DocumentTemplate } from "@/design-system/document-templates";
import { cn } from "@/lib/utils";
import { validateFormValues } from "@/lib/schema-registry";
import { useToast } from "@/components/ui/toast-provider";
import { getNurseScoresAction } from "@/app/actions/clinical-actions";
import { getIpdWardsAction } from "@/app/actions/ipd-actions";
import { usePublishedFormSchema } from "@/hooks/use-published-form-schema";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  MessageCircle,
  Plus,
  Printer,
  Search,
  Send,
  SkipForward,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { debounce } from "@/lib/debounce";
import { appendScribeSessionHeader } from "@/lib/scribe-transcript";

const TABS = [
  { id: "examination", label: "Examination" },
  { id: "diagnosis", label: "Diagnosis" },
  { id: "treatment", label: "Treatment" },
  { id: "prescription", label: "Prescription" },
  { id: "handoff", label: "Handoff" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/** Keeps clinical forms readable without stretching inputs across the full viewport. */
const CONSULT_FORM_SPLIT = "grid gap-6 lg:grid-cols-[minmax(0,28rem)_minmax(280px,1fr)]";
const CONSULT_SIDEBAR_SPLIT = "grid gap-6 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]";

type ConsultationWorkspaceProps = {
  visitId: string;
};

const PATAUDI_BRANCH_ID = "branch_pataudi";

export function ConsultationWorkspace({ visitId }: ConsultationWorkspaceProps) {
  useDoctorPoll();
  const router = useRouter();
  const { toast } = useToast();
  const { session } = useSession();
  const isPataudi = session?.branchId === PATAUDI_BRANCH_ID;
  const {
    getVisit,
    getPatient,
    getConsultation,
    getJuniorSubmission,
    startConsultation,
    saveConsultSection,
    patchConsultSectionLocal,
    setPrescription,
    applyTemplate,
    setScribeTranscript,
    persistScribeTranscript,
    applyScribeDraft,
    applyScribeToExamination,
    updateConsultation,
    completeConsultation,
    templates,
    packages: storePackages,
    documentTemplates,
  } = useDoctorStore();

  const [apiPackages, setApiPackages] = useState<BillingPackage[]>([]);
  const [apiServices, setApiServices] = useState<BillingPackage[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [tab, setTab] = useState<TabId>("examination");
  const [scribeApplied, setScribeApplied] = useState(false);
  const [handoffValues, setHandoffValues] = useState<Record<string, string | number | boolean>>({});
  const [treatmentMode, setTreatmentMode] = useState<TreatmentMode>("opd");
  const [recommendCounsellor, setRecommendCounsellor] = useState(true);
  const [skipCounsellor, setSkipCounsellor] = useState(false);
  const [sendWhatsapp, setSendWhatsapp] = useState(true);
  const [notes, setNotes] = useState("");
  const [completed, setCompleted] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const prescriptionTemplates = useMemo(
    () => documentTemplates.filter((t: DocumentTemplate) => t.kind === "prescription" && t.enabled),
    [documentTemplates],
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>(() =>
    prescriptionTemplates.find((t) => t.id === "doc_rx_saini")?.id ?? prescriptionTemplates[0]?.id,
  );
  const [savingExam, setSavingExam] = useState(false);
  const [examSaved, setExamSaved] = useState(false);
  const [savingDx, setSavingDx] = useState(false);
  const [dxSaved, setDxSaved] = useState(false);
  const [savingTx, setSavingTx] = useState(false);
  const [txSaved, setTxSaved] = useState(false);
  const [savingHandoff, setSavingHandoff] = useState(false);
  const [handoffSaved, setHandoffSaved] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [cart, setCart] = useState<ConsultationCartItem[]>([]);
  const cartTotal = useMemo(() => cart.reduce((s, i) => s + i.amount * i.quantity, 0), [cart]);
  const [serviceSearch, setServiceSearch] = useState("");
  const [packageSearch, setPackageSearch] = useState("");
  const [cartTab, setCartTab] = useState<"services" | "packages">("services");
  const [scoreEntries, setScoreEntries] = useState<{ id: string; submittedAt: string; data: Record<string, string | number | boolean> }[]>([]);
  type IpdWardOption = { id: string; label: string; active: boolean; beds: Array<{ id: string; label: string; active: boolean; occupied: boolean }> };
  const [ipdWards, setIpdWards] = useState<IpdWardOption[]>([]);
  const [selectedIpdWardId, setSelectedIpdWardId] = useState("");
  const [selectedIpdBedId, setSelectedIpdBedId] = useState("");

  const scoreSchema = usePublishedFormSchema("nurse-scores");

  useEffect(() => {
    if (!visitId) return;
    void (async () => {
      const res = await getNurseScoresAction(visitId);
      if (res.ok) setScoreEntries(res.data);
    })();
  }, [visitId]);

  useEffect(() => {
    if (treatmentMode !== "ipd") {
      setSelectedIpdWardId("");
      setSelectedIpdBedId("");
      return;
    }
    void (async () => {
      const res = await getIpdWardsAction();
      if (res.ok) setIpdWards(res.data as IpdWardOption[]);
    })();
  }, [treatmentMode]);

  useEffect(() => {
    if (treatmentMode !== "ipd" || ipdWards.length === 0) return;
    const wardLabel = String(handoffValues.ward ?? "");
    const bedLabel = String(handoffValues.bed ?? "");
    const ward = ipdWards.find((w) => w.label === wardLabel) ?? ipdWards.find((w) => w.id === selectedIpdWardId);
    const bed = ward?.beds.find((b) => b.label === bedLabel);
    if (ward && bed) {
      setSelectedIpdWardId(ward.id);
      setSelectedIpdBedId(bed.id);
    }
  }, [treatmentMode, ipdWards, handoffValues.ward, handoffValues.bed]);

  const scoreLabels = useMemo(
    () => Object.fromEntries(scoreSchema?.sections.flatMap((s) => s.fields).map((f) => [f.id, f.label]) ?? []),
    [scoreSchema],
  );

  const visit = getVisit(visitId);
  const patient = visit ? getPatient(visit.patientId) : undefined;
  const junior = getJuniorSubmission(visitId);

  const examSchema = useDoctorFormSchema("doctor-examination");
  const dxSchema = useDoctorFormSchema("doctor-diagnosis");
  const txSchema = useDoctorFormSchema("doctor-treatment");
  const handoffSchema = useDoctorFormSchema("doctor-handoff");

  const startedRef = useRef<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoadingData(true);
      const [pkgs, svcs] = await Promise.all([
        fetchBillingPackagesFromAPI(),
        fetchServiceChargesFromAPI(),
      ]);
      setApiPackages(pkgs);
      setApiServices(svcs);
      setLoadingData(false);
    };
    loadData();
  }, []);

  useEffect(() => {
    if (!visit) return;
    if (startedRef.current === visitId) return;
    startedRef.current = visitId;
    void startConsultation(visitId);
  }, [visit, visitId, startConsultation]);

  const consult = getConsultation(visitId);
  const scribeLang = consult?.scribeLanguage ?? "en";

  const persistScribeDebounced = useMemo(
    () =>
      debounce((text: string, lang: string) => {
        persistScribeTranscript(visitId, text, lang);
      }, 1500),
    [visitId, persistScribeTranscript],
  );

  useEffect(() => () => persistScribeDebounced.cancel(), [persistScribeDebounced]);

  useEffect(() => {
    if (consult) {
      setTreatmentMode(consult.treatmentMode);
      setRecommendCounsellor(consult.recommendCounsellor);
      setSkipCounsellor(consult.skipCounsellor);
      setNotes(consult.notes);
      setCompleted(consult.status === "completed");
      const savedCart = consult.cart ?? [];
      setCart(savedCart);
      const savedServiceIds = savedCart.filter((i) => i.type === "service").map((i) => i.id).join(",");
      const savedServiceLabels = savedCart.filter((i) => i.type === "service").map((i) => i.label).join(", ");
      const savedPackage = savedCart.find((i) => i.type === "package");
      setHandoffValues({
        ...(consult.handoff ?? {}),
        serviceIds: savedServiceIds,
        serviceLabels: savedServiceLabels,
        packageId: savedPackage?.id ?? consult.packageId ?? "",
        packageLabel: savedPackage?.label ?? "",
      });
    }
  }, [consult]);

  if (!visit || !patient) {
    return (
      <PageChrome
        breadcrumbs={[{ label: "Doctor", href: "/app/doctor" }, { label: "Consult" }]}
        title="Visit not found"
      >
        <Link href="/app/doctor/queue" className="text-[13px] text-[var(--attio-accent)]">
          ← Back to queue
        </Link>
      </PageChrome>
    );
  }

  const finishConsult = async () => {
    setCompleting(true);
    const consultData = getConsultation(visitId);
    const examErrors = validateFormValues(examSchema, consultData?.examination ?? {});
    const dxErrors = validateFormValues(dxSchema, consultData?.diagnosis ?? {});
    const handoffErrors = validateFormValues(handoffSchema, handoffValues);
    const firstError =
      Object.values(examErrors)[0] ??
      Object.values(dxErrors)[0] ??
      Object.values(handoffErrors)[0];
    if (firstError) {
      toast(firstError, "error");
      setCompleting(false);
      return;
    }

    if (treatmentMode === "ipd" && (!handoffValues.ward || !handoffValues.bed)) {
      toast("Select an IPD ward and bed before completing the consultation.", "error");
      setCompleting(false);
      return;
    }

    const { cart: _, ...handoffPayload } = handoffValues;
    const result = await completeConsultation(visitId, {
      treatmentMode,
      recommendCounsellor: isPataudi ? false : recommendCounsellor,
      skipCounsellor: isPataudi ? true : skipCounsellor,
      handoff: handoffPayload,
      sendWhatsapp,
    });
    if (!result.ok) {
      toast(result.error ?? "Could not complete consultation", "error");
      setCompleting(false);
      return;
    }
    setCompleted(true);
    toast("Consultation completed", "success");
    router.push("/app/doctor/queue");
  };

  const handlePrintPrescription = async () => {
    if (!patient || !visit || !consult) return;
    try {
      const selectedTemplate = prescriptionTemplates.find((t) => t.id === selectedTemplateId);
      const pdfBytes = await generatePrescriptionPdf({
        patient,
        visit,
        consult,
        doctorName: visit.doctorName,
        layout: selectedTemplate?.layout ?? "navayu-letterhead",
      });
      printPdfBytes(pdfBytes, "Prescription");
    } catch (error) {
      toast("Could not generate prescription PDF", "error");
    }
  };

  const updateHandoffSelection = (updates: Record<string, string | number | boolean>) => {
    const next = { ...handoffValues, ...updates };
    setHandoffValues(next);
    updateConsultation(visitId, { handoff: next });
  };

  const deriveHandoffFromCart = (nextCart: ConsultationCartItem[]) => {
    const { cart: _, ...rest } = handoffValues;
    const serviceIds = nextCart.filter((i) => i.type === "service").map((i) => i.id).join(",");
    const serviceLabels = nextCart.filter((i) => i.type === "service").map((i) => i.label).join(", ");
    const pkg = nextCart.find((i) => i.type === "package");
    return { ...rest, serviceIds, serviceLabels, packageId: pkg?.id ?? "", packageLabel: pkg?.label ?? "" };
  };

  const persistCart = (nextCart: ConsultationCartItem[]) => {
    const nextHandoff = deriveHandoffFromCart(nextCart);
    const pkg = nextCart.find((i) => i.type === "package");
    setHandoffValues(nextHandoff);
    setCart(nextCart);
    updateConsultation(visitId, { cart: nextCart, packageId: pkg?.id ?? undefined, handoff: nextHandoff });
  };

  const addServiceToCart = (svc: BillingPackage) => {
    if (cart.some((i) => i.id === svc.id && i.type === "service")) return;
    const next = [
      ...cart,
      { id: svc.id, type: "service" as const, label: svc.label, amount: svc.amount, quantity: 1, gstPercent: svc.gstPercent ?? 0 },
    ];
    persistCart(next);
  };

  const addPackageToCart = (pkg: BillingPackage) => {
    const next = cart.filter((i) => i.type !== "package").concat({
      id: pkg.id,
      type: "package" as const,
      label: pkg.label,
      amount: pkg.amount,
      quantity: 1,
      gstPercent: pkg.gstPercent ?? 0,
    });
    persistCart(next);
  };

  const removeCartItem = (id: string) => {
    persistCart(cart.filter((i) => i.id !== id));
  };

  const updateCartQuantity = (id: string, quantity: number) => {
    if (quantity < 1) {
      removeCartItem(id);
      return;
    }
    persistCart(cart.map((i) => (i.id === id ? { ...i, quantity } : i)));
  };

  return (
    <PageChrome
      breadcrumbs={[
        { label: "Doctor", href: "/app/doctor" },
        { label: "OPD queue", href: "/app/doctor/queue" },
        { label: patient.name, href: `/app/doctor/patients/${patient.id}` },
      ]}
      title={`Consultation · ${patient.name}`}
      meta={`Token #${visit.token} · ${patient.uhid} · ${visit.billing} billing`}
      tabs={TABS.filter((t) => !isPataudi || t.id !== "handoff").map((t) => ({ id: t.id, label: t.label }))}
      activeTab={tab}
      onTabChange={(id) => setTab(id as TabId)}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {!completed && (isPataudi || prescriptionTemplates.length > 0) && (
            <>
              {prescriptionTemplates.length > 1 && (
                <Select value={selectedTemplateId} onValueChange={(v) => setSelectedTemplateId(v ?? undefined)}>
                  <SelectTrigger className="h-9 w-[220px] bg-white text-[13px] text-[var(--attio-text)]">
                    <SelectValue placeholder="Select prescription template" />
                  </SelectTrigger>
                  <SelectContent>
                    {prescriptionTemplates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <AttioButton
                variant="secondary"
                className="gap-1.5"
                onClick={handlePrintPrescription}
                disabled={!consult}
              >
                <Printer className="size-3.5" />
                Print prescription
              </AttioButton>
            </>
          )}
          {!completed && (
            <AttioButton variant="primary" className="gap-1.5" onClick={finishConsult} disabled={completing}>
              {completing ? (
                <>
                  <div className="size-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Completing...
                </>
              ) : (
                <>
                  <Send className="size-3.5" />
                  Complete consult
                </>
              )}
            </AttioButton>
          )}
        </div>
      }
    >
      <Link
        href="/app/doctor/queue"
        className="mb-4 inline-flex items-center gap-1 text-[13px] text-[var(--attio-text-tertiary)] hover:text-[var(--attio-text)]"
      >
        <ArrowLeft className="size-4" />
        OPD queue
      </Link>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge label={visit.billing} variant={visit.billing === "paid" ? "success" : "warning"} />
        <StatusBadge label={`Exam: ${visit.exam}`} variant={visit.exam === "done" ? "success" : "info"} />
        <StatusBadge label={patient.department} variant="neutral" />
        {isRedFlagVisit(visit) && <StatusBadge label="RED FLAG" variant="danger" />}
        {visit.routingNote && (
          <span className="text-[12px] text-amber-800">{visit.routingNote}</span>
        )}
        {visit.deferredReason && <StatusBadge label="Deferred billing" variant="warning" />}
      </div>

      {junior && (
        <div className="mb-4">
        <Panel title="Junior doctor handoff (read-only)">
          <div className="grid gap-2 text-[13px] text-[var(--attio-text-secondary)] sm:grid-cols-2">
            {Boolean(junior.redFlags) && (
              <p className="col-span-full rounded-lg bg-red-50 px-3 py-2 text-red-800">
                Red flags noted: {String(junior.redFlagNotes ?? "Review immediately")}
              </p>
            )}
            {junior.chiefComplaint && (
              <p><span className="font-medium">Complaint:</span> {String(junior.chiefComplaint)}</p>
            )}
            {junior.juniorImpression && (
              <p><span className="font-medium">Junior impression:</span> {String(junior.juniorImpression)}</p>
            )}
            {junior.seniorHandoff && (
              <p className="col-span-full"><span className="font-medium">Handoff note:</span> {String(junior.seniorHandoff)}</p>
            )}
            {junior.rom && (
              <p><span className="font-medium">ROM:</span> {String(junior.rom)}</p>
            )}
            {junior.specialTests && (
              <p><span className="font-medium">Special tests:</span> {String(junior.specialTests)}</p>
            )}
            {(junior.bpSystolic || junior.bpDiastolic || junior.pulse || junior.spo2 || junior.temperature || junior.weight || junior.height) && (
              <div className="col-span-full rounded-lg bg-[var(--attio-surface)] p-2 text-[12px]">
                <p className="font-medium">Vitals</p>
                <p>
                  BP: {String(junior.bpSystolic ?? "—")}/{String(junior.bpDiastolic ?? "—")} mmHg ·{" "}
                  Pulse: {String(junior.pulse ?? "—")} bpm · SpO₂: {String(junior.spo2 ?? "—")}% ·{" "}
                  Temp: {String(junior.temperature ?? "—")} °F · Weight: {String(junior.weight ?? "—")} kg{" "}
                  {junior.height ? `· Height: ${String(junior.height)} cm` : ""}
                </p>
                {junior.vitalsNotes && <p className="mt-1 text-[var(--attio-text-tertiary)]">{String(junior.vitalsNotes)}</p>}
              </div>
            )}
          </div>
        </Panel>
        </div>
      )}

      {scoreEntries.length > 0 && (
        <div className="mb-4">
          <Panel title="Nursing scores">
            <div className="space-y-2">
              {scoreEntries.map((entry) => (
                <div key={entry.id} className="rounded-lg bg-[var(--attio-surface)] p-2 text-[12px]">
                  <p className="text-[11px] text-[var(--attio-text-tertiary)]">
                    {new Date(entry.submittedAt).toLocaleString("en-IN")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(entry.data)
                      .filter(([key]) => key !== "scoreNotes")
                      .map(([key, value]) => (
                        <span key={key} className="font-medium">
                          {scoreLabels[key] ?? key}: {String(value)}
                        </span>
                      ))}
                  </div>
                  {entry.data.scoreNotes && (
                    <p className="mt-1 text-[var(--attio-text-tertiary)]">{String(entry.data.scoreNotes)}</p>
                  )}
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-[var(--attio-border)] bg-white px-4 py-3">
        {!isPataudi && (
          <>
            <span className="text-[12px] font-medium text-[var(--attio-text-secondary)]">Treatment mode</span>
            {(["opd", "ipd", "daycare"] as TreatmentMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setTreatmentMode(mode);
                  updateConsultation(visitId, { treatmentMode: mode });
                }}
                className={cn(
                  "rounded-full border px-3 py-1 text-[12px] capitalize transition-colors",
                  treatmentMode === mode
                    ? "border-[var(--attio-accent)] bg-[var(--attio-accent)]/10 text-[var(--attio-accent)]"
                    : "border-[var(--attio-border)] text-[var(--attio-text-secondary)] hover:bg-[var(--attio-hover)]",
                )}
              >
                {mode}
              </button>
            ))}
            {treatmentMode === "ipd" && (
              <>
                <span className="ml-2 text-[12px] font-medium text-[var(--attio-text-secondary)]">Ward</span>
                <Select
                  value={selectedIpdWardId}
                  onValueChange={(value) => {
                    const wardId = value ?? "";
                    if (!wardId) return;
                    setSelectedIpdWardId(wardId);
                    setSelectedIpdBedId("");
                    const ward = ipdWards.find((w) => w.id === wardId);
                    if (ward) updateHandoffSelection({ ward: ward.label, bed: "" });
                  }}
                >
                  <SelectTrigger className="h-8 w-40 text-[12px]">
                    <SelectValue placeholder="Select ward" />
                  </SelectTrigger>
                  <SelectContent>
                    {ipdWards.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-[12px] font-medium text-[var(--attio-text-secondary)]">Bed</span>
                <Select
                  value={selectedIpdBedId}
                  disabled={!selectedIpdWardId}
                  onValueChange={(value) => {
                    const bedId = value ?? "";
                    if (!bedId) return;
                    setSelectedIpdBedId(bedId);
                    const ward = ipdWards.find((w) => w.id === selectedIpdWardId);
                    const bed = ward?.beds.find((b) => b.id === bedId);
                    if (ward && bed) updateHandoffSelection({ ward: ward.label, bed: bed.label });
                  }}
                >
                  <SelectTrigger className="h-8 w-40 text-[12px]">
                    <SelectValue placeholder="Select bed" />
                  </SelectTrigger>
                  <SelectContent>
                    {ipdWards
                      .find((w) => w.id === selectedIpdWardId)
                      ?.beds.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </>
            )}
          </>
        )}

        <div className="ml-auto flex flex-wrap gap-2">
          {!isPataudi && (
            <>
              <label className="flex items-center gap-1.5 text-[12px] text-[var(--attio-text-secondary)]">
                <input
                  type="checkbox"
                  checked={recommendCounsellor}
                  onChange={(e) => {
                    setRecommendCounsellor(e.target.checked);
                    updateConsultation(visitId, { recommendCounsellor: e.target.checked });
                  }}
                />
                Recommend counsellor
              </label>
              <label className="flex items-center gap-1.5 text-[12px] text-[var(--attio-text-secondary)]">
                <input
                  type="checkbox"
                  checked={skipCounsellor}
                  onChange={(e) => {
                    setSkipCounsellor(e.target.checked);
                    updateConsultation(visitId, { skipCounsellor: e.target.checked });
                  }}
                />
                Skip counsellor
              </label>
            </>
          )}
          <label className="flex items-center gap-1.5 text-[12px] text-[var(--attio-text-secondary)]">
            <input
              type="checkbox"
              checked={sendWhatsapp}
              onChange={(e) => setSendWhatsapp(e.target.checked)}
            />
            <MessageCircle className="size-3.5" />
            WhatsApp Rx
          </label>
        </div>
      </div>

      {tab === "examination" && (
        <div className={CONSULT_FORM_SPLIT}>
          <Panel title="Examination">
            <PublishedSchemaForm
              schema={examSchema}
              formKey={`exam-${visitId}-${consult?.startedAt ?? ""}`}
              initialValues={consult?.examination}
              onValuesChange={(data) => patchConsultSectionLocal(visitId, "examination", data)}
              submitStatus={savingExam ? "saving" : examSaved ? "saved" : "idle"}
              submitLabel={examSaved ? "Draft saved" : "Save examination"}
              onSubmit={async (data) => {
                setSavingExam(true);
                await saveConsultSection(visitId, "examination", data);
                setSavingExam(false);
                setExamSaved(true);
                setTimeout(() => setExamSaved(false), 3000);
              }}
            />
            {examSaved && (
              <p className="mt-3 flex items-center gap-1.5 text-[12px] text-emerald-600">
                <CheckCircle2 className="size-3.5" />
                Draft saved
              </p>
            )}
          </Panel>
          <AiScribePanel
            language={scribeLang}
            transcript={consult?.scribeTranscript ?? ""}
            patientContext={
              patient
                ? `${patient.name}, UHID ${patient.uhid}, ${patient.age}y ${patient.gender}`
                : undefined
            }
            applied={scribeApplied}
            onLanguageChange={(lang) => {
              const text = consult?.scribeTranscript ?? "";
              setScribeTranscript(visitId, text, lang);
              persistScribeDebounced.cancel();
              persistScribeTranscript(visitId, text, lang);
            }}
            onTranscriptChange={(text) => {
              setScribeTranscript(visitId, text, scribeLang);
              persistScribeDebounced(text, scribeLang);
            }}
            onRecordingStart={() => {
              const current = consult?.scribeTranscript ?? "";
              const next = appendScribeSessionHeader(current, scribeLang);
              if (next === current) return;
              setScribeTranscript(visitId, next, scribeLang);
              persistScribeDebounced.cancel();
              persistScribeTranscript(visitId, next, scribeLang);
            }}
            onRecordingStop={(text) => {
              persistScribeDebounced.cancel();
              persistScribeTranscript(visitId, text, scribeLang);
            }}
            onPersistTranscript={(text) => {
              persistScribeDebounced.cancel();
              persistScribeTranscript(visitId, text, scribeLang);
            }}
            onDraftAccepted={(draft) => {
              applyScribeDraft(visitId, draft);
              setScribeApplied(true);
              toast("Scribe applied — consult fields and prescription updated.", "success");
            }}
          />
        </div>
      )}

      {tab === "diagnosis" && (
        <div className={CONSULT_SIDEBAR_SPLIT}>
          <Panel title="Diagnosis">
            <PublishedSchemaForm
              schema={dxSchema}
              formKey={`dx-${visitId}-${consult?.startedAt ?? ""}`}
              initialValues={consult?.diagnosis}
              onValuesChange={(data) => patchConsultSectionLocal(visitId, "diagnosis", data)}
              submitStatus={savingDx ? "saving" : dxSaved ? "saved" : "idle"}
              submitLabel={dxSaved ? "Draft saved" : "Save diagnosis"}
              onSubmit={async (data) => {
                setSavingDx(true);
                await saveConsultSection(visitId, "diagnosis", data);
                setSavingDx(false);
                setDxSaved(true);
                setTimeout(() => setDxSaved(false), 3000);
              }}
            />
            {dxSaved && (
              <p className="mt-3 flex items-center gap-1.5 text-[12px] text-emerald-600">
                <CheckCircle2 className="size-3.5" />
                Draft saved
              </p>
            )}
          </Panel>
          <Panel title="Templates">
            <p className="mb-3 text-[12px] text-[var(--attio-text-secondary)]">
              Apply disease template — fills diagnosis, treatment & Rx
            </p>
            <ul className="space-y-2">
              {templates.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => applyTemplate(visitId, tpl.id)}
                  className="flex w-full items-start gap-2 rounded-lg border border-[var(--attio-border-subtle)] px-3 py-2.5 text-left hover:bg-[var(--attio-surface)]"
                >
                  <FileText className="mt-0.5 size-4 shrink-0 text-[var(--attio-accent)]" />
                  <div>
                    <p className="text-[13px] font-medium">{tpl.label}</p>
                    <p className="text-[11px] text-[var(--attio-text-tertiary)]">{tpl.disease}</p>
                  </div>
                </button>
              ))}
            </ul>
            <Link
              href="/app/doctor/templates"
              className="mt-3 inline-block text-[12px] text-[var(--attio-accent)]"
            >
              + Create your own template
            </Link>
          </Panel>
        </div>
      )}

      {tab === "treatment" && (
        <div className={CONSULT_FORM_SPLIT}>
          <Panel title="Treatment plan">
            <PublishedSchemaForm
              schema={txSchema}
              formKey={`tx-${visitId}-${consult?.startedAt ?? ""}`}
              initialValues={consult?.treatment}
              onValuesChange={(data) => patchConsultSectionLocal(visitId, "treatment", data)}
              submitStatus={savingTx ? "saving" : txSaved ? "saved" : "idle"}
              submitLabel={txSaved ? "Draft saved" : "Save treatment"}
              onSubmit={async (data) => {
                setSavingTx(true);
                await saveConsultSection(visitId, "treatment", data);
                setSavingTx(false);
                setTxSaved(true);
                setTimeout(() => setTxSaved(false), 3000);
              }}
            />
            {txSaved && (
              <p className="mt-3 flex items-center gap-1.5 text-[12px] text-emerald-600">
                <CheckCircle2 className="size-3.5" />
                Draft saved
              </p>
            )}
          </Panel>
        </div>
      )}

      {tab === "prescription" && consult && (
        <div className="space-y-4">
          <Panel title="Prescription (e-Rx) — fully editable">
            <PrescriptionEditor
              lines={consult.prescription}
              onChange={(lines) => setPrescription(visitId, lines)}
            />
            {sendWhatsapp && (
              <p className="mt-4 flex items-center gap-1.5 text-[12px] text-[var(--attio-accent)]">
                <MessageCircle className="size-3.5" />
                Rx will be sent to {patient.phone} on completion · saved to patient profile
              </p>
            )}
          </Panel>
        </div>
      )}

      {tab === "handoff" && !isPataudi && (
        <div className={CONSULT_SIDEBAR_SPLIT}>
          <Panel title="Counsellor handoff">
            <PublishedSchemaForm
              schema={handoffSchema}
              formKey={`handoff-${visitId}`}
              initialValues={handoffValues}
              submitStatus={savingHandoff ? "saving" : handoffSaved ? "saved" : "idle"}
              submitLabel={handoffSaved ? "Draft saved" : "Save handoff notes"}
              onSubmit={async (data) => {
                setSavingHandoff(true);
                setHandoffValues(data);
                await updateConsultation(visitId, { handoff: data });
                setSavingHandoff(false);
                setHandoffSaved(true);
                setTimeout(() => setHandoffSaved(false), 3000);
              }}
            />
            {handoffSaved && (
              <p className="mt-3 flex items-center gap-1.5 text-[12px] text-emerald-600">
                <CheckCircle2 className="size-3.5" />
                Draft saved
              </p>
            )}
          </Panel>
          <div className="space-y-6">
            <Panel title="Services & packages cart">
              {loadingData ? (
                <p className="text-[13px] text-[var(--attio-text-tertiary)]">Loading...</p>
              ) : (
                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="space-y-4">
                    <div className="flex border-b">
                    {[
                      { id: "services" as const, label: "Services" },
                      { id: "packages" as const, label: "Packages" },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setCartTab(tab.id)}
                        className={cn(
                          "border-b-2 px-3 py-2 text-[12px] font-medium whitespace-nowrap",
                          cartTab === tab.id
                            ? "border-[var(--attio-text)] text-[var(--attio-text)]"
                            : "border-transparent text-[var(--attio-text-tertiary)]",
                        )}
                      >
                        {tab.label}
                        <span className="ml-1.5 rounded-full bg-[var(--attio-surface)] px-1.5 py-0.5 text-[10px] text-[var(--attio-text-secondary)]">
                          {tab.id === "services" ? apiServices.length : apiPackages.length}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--attio-text-tertiary)]" />
                    <input
                      type="text"
                      placeholder={cartTab === "services" ? "Search services…" : "Search packages…"}
                      value={cartTab === "services" ? serviceSearch : packageSearch}
                      onChange={(e) =>
                        cartTab === "services" ? setServiceSearch(e.target.value) : setPackageSearch(e.target.value)
                      }
                      className="h-9 w-full rounded-md border border-[var(--attio-border)] bg-white py-1.5 pl-9 pr-3 text-[13px] outline-none focus:border-[var(--attio-text)]"
                    />
                  </div>

                  <ul className="max-h-96 space-y-2 overflow-y-auto">
                    {cartTab === "services"
                      ? apiServices
                          .filter(
                            (svc) =>
                              svc.label.toLowerCase().includes(serviceSearch.toLowerCase()) ||
                              (svc.description && svc.description.toLowerCase().includes(serviceSearch.toLowerCase())),
                          )
                          .map((svc) => {
                            const inCart = cart.some((i) => i.id === svc.id && i.type === "service");
                            return (
                              <li key={svc.id}>
                                <div className={cn(
                                  "flex items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-colors",
                                  inCart
                                    ? "border-emerald-300 bg-emerald-50/50"
                                    : "border-[var(--attio-border)] bg-white hover:border-[var(--attio-accent)]",
                                )}>
                                  <div className="min-w-0">
                                    <p className="font-medium text-[13px]">
                                      {svc.label}
                                      {inCart && (
                                        <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700">
                                          Added
                                        </span>
                                      )}
                                    </p>
                                    <p className="text-[11px] text-[var(--attio-text-tertiary)]">
                                      ₹{svc.amount.toLocaleString("en-IN")}
                                      {svc.gstPercent ? ` · GST ${svc.gstPercent}%` : ""}
                                    </p>
                                  </div>
                                  {inCart ? (
                                    <button type="button" onClick={() => removeCartItem(svc.id)} className="shrink-0 rounded p-1.5 text-red-600 hover:bg-red-50">
                                      <Trash2 className="size-4" />
                                    </button>
                                  ) : (
                                    <button type="button" onClick={() => addServiceToCart(svc)} className="shrink-0 rounded p-1.5 text-[var(--attio-accent)] hover:bg-[var(--attio-surface)]">
                                      <Plus className="size-4" />
                                    </button>
                                  )}
                                </div>
                              </li>
                            );
                          })
                      : apiPackages
                          .filter(
                            (pkg) =>
                              pkg.label.toLowerCase().includes(packageSearch.toLowerCase()) ||
                              (pkg.description && pkg.description.toLowerCase().includes(packageSearch.toLowerCase())),
                          )
                          .map((pkg) => {
                            const inCart = cart.some((i) => i.id === pkg.id && i.type === "package");
                            return (
                              <li key={pkg.id}>
                                <div className={cn(
                                  "flex items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-colors",
                                  inCart
                                    ? "border-blue-300 bg-blue-50/50"
                                    : "border-[var(--attio-border)] bg-white hover:border-[var(--attio-accent)]",
                                )}>
                                  <div className="min-w-0">
                                    <p className="font-medium text-[13px]">
                                      {pkg.label}
                                      {inCart && (
                                        <span className="ml-1.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700">
                                          Added
                                        </span>
                                      )}
                                    </p>
                                    <p className="text-[11px] text-[var(--attio-text-tertiary)]">
                                      ₹{pkg.amount.toLocaleString("en-IN")} · {pkg.sessions ?? "—"} sessions
                                      {pkg.gstPercent ? ` · GST ${pkg.gstPercent}%` : ""}
                                    </p>
                                  </div>
                                  {inCart ? (
                                    <button type="button" onClick={() => removeCartItem(pkg.id)} className="shrink-0 rounded p-1.5 text-red-600 hover:bg-red-50">
                                      <Trash2 className="size-4" />
                                    </button>
                                  ) : (
                                    <button type="button" onClick={() => addPackageToCart(pkg)} className="shrink-0 rounded p-1.5 text-[var(--attio-accent)] hover:bg-[var(--attio-surface)]">
                                      <Plus className="size-4" />
                                    </button>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                    {cartTab === "services" &&
                      apiServices.filter(
                        (svc) =>
                          svc.label.toLowerCase().includes(serviceSearch.toLowerCase()) ||
                          (svc.description && svc.description.toLowerCase().includes(serviceSearch.toLowerCase())),
                      ).length === 0 && (
                        <p className="text-[12px] text-[var(--attio-text-tertiary)]">No services match.</p>
                      )}
                    {cartTab === "packages" &&
                      apiPackages.filter(
                        (pkg) =>
                          pkg.label.toLowerCase().includes(packageSearch.toLowerCase()) ||
                          (pkg.description && pkg.description.toLowerCase().includes(packageSearch.toLowerCase())),
                      ).length === 0 && (
                        <p className="text-[12px] text-[var(--attio-text-tertiary)]">No packages match.</p>
                      )}
                  </ul>
                </div>

                {cart.length > 0 ? (
                  <div className="max-h-96 overflow-y-auto rounded-lg border border-[var(--attio-border)] bg-[var(--attio-surface)] p-3 lg:sticky lg:top-0 lg:self-start">
                    <p className="mb-2 flex items-center justify-between text-[12px] font-medium text-[var(--attio-text-secondary)]">
                      <span>Cart</span>
                      <span className="rounded-full bg-[var(--attio-surface)] px-1.5 py-0.5 text-[10px]">
                        {cart.length} item{cart.length !== 1 ? "s" : ""}
                      </span>
                    </p>
                    <ul className="space-y-2">
                      {cart.map((item) => (
                        <li key={item.id} className="flex items-center gap-3 text-[13px]">
                          <span className={cn(
                            "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
                            item.type === "package" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700",
                          )}>
                            {item.type === "package" ? "Pkg" : "Svc"}
                          </span>
                          <span className="flex-1 truncate">{item.label}</span>
                          <input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => updateCartQuantity(item.id, Number(e.target.value))}
                            className="h-8 w-14 rounded-md border border-[var(--attio-border)] bg-white px-2 text-center text-[12px]"
                          />
                          <span className="w-20 text-right tabular-nums">
                            ₹{(item.amount * item.quantity).toLocaleString("en-IN")}
                          </span>
                          <button type="button" onClick={() => removeCartItem(item.id)} className="rounded p-1 text-red-600 hover:bg-red-50">
                            <Trash2 className="size-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 flex items-center justify-between border-t border-[var(--attio-border-subtle)] pt-2 text-[13px] font-semibold">
                      <span>Total</span>
                      <span className="tabular-nums">₹{cartTotal.toLocaleString("en-IN")}</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center rounded-lg border border-[var(--attio-border)] bg-[var(--attio-surface)] p-6 text-center">
                    <p className="text-[13px] font-medium text-[var(--attio-text-secondary)]">Cart is empty</p>
                    <p className="text-[12px] text-[var(--attio-text-tertiary)]">Select services or packages to add them here.</p>
                  </div>
                )}
              </div>
              )}
            </Panel>
            <Panel title="Complete consultation">
            <div className="space-y-4 text-[13px] text-[var(--attio-text-secondary)]">
              <p>
                {recommendCounsellor && !skipCounsellor
                  ? "Patient moves to counsellor queue with full consult payload."
                  : "Patient marked completed — no counsellor handoff."}
              </p>
              {visit.deferredReason && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
                  Billing deferred: {visit.deferredReason}
                </p>
              )}
              <textarea
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  updateConsultation(visitId, { notes: e.target.value });
                }}
                rows={4}
                placeholder="Private consult notes…"
                className="w-full resize-none rounded-lg border border-[var(--attio-border)] px-3 py-2 text-[13px] outline-none"
              />
              <AttioButton variant="primary" className="w-full gap-1.5" onClick={finishConsult} disabled={completing}>
                {completing ? (
                  <>
                    <div className="size-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    {recommendCounsellor && !skipCounsellor ? "Sending..." : "Completing..."}
                  </>
                ) : recommendCounsellor && !skipCounsellor ? (
                  <>
                    <Send className="size-3.5" />
                    Send to counsellor
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="size-3.5" />
                    Complete without counsellor
                  </>
                )}
              </AttioButton>
              {recommendCounsellor && (
                <AttioButton
                  variant="secondary"
                  className="w-full gap-1.5"
                  disabled={completing}
                  onClick={() => {
                    setSkipCounsellor(true);
                    updateConsultation(visitId, { skipCounsellor: true });
                    finishConsult();
                  }}
                >
                  {completing ? (
                    <>
                      <div className="size-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Skipping...
                    </>
                  ) : (
                    <>
                      <SkipForward className="size-3.5" />
                      Skip counsellor & finish
                    </>
                  )}
                </AttioButton>
              )}
            </div>
          </Panel>
        </div>
      </div>
      )}
    </PageChrome>
  );
}
