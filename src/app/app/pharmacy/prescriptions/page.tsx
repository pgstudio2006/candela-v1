"use client";

import { RxWorkspaceModal } from "@/components/pharmacy/rx-workspace";
import { usePharmacyStore } from "@/components/pharmacy/pharmacy-store";
import { useFrontdeskStore } from "@/components/frontdesk/frontdesk-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, DataTable, StatusBadge } from "@/components/frontdesk/ui";
import { PharmacyDialog, PharmacyInput, PharmacySelect, FormRow } from "@/components/pharmacy/ui";
import type { Prescription } from "@/design-system/pharmacy-data";
import { RX_STATUS_LABELS } from "@/design-system/pharmacy-data";
import { usePharmacyPoll } from "@/hooks/use-pharmacy-poll";
import { useToast } from "@/components/ui/toast-provider";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const emptyLine = () => ({ drug: "", dose: "1 tab", frequency: "OD", duration: "7 days", instructions: "" });

export default function PharmacyPrescriptionsPage() {
  usePharmacyPoll();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { getActivePrescriptions, prescriptions, createManualPrescription } = usePharmacyStore();
  const { getPatient } = useFrontdeskStore();
  const [selected, setSelected] = useState<Prescription | null>(null);
  const [filter, setFilter] = useState<string>("active");
  const [sourceFilter, setSourceFilter] = useState<"all" | "opd" | "ipd" | "walk_in">("all");
  const [manualOpen, setManualOpen] = useState(false);
  const [patientName, setPatientName] = useState("");
  const [uhid, setUhid] = useState("");
  const [mobile, setMobile] = useState("");
  const [age, setAge] = useState("");
  const [priority, setPriority] = useState<"routine" | "urgent" | "stat">("routine");
  const [patientType, setPatientType] = useState<"registered" | "other_doctor" | "without_prescription" | "">("");
  const [referral, setReferral] = useState({ doctorName: "", hospital: "", clinicDetails: "", address: "" });
  const [lines, setLines] = useState([emptyLine()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const patientId = searchParams.get("patientId");
    const name = searchParams.get("name");
    const pMobile = searchParams.get("mobile");
    const pAge = searchParams.get("age");
    const pType = searchParams.get("patientType");
    if (patientId) {
      const patient = getPatient(patientId);
      setPatientName(patient?.name ?? "");
      setUhid(patient?.uhid ?? "");
      setMobile(patient?.phone ?? "");
      setAge(patient?.age ? String(patient.age) : "");
      setPatientType("registered");
    } else if (name) {
      setPatientName(name);
      setMobile(pMobile ?? "");
      setAge(pAge ?? "");
      setPatientType((pType as any) ?? "without_prescription");
    }
    const rDoctor = searchParams.get("referralDoctor");
    const rHospital = searchParams.get("referralHospital");
    const rClinic = searchParams.get("referralClinicDetails");
    const rAddress = searchParams.get("address");
    if (rDoctor || rHospital || rClinic || rAddress) {
      setReferral({
        doctorName: rDoctor ?? "",
        hospital: rHospital ?? "",
        clinicDetails: rClinic ?? "",
        address: rAddress ?? "",
      });
    }
    if (patientId || name) setManualOpen(true);

    const refill = searchParams.get("refill");
    const rxLinesParam = searchParams.get("rxLines");
    if (refill === "1" && rxLinesParam) {
      try {
        const parsed = JSON.parse(rxLinesParam) as Array<{ drug: string; dose: string; frequency: string; duration: string; instructions?: string }>;
        if (Array.isArray(parsed) && parsed.length > 0) {
          setLines(parsed.map((l) => ({ ...l, instructions: l.instructions ?? "" })));
          setManualOpen(true);
        }
      } catch {
        // ignore invalid rxLines
      }
    }
  }, [searchParams]);

  const baseRows = filter === "active" ? getActivePrescriptions() : prescriptions;
  const rows = sourceFilter === "all" ? baseRows : baseRows.filter((r) => r.source === sourceFilter);

  const resetManual = () => {
    setPatientName("");
    setUhid("");
    setMobile("");
    setAge("");
    setPriority("routine");
    setPatientType("");
    setReferral({ doctorName: "", hospital: "", clinicDetails: "", address: "" });
    setLines([emptyLine()]);
  };

  const saveManual = async () => {
    if (!patientName.trim() || lines.length === 0 || lines.some((l) => !l.drug.trim())) {
      toast("Enter patient name and at least one drug", "error");
      return;
    }
    setSaving(true);
    const result = await createManualPrescription({
      patientName: patientName.trim(),
      uhid: uhid.trim(),
      mobile: mobile.trim() || undefined,
      age: age ? Number(age) : undefined,
      priority,
      patientType: patientType || undefined,
      referral: Object.values(referral).some(Boolean) ? referral : undefined,
      lines,
    });
    setSaving(false);
    if (!result.ok) {
      toast(result.error ?? "Failed to create manual Rx", "error");
      return;
    }
    toast("Manual Rx created", "success");
    setManualOpen(false);
    resetManual();
  };

  return (
    <PageChrome
      breadcrumbs={[{ label: "Pharmacy", href: "/app/pharmacy" }, { label: "Prescriptions" }]}
      title="Prescriptions queue"
      meta="Verify · dispense · FEFO batch pick · Schedule H register · live refresh"
      actions={
        <div className="flex items-center gap-2">
          <AttioButton variant="primary" onClick={() => setManualOpen(true)}>
            <Plus className="size-3.5" />
            Manual Rx
          </AttioButton>
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as typeof sourceFilter)} className="h-8 rounded-md border px-2 text-[12px]">
            <option value="all">All sources</option>
            <option value="opd">OPD</option>
            <option value="ipd">IPD</option>
            <option value="walk_in">Walk-in</option>
          </select>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="h-8 rounded-md border px-2 text-[12px]">
            <option value="active">Active queue</option>
            <option value="all">All prescriptions</option>
          </select>
        </div>
      }
    >
      <DataTable
        columns={[
          { key: "patient", label: "Patient" },
          { key: "uhid", label: "UHID" },
          { key: "doctor", label: "Doctor" },
          { key: "source", label: "Source" },
          { key: "priority", label: "Priority" },
          { key: "items", label: "Items" },
          { key: "status", label: "Status" },
          { key: "time", label: "Received" },
        ]}
        rows={rows.map((r) => ({
          patient: (
            <button type="button" className="font-medium text-left hover:underline" onClick={() => setSelected(r)}>
              {r.patientName}
            </button>
          ),
          uhid: r.uhid,
          doctor: r.doctorName,
          source: r.source.toUpperCase(),
          priority: <StatusBadge label={r.priority} variant={r.priority === "stat" ? "danger" : r.priority === "urgent" ? "warning" : "neutral"} />,
          items: r.lines.length,
          status: <StatusBadge label={RX_STATUS_LABELS[r.status]} variant="info" />,
          time: new Date(r.createdAt).toLocaleString("en-IN"),
        }))}
      />
      {selected && <RxWorkspaceModal rx={selected} onClose={() => setSelected(null)} />}

      <PharmacyDialog
        open={manualOpen}
        title="Manual prescription"
        subtitle="Create a walk-in Rx directly in the pharmacy queue"
        onClose={() => {
          setManualOpen(false);
          resetManual();
        }}
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormRow label="Patient name" required>
              <PharmacyInput value={patientName} onChange={(e) => setPatientName(e.target.value)} placeholder="Patient name" />
            </FormRow>
            <FormRow label="UHID">
              <PharmacyInput value={uhid} onChange={(e) => setUhid(e.target.value)} placeholder="UHID (optional)" />
            </FormRow>
            <FormRow label="Mobile">
              <PharmacyInput value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="Mobile" />
            </FormRow>
            <FormRow label="Age">
              <PharmacyInput value={age} onChange={(e) => setAge(e.target.value)} placeholder="Age" />
            </FormRow>
            <FormRow label="Priority" required>
              <PharmacySelect value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
                <option value="routine">Routine</option>
                <option value="urgent">Urgent</option>
                <option value="stat">STAT</option>
              </PharmacySelect>
            </FormRow>
          </div>
          {(patientType === "other_doctor" || patientType === "without_prescription") && (
            <div className="grid gap-3 sm:grid-cols-2 rounded-lg border p-3">
              <FormRow label="Referral Doctor Name">
                <PharmacyInput value={referral.doctorName} onChange={(e) => setReferral({ ...referral, doctorName: e.target.value })} placeholder="Referral doctor name" />
              </FormRow>
              <FormRow label="Referral Hospital / Clinic">
                <PharmacyInput value={referral.hospital} onChange={(e) => setReferral({ ...referral, hospital: e.target.value })} placeholder="Referral hospital or clinic" />
              </FormRow>
              <FormRow label="Referral Clinic Details">
                <PharmacyInput value={referral.clinicDetails} onChange={(e) => setReferral({ ...referral, clinicDetails: e.target.value })} placeholder="Referral clinic details" />
              </FormRow>
              <FormRow label="Address">
                <PharmacyInput value={referral.address} onChange={(e) => setReferral({ ...referral, address: e.target.value })} placeholder="Address" />
              </FormRow>
            </div>
          )}
          <div className="space-y-2">
            <p className="text-[12px] font-medium text-[var(--attio-text-secondary)]">Medicines</p>
            {lines.map((line, idx) => (
              <div key={idx} className="grid gap-2 rounded-lg border p-2 sm:grid-cols-5">
                <PharmacyInput placeholder="Drug" value={line.drug} onChange={(e) => setLines(lines.map((l, i) => (i === idx ? { ...l, drug: e.target.value } : l)))} />
                <PharmacyInput placeholder="Dose" value={line.dose} onChange={(e) => setLines(lines.map((l, i) => (i === idx ? { ...l, dose: e.target.value } : l)))} />
                <PharmacyInput placeholder="Frequency" value={line.frequency} onChange={(e) => setLines(lines.map((l, i) => (i === idx ? { ...l, frequency: e.target.value } : l)))} />
                <PharmacyInput placeholder="Duration" value={line.duration} onChange={(e) => setLines(lines.map((l, i) => (i === idx ? { ...l, duration: e.target.value } : l)))} />
                <PharmacyInput placeholder="Instructions" value={line.instructions} onChange={(e) => setLines(lines.map((l, i) => (i === idx ? { ...l, instructions: e.target.value } : l)))} />
              </div>
            ))}
            <AttioButton variant="secondary" onClick={() => setLines([...lines, emptyLine()])}>
              Add line
            </AttioButton>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <AttioButton variant="secondary" onClick={() => { setManualOpen(false); resetManual(); }}>
              Cancel
            </AttioButton>
            <AttioButton variant="primary" disabled={saving} onClick={saveManual}>
              {saving ? "Saving..." : "Create Rx"}
            </AttioButton>
          </div>
        </div>
      </PharmacyDialog>
    </PageChrome>
  );
}
