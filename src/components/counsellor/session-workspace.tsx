"use client";

import { HandoffPayloadView } from "@/components/counsellor/handoff-payload-view";
import { PublishedSchemaForm } from "@/components/candela/published-schema-form";
import { saveSubmissionAction } from "@/app/actions/clinical-actions";
import { useCounsellorStore } from "@/components/counsellor/counsellor-store";
import { PrintableQuote } from "@/components/counsellor/print/printable-quote";
import { PrintPreviewModal } from "@/components/doctor/print/print-preview-modal";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, Panel, StatusBadge } from "@/components/frontdesk/ui";
import {
  OBJECTION_TAGS,
  type CounselQuote,
} from "@/design-system/counsellor-data";
import { useCounsellorPoll } from "@/hooks/use-counsellor-poll";
import { usePublishedFormSchema } from "@/hooks/use-published-form-schema";
import { useToast } from "@/components/ui/toast-provider";
import { useSession } from "@/components/candela/session-provider";
import { cn } from "@/lib/utils";
import { isRedFlagVisit } from "@/lib/frontdesk-workflow";
import {
  fetchBillingPackagesFromAPI,
  fetchServiceChargesFromAPI,
  type BillingPackage,
} from "@/lib/billing-packages";
import { ArrowLeft, MessageCircle, Plus, Printer, Send, Trash2, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type SessionWorkspaceProps = { visitId: string };

export function SessionWorkspace({ visitId }: SessionWorkspaceProps) {
  useCounsellorPoll();
  const router = useRouter();
  const { toast } = useToast();
  const { session } = useSession();
  const {
    getQueueItem,
    getPatient,
    getVisit,
    claimSession,
    buildQuote,
    requestDiscountApproval,
    completeSession,
    maxDiscountPercent,
    discountPolicy,
    packages: storePackages,
    activeCounsellorName,
    approvals,
    approvedDiscounts,
  } = useCounsellorStore();

  const [apiPackages, setApiPackages] = useState<BillingPackage[]>([]);
  const [apiServices, setApiServices] = useState<BillingPackage[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [packageSearch, setPackageSearch] = useState("");
  const [serviceSearch, setServiceSearch] = useState("");
  const [tab, setTab] = useState<"packages" | "services">("packages");

  const item = getQueueItem(visitId);
  const patient = item ? getPatient(item.patientId) : undefined;
  const visit = getVisit(visitId);

  const [packageId, setPackageId] = useState(item?.packageId ?? "");
  const [selectedServices, setSelectedServices] = useState<Array<{ id: string; label: string; amount: number; quantity: number; gstPercent: number }>>([]);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountReason, setDiscountReason] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [objections, setObjections] = useState<string[]>([]);
  const [callbackAt, setCallbackAt] = useState("");
  const [consent, setConsent] = useState(false);
  const [whatsapp, setWhatsapp] = useState(false);
  const [voiceNote, setVoiceNote] = useState("");
  const [emiMonths, setEmiMonths] = useState(0);
  const [corporateRef, setCorporateRef] = useState("");
  const [paymentExpectation, setPaymentExpectation] = useState<"pay_now" | "desk" | "corporate">("desk");
  const [printOpen, setPrintOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [savingIntake, setSavingIntake] = useState(false);
  const [gstRatePercent, setGstRatePercent] = useState(18);
  const intakeSchema = usePublishedFormSchema("counsellor-intake");

  useEffect(() => {
    const loadData = async () => {
      setLoadingData(true);
      const branchId = session?.branchId;
      const [pkgs, svcs] = await Promise.all([
        fetchBillingPackagesFromAPI(branchId),
        fetchServiceChargesFromAPI(branchId),
      ]);
      setApiPackages(pkgs);
      setApiServices(svcs);
      setLoadingData(false);
    };
    loadData();
  }, [session?.branchId]);

  useEffect(() => {
    if (!item) return;
    setClaiming(true);
    void claimSession(visitId)
      .catch((err) => toast(String(err), "error"))
      .finally(() => setClaiming(false));
    const doctorCart = item.payload.cart ?? [];
    const doctorPackage = doctorCart.find((i) => i.type === "package");
    const doctorServices = doctorCart.filter((i) => i.type === "service");
    setPackageId(String(doctorPackage?.id ?? item.packageId ?? item.payload.handoff?.packageId ?? ""));
    setSelectedServices(
      doctorServices.map((s) => ({ id: s.id, label: s.label, amount: s.amount, quantity: s.quantity, gstPercent: s.gstPercent })),
    );
  }, [item, visitId, claimSession, toast]);

  const quote = useMemo(
    () => buildQuote(visitId, packageId, [], discountPercent, discountReason, "better", selectedServices.map(s => ({ id: s.id, label: s.label, amount: s.amount, quantity: s.quantity, gstPercent: s.gstPercent, type: "service" as const }))),
    [visitId, packageId, discountPercent, discountReason, selectedServices, buildQuote],
  );

  const limit = maxDiscountPercent();
  const hasApprovedDiscount = [...approvals, ...approvedDiscounts].some(
    (a) => a.visitId === visitId && a.status === "approved" && a.requestedPercent >= discountPercent,
  );
  const needsApproval =
    (discountPercent > limit || discountPercent > discountPolicy.managerApprovalAbove) && !hasApprovedDiscount;
  const needsReason = discountPercent > discountPolicy.requireReasonAbove && !discountReason.trim();

  if (!item || !patient || !visit) {
    return (
      <PageChrome breadcrumbs={[{ label: "Counsellor", href: "/app/counsellor" }, { label: "Session" }]} title="Not in queue">
        <Link href="/app/counsellor/queue" className="text-[13px] text-[var(--attio-accent)]">← Queue</Link>
      </PageChrome>
    );
  }

  const toggleObjection = (tag: string) => {
    setObjections((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]));
  };

  const addService = (service: BillingPackage) => {
    if (selectedServices.some(s => s.id === service.id)) return;
    setSelectedServices([...selectedServices, {
      id: service.id,
      label: service.label,
      amount: service.amount,
      quantity: 1,
      gstPercent: service.gstPercent ?? 0,
    }]);
  };

  const removeService = (id: string) => {
    setSelectedServices(selectedServices.filter(s => s.id !== id));
  };

  const updateServiceQuantity = (id: string, quantity: number) => {
    setSelectedServices(selectedServices.map(s => s.id === id ? { ...s, quantity: Math.max(1, quantity) } : s));
  };

  const finish = async (outcome: "converted" | "deferred" | "lost" | "callback", sendBilling = false) => {
    if (sendBilling && !consent) {
      toast("Capture patient consent before sending to billing.", "error");
      return;
    }
    if (sendBilling && needsReason) {
      toast("Enter a discount reason before sending to billing.", "error");
      return;
    }
    if (sendBilling && needsApproval) {
      toast("Request manager approval first, then retry after approval.", "error");
      await requestDiscountApproval(visitId, quote, discountReason || "Manager approval requested");
      return;
    }
    if (outcome === "callback" && !callbackAt.trim()) {
      toast("Set a callback date/time.", "error");
      return;
    }

    const result = await completeSession(visitId, outcome, {
      quote: outcome === "converted" ? { ...quote, emiMonths: emiMonths || undefined, corporateRef: corporateRef || undefined, consentCaptured: consent, whatsappSent: whatsapp } : undefined,
      internalNotes,
      objections,
      callbackAt: outcome === "callback" ? callbackAt : undefined,
      sendToBilling: sendBilling && outcome === "converted",
      paymentExpectation,
      consentCaptured: consent,
      whatsappSent: whatsapp,
      voiceNote,
    });

    if (!result.ok) {
      toast(result.error ?? "Could not complete session", "error");
      return;
    }
    toast(outcome === "converted" && sendBilling ? "Sent to reception billing" : "Session saved", "success");
    router.push("/app/counsellor/queue");
  };

  return (
    <PageChrome
      breadcrumbs={[
        { label: "Counsellor", href: "/app/counsellor" },
        { label: "Queue", href: "/app/counsellor/queue" },
        { label: patient.name, href: `/app/counsellor/patients/${patient.id}` },
        { label: "Session" },
      ]}
      title={`Counsel · ${patient.name}`}
      meta={`${item.doctorName} · ${patient.uhid} · ${activeCounsellorName}${claiming ? " · claiming…" : ""}`}
      actions={
        <AttioButton variant="secondary" className="gap-1.5" onClick={() => setPrintOpen(true)}>
          <Printer className="size-3.5" />
          Print quote
        </AttioButton>
      }
    >
      <Link href="/app/counsellor/queue" className="mb-4 inline-flex items-center gap-1 text-[13px] text-[var(--attio-text-tertiary)] hover:text-[var(--attio-text)]">
        <ArrowLeft className="size-4" />
        Queue
      </Link>

      <div className="mb-4 flex flex-wrap gap-2">
        {isRedFlagVisit(visit) && <StatusBadge label="RED FLAG" variant="danger" />}
        {item.priority === "high" && <StatusBadge label="High priority" variant="warning" />}
        {visit.routingNote && (
          <span className="rounded-lg bg-amber-50 px-3 py-1 text-[12px] text-amber-900">{visit.routingNote}</span>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[320px_1fr_320px]">
        {/* Left: Doctor context (read-only) */}
        <div className="space-y-4">
          <Panel title="Doctor handoff" className="sticky top-0">
            <HandoffPayloadView item={item} patient={patient} visit={visit} />
          </Panel>
        </div>

        {/* Center: Estimate builder */}
        <div className="space-y-4">
          <Panel title="Package & Service Selection">
            {loadingData ? (
              <p className="text-[13px] text-[var(--attio-text-tertiary)]">Loading packages and services...</p>
            ) : (
              <>
                <div className="mb-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTab("packages")}
                    className={cn(
                      "h-8 rounded-md border px-4 text-[12px] font-medium",
                      tab === "packages"
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-[var(--attio-border)] bg-white",
                    )}
                  >
                    Packages ({apiPackages.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("services")}
                    className={cn(
                      "h-8 rounded-md border px-4 text-[12px] font-medium",
                      tab === "services"
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-[var(--attio-border)] bg-white",
                    )}
                  >
                    Services ({apiServices.length})
                  </button>
                </div>

                <div className="mb-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--attio-text-tertiary)]" />
                    <input
                      type="text"
                      placeholder={tab === "packages" ? "Search packages..." : "Search services..."}
                      value={tab === "packages" ? packageSearch : serviceSearch}
                      onChange={(e) => (tab === "packages" ? setPackageSearch(e.target.value) : setServiceSearch(e.target.value))}
                      className="pl-9 w-full h-9 rounded-md border border-[var(--attio-border)] px-3 text-[13px]"
                    />
                  </div>
                </div>

                {tab === "packages" && (
                  <div className="space-y-2">
                    <select value={packageId} onChange={(e) => setPackageId(e.target.value)} className="w-full rounded-md border border-[var(--attio-border)] px-2 py-2 text-[13px]">
                      <option value="">Select a package...</option>
                      {apiPackages
                        .filter((pkg) =>
                          pkg.label.toLowerCase().includes(packageSearch.toLowerCase()) ||
                          (pkg.description && pkg.description.toLowerCase().includes(packageSearch.toLowerCase()))
                        )
                        .map((pkg) => (
                          <option key={pkg.id} value={pkg.id}>{pkg.label} — ₹{pkg.amount.toLocaleString("en-IN")}{pkg.sessions ? ` (${pkg.sessions} sessions)` : ""}</option>
                        ))}
                    </select>
                    {packageId && (
                      <div className="text-[12px] text-[var(--attio-text-tertiary)]">
                        {apiPackages.find(p => p.id === packageId)?.description}
                      </div>
                    )}
                  </div>
                )}

                {tab === "services" && (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {apiServices
                      .filter((svc) =>
                        svc.label.toLowerCase().includes(serviceSearch.toLowerCase()) ||
                        (svc.description && svc.description.toLowerCase().includes(serviceSearch.toLowerCase()))
                      )
                      .map((svc) => (
                        <div key={svc.id} className="flex items-center justify-between rounded-md border border-[var(--attio-border)] p-2">
                          <div className="flex-1">
                            <p className="text-[12px] font-medium">{svc.label}</p>
                            {svc.description && <p className="text-[11px] text-[var(--attio-text-tertiary)]">{svc.description}</p>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[12px] tabular-nums">₹{svc.amount.toLocaleString("en-IN")}</span>
                            {selectedServices.some(s => s.id === svc.id) ? (
                              <button type="button" onClick={() => removeService(svc.id)} className="text-red-600">
                                <Trash2 className="size-4" />
                              </button>
                            ) : (
                              <button type="button" onClick={() => addService(svc)} className="text-[var(--attio-accent)]">
                                <Plus className="size-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </>
            )}
          </Panel>

          {selectedServices.length > 0 && (
            <Panel title="Selected Services">
              <div className="space-y-2">
                {selectedServices.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 text-[12px]">
                    <span className="flex-1">{s.label}</span>
                    <input
                      type="number"
                      min={1}
                      value={s.quantity}
                      onChange={(e) => updateServiceQuantity(s.id, Number(e.target.value))}
                      className="w-16 h-8 rounded-md border border-[var(--attio-border)] px-2 text-center"
                    />
                    <span className="tabular-nums">₹{(s.amount * s.quantity).toLocaleString("en-IN")}</span>
                    <button type="button" onClick={() => removeService(s.id)} className="text-red-600">
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          <Panel title="Pricing & discount">
            <div className="space-y-3 text-[13px]">
              <div className="flex justify-between"><span className="text-[var(--attio-text-tertiary)]">Gross</span><span className="tabular-nums">₹{quote.grossAmount.toLocaleString("en-IN")}</span></div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--attio-text-tertiary)]">GST %</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={gstRatePercent}
                  onChange={(e) => setGstRatePercent(Number(e.target.value) || 0)}
                  className="w-20 h-8 rounded-md border border-[var(--attio-border)] px-2 text-right text-[12px]"
                />
              </div>
              {gstRatePercent > 0 && (
                <div className="flex justify-between"><span className="text-[var(--attio-text-tertiary)]">GST ({gstRatePercent}%)</span><span className="tabular-nums">₹{quote.gstAmount.toLocaleString("en-IN")}</span></div>
              )}
              <label className="block">
                <span className="text-[11px] text-[var(--attio-text-tertiary)]">Discount %</span>
                <input type="number" min={0} value={discountPercent} onChange={(e) => setDiscountPercent(Number(e.target.value))} className="mt-1 w-full rounded-md border border-[var(--attio-border)] px-2 py-1.5" />
              </label>
              {discountPercent > 0 && (
                <input value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} placeholder="Discount reason" className="w-full rounded-md border border-[var(--attio-border)] px-2 py-1.5 text-[12px]" />
              )}
              {needsApproval && <StatusBadge label="Manager approval required" variant="warning" />}
              {hasApprovedDiscount && <StatusBadge label="Discount approved" variant="success" />}
              <div className="flex justify-between border-t pt-2 text-[15px] font-semibold">
                <span>Net payable</span>
                <span className="tabular-nums text-[var(--attio-accent)]">₹{quote.netAmount.toLocaleString("en-IN")}</span>
              </div>
            </div>
          </Panel>


          <Panel title="Counselling intake">
            <PublishedSchemaForm
              schema={intakeSchema}
              initialValues={{ internalNotes }}
              submitLabel={savingIntake ? "Saving…" : "Save intake"}
              onSubmit={async (data) => {
                setSavingIntake(true);
                try {
                  const notes = [data.chiefConcern, data.internalNotes, data.objectionNotes]
                    .filter(Boolean)
                    .map(String)
                    .join("\n");
                  if (notes) setInternalNotes(notes);
                  await saveSubmissionAction("counsellor-intake", data, {
                    visitId,
                    patientId: patient.id,
                  });
                  toast("Intake saved", "success");
                } catch (err) {
                  toast(err instanceof Error ? err.message : "Could not save intake", "error");
                } finally {
                  setSavingIntake(false);
                }
              }}
            />
          </Panel>
        </div>

        {/* Right: Outcomes */}
        <div className="space-y-4">
          <Panel title="Session wrap-up" className="sticky top-0">
            <div className="mb-3 flex flex-wrap gap-1">
              {OBJECTION_TAGS.map((tag) => (
                <button key={tag} type="button" onClick={() => toggleObjection(tag)} className={cn("rounded-full border px-2 py-0.5 text-[10px]", objections.includes(tag) ? "border-[var(--attio-accent)] bg-[var(--attio-accent)]/10" : "border-[var(--attio-border)]")}>{tag}</button>
              ))}
            </div>
            <textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} rows={3} placeholder="Internal counsel notes…" className="mb-3 w-full resize-none rounded-lg border px-3 py-2 text-[13px]" />
            <textarea value={voiceNote} onChange={(e) => setVoiceNote(e.target.value)} rows={2} placeholder="Voice note summary (optional)…" className="mb-3 w-full resize-none rounded-lg border px-3 py-2 text-[12px]" />
            <input type="datetime-local" value={callbackAt} onChange={(e) => setCallbackAt(e.target.value)} className="mb-3 w-full rounded-md border px-2 py-1.5 text-[12px]" />
            <div className="mb-3 space-y-2 text-[12px]">
              <label className="flex items-center gap-2"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />Package consent captured</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)} /><MessageCircle className="size-3.5" />Send WhatsApp quote on convert</label>
            </div>
            <div className="mb-3 flex flex-wrap gap-1">
              {(["desk", "pay_now", "corporate"] as const).map((p) => (
                <button key={p} type="button" onClick={() => setPaymentExpectation(p)} className={cn("rounded-full border px-2.5 py-1 text-[11px] capitalize", paymentExpectation === p ? "border-[var(--attio-accent)] bg-[var(--attio-accent)]/10" : "border-[var(--attio-border)]")}>{p.replace("_", " ")}</button>
              ))}
            </div>
            {!consent && (
              <p className="mb-2 text-[11px] text-amber-600">Check “Package consent captured” to send to reception billing.</p>
            )}
            <div className="grid gap-2">
              <AttioButton variant="primary" className="gap-1.5" onClick={() => void finish("converted", true)}>
                <Send className="size-3.5" />
                Convert & send to reception
              </AttioButton>
              <AttioButton variant="secondary" onClick={() => void finish("callback")}>Schedule callback</AttioButton>
              <AttioButton variant="secondary" onClick={() => void finish("deferred")}>Deferred — needs time</AttioButton>
              <AttioButton variant="secondary" onClick={() => void finish("lost")}>Lost</AttioButton>
            </div>
          </Panel>
        </div>
      </div>

      <PrintPreviewModal open={printOpen} onClose={() => setPrintOpen(false)} title="Package quote" printId="counsel-quote-print">
        <PrintableQuote patient={patient} visit={visit} quote={quote} doctorName={item.doctorName} counsellorName={activeCounsellorName} />
      </PrintPreviewModal>
    </PageChrome>
  );
}
