"use client";

import { usePharmacyStore } from "@/components/pharmacy/pharmacy-store";
import { useFrontdeskStore } from "@/components/frontdesk/frontdesk-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { Panel, AttioButton } from "@/components/frontdesk/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useRouter } from "next/navigation";

type PatientType = "registered" | "walkin" | "external";

export default function PharmacyPatientSelectPage() {
  const router = useRouter();
  const { searchPatients, getPatient } = useFrontdeskStore();
  const { createManualPrescription } = usePharmacyStore();
  const [patientType, setPatientType] = useState<PatientType>("registered");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [walkinForm, setWalkinForm] = useState({ name: "", mobile: "", age: "" });
  const [externalForm, setExternalForm] = useState({ 
    name: "", 
    mobile: "", 
    age: "", 
    referralDoctor: "", 
    referralHospital: "", 
    address: "" 
  });

  const searchResults = searchQuery ? searchPatients(searchQuery) : [];

  const handleRegisteredPatient = (patient: any) => {
    setSelectedPatient(patient);
    // Navigate to prescription creation with registered patient
    router.push(`/app/pharmacy/prescriptions/new?patientId=${patient.id}&type=registered`);
  };

  const handleWalkinSubmit = async () => {
    if (!walkinForm.name || !walkinForm.mobile) {
      alert("Please fill name and mobile");
      return;
    }
    // Create walk-in prescription record
    router.push(`/app/pharmacy/prescriptions/new?name=${encodeURIComponent(walkinForm.name)}&mobile=${encodeURIComponent(walkinForm.mobile)}&age=${encodeURIComponent(walkinForm.age)}&type=walkin`);
  };

  const handleExternalSubmit = async () => {
    if (!externalForm.name || !externalForm.mobile) {
      alert("Please fill name and mobile");
      return;
    }
    router.push(`/app/pharmacy/prescriptions/new?name=${encodeURIComponent(externalForm.name)}&mobile=${encodeURIComponent(externalForm.mobile)}&age=${encodeURIComponent(externalForm.age)}&referralDoctor=${encodeURIComponent(externalForm.referralDoctor)}&referralHospital=${encodeURIComponent(externalForm.referralHospital)}&address=${encodeURIComponent(externalForm.address)}&type=external`);
  };

  return (
    <PageChrome
      breadcrumbs={[
        { label: "Pharmacy", href: "/app/pharmacy" },
        { label: "Patient" },
      ]}
      title="Select Patient"
      meta="Choose patient type to begin prescription"
    >
      <div className="mb-6 flex gap-2">
        <AttioButton
          variant={patientType === "registered" ? "primary" : "secondary"}
          onClick={() => setPatientType("registered")}
        >
          Registered Patient
        </AttioButton>
        <AttioButton
          variant={patientType === "walkin" ? "primary" : "secondary"}
          onClick={() => setPatientType("walkin")}
        >
          Walk-in Patient
        </AttioButton>
        <AttioButton
          variant={patientType === "external" ? "primary" : "secondary"}
          onClick={() => setPatientType("external")}
        >
          External Prescription
        </AttioButton>
      </div>

      {patientType === "registered" && (
        <Panel title="Registered Patient (Hospital Patient)">
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
            {searchResults.length > 0 && (
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
                      Select
                    </AttioButton>
                  </li>
                ))}
              </ul>
            )}
            {searchQuery && searchResults.length === 0 && (
              <p className="text-[13px] text-[var(--attio-text-tertiary)]">No patients found</p>
            )}
          </div>
        </Panel>
      )}

      {patientType === "walkin" && (
        <Panel title="Walk-in Patient">
          <div className="space-y-4">
            <div>
              <Label className="text-[12px]">Name *</Label>
              <Input
                type="text"
                value={walkinForm.name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWalkinForm({ ...walkinForm, name: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-[12px]">Mobile Number *</Label>
              <Input
                type="text"
                value={walkinForm.mobile}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWalkinForm({ ...walkinForm, mobile: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-[12px]">Age</Label>
              <Input
                type="text"
                value={walkinForm.age}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWalkinForm({ ...walkinForm, age: e.target.value })}
                className="mt-1"
              />
            </div>
            <AttioButton variant="primary" onClick={handleWalkinSubmit}>
              Continue to Prescription
            </AttioButton>
            <p className="text-[11px] text-[var(--attio-text-tertiary)]">
              Walk-in patients are saved only in Pharmacy Database, not Hospital Patient Database.
            </p>
          </div>
        </Panel>
      )}

      {patientType === "external" && (
        <Panel title="External Doctor / Hospital Patient">
          <div className="space-y-4">
            <div>
              <Label className="text-[12px]">Patient Name *</Label>
              <Input
                type="text"
                value={externalForm.name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExternalForm({ ...externalForm, name: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-[12px]">Mobile Number *</Label>
              <Input
                type="text"
                value={externalForm.mobile}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExternalForm({ ...externalForm, mobile: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-[12px]">Age</Label>
              <Input
                type="text"
                value={externalForm.age}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExternalForm({ ...externalForm, age: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-[12px]">Referral Doctor Name</Label>
              <Input
                type="text"
                value={externalForm.referralDoctor}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExternalForm({ ...externalForm, referralDoctor: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-[12px]">Referral Hospital / Clinic</Label>
              <Input
                type="text"
                value={externalForm.referralHospital}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExternalForm({ ...externalForm, referralHospital: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-[12px]">Address</Label>
              <Input
                type="text"
                value={externalForm.address}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExternalForm({ ...externalForm, address: e.target.value })}
                className="mt-1"
              />
            </div>
            <AttioButton variant="primary" onClick={handleExternalSubmit}>
              Continue to Prescription
            </AttioButton>
            <p className="text-[11px] text-[var(--attio-text-tertiary)]">
              Data stored only in Pharmacy Database, not Hospital Patient Database.
            </p>
          </div>
        </Panel>
      )}
    </PageChrome>
  );
}
