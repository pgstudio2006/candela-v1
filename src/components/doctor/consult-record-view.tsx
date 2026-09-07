"use client";

import { getVisitReceiptAction } from "@/app/actions/clinical-actions";
import { listDocumentTemplatesAction } from "@/app/actions/doctor-actions";
import { PrintableConsultRecord } from "@/components/doctor/print/printable-consult-record";
import { InvoicePdfPreviewModal } from "@/components/doctor/print/invoice-pdf-preview-modal";
import { PrintPreviewModal } from "@/components/doctor/print/print-preview-modal";
import { useSession } from "@/components/candela/session-provider";
import { useToast } from "@/components/ui/toast-provider";
import { generatePrescriptionPdf, printPdfBytes } from "@/lib/prescription-pdf";
import { savePdfAsPatientDocument } from "@/lib/patient-documents";
import type { DocumentTemplate } from "@/design-system/document-templates";
import type { OpdReceiptPayload } from "@/lib/opd-receipt";
import { AttioButton, Panel, StatusBadge } from "@/components/frontdesk/ui";
import type { Patient, Visit } from "@/design-system/frontdesk-data";
import type { ConsultationRecord } from "@/design-system/doctor-data";
import {
  consultPrimaryDiagnosis,
  fieldEntries,
  formatConsultDate,
  formatPrescriptionDuration,
  humanizeFieldKey,
  scribeLanguageLabel,
} from "@/lib/doctor-records";
import { FileText, Printer, Receipt } from "lucide-react";
import { useEffect, useState } from "react";

const PATAUDI_BRANCH_ID = "branch_pataudi";

type ConsultRecordViewProps = {
  patient: Patient;
  visit: Visit;
  consult: ConsultationRecord;
  doctorName: string;
  compact?: boolean;
};

export function ConsultRecordView({
  patient,
  visit,
  consult,
  doctorName,
  compact,
}: ConsultRecordViewProps) {
  const { session } = useSession();
  const { toast } = useToast();
  const [printKind, setPrintKind] = useState<"invoice" | "record" | null>(null);
  const [invoiceReceipt, setInvoiceReceipt] = useState<OpdReceiptPayload | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState("");
  const [documentTemplates, setDocumentTemplates] = useState<DocumentTemplate[]>([]);
  const [printingRx, setPrintingRx] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void listDocumentTemplatesAction()
      .then((res) => {
        if (!cancelled && res.ok && res.data) setDocumentTemplates(res.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (printKind !== "invoice") {
      setInvoiceReceipt(null);
      setInvoiceError("");
      return;
    }

    let cancelled = false;
    setInvoiceLoading(true);
    setInvoiceError("");

    void getVisitReceiptAction(visit.id)
      .then((data) => {
        if (cancelled) return;
        if ("error" in data) {
          setInvoiceError(data.error ?? "Could not load invoice.");
          setInvoiceReceipt(null);
        } else {
          setInvoiceReceipt(data.receipt);
        }
      })
      .catch(() => {
        if (!cancelled) setInvoiceError("Could not load invoice.");
      })
      .finally(() => {
        if (!cancelled) setInvoiceLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [printKind, visit.id]);

  const handlePrintPrescription = async () => {
    setPrintingRx(true);
    try {
      const isPataudi = session?.branchId === PATAUDI_BRANCH_ID;
      const defaultTemplate = isPataudi
        ? (documentTemplates.find((t) => t.kind === "prescription" && t.isDefault) ?? null)
        : null;
      const pdfBytes = await generatePrescriptionPdf({
        patient,
        visit,
        consult,
        doctorName,
        layout: defaultTemplate?.layout ?? "navayu-letterhead",
        branchId: session?.branchId,
        uploadedTemplateFileData: defaultTemplate?.fileData,
        template: defaultTemplate,
      });
      printPdfBytes(pdfBytes, "Prescription");
      // Keep the exact printed prescription in the patient profile documents.
      const date = new Date().toISOString().slice(0, 10);
      await savePdfAsPatientDocument(
        patient.id,
        "prescription",
        `prescription-${patient.uhid ?? patient.id}-${date}.pdf`,
        pdfBytes,
        { visitId: visit.id, label: `Prescription · ${doctorName} · ${date}` },
      );
    } catch {
      toast("Could not generate prescription PDF", "error");
    } finally {
      setPrintingRx(false);
    }
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <StatusBadge label={consult.status.replace("_", " ")} variant={consult.status === "completed" ? "success" : "info"} />
        <StatusBadge label={consult.treatmentMode.toUpperCase()} variant="neutral" />
        {consult.scribeTranscript && <StatusBadge label="AI Scribe" variant="info" />}
        {consult.whatsappRxSent && <StatusBadge label="WhatsApp Rx" variant="success" />}
      </div>

      {!compact && (
        <div className="mb-4 flex flex-wrap gap-2">
          <AttioButton
            variant="secondary"
            className="gap-1.5"
            disabled={printingRx}
            onClick={() => void handlePrintPrescription()}
          >
            <Printer className="size-3.5" />
            {printingRx ? "Preparing…" : "Print prescription"}
          </AttioButton>
          <AttioButton variant="secondary" className="gap-1.5" onClick={() => setPrintKind("invoice")}>
            <Receipt className="size-3.5" />
            Print invoice
          </AttioButton>
          <AttioButton variant="secondary" className="gap-1.5" onClick={() => setPrintKind("record")}>
            <FileText className="size-3.5" />
            Print full record
          </AttioButton>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Visit meta">
          <dl className="space-y-2 text-[13px]">
            <div className="flex justify-between"><dt className="text-[var(--attio-text-tertiary)]">Date</dt><dd>{formatConsultDate(consult.completedAt ?? consult.startedAt)}</dd></div>
            <div className="flex justify-between"><dt className="text-[var(--attio-text-tertiary)]">Doctor</dt><dd>{doctorName}</dd></div>
            <div className="flex justify-between"><dt className="text-[var(--attio-text-tertiary)]">Token</dt><dd>#{visit.token ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-[var(--attio-text-tertiary)]">Billing</dt><dd>{visit.billing}</dd></div>
            <div className="flex justify-between"><dt className="text-[var(--attio-text-tertiary)]">Diagnosis</dt><dd className="max-w-[60%] text-right">{consultPrimaryDiagnosis(consult)}</dd></div>
          </dl>
        </Panel>

        {consult.scribeTranscript && (
          <Panel title={`AI Scribe · ${scribeLanguageLabel(consult.scribeLanguage)}`}>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--attio-text-secondary)]">
              {consult.scribeTranscript}
            </p>
            {consult.scribeAppliedAt && (
              <p className="mt-2 text-[11px] text-[var(--attio-text-tertiary)]">
                Applied to examination {formatConsultDate(consult.scribeAppliedAt)}
              </p>
            )}
          </Panel>
        )}

        {fieldEntries(consult.examination).length > 0 && (
          <Panel title="Examination">
            <dl className="space-y-2 text-[13px]">
              {fieldEntries(consult.examination).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11px] font-medium text-[var(--attio-text-tertiary)]">{humanizeFieldKey(k)}</dt>
                  <dd className="mt-0.5 text-[var(--attio-text-secondary)]">{String(v)}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        )}

        {fieldEntries(consult.diagnosis).length > 0 && (
          <Panel title="Diagnosis">
            <dl className="space-y-2 text-[13px]">
              {fieldEntries(consult.diagnosis).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11px] font-medium text-[var(--attio-text-tertiary)]">{humanizeFieldKey(k)}</dt>
                  <dd className="mt-0.5">{String(v)}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        )}

        {fieldEntries(consult.treatment).length > 0 && (
          <Panel title="Treatment">
            <dl className="space-y-2 text-[13px]">
              {fieldEntries(consult.treatment).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11px] font-medium text-[var(--attio-text-tertiary)]">{humanizeFieldKey(k)}</dt>
                  <dd className="mt-0.5">{String(v)}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        )}

        {consult.prescription.length > 0 && (
          <Panel title="Prescription" className="lg:col-span-2">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[var(--attio-border-subtle)] text-left text-[11px] text-[var(--attio-text-tertiary)]">
                  <th className="pb-2 pr-2">#</th>
                  <th className="pb-2 pr-2">Medicine</th>
                  <th className="pb-2 pr-2">Dose</th>
                  <th className="pb-2 pr-2">Freq</th>
                  <th className="pb-2">Duration</th>
                </tr>
              </thead>
              <tbody>
                {consult.prescription.map((rx, i) => (
                  <tr key={rx.id} className="border-b border-[var(--attio-border-subtle)]">
                    <td className="py-2 pr-2">{i + 1}</td>
                    <td className="py-2 pr-2">{rx.drug}</td>
                    <td className="py-2 pr-2">{rx.dose}</td>
                    <td className="py-2 pr-2">{rx.frequency}</td>
                    <td className="py-2">{formatPrescriptionDuration(rx)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}

        {consult.notes && (
          <Panel title="Private notes">
            <p className="text-[13px] text-[var(--attio-text-secondary)]">{consult.notes}</p>
          </Panel>
        )}

        {consult.handoff && fieldEntries(consult.handoff).length > 0 && (
          <Panel title="Counsellor handoff">
            <dl className="space-y-2 text-[13px]">
              {fieldEntries(consult.handoff).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-[var(--attio-text-tertiary)]">{humanizeFieldKey(k)}</dt>
                  <dd className="text-right">{String(v)}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        )}
      </div>

      <InvoicePdfPreviewModal
        open={printKind === "invoice"}
        onClose={() => setPrintKind(null)}
        title="Tax invoice"
        receipt={invoiceReceipt}
        loading={invoiceLoading}
        error={invoiceError}
      />

      <PrintPreviewModal
        open={printKind === "record"}
        onClose={() => setPrintKind(null)}
        title="Consultation record"
        printId="print-record"
      >
        <PrintableConsultRecord patient={patient} visit={visit} consult={consult} doctorName={doctorName} />
      </PrintPreviewModal>
    </>
  );
}
