"use client";

import { PublishedSchemaForm } from "@/components/candela/published-schema-form";
import { AiScribePanel } from "@/components/doctor/ai-scribe-panel";
import { useDoctorStore } from "@/components/doctor/doctor-store";
import { PrescriptionEditor } from "@/components/doctor/prescription-editor";
import { useDoctorFormSchema } from "@/components/doctor/use-doctor-form-schema";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, Panel, StatusBadge } from "@/components/frontdesk/ui";
import { useSession } from "@/components/candela/session-provider";
import type { TreatmentMode } from "@/design-system/doctor-data";
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
  Printer,
  Send,
  SkipForward,
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
const CONSULT_SIDEBAR_SPLIT = "grid gap-6 lg:grid-cols-[minmax(0,28rem)_minmax(240px,18rem)]";

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
  const [savingTx, setSavingTx] = useState(false);
  const [savingHandoff, setSavingHandoff] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [selectedHandoffServiceId, setSelectedHandoffServiceId] = useState<string>("");
  const [selectedHandoffPackageId, setSelectedHandoffPackageId] = useState<string>("");

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
      setSelectedHandoffServiceId(String(consult.handoff?.serviceId ?? ""));
      setSelectedHandoffPackageId(String(consult.handoff?.packageId ?? consult.packageId ?? ""));
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

    const result = await completeConsultation(visitId, {
      treatmentMode,
      recommendCounsellor: isPataudi ? false : recommendCounsellor,
      skipCounsellor: isPataudi ? true : skipCounsellor,
      handoff: handoffValues,
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

  const handleSelectHandoffService = (svc: BillingPackage) => {
    const selected = selectedHandoffServiceId === svc.id ? "" : svc.id;
    setSelectedHandoffServiceId(selected);
    updateHandoffSelection({
      serviceId: selected,
      serviceLabel: selected ? svc.label : "",
    });
  };

  const handleSelectHandoffPackage = (pkg: BillingPackage) => {
    const selected = selectedHandoffPackageId === pkg.id ? "" : pkg.id;
    setSelectedHandoffPackageId(selected);
    updateHandoffSelection({
      packageId: selected,
      packageLabel: selected ? pkg.label : "",
    });
    if (selected) {
      updateConsultation(visitId, { packageId: selected });
    } else {
      updateConsultation(visitId, { packageId: undefined });
    }
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
          {!completed && prescriptionTemplates.length > 0 && (
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
          </div>
        </Panel>
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-[var(--attio-border)] bg-white px-4 py-3">
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
              submitLabel={savingDx ? "Saving..." : "Save diagnosis"}
              onSubmit={async (data) => {
                setSavingDx(true);
                await saveConsultSection(visitId, "diagnosis", data);
                setSavingDx(false);
              }}
            />
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
              submitLabel={savingTx ? "Saving..." : "Save treatment"}
              onSubmit={async (data) => {
                setSavingTx(true);
                await saveConsultSection(visitId, "treatment", data);
                setSavingTx(false);
              }}
            />
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
              submitLabel={savingHandoff ? "Saving..." : "Save handoff notes"}
              onSubmit={async (data) => {
                setSavingHandoff(true);
                setHandoffValues(data);
                await updateConsultation(visitId, { handoff: data });
                setSavingHandoff(false);
              }}
            />
          </Panel>
          <div className="space-y-6">
            <Panel title="Services & packages">
              {loadingData ? (
                <p className="text-[13px] text-[var(--attio-text-tertiary)]">Loading...</p>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="mb-2 text-[12px] font-medium text-[var(--attio-text-secondary)]">Services</p>
                    <ul className="max-h-48 space-y-2 overflow-y-auto">
                      {apiServices.map((svc: BillingPackage) => (
                        <button
                          key={svc.id}
                          type="button"
                          onClick={() => handleSelectHandoffService(svc)}
                          className={cn(
                            "w-full rounded-lg border px-3 py-2 text-left text-[13px] transition-colors hover:bg-[var(--attio-hover)]",
                            selectedHandoffServiceId === svc.id && "border-[var(--attio-accent)] bg-blue-50/50",
                          )}
                        >
                          <p className="font-medium">{svc.label}</p>
                          <p className="text-[12px] text-[var(--attio-text-tertiary)]">
                            ₹{svc.amount.toLocaleString("en-IN")}
                          </p>
                        </button>
                      ))}
                      {apiServices.length === 0 && (
                        <p className="text-[12px] text-[var(--attio-text-tertiary)]">No services available.</p>
                      )}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-2 text-[12px] font-medium text-[var(--attio-text-secondary)]">Packages</p>
                    <ul className="max-h-48 space-y-2 overflow-y-auto">
                      {apiPackages.map((pkg: BillingPackage) => (
                        <button
                          key={pkg.id}
                          type="button"
                          onClick={() => handleSelectHandoffPackage(pkg)}
                          className={cn(
                            "w-full rounded-lg border px-3 py-2 text-left text-[13px] transition-colors hover:bg-[var(--attio-hover)]",
                            selectedHandoffPackageId === pkg.id && "border-[var(--attio-accent)] bg-blue-50/50",
                          )}
                        >
                          <p className="font-medium">{pkg.label}</p>
                          <p className="text-[12px] text-[var(--attio-text-tertiary)]">
                            ₹{pkg.amount.toLocaleString("en-IN")} · {pkg.sessions ?? "—"} sessions
                          </p>
                        </button>
                      ))}
                      {apiPackages.length === 0 && (
                        <p className="text-[12px] text-[var(--attio-text-tertiary)]">No packages available.</p>
                      )}
                    </ul>
                  </div>
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
