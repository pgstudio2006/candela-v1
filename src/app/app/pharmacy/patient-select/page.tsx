"use client";

import { usePharmacyStore } from "@/components/pharmacy/pharmacy-store";
import { useFrontdeskStore } from "@/components/frontdesk/frontdesk-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { Panel, AttioButton } from "@/components/frontdesk/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useRouter } from "next/navigation";

type PatientType = "registered" | "other_doctor" | "without_prescription";

interface WalkInForm {
  name: string;
  mobile: string;
  age: string;
  referralDoctor: string;
  referralHospital: string;
  referralClinicDetails: string;
  address: string;
}

const buildSearchParams = (base: string, patientType: PatientType, form: WalkInForm) => {
  const params = new URLSearchParams({ patientType });
  if (form.name) params.set("name", form.name);
  if (form.mobile) params.set("mobile", form.mobile);
  if (form.age) params.set("age", form.age);
  if (form.referralDoctor) params.set("referralDoctor", form.referralDoctor);
  if (form.referralHospital) params.set("referralHospital", form.referralHospital);
  if (form.referralClinicDetails) params.set("referralClinicDetails", form.referralClinicDetails);
  if (form.address) params.set("address", form.address);
  return `${base}?${params.toString()}`;
};

export default function PharmacyPatientSelectPage() {
  const router = useRouter();
  const { searchPatients } = useFrontdeskStore();
  const { prescriptions } = usePharmacyStore();
  const [patientType, setPatientType] = useState<PatientType | "registered_refill">("registered");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [walkInForm, setWalkInForm] = useState<WalkInForm>({
    name: "",
    mobile: "",
    age: "",
    referralDoctor: "",
    referralHospital: "",
    referralClinicDetails: "",
    address: "",
  });

  const searchResults = searchQuery ? searchPatients(searchQuery) : [];
  const patientHistory = selectedPatient
    ? prescriptions.filter((r) => r.uhid === selectedPatient.uhid || r.patientName === selectedPatient.name)
    : [];

  const handleRegisteredPatient = (patient: any) => {
    setSelectedPatient(patient);
    if (patientType === "registered_refill") return;
    router.push(`/app/pharmacy/prescriptions?patientId=${patient.id}&patientType=registered`);
  };

  const handleRefill = (rx: import("@/design-system/pharmacy-data").Prescription) => {
    const params = new URLSearchParams({ patientType: "registered" });
    params.set("patientId", selectedPatient.id);
    params.set("refill", "1");
    params.set("rxLines", JSON.stringify(rx.lines.map((l) => ({
      drug: l.drugId,
      dose: l.dose,
      frequency: l.frequency,
      duration: l.duration,
      instructions: l.notes,
    }))));
    router.push(`/app/pharmacy/prescriptions?${params.toString()}`);
  };

  const handleWalkInSubmit = () => {
    if (!walkInForm.name || !walkInForm.mobile) {
      alert("Please fill name and mobile");
      return;
    }
    router.push(buildSearchParams("/app/pharmacy/prescriptions", "without_prescription", walkInForm));
  };

  const handleOtherDoctorSubmit = () => {
    if (!walkInForm.name || !walkInForm.mobile) {
      alert("Please fill name and mobile");
      return;
    }
    router.push(buildSearchParams("/app/pharmacy/prescriptions", "other_doctor", walkInForm));
  };

  const renderWalkInForm = (submitHandler: () => void, submitLabel: string) => (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label className="text-[12px]">Name *</Label>
          <Input
            type="text"
            value={walkInForm.name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWalkInForm({ ...walkInForm, name: e.target.value })}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-[12px]">Mobile Number *</Label>
          <Input
            type="text"
            value={walkInForm.mobile}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWalkInForm({ ...walkInForm, mobile: e.target.value })}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-[12px]">Age</Label>
          <Input
            type="text"
            value={walkInForm.age}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWalkInForm({ ...walkInForm, age: e.target.value })}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-[12px]">Referral Doctor Name</Label>
          <Input
            type="text"
            value={walkInForm.referralDoctor}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWalkInForm({ ...walkInForm, referralDoctor: e.target.value })}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-[12px]">Referral Hospital / Clinic</Label>
          <Input
            type="text"
            value={walkInForm.referralHospital}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWalkInForm({ ...walkInForm, referralHospital: e.target.value })}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-[12px]">Referral Clinic Details</Label>
          <Input
            type="text"
            value={walkInForm.referralClinicDetails}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWalkInForm({ ...walkInForm, referralClinicDetails: e.target.value })}
            className="mt-1"
          />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-[12px]">Address</Label>
          <Input
            type="text"
            value={walkInForm.address}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWalkInForm({ ...walkInForm, address: e.target.value })}
            className="mt-1"
          />
        </div>
      </div>
      <AttioButton variant="primary" onClick={submitHandler}>
        {submitLabel}
      </AttioButton>
      <p className="text-[11px] text-[var(--attio-text-tertiary)]">
        This patient data is saved only in the Pharmacy Database, not the Hospital Patient Database.
      </p>
    </div>
  );

  return (
    <PageChrome
      breadcrumbs={[
        { label: "Pharmacy", href: "/app/pharmacy" },
        { label: "Issue New Order" },
      ]}
      title="Issue New Order"
      meta="Select patient type to begin a new pharmacy order"
    >
      <div className="mb-6 flex flex-wrap gap-2">
        <AttioButton
          variant={patientType === "registered" ? "primary" : "secondary"}
          onClick={() => { setPatientType("registered"); setSelectedPatient(null); }}
        >
          Registered / Own Hospital Patient
        </AttioButton>
        <AttioButton
          variant={patientType === "registered_refill" ? "primary" : "secondary"}
          onClick={() => { setPatientType("registered_refill"); setSelectedPatient(null); }}
        >
          Registered Refill
        </AttioButton>
        <AttioButton
          variant={patientType === "other_doctor" ? "primary" : "secondary"}
          onClick={() => { setPatientType("other_doctor"); setSelectedPatient(null); }}
        >
          Other Doctor / Hospital Patient
        </AttioButton>
        <AttioButton
          variant={patientType === "without_prescription" ? "primary" : "secondary"}
          onClick={() => { setPatientType("without_prescription"); setSelectedPatient(null); }}
        >
          Without Prescription Patient
        </AttioButton>
      </div>

      {(patientType === "registered" || patientType === "registered_refill") && (
        <Panel title={patientType === "registered_refill" ? "Registered Refill" : "Registered / Own Hospital Patient"}>
          <div className="space-y-4">
            <div>
              <Label className="text-[12px]">Search Patient</Label>
              <Input
                type="text"
                placeholder="Search by UHID, name, or mobile number"
                value={searchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                className="mt-1"
              />
            </div>
            {searchResults.length > 0 && !selectedPatient && (
              <ul className="divide-y divide-[var(--attio-border-subtle)]">
                {searchResults.map((patient) => (
                  <li
                    key={patient.id}
                    className="flex items-center justify-between py-3 cursor-pointer hover:bg-[var(--attio-hover)]"
                    onClick={() => handleRegisteredPatient(patient)}
                  >
                    <div>
                      <p className="font-medium">{patient.name}</p>
                      <p className="text-[11px] text-[var(--attio-text-tertiary)]">{patient.uhid} · {patient.phone}</p>
                    </div>
                    <AttioButton variant="secondary" className="text-[12px]">
                      {patientType === "registered_refill" ? "Select for Refill" : "Select"}
                    </AttioButton>
                  </li>
                ))}
              </ul>
            )}
            {searchQuery && searchResults.length === 0 && !selectedPatient && (
              <p className="text-[13px] text-[var(--attio-text-tertiary)]">No patients found</p>
            )}
            {selectedPatient && patientType === "registered_refill" && (
              <div className="space-y-3">
                <p className="text-[13px] font-medium">{selectedPatient.name} · {selectedPatient.uhid}</p>
                {patientHistory.length === 0 && <p className="text-[13px] text-[var(--attio-text-tertiary)]">No previous prescriptions found.</p>}
                {patientHistory.map((rx) => (
                  <div key={rx.id} className="rounded border p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[13px] font-medium">{rx.id} · {rx.doctorName}</p>
                        <p className="text-[11px] text-[var(--attio-text-tertiary)]">{new Date(rx.createdAt).toLocaleDateString("en-IN")} · {rx.lines.length} item(s)</p>
                      </div>
                      <AttioButton variant="primary" className="!h-7 !text-[11px]" onClick={() => handleRefill(rx)}>
                        Refill
                      </AttioButton>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {selectedPatient && patientType === "registered" && (
              <div className="flex items-center justify-between rounded border p-3">
                <div>
                  <p className="font-medium">{selectedPatient.name}</p>
                  <p className="text-[11px] text-[var(--attio-text-tertiary)]">{selectedPatient.uhid} · {selectedPatient.phone}</p>
                </div>
                <AttioButton variant="primary" onClick={() => router.push(`/app/pharmacy/prescriptions?patientId=${selectedPatient.id}&patientType=registered`)}>
                  Continue to Prescription
                </AttioButton>
              </div>
            )}
          </div>
        </Panel>
      )}

      {patientType === "other_doctor" && (
        <Panel title="Other Doctor / Hospital Patient">
          {renderWalkInForm(handleOtherDoctorSubmit, "Continue to Prescription")}
        </Panel>
      )}

      {patientType === "without_prescription" && (
        <Panel title="Without Prescription Patient">
          {renderWalkInForm(handleWalkInSubmit, "Continue to Prescription")}
        </Panel>
      )}
    </PageChrome>
  );
}
