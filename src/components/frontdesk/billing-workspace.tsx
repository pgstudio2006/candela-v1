"use client";

import { BillingReceiptModal } from "@/components/frontdesk/billing-receipt-modal";
import { OpdBillingForm } from "@/components/frontdesk/opd-billing-form";
import { useFrontdeskStore } from "@/components/frontdesk/frontdesk-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { PostCounselBillingForm } from "@/components/frontdesk/post-counsel-billing-form";
import { Panel, StatusBadge } from "@/components/frontdesk/ui";
import { useSession } from "@/components/candela/session-provider";
import { useFrontdeskPoll } from "@/hooks/use-frontdesk-poll";
import { useToast } from "@/components/ui/toast-provider";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Patient, Visit } from "@/design-system/frontdesk-data";
import type { IpdAdmissionDetail } from "@/design-system/ipd-data";
import { getVisitForBillingAction } from "@/app/actions/clinical-actions";
import { getIpdAdmissionAction } from "@/app/actions/ipd-actions";
import { IpdWalletPanel } from "@/components/frontdesk/ipd-wallet-panel";
import { IpdServiceCartPanel } from "@/components/frontdesk/ipd-service-cart-panel";
import { IpdFinalBillModal } from "@/components/frontdesk/ipd-final-bill-modal";
import { LabOrderButton } from "@/components/lab/lab-order-modal";

const PATAUDI_BRANCH_ID = "branch_pataudi";
type BillingMode = "opd" | "ipd";

export type BillingWorkspaceProps = {
  mode: BillingMode;
  defaultTitle: string;
  defaultMeta: string;
};

function isVisitIpd(visit?: Visit) {
  if (!visit) return false;
  return visit.treatmentPath === "ipd" || Boolean(visit.ipdAdmissionId);
}

export function BillingWorkspace({ mode, defaultTitle, defaultMeta }: BillingWorkspaceProps) {
  useFrontdeskPoll();
  const router = useRouter();
  const params = useSearchParams();
  const visitParam = params.get("visit") ?? undefined;
  const { session } = useSession();
  const isPataudi = session?.branchId === PATAUDI_BRANCH_ID;
  const {
    processBilling,
    processCounselBilling,
    getPendingBilling,
    getVisit,
    getPatient,
    getPatientVisits,
    saveSubmission,
    billingHandoffs,
    getBillingHandoff,
    patients,
  } = useFrontdeskStore();
  const { toast } = useToast();
  const [selectedVisitId, setSelectedVisitId] = useState(visitParam ?? "");
  const [routingFlash, setRoutingFlash] = useState<string | null>(null);
  const [receiptVisitId, setReceiptVisitId] = useState<string | null>(null);
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);
  const [finalBillOpen, setFinalBillOpen] = useState(false);

  const pending = getPendingBilling();
  const activeVisitId = selectedVisitId || "";
  const counselForVisit = activeVisitId ? getBillingHandoff(activeVisitId) : undefined;
  const activeVisit = activeVisitId ? getVisit(activeVisitId) : undefined;
  const activePatient = activeVisit ? getPatient(activeVisit.patientId) : undefined;
  const isPostCounsel = Boolean(counselForVisit);

  const [selectedPatient, setSelectedPatient] = useState<Patient | undefined>(activePatient);
  const [directVisit, setDirectVisit] = useState<Visit | undefined>(undefined);
  const [directPatient, setDirectPatient] = useState<Patient | undefined>(undefined);
  const [ipdAdmission, setIpdAdmission] = useState<IpdAdmissionDetail | null>(null);

  const refreshIpdAdmission = useCallback(
    async (admissionId?: string) => {
      if (!admissionId) {
        setIpdAdmission(null);
        return;
      }
      const res = await getIpdAdmissionAction(admissionId);
      if (res.ok && res.data) {
        setIpdAdmission(res.data as IpdAdmissionDetail);
      } else {
        setIpdAdmission(null);
      }
    },
    [],
  );

  useEffect(() => {
    if (mode !== "ipd") {
      setIpdAdmission(null);
      return;
    }
    const visit = directVisit ?? (selectedVisitId ? getVisit(selectedVisitId) : undefined);
    const admissionId = visit?.ipdAdmissionId;
    void refreshIpdAdmission(admissionId);
  }, [mode, selectedVisitId, directVisit, getVisit, refreshIpdAdmission]);

  useEffect(() => {
    if (visitParam) setSelectedVisitId(visitParam);
  }, [visitParam]);

  useEffect(() => {
    setSelectedPatient(directPatient ?? activePatient ?? undefined);
  }, [activePatient?.id, directPatient?.id]);

  // Directly fetch a visit from URL when it is not in the polled workspace snapshot
  // (e.g. IPD admissions that live outside the frontdesk queue).
  useEffect(() => {
    if (!visitParam) {
      setDirectVisit(undefined);
      setDirectPatient(undefined);
      return;
    }
    if (getVisit(visitParam)) return; // already available in store
    let cancelled = false;
    void getVisitForBillingAction(visitParam).then((res) => {
      if (cancelled || !res) return;
      setDirectVisit(res.visit ?? undefined);
      setDirectPatient(res.patient ?? undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [visitParam, getVisit]);

  // Redirect to the correct billing page when a visit is explicitly requested
  // and its treatment path does not match the current page mode.
  useEffect(() => {
    if (!visitParam) return;
    const visit = directVisit ?? getVisit(visitParam);
    if (!visit) return;
    const ipd = isVisitIpd(visit);
    if (mode === "opd" && ipd) {
      router.replace(`/app/frontdesk/ipd-billing?visit=${visitParam}`);
    } else if (mode === "ipd" && !ipd) {
      router.replace(`/app/frontdesk/opd-billing?visit=${visitParam}`);
    }
  }, [visitParam, directVisit, getVisit, mode, router]);

  const resolveVisitForPatient = (patient: Patient) => {
    const visits = getPatientVisits(patient.id);
    const billable = visits.find(
      (v) => v.stage === "billing" || v.billing === "pending" || v.billing === "deferred" || v.billing === "partial",
    );
    return billable ?? visits[visits.length - 1];
  };

  const selectedVisit = useMemo(() => {
    if (directVisit) return directVisit;
    if (selectedVisitId) return getVisit(selectedVisitId);
    if (selectedPatient) return resolveVisitForPatient(selectedPatient);
    return undefined;
  }, [directVisit, selectedVisitId, selectedPatient, getVisit, getPatientVisits]);

  const handleBillingSuccess = (result: {
    ok: true;
    routeHref: string;
    routingNote: string;
    visitId: string;
    finalized?: boolean;
  }) => {
    setRoutingFlash(result.routingNote);
    if (result.finalized) {
      setReceiptVisitId(result.visitId);
      setPendingRoute(result.routeHref);
    } else {
      setReceiptVisitId(null);
      setPendingRoute(null);
    }
  };

  const finishBilling = async (resultPromise: ReturnType<typeof processBilling>) => {
    const result = await resultPromise;
    if (!result.ok) {
      toast(result.error, "error");
      return;
    }
    handleBillingSuccess(result);
  };

  const closeReceipt = () => {
    setReceiptVisitId(null);
    if (pendingRoute) {
      router.push(pendingRoute);
      setPendingRoute(null);
    }
  };

  const pageTitle = isPostCounsel ? "Post-counsellor billing" : defaultTitle;
  const pageMeta = isPostCounsel
    ? "Full / partial payment · OPD → IPD conversion · routing by payment state"
    : defaultMeta;

  const routingGuideText =
    mode === "ipd"
      ? "Paid or deferred IPD patients return to the ward. Unpaid balances are tracked against the admission."
      : "Paid or deferred patients proceed to queue → junior exam → doctor consult.";

  const queueHref = mode === "ipd" ? "/app/frontdesk/ipd" : "/app/frontdesk/queue";
  const queueLabel = mode === "ipd" ? "View ward map →" : "View queue →";

  return (
    <>
      <PageChrome
        breadcrumbs={[
          { label: "Front Desk", href: "/app/frontdesk" },
          { label: mode === "ipd" ? "IPD Billing" : "OPD Billing" },
        ]}
        title={pageTitle}
        meta={pageMeta}
      >
        {routingFlash && (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-900">
            {routingFlash}
            {receiptVisitId && (
              <p className="mt-1 text-[12px]">Receipt ready — print for the patient, then continue.</p>
            )}
            {!receiptVisitId && routingFlash && (
              <p className="mt-1 text-[12px]">Partial payment received — invoice will be available once the full amount is collected.</p>
            )}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <div>
            {activeVisit && counselForVisit ? (
              <Panel title={`Package closure · ${activePatient?.name ?? "Patient"}`}>
                <PostCounselBillingForm
                  handoff={counselForVisit}
                  onSubmit={async (input) => {
                    await saveSubmission("billing", input as unknown as Record<string, string | number | boolean>, {
                      visitId: activeVisit.id,
                      patientId: activeVisit.patientId,
                    });
                    void finishBilling(processCounselBilling(activeVisit.id, input));
                  }}
                />
              </Panel>
            ) : isPataudi && mode === "ipd" && ipdAdmission ? (
              <>
                <IpdServiceCartPanel
                  admission={ipdAdmission}
                  onChange={() => void refreshIpdAdmission(ipdAdmission.id)}
                  onGenerateFinalBill={() => setFinalBillOpen(true)}
                />
                {finalBillOpen && (
                  <IpdFinalBillModal
                    admission={ipdAdmission}
                    onClose={() => setFinalBillOpen(false)}
                    onGenerated={() => {
                      setFinalBillOpen(false);
                      void refreshIpdAdmission(ipdAdmission.id);
                    }}
                  />
                )}
              </>
            ) : (
              <OpdBillingForm
                branchId={session?.branchId}
                branchName={session?.branchName}
                patients={patients}
                patient={selectedPatient}
                visit={selectedVisit}
                onSelectPatient={(p) => {
                  setSelectedPatient(p);
                  const v = resolveVisitForPatient(p);
                  if (v) setSelectedVisitId(v.id);
                }}
                onClearPatient={() => {
                  setSelectedPatient(undefined);
                  setSelectedVisitId("");
                }}
                onSubmit={async (data) => {
                  if (!selectedVisit || !selectedPatient) return;
                  await saveSubmission("billing", data, {
                    visitId: selectedVisit.id,
                    patientId: selectedPatient.id,
                  });
                  void finishBilling(processBilling(selectedVisit.id, data));
                }}
              />
            )}
          </div>

          <div className="space-y-4">
            {billingHandoffs.length > 0 && (
              <Panel title="From counsellor">
                <ul className="space-y-2">
                  {billingHandoffs.map((h) => {
                    const selected = selectedVisitId === h.visitId;
                    return (
                      <li key={h.visitId} className="flex items-stretch gap-1">
                        <button
                          type="button"
                          onClick={() => setSelectedVisitId(selected ? "" : h.visitId)}
                          className={cn(
                            "flex-1 rounded-lg border p-3 text-left transition-colors",
                            selected
                              ? "border-[var(--attio-accent)] bg-[var(--attio-accent)]/10"
                              : "border-[var(--attio-border-subtle)] hover:bg-[var(--attio-hover)]",
                          )}
                        >
                          <p className="text-[13px] font-medium">{h.patientName}</p>
                          <p className="text-[11px] text-[var(--attio-text-tertiary)]">{h.quote.packageLabel}</p>
                        </button>
                        {selected && (
                          <button
                            type="button"
                            onClick={() => setSelectedVisitId("")}
                            className="flex items-center rounded-lg border border-red-200 px-2 text-red-600 hover:bg-red-50"
                            title="Clear selection"
                            aria-label="Clear selection"
                          >
                            ×
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            )}

            <Panel
              title="Awaiting billing"
              action={
                <span className="text-[11px] text-[var(--attio-text-tertiary)]">{pending.length} visit(s)</span>
              }
            >
              {pending.length === 0 ? (
                <p className="text-[13px] text-[var(--attio-text-tertiary)]">All clear — use search above to bill any patient.</p>
              ) : (
                <ul className="max-h-48 space-y-1 overflow-y-auto text-[12px] text-[var(--attio-text-secondary)]">
                  {pending.map(({ visit, patient }) => {
                    const billingVariant =
                      visit.billing === "paid"
                        ? "success"
                        : visit.billing === "partial"
                          ? "info"
                          : visit.billing === "deferred"
                            ? "neutral"
                            : "warning";
                    return (
                      <li key={visit.id}>
                        {patient.name} · {visit.doctorName} ·{" "}
                        <StatusBadge label={visit.billing} variant={billingVariant} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>

            {selectedPatient && (
              <Panel title="Laboratory">
                <p className="text-[13px] text-[var(--attio-text-secondary)]">
                  {selectedVisit ? "Order tests for this visit." : "Order tests for this patient."}
                </p>
                <div className="mt-2">
                  <LabOrderButton
                    patientId={selectedPatient.id}
                    patientName={selectedPatient.name}
                    visitId={selectedVisit?.id}
                    admissionId={selectedVisit?.ipdAdmissionId}
                    source={selectedVisit && isVisitIpd(selectedVisit) ? "ipd" : selectedVisit ? "opd" : "direct"}
                    onCreated={(orderId) => toast(`Lab order ${orderId} created`, "success")}
                  />
                </div>
              </Panel>
            )}

            {mode === "ipd" && ipdAdmission && (
              <IpdWalletPanel
                admission={ipdAdmission}
                onChange={() => {
                  void refreshIpdAdmission(ipdAdmission.id);
                }}
              />
            )}

            <Panel title="Routing guide">
              <p className="text-[13px] text-[var(--attio-text-secondary)]">{routingGuideText}</p>
              <Link
                href={queueHref}
                className="mt-2 inline-block text-[13px] font-medium text-[var(--attio-accent)] hover:underline"
              >
                {queueLabel}
              </Link>
            </Panel>
          </div>
        </div>
      </PageChrome>

      <BillingReceiptModal open={Boolean(receiptVisitId)} visitId={receiptVisitId} onClose={closeReceipt} />
    </>
  );
}
