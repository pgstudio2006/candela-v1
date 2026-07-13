"use client";

import {
  admitPatientAction,
  getIpdAdmissionAction,
  getIpdSnapshotAction,
  transferIpdAdmissionAction,
  updateIpdAdmissionAction,
} from "@/app/actions/ipd-actions";
import { getPatientInvoicesAction } from "@/app/actions/clinical-actions";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, MetricStrip, Panel, StatusBadge } from "@/components/frontdesk/ui";
import { PatientSearchField } from "@/components/frontdesk/patient-search-field";
import { IpdServiceCartPanel } from "@/components/frontdesk/ipd-service-cart-panel";
import { useToast } from "@/components/ui/toast-provider";
import type { IpdAdmissionDetail, IpdAdmissionStatus, IpdBillingMode, IpdSnapshot } from "@/design-system/ipd-data";
import { cn } from "@/lib/utils";
import { ArrowRightLeft, BedDouble, Calendar, Loader2, Pencil, Plus, Printer, Stethoscope, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

export default function FrontdeskIpdPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [snapshot, setSnapshot] = useState<IpdSnapshot | null>(null);
  const [selectedBed, setSelectedBed] = useState<{ wardId: string; bedId: string } | null>(null);
  const [selectedAdmission, setSelectedAdmission] = useState<IpdAdmissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<"admit" | "edit" | "transfer" | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

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
      toast("Final discharge is blocked until payment is cleared and the service cart is empty.", "error");
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

  const printDischargeSummary = () => {
    if (!selectedAdmission?.dischargeSummary) return;
    const summary = selectedAdmission.dischargeSummary as Record<string, string>;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return toast("Could not open print window", "error");
    printWindow.document.write(`
      <html>
        <head><title>Discharge Summary - ${selectedAdmission.patientName}</title>
          <style>body{font-family:system-ui,sans-serif;padding:24px;color:#111;}h1{font-size:18px;margin:0 0 8px;}.meta{color:#555;font-size:12px;margin-bottom:16px;}.section{margin-bottom:12px;}.label{font-weight:600;font-size:12px;color:#444;}.value{font-size:12px;white-space:pre-wrap;}</style>
        </head>
        <body>
          <h1>Discharge Summary</h1>
          <div class="meta">${selectedAdmission.patientName} · ${selectedAdmission.uhid ?? ""} · ${selectedAdmission.ward} Bed ${selectedAdmission.bed}</div>
          <div class="section"><div class="label">Admission date</div><div class="value">${summary.admissionDate ?? ""}</div></div>
          <div class="section"><div class="label">Discharge date</div><div class="value">${summary.dischargeDate ?? ""}</div></div>
          <div class="section"><div class="label">Diagnosis</div><div class="value">${summary.diagnosis ?? ""}</div></div>
          <div class="section"><div class="label">Procedures</div><div class="value">${summary.procedures ?? ""}</div></div>
          <div class="section"><div class="label">Medications</div><div class="value">${summary.medications ?? ""}</div></div>
          <div class="section"><div class="label">Follow up</div><div class="value">${summary.followUp ?? ""}</div></div>
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

  const invoiceBalance = patientInvoices.reduce((sum, inv) => sum + (inv.balanceAmount ?? 0), 0);
  const invoiceTotal = patientInvoices.reduce((sum, inv) => sum + (inv.totalAmount ?? 0), 0);
  const invoicePaid = patientInvoices.reduce((sum, inv) => sum + (inv.amountPaid ?? 0), 0);
  const paymentClear =
    selectedAdmission &&
    (selectedAdmission.balanceDue ?? 0) <= 0 &&
    (selectedAdmission.amountPaid ?? 0) >= (selectedAdmission.billAmount ?? 0) &&
    selectedAdmission.cart.length === 0 &&
    invoiceBalance <= 0 &&
    invoicePaid >= invoiceTotal;

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

                        {selectedAdmission.status === "discharged" && (
                          <StatusBadge label="Discharged" variant="success" />
                        )}

                        {Boolean(selectedAdmission.dischargeSummary) && selectedAdmission.status !== "discharged" && (
                          <AttioButton variant="secondary" className="gap-1.5" onClick={printDischargeSummary}>
                            <Printer className="size-3.5" />
                            Print discharge summary
                          </AttioButton>
                        )}

                        {selectedAdmission.status === "doctor_ready" && (
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

                        {selectedAdmission.status !== "doctor_ready" && selectedAdmission.status !== "discharged" && (
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
                    <IpdServiceCartPanel
                      admission={selectedAdmission}
                      onChange={async () => {
                        const res = await getIpdAdmissionAction(selectedAdmission.id);
                        if (res.ok) setSelectedAdmission(res.data);
                        setRefreshKey((k) => k + 1);
                      }}
                    />
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
                        Discharge the patient now and free the bed. Payment and service cart must be cleared.
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
                          Discharge is blocked until payment is cleared and the service cart is empty.
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
    </PageChrome>
  );
}
