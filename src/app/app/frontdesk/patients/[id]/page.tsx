"use client";

import { BillingReceiptModal } from "@/components/frontdesk/billing-receipt-modal";
import { useSession } from "@/components/candela/session-provider";
import { useFrontdeskStore } from "@/components/frontdesk/frontdesk-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, Panel, StatusBadge } from "@/components/frontdesk/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PatientDocumentsPanel } from "@/components/patient-documents";
import { PatientConsentsPanel } from "@/components/patient-consents";
import { PatientPrescriptionsPanel } from "@/components/frontdesk/patient-prescriptions-panel";
import { formatStageStatus, resolvePatientAge } from "@/lib/frontdesk-workflow";
import { problemLabelForValue } from "@/lib/department-problems";
import { ArrowLeft, CreditCard, Download, ListOrdered, Pencil, Printer, UserCog } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { assignCounsellorToPatientAction } from "@/server/crm/online-counsellor-actions";
import { getPatientInvoicesAction, getPatientInvoiceReceiptsAction } from "@/app/actions/clinical-actions";
import { getIpdAdmissionsByPatientAction } from "@/app/actions/ipd-actions";
import { downloadPdfBytes } from "@/lib/invoice-pdf";
import { generatePatientInvoiceSummaryPdf } from "@/lib/patient-invoice-summary-pdf";

export default function PatientRecordPage() {
  const params = useParams();
  const id = params.id as string;
  const { getPatient, getPatientVisits, visits } = useFrontdeskStore();
  const patient = getPatient(id);
  const patientVisits = patient ? getPatientVisits(patient.id) : [];
  const activeVisit = patientVisits.find((v) => !["completed", "with_doctor"].includes(v.stage));
  const billingTotals = useMemo(() => {
    const billed = patientVisits.filter((v) => v.billAmount);
    const paid = billed.reduce((sum, v) => sum + (v.amountPaid ?? 0), 0);
    const pending = billed.reduce((sum, v) => sum + (v.balanceDue ?? 0), 0);
    return { billed, paid, pending };
  }, [patientVisits]);
  const { setActivePatientId } = useSession();
  const [reprintVisitId, setReprintVisitId] = useState<string | null>(null);
  const [reprintInvoiceId, setReprintInvoiceId] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<Extract<Awaited<ReturnType<typeof getPatientInvoicesAction>>, { ok: true }>["data"]["invoices"]>([]);
  const [printingAll, setPrintingAll] = useState(false);
  const [selectedInvoiceNumbers, setSelectedInvoiceNumbers] = useState<Set<string>>(() => new Set());
  const [downloadingSelected, setDownloadingSelected] = useState(false);
  const [counsellors, setCounsellors] = useState<{ id: string; name: string }[]>([]);
  const [selectedCounsellor, setSelectedCounsellor] = useState("");
  const [reassigning, setReassigning] = useState(false);
  const [reassignToast, setReassignToast] = useState<string | null>(null);
  const [patientStatus, setPatientStatus] = useState<string>("");
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [ipdAdmissions, setIpdAdmissions] = useState<Extract<Awaited<ReturnType<typeof getIpdAdmissionsByPatientAction>>, { ok: true }>["data"]>([]);

  useEffect(() => {
    if (patient) setActivePatientId(patient.id);
  }, [patient, setActivePatientId]);

  useEffect(() => {
    if (!patient) return;
    let cancelled = false;
    void getPatientInvoicesAction(patient.id).then((result) => {
      if (cancelled) return;
      if (result.ok && result.data) setInvoices(result.data.invoices);
    });
    void getIpdAdmissionsByPatientAction(patient.id).then((result) => {
      if (cancelled) return;
      if (result.ok && result.data) setIpdAdmissions(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [patient]);

  useEffect(() => {
    if (patient) {
      setPatientStatus((patient as any).status || "active");
    }
  }, [patient]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/crm/counsellors", { credentials: "include" });
        const json = await res.json();
        if (json.ok) setCounsellors(json.data);
      } catch {}
    })();
  }, []);

  const handleReassign = async () => {
    if (!selectedCounsellor || !patient) return;
    const counsellor = counsellors.find((c) => c.id === selectedCounsellor);
    if (!counsellor) return;
    setReassigning(true);
    const result = await assignCounsellorToPatientAction(patient.id, counsellor.id, counsellor.name);
    setReassigning(false);
    if (result.ok) {
      setReassignToast(`Counsellor reassigned to ${counsellor.name}.`);
      setTimeout(() => setReassignToast(null), 4000);
    } else {
      setReassignToast(`Failed: ${result.error}`);
      setTimeout(() => setReassignToast(null), 4000);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!patient) return;
    setUpdatingStatus(true);
    try {
      const res = await fetch("/api/patients/status", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: patient.id, status: newStatus }),
      });
      const json = await res.json();
      if (json.ok) {
        setPatientStatus(newStatus);
        setReassignToast(`Patient status updated to ${newStatus}.`);
        setTimeout(() => setReassignToast(null), 3000);
      } else {
        setReassignToast(`Failed: ${json.error}`);
        setTimeout(() => setReassignToast(null), 3000);
      }
    } catch {
      setReassignToast("Failed to update status");
      setTimeout(() => setReassignToast(null), 3000);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleViewDischargeSummary = (admission: (typeof ipdAdmissions)[number], summary: Record<string, string>) => {
    const name = patient?.name ?? "";
    const uhid = patient?.uhid ?? "";
    const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const formatDate = (value?: string) => {
      if (!value) return "—";
      const d = new Date(value);
      return isNaN(d.getTime()) ? value : d.toLocaleDateString("en-IN");
    };
    const fields = [
      { label: "Admission date", value: formatDate(summary.admissionDate) },
      { label: "Discharge date", value: formatDate(summary.dischargeDate) },
      { label: "Diagnosis", value: summary.diagnosis },
      { label: "Procedures", value: summary.procedures },
      { label: "Medications", value: summary.medications },
      { label: "Follow up", value: summary.followUp },
      { label: "Notes", value: summary.notes },
    ];
    const body = fields
      .filter((f) => typeof f.value === "string" && f.value.trim() !== "" && f.value !== "—")
      .map((f) => `<div class="section"><div class="label">${escape(f.label)}</div><div class="value">${escape(f.value)}</div></div>`)
      .join("");
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head><title>Discharge Summary - ${escape(name)}</title>
          <style>body{font-family:system-ui,sans-serif;padding:24px;color:#111;}h1{font-size:18px;margin:0 0 8px;}.meta{color:#555;font-size:12px;margin-bottom:16px;}.section{margin-bottom:12px;}.label{font-weight:600;font-size:12px;color:#444;}.value{font-size:12px;white-space:pre-wrap;}</style>
        </head>
        <body>
          <h1>Discharge Summary</h1>
          <div class="meta">${escape(name)} · ${escape(uhid)} · ${escape(admission.ward)} Bed ${escape(admission.bed)}</div>
          ${body}
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

  if (!patient) {
    return (
      <PageChrome breadcrumbs={[{ label: "Front Desk", href: "/app/frontdesk" }, { label: "Patients" }]} title="Patient not found">
        <Link href="/app/frontdesk/patients" className="text-[13px] text-[var(--attio-accent)]">← Back</Link>
      </PageChrome>
    );
  }

  return (
    <PageChrome
      breadcrumbs={[
        { label: "Front Desk", href: "/app/frontdesk" },
        { label: "Patients", href: "/app/frontdesk/patients" },
        { label: patient.name },
      ]}
      title={patient.name}
      meta={`${patient.uhid} · ${resolvePatientAge(patient.age, patient.dateOfBirth) || "—"}y · ${patient.phone}`}
      actions={
        <>
          <Link href={`/app/frontdesk/patients/${patient.id}/edit`}>
            <AttioButton variant="secondary" className="gap-1"><Pencil className="size-3.5" /> Edit</AttioButton>
          </Link>
          <Link href={`/app/frontdesk/check-in?patient=${patient.id}${activeVisit ? `&visit=${activeVisit.id}` : ""}`}>
            <AttioButton variant="secondary">Check in</AttioButton>
          </Link>
          {activeVisit && (
            <Link href={`/app/frontdesk/billing?visit=${activeVisit.id}`}>
              <AttioButton variant="secondary" className="gap-1"><CreditCard className="size-3.5" /> Bill</AttioButton>
            </Link>
          )}
          <Link href="/app/frontdesk/queue">
            <AttioButton variant="primary" className="gap-1"><ListOrdered className="size-3.5" /> Queue</AttioButton>
          </Link>
        </>
      }
    >
      <Link
        href="/app/frontdesk/patients"
        className="mb-4 inline-flex items-center gap-1 text-[13px] text-[var(--attio-text-tertiary)] hover:text-[var(--attio-text)]"
      >
        <ArrowLeft className="size-4" />
        Patients
      </Link>

      <div className="mb-4 flex flex-wrap gap-1">
        {Array.isArray(patient.tags) && patient.tags.map((t) => (
          <StatusBadge key={t} label={t} variant="neutral" />
        ))}
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="visits">Visits</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="prescriptions">Prescriptions</TabsTrigger>
          <TabsTrigger value="ipd">IPD</TabsTrigger>
          <TabsTrigger value="counsellor">Counsellor</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="consents">Consents</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Demographics">
              <dl className="grid grid-cols-2 gap-3 text-[13px]">
                <div><dt className="text-[var(--attio-text-tertiary)]">Email</dt><dd>{patient.email ?? "—"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">Referrer</dt><dd>{patient.referrer ?? "—"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">Referral source</dt><dd>{patient.referrerSource ?? "—"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">Referral doctor</dt><dd>{(patient as any).referralDoctorName ?? "—"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">Corporate ID</dt><dd>{patient.corporateId ?? "—"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">Problem</dt><dd>{patient.problem ? problemLabelForValue(patient.problem) : "—"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">Status</dt>
                  <dd>
                    <select
                      value={patientStatus}
                      onChange={(e) => handleStatusChange(e.target.value)}
                      disabled={updatingStatus}
                      className="h-7 rounded border px-2 text-[12px]"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="blocked">Blocked</option>
                      <option value="deceased">Deceased</option>
                    </select>
                  </dd>
                </div>
                <div><dt className="text-[var(--attio-text-tertiary)]">Consent</dt><dd>{patient.consentTreatment || patient.consentData ? "On file" : "—"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">Last visit</dt><dd>{patient.lastVisit ?? "—"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">Balance</dt><dd>{patient.balance > 0 ? `₹${patient.balance}` : "Clear"}</dd></div>
                {patient.registrationNotes && (
                  <div className="col-span-2"><dt className="text-[var(--attio-text-tertiary)]">Notes</dt><dd>{patient.registrationNotes}</dd></div>
                )}
              </dl>
            </Panel>
            <Panel title="Address">
              <dl className="grid grid-cols-2 gap-3 text-[13px]">
                <div><dt className="text-[var(--attio-text-tertiary)]">Country</dt><dd>{patient.country ?? "—"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">State</dt><dd>{patient.state ?? "—"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">District</dt><dd>{patient.district ?? "—"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">City</dt><dd>{patient.city ?? "—"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">Area</dt><dd>{patient.area ?? "—"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">Society / colony</dt><dd>{patient.society ?? "—"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">House / building</dt><dd>{patient.houseNumber ?? "—"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">Street / road</dt><dd>{patient.street ?? "—"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">Locality / area</dt><dd>{patient.locality ?? "—"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">Landmark</dt><dd>{patient.landmark ?? "—"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">Pincode</dt><dd>{patient.pincode ?? "—"}</dd></div>
                {patient.address && (
                  <div className="col-span-2"><dt className="text-[var(--attio-text-tertiary)]">Full address</dt><dd>{patient.address}</dd></div>
                )}
              </dl>
            </Panel>
            <Panel title="Imported details" className="lg:col-span-2">
              <dl className="grid grid-cols-2 gap-3 text-[13px] md:grid-cols-3 lg:grid-cols-4">
                <div><dt className="text-[var(--attio-text-tertiary)]">Lead ID</dt><dd>{patient.leadId ?? "—"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">User name</dt><dd>{patient.userName ?? "—"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">Campaign</dt><dd>{patient.campaignName ?? "—"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">Source</dt><dd>{patient.source ?? "—"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">Source detail</dt><dd>{patient.sourceDetail ?? "—"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">Lead status</dt><dd>{patient.leadStatus ?? "—"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">Action status</dt><dd>{patient.actionStatus ?? "—"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">Lost reason</dt><dd>{patient.lostReason ?? "—"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">Follow-up date</dt><dd>{patient.followUpDate ?? "—"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">Date of birth</dt><dd>{patient.dateOfBirth ?? "—"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">Anniversary</dt><dd>{patient.anniversaryDate ?? "—"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">Alternate phone</dt><dd>{patient.alternatePhone ?? "—"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">Disease</dt><dd>{patient.disease ?? "—"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">Doctor (appointment)</dt><dd>{patient.doctorName ?? "—"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">Appointment centre</dt><dd>{patient.appointmentCentre ?? "—"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">Referral type</dt><dd>{patient.referralType ?? "—"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">Referral doctor</dt><dd>{patient.referralDoctorName ?? "—"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">Assignee</dt><dd>{patient.assigneeName ?? "—"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">Assignee email</dt><dd>{patient.assigneeEmail ?? "—"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">Action created by</dt><dd>{patient.actionCreatedBy ?? "—"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">Action created by email</dt><dd>{patient.actionCreatedByEmail ?? "—"}</dd></div>
                {patient.userNote && (
                  <div className="col-span-2 md:col-span-3 lg:col-span-4"><dt className="text-[var(--attio-text-tertiary)]">User note</dt><dd>{patient.userNote}</dd></div>
                )}
                {patient.notes && (
                  <div className="col-span-2 md:col-span-3 lg:col-span-4"><dt className="text-[var(--attio-text-tertiary)]">Notes</dt><dd>{patient.notes}</dd></div>
                )}
              </dl>
            </Panel>
            <Panel title="Next best action">
              {activeVisit ? (
                <>
                  <p className="text-[13px] text-[var(--attio-text-secondary)]">
                    Active visit at <strong>{formatStageStatus(activeVisit.stage)}</strong> stage
                  </p>
                  {activeVisit.stage === "billing" && (
                    <Link href={`/app/frontdesk/billing?visit=${activeVisit.id}`} className="mt-3 inline-block">
                      <AttioButton variant="primary">Go to billing</AttioButton>
                    </Link>
                  )}
                  {activeVisit.stage === "registered" && (
                    <Link href={`/app/frontdesk/check-in?visit=${activeVisit.id}&patient=${patient.id}`} className="mt-3 inline-block">
                      <AttioButton variant="primary">Check in now</AttioButton>
                    </Link>
                  )}
                </>
              ) : (
                <p className="text-[13px] text-[var(--attio-text-secondary)]">No active visit — register or book appointment</p>
              )}
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="visits" className="mt-4">
          <Panel title="Visit history">
            <ul className="space-y-2">
              {patientVisits.map((v) => (
                <li key={v.id} className="flex items-center justify-between rounded-lg border border-[var(--attio-border-subtle)] p-3 text-[13px]">
                  <div>
                    <p className="font-medium">{v.doctorName || "Unassigned"}</p>
                    <p className="text-[var(--attio-text-tertiary)]">Token #{v.token ?? "—"} · {formatStageStatus(v.stage)}</p>
                  </div>
                  <StatusBadge label={v.billing} variant={v.billing === "paid" ? "success" : "warning"} />
                </li>
              ))}
            </ul>
          </Panel>
        </TabsContent>

        <TabsContent value="prescriptions" className="mt-4">
          <PatientPrescriptionsPanel patient={patient} visits={patientVisits} />
        </TabsContent>

        <TabsContent value="ipd" className="mt-4">
          <Panel title="IPD admissions">
            {ipdAdmissions.length === 0 ? (
              <p className="text-[13px] text-[var(--attio-text-secondary)]">No IPD admissions recorded.</p>
            ) : (
              <ul className="space-y-2">
                {ipdAdmissions.map((a) => (
                  <li key={a.id} className="rounded-lg border border-[var(--attio-border-subtle)] p-3 text-[13px]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">{a.ward} · Bed {a.bed}</p>
                        <p className="text-[var(--attio-text-tertiary)]">
                          Admitted {new Date(a.admittedAt).toLocaleString("en-IN")} · {a.doctorName}
                        </p>
                      </div>
                      <StatusBadge label={a.status.replace("_", " ")} variant={a.status === "discharged" ? "success" : a.status === "discharge_planned" ? "warning" : "info"} />
                    </div>
                    <p className="mt-1 text-[var(--attio-text-secondary)]">Diagnosis: {a.diagnosis}</p>
                    {(() => {
                      const summary = a.dischargeSummary;
                      const hasSummary = typeof summary === "object" && summary !== null && Object.keys(summary).length > 0;
                      return hasSummary ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <p className="text-[11px] text-[var(--attio-text-tertiary)]">Discharge summary on file</p>
                          <AttioButton
                            variant="secondary"
                            className="!h-7 !text-[11px] gap-1"
                            onClick={() => void handleViewDischargeSummary(a, summary as Record<string, string>)}
                          >
                            <Printer className="size-3.5" />
                            View / Print
                          </AttioButton>
                        </div>
                      ) : null;
                    })()}
                    {a.visitId && (
                      <Link href={`/app/frontdesk/ipd-billing?visit=${a.visitId}`} className="mt-2 inline-block text-[12px] text-[var(--attio-accent)] hover:underline">
                        View billing →
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="billing" className="mt-4">
          <Panel
            title="Billing summary"
            action={
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-[10px] text-[var(--attio-text-tertiary)]">Total paid</p>
                  <p className="text-[13px] font-semibold text-emerald-600">₹{billingTotals.paid.toLocaleString("en-IN")}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-[var(--attio-text-tertiary)]">Total pending</p>
                  <p className="text-[13px] font-semibold text-amber-600">₹{billingTotals.pending.toLocaleString("en-IN")}</p>
                </div>
                <AttioButton
                  variant="primary"
                  className="h-8 gap-1.5 text-[11px]"
                  disabled={printingAll || invoices.length === 0}
                  onClick={async () => {
                    if (!patient) return;
                    setPrintingAll(true);
                    const result = await getPatientInvoiceReceiptsAction(patient.id);
                    if (!result.ok || !result.data?.length) {
                      setPrintingAll(false);
                      return;
                    }
                    try {
                      const bytes = await generatePatientInvoiceSummaryPdf(result.data);
                      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
                      downloadPdfBytes(bytes, `${patient.uhid ?? patient.id}_summary_${timestamp}.pdf`);
                    } catch (err) {
                      console.error("Download invoice summary failed", err);
                    } finally {
                      setPrintingAll(false);
                    }
                  }}
                >
                  <Download className="size-3.5" />
                  {printingAll ? "Preparing…" : "Download summary"}
                </AttioButton>
              </div>
            }
          >
            <p className="text-[13px] text-[var(--attio-text-secondary)]">
              Outstanding ledger: {patient.balance > 0 ? `₹${patient.balance.toLocaleString("en-IN")}` : "None"}
            </p>
            {billingTotals.billed.map((v) => (
              <div key={v.id} className="mt-3 rounded-lg border border-[var(--attio-border-subtle)] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[13px] font-medium">Visit {v.id}</p>
                  <StatusBadge label={v.billing} variant={v.billing === "paid" ? "success" : v.billing === "partial" ? "warning" : "neutral"} />
                  {v.treatmentPath === "ipd" && <StatusBadge label="IPD" variant="info" />}
                </div>
                <p className="mt-1 text-[12px] text-[var(--attio-text-tertiary)]">
                  ₹{v.billAmount?.toLocaleString("en-IN")}
                  {v.amountPaid != null && ` · paid ₹${v.amountPaid.toLocaleString("en-IN")}`}
                  {v.balanceDue ? ` · balance ₹${v.balanceDue.toLocaleString("en-IN")}` : ""}
                </p>
                {v.counselPackageLabel && (
                  <p className="mt-1 text-[12px] text-[var(--attio-text-secondary)]">{v.counselPackageLabel}</p>
                )}
                {v.routingNote && (
                  <p className="mt-2 text-[11px] text-[var(--attio-text-tertiary)]">{v.routingNote}</p>
                )}
                {(v.billAmount ?? 0) > 0 && (
                  <AttioButton
                    variant="secondary"
                    className="mt-3 h-8 gap-1.5 text-[11px]"
                    onClick={() => setReprintVisitId(v.id)}
                  >
                    <Printer className="size-3.5" />
                    Reprint receipt
                  </AttioButton>
                )}
                {v.stage === "ipd_admitted" && (
                  <Link href="/app/doctor/ipd" className="mt-2 inline-block text-[12px] font-medium text-[var(--attio-accent)] hover:underline">
                    View IPD ward →
                  </Link>
                )}
              </div>
            ))}
          </Panel>

          <Panel
            title="All invoices"
            className="mt-4"
            action={
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedInvoiceNumbers(new Set(invoices.map((inv) => inv.invoiceNumber)))}
                  className="text-[11px] text-[var(--attio-accent)] hover:underline"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedInvoiceNumbers(new Set())}
                  className="text-[11px] text-[var(--attio-text-tertiary)] hover:underline"
                >
                  Clear
                </button>
                <AttioButton
                  variant="secondary"
                  className="h-8 gap-1.5 text-[11px]"
                  disabled={downloadingSelected || selectedInvoiceNumbers.size === 0 || invoices.length === 0}
                  onClick={async () => {
                    if (!patient) return;
                    setDownloadingSelected(true);
                    const result = await getPatientInvoiceReceiptsAction(patient.id);
                    if (!result.ok || !result.data?.length) {
                      setDownloadingSelected(false);
                      return;
                    }
                    const selected = result.data.filter((r) => selectedInvoiceNumbers.has(r.invoiceNumber));
                    if (selected.length === 0) {
                      setDownloadingSelected(false);
                      return;
                    }
                    try {
                      const bytes = await generatePatientInvoiceSummaryPdf(selected);
                      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
                      downloadPdfBytes(bytes, `${patient.uhid ?? patient.id}_invoices_${timestamp}.pdf`);
                    } catch (err) {
                      console.error("Download selected invoices failed", err);
                    } finally {
                      setDownloadingSelected(false);
                    }
                  }}
                >
                  <Download className="size-3.5" />
                  {downloadingSelected ? "Preparing…" : `Download selected (${selectedInvoiceNumbers.size})`}
                </AttioButton>
              </div>
            }
          >
            {invoices.length === 0 ? (
              <p className="text-[13px] text-[var(--attio-text-secondary)]">No invoices yet.</p>
            ) : (
              <ul className="space-y-2">
                {invoices.map((inv) => (
                  <li key={inv.id} className="flex flex-col gap-1 rounded-lg border border-[var(--attio-border-subtle)] p-3 text-[13px]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedInvoiceNumbers.has(inv.invoiceNumber)}
                          onChange={() => {
                            setSelectedInvoiceNumbers((prev) => {
                              const next = new Set(prev);
                              if (next.has(inv.invoiceNumber)) next.delete(inv.invoiceNumber);
                              else next.add(inv.invoiceNumber);
                              return next;
                            });
                          }}
                          className="h-4 w-4"
                        />
                        <span className="font-medium">{inv.invoiceNumber}</span>
                        <StatusBadge label={inv.status} variant={inv.status === "paid" ? "success" : inv.status === "partial" ? "warning" : "neutral"} />
                        {inv.treatmentPath === "ipd" && <StatusBadge label="IPD" variant="info" />}
                        {(inv as { hasPharmacy?: boolean }).hasPharmacy && <StatusBadge label="Pharmacy" variant="neutral" />}
                      </div>
                      <span className="text-[12px] text-[var(--attio-text-tertiary)]">{new Date(inv.createdAt).toLocaleString("en-IN")}</span>
                    </div>
                    <p className="text-[var(--attio-text-tertiary)]">
                      Total ₹{inv.totalAmount.toLocaleString("en-IN")}
                      {` · paid ₹${inv.amountPaid.toLocaleString("en-IN")}`}
                      {inv.balanceAmount > 0 ? ` · balance ₹${inv.balanceAmount.toLocaleString("en-IN")}` : ""}
                    </p>
                    <AttioButton
                      variant="secondary"
                      className="mt-1 h-8 gap-1.5 self-start text-[11px]"
                      onClick={() => {
                        setReprintVisitId(inv.visitId);
                        setReprintInvoiceId(inv.id);
                      }}
                    >
                      <Printer className="size-3.5" />
                      Reprint receipt
                    </AttioButton>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="counsellor" className="mt-4">
          <Panel title="Counsellor assignment">
            {reassignToast && (
              <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-900">
                {reassignToast}
              </div>
            )}
            <div className="space-y-3">
              <div>
                <p className="text-[12px] text-[var(--attio-text-tertiary)]">Current counsellor</p>
                <p className="mt-1 text-[14px] font-medium">
                  {(patient as any).assignedCounsellorName ?? "—"}
                </p>
              </div>
              <div>
                <label className="block text-[12px]">
                  <span className="mb-1 block text-[var(--attio-text-tertiary)]">Reassign to</span>
                  <select
                    value={selectedCounsellor}
                    onChange={(e) => setSelectedCounsellor(e.target.value)}
                    className="h-9 w-full rounded-lg border border-[var(--attio-border)] px-3 text-[13px]"
                  >
                    <option value="">Select counsellor…</option>
                    {counsellors.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
              </div>
              <AttioButton
                variant="primary"
                disabled={!selectedCounsellor || reassigning}
                onClick={() => void handleReassign()}
                className="gap-1.5"
              >
                <UserCog className="size-3.5" />
                {reassigning ? "Reassigning…" : "Reassign counsellor"}
              </AttioButton>
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <PatientDocumentsPanel patientId={patient.id} />
        </TabsContent>

        <TabsContent value="consents" className="mt-4">
          <PatientConsentsPanel patientId={patient.id} />
        </TabsContent>
      </Tabs>

      <BillingReceiptModal
        open={Boolean(reprintVisitId)}
        visitId={reprintVisitId}
        invoiceId={reprintInvoiceId}
        onClose={() => {
          setReprintVisitId(null);
          setReprintInvoiceId(null);
        }}
      />
    </PageChrome>
  );
}
