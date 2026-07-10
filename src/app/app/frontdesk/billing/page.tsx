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
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import type { Patient } from "@/design-system/frontdesk-data";

function BillingContent() {
  useFrontdeskPoll();
  const router = useRouter();
  const params = useSearchParams();
  const visitParam = params.get("visit") ?? undefined;
  const { session } = useSession();
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

  const pending = getPendingBilling();
  const activeVisitId = selectedVisitId || billingHandoffs[0]?.visitId || "";
  const counselForVisit = activeVisitId ? getBillingHandoff(activeVisitId) : undefined;
  const activeVisit = activeVisitId ? getVisit(activeVisitId) : undefined;
  const activePatient = activeVisit ? getPatient(activeVisit.patientId) : undefined;
  const isPostCounsel = Boolean(counselForVisit);

  const [selectedPatient, setSelectedPatient] = useState<Patient | undefined>(activePatient);

  useEffect(() => {
    if (visitParam) setSelectedVisitId(visitParam);
  }, [visitParam]);

  useEffect(() => {
    if (activePatient) setSelectedPatient(activePatient);
  }, [activePatient?.id]);

  const resolveVisitForPatient = (patient: Patient) => {
    const visits = getPatientVisits(patient.id);
    const billable = visits.find(
      (v) => v.stage === "billing" || v.billing === "pending" || v.billing === "deferred" || v.billing === "partial",
    );
    return billable ?? visits[visits.length - 1];
  };

  const selectedVisit = useMemo(() => {
    if (selectedVisitId) return getVisit(selectedVisitId);
    if (selectedPatient) return resolveVisitForPatient(selectedPatient);
    return undefined;
  }, [selectedVisitId, selectedPatient, getVisit, getPatientVisits]);

  const handleBillingSuccess = (result: {
    ok: true;
    routeHref: string;
    routingNote: string;
    visitId: string;
    finalized?: boolean;
  }) => {
    setRoutingFlash(result.routingNote);
    setReceiptVisitId(result.visitId);
    if (result.finalized) {
      setPendingRoute(result.routeHref);
    } else {
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

  return (
    <>
      <PageChrome
        breadcrumbs={[
          { label: "Front Desk", href: "/app/frontdesk" },
          { label: "Billing" },
        ]}
        title={isPostCounsel ? "Post-counsellor billing" : "Billing-first OPD"}
        meta={
          isPostCounsel
            ? "Full / partial payment · OPD → IPD conversion · routing by payment state"
            : "Search patient · add branch packages · GST · split payment · release to queue"
        }
      >
        {routingFlash && (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-900">
            {routingFlash}
            {receiptVisitId && (
              <p className="mt-1 text-[12px]">Receipt ready — print for the patient, then continue.</p>
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
                  {billingHandoffs.map((h) => (
                    <li key={h.visitId}>
                      <button
                        type="button"
                        onClick={() => setSelectedVisitId(h.visitId)}
                        className="w-full rounded-lg border border-[var(--attio-border-subtle)] p-3 text-left hover:bg-[var(--attio-hover)]"
                      >
                        <p className="text-[13px] font-medium">{h.patientName}</p>
                        <p className="text-[11px] text-[var(--attio-text-tertiary)]">{h.quote.packageLabel}</p>
                      </button>
                    </li>
                  ))}
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

            <Panel title="Routing guide">
              <p className="text-[13px] text-[var(--attio-text-secondary)]">
                Paid or deferred patients proceed to queue → junior exam → doctor consult.
              </p>
              <Link
                href="/app/frontdesk/queue"
                className="mt-2 inline-block text-[13px] font-medium text-[var(--attio-accent)] hover:underline"
              >
                View queue →
              </Link>
            </Panel>
          </div>
        </div>
      </PageChrome>

      <BillingReceiptModal open={Boolean(receiptVisitId)} visitId={receiptVisitId} onClose={closeReceipt} />
    </>
  );
}

export default function BillingPage() {
  return (
    <Suspense>
      <BillingContent />
    </Suspense>
  );
}
