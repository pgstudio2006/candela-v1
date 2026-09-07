"use client";

import { PrintablePrescription } from "@/components/doctor/print/printable-prescription";
import { AttioButton } from "@/components/frontdesk/ui";
import type { ConsultationRecord } from "@/design-system/doctor-data";
import type { Patient, Visit } from "@/design-system/frontdesk-data";
import { printHtmlElement } from "@/lib/doctor-records";
import { CheckCircle2, Pencil, Printer } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

type VerifyPrescriptionModalProps = {
  open: boolean;
  patient: Patient;
  visit: Visit;
  consult: ConsultationRecord;
  doctorName: string;
  /** Label for the primary confirm action, e.g. "Verify & complete consultation". */
  confirmLabel: string;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

/**
 * Final gate before a consultation is completed — the doctor must see the
 * printable prescription and explicitly verify it. Completion only proceeds
 * after the confirm button is pressed.
 */
export function VerifyPrescriptionModal({
  open,
  patient,
  visit,
  consult,
  doctorName,
  confirmLabel,
  confirmDisabled,
  onConfirm,
  onClose,
}: VerifyPrescriptionModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-8 backdrop-blur-[2px]"
      role="presentation"
    >
      <div
        className="mb-8 w-full max-w-[210mm] overflow-hidden rounded-xl border border-[var(--attio-border)] bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Verify prescription"
      >
        <div className="border-b border-[var(--attio-border-subtle)] bg-amber-50/70 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[14px] font-semibold">Verify prescription before completing</h2>
              <p className="mt-0.5 text-[12px] text-[var(--attio-text-tertiary)]">
                Check patient details, diagnosis and medicines. The consultation completes only after you verify.
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <AttioButton variant="secondary" className="gap-1.5" onClick={onClose}>
                <Pencil className="size-3.5" />
                Back to edit
              </AttioButton>
              <AttioButton
                variant="secondary"
                className="gap-1.5"
                onClick={() => printHtmlElement("verify-prescription-sheet", "Prescription")}
              >
                <Printer className="size-3.5" />
                Print
              </AttioButton>
            </div>
          </div>
        </div>
        <div className="max-h-[70vh] overflow-y-auto bg-[#f5f5f4] p-6">
          <div id="verify-prescription-sheet" className="mx-auto bg-white p-8 shadow-sm" style={{ width: "210mm", minHeight: "297mm" }}>
            <PrintablePrescription patient={patient} visit={visit} consult={consult} doctorName={doctorName} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[var(--attio-border-subtle)] px-4 py-3">
          <AttioButton variant="secondary" onClick={onClose}>
            Cancel
          </AttioButton>
          <AttioButton variant="primary" className="gap-1.5" disabled={confirmDisabled} onClick={onConfirm}>
            <CheckCircle2 className="size-4" />
            {confirmDisabled ? "Saving…" : confirmLabel}
          </AttioButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}
