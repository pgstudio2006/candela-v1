"use client";

import { useCallback, useState } from "react";
import { useSession } from "@/components/candela/session-provider";
import { getIpdAdmissionAction } from "@/app/actions/ipd-actions";
import { IpdServiceCartPanel } from "@/components/frontdesk/ipd-service-cart-panel";
import { IpdWalletPanel } from "@/components/frontdesk/ipd-wallet-panel";
import { IpdRefundPanel } from "@/components/frontdesk/ipd-refund-panel";
import { IpdFinalBillModal } from "@/components/frontdesk/ipd-final-bill-modal";
import { AttioButton, Panel, StatusBadge } from "@/components/frontdesk/ui";
import { LabOrderButton } from "@/components/lab/lab-order-modal";
import type { IpdAdmissionDetail } from "@/design-system/ipd-data";
import { ArrowLeft, BedDouble, Calendar, User } from "lucide-react";

const PATAUDI_BRANCH_ID = "branch_pataudi";

type IpdAdmissionWorkspaceProps = {
  admission: IpdAdmissionDetail;
  onBack?: () => void;
};

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function IpdAdmissionWorkspace({ admission, onBack }: IpdAdmissionWorkspaceProps) {
  const { session } = useSession();
  const isPataudi = session?.branchId === PATAUDI_BRANCH_ID;
  const [admissionState, setAdmissionState] = useState<IpdAdmissionDetail>(admission);
  const [finalBillOpen, setFinalBillOpen] = useState(false);

  const refresh = useCallback(async () => {
    const res = await getIpdAdmissionAction(admissionState.id);
    if (res.ok && res.data) setAdmissionState(res.data);
  }, [admissionState.id]);

  const patientName = admissionState.patientName;
  const bed = admissionState.bed;
  const ward = admissionState.ward;

  return (
    <div className="flex min-h-full flex-col gap-6 p-4 md:p-6">
      {onBack && (
        <div>
          <AttioButton variant="secondary" onClick={onBack} className="gap-1.5">
            <ArrowLeft className="size-4" />
            Back to ward map
          </AttioButton>
        </div>
      )}

      <div className="flex flex-col gap-4 rounded-xl border border-[var(--attio-border)] bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-[var(--attio-surface)]">
              <User className="size-5 text-[var(--attio-text-secondary)]" />
            </div>
            <div>
              <h2 className="text-[16px] font-semibold">{patientName ?? "Patient"}</h2>
              <p className="text-[12px] text-[var(--attio-text-tertiary)]">
                UHID: {admissionState.uhid ?? "—"} · {admissionState.phone ?? "—"}
              </p>
            </div>
          </div>
          <StatusBadge label={admissionState.status} variant={admissionState.status === "admitted" ? "info" : admissionState.status === "discharged" ? "success" : "neutral"} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex items-center gap-2 rounded-lg bg-[var(--attio-surface)] px-3 py-2 text-[12px]">
            <BedDouble className="size-4 text-[var(--attio-text-tertiary)]" />
            <span className="text-[var(--attio-text-secondary)]">Bed:</span>
            <span className="font-medium">{bed ? `${ward} · ${bed}` : "—"}</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-[var(--attio-surface)] px-3 py-2 text-[12px]">
            <Calendar className="size-4 text-[var(--attio-text-tertiary)]" />
            <span className="text-[var(--attio-text-secondary)]">Admitted:</span>
            <span className="font-medium">{new Date(admissionState.admittedAt).toLocaleDateString()}</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-[var(--attio-surface)] px-3 py-2 text-[12px]">
            <span className="text-[var(--attio-text-secondary)]">Available {isPataudi ? "advance" : "wallet"}:</span>
            <span className="font-medium tabular-nums">{fmt(admissionState.walletBalance ?? 0)}</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-[var(--attio-surface)] px-3 py-2 text-[12px]">
            <span className="text-[var(--attio-text-secondary)]">Final invoice:</span>
            <span className="font-medium">{admissionState.finalInvoiceId ? admissionState.finalInvoiceId : "Not generated"}</span>
          </div>
        </div>
      </div>

      <Panel title="Laboratory">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-[var(--attio-text-secondary)]">
            Order lab tests for this admission. Tests are added to the IPD service cart and become available to the laboratory.
          </p>
          <LabOrderButton
            patientId={admissionState.patientId}
            patientName={admissionState.patientName}
            visitId={admissionState.visitId}
            admissionId={admissionState.id}
            source="ipd"
            onCreated={() => refresh()}
          />
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <IpdServiceCartPanel
          admission={admissionState}
          onChange={refresh}
          onGenerateFinalBill={() => setFinalBillOpen(true)}
        />
        <IpdWalletPanel admission={admissionState} onChange={refresh} />
      </div>

      <IpdRefundPanel admission={admissionState} onChange={refresh} />

      {finalBillOpen && (
        <IpdFinalBillModal
          admission={admissionState}
          onClose={() => setFinalBillOpen(false)}
          onGenerated={() => {
            setFinalBillOpen(false);
            void refresh();
          }}
        />
      )}
    </div>
  );
}
