"use client";

import { getEmergencyVisitsAction, registerEmergencyAction } from "@/app/actions/emergency-actions";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, Panel } from "@/components/frontdesk/ui";
import { useToast } from "@/components/ui/toast-provider";
import { EmergencyReferralForm } from "@/components/emergency-referral";
import { getIpdSnapshotAction } from "@/app/actions/ipd-actions";
import type { IpdSnapshot } from "@/design-system/ipd-data";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type EmergencyVisit = {
  id: string;
  patientId: string;
  patientName: string;
  uhid: string;
  phone: string | null;
  age: number | null;
  gender: string | null;
  complaint: string;
  stage: string;
  treatmentPath: string | null;
  doctorName: string | null;
  ipdAdmissionId: string | null;
  createdAt: string;
};

export default function EmergencyPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [visits, setVisits] = useState<EmergencyVisit[]>([]);
  const [snapshot, setSnapshot] = useState<IpdSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [referralVisit, setReferralVisit] = useState<EmergencyVisit | null>(null);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    age: "",
    gender: "",
    complaint: "",
    mlc: false,
    mlcDetails: "",
    broughtBy: "",
    policeStation: "",
    firNumber: "",
    admitToIpd: false,
    attendingDoctorId: "",
    expectedDischarge: "",
    bpSystolic: "",
    bpDiastolic: "",
    pulse: "",
    spo2: "",
    temperature: "",
    unknownPatient: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    const [visitsRes, snapshotRes] = await Promise.all([getEmergencyVisitsAction(), getIpdSnapshotAction()]);
    if (visitsRes.ok && visitsRes.data) setVisits(visitsRes.data);
    if (snapshotRes.ok && snapshotRes.data) setSnapshot(snapshotRes.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.complaint.trim()) {
      return toast("Complaint is required", "error");
    }
    setBusy(true);
    const vitals: Record<string, string | number | boolean> = {};
    if (form.bpSystolic) vitals.bpSystolic = Number(form.bpSystolic);
    if (form.bpDiastolic) vitals.bpDiastolic = Number(form.bpDiastolic);
    if (form.pulse) vitals.pulse = Number(form.pulse);
    if (form.spo2) vitals.spo2 = Number(form.spo2);
    if (form.temperature) vitals.temperature = Number(form.temperature);

    const res = await registerEmergencyAction({
      name: form.unknownPatient ? undefined : form.name,
      phone: form.unknownPatient ? undefined : form.phone,
      age: form.age ? Number(form.age) : undefined,
      gender: form.gender || undefined,
      complaint: form.complaint,
      mlc: form.mlc,
      mlcDetails: form.mlcDetails,
      broughtBy: form.broughtBy,
      policeStation: form.policeStation,
      firNumber: form.firNumber,
      admitToIpd: form.admitToIpd,
      attendingDoctorId: form.attendingDoctorId || undefined,
      expectedDischarge: form.expectedDischarge || undefined,
      vitals,
    });
    if (res.ok) {
      toast("Emergency registration saved", "success");
      setShowForm(false);
      setForm({
        name: "",
        phone: "",
        age: "",
        gender: "",
        complaint: "",
        mlc: false,
        mlcDetails: "",
        broughtBy: "",
        policeStation: "",
        firNumber: "",
        admitToIpd: false,
        attendingDoctorId: "",
        expectedDischarge: "",
        bpSystolic: "",
        bpDiastolic: "",
        pulse: "",
        spo2: "",
        temperature: "",
        unknownPatient: false,
      });
      load();
    } else {
      toast((res as any).error ?? "Registration failed", "error");
    }
    setBusy(false);
  };

  return (
    <PageChrome
      breadcrumbs={[{ label: "Front Desk", href: "/app/frontdesk" }, { label: "Emergency" }]}
      title="Emergency"
      meta="Registration · MLC · triage · emergency ward admission"
      actions={
        <AttioButton variant="primary" onClick={() => setShowForm(true)}>
          + New emergency registration
        </AttioButton>
      }
    >
      {showForm && (
        <Panel title="Emergency registration">
          <form onSubmit={handleSubmit} className="space-y-3 text-[13px]">
            <label className="flex items-center gap-2 font-medium text-[var(--attio-text-secondary)]">
              <input
                type="checkbox"
                checked={form.unknownPatient}
                onChange={(e) =>
                  setForm({
                    ...form,
                    unknownPatient: e.target.checked,
                    name: e.target.checked ? "Unknown" : "",
                    phone: e.target.checked ? "Unknown" : "",
                  })
                }
              />
              Unknown patient
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                className="rounded-md border px-3 py-2"
                placeholder="Patient name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <input
                className="rounded-md border px-3 py-2"
                placeholder="Phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
              <input
                className="rounded-md border px-3 py-2"
                placeholder="Age"
                type="number"
                value={form.age}
                onChange={(e) => setForm({ ...form, age: e.target.value })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <select
                className="rounded-md border px-3 py-2"
                value={form.gender}
                onChange={(e) => setForm({ ...form, gender: e.target.value })}
              >
                <option value="">Gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
              <select
                className="rounded-md border px-3 py-2"
                value={form.attendingDoctorId}
                onChange={(e) => setForm({ ...form, attendingDoctorId: e.target.value })}
              >
                <option value="">Attending doctor</option>
                {snapshot?.doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <input
                className="rounded-md border px-3 py-2"
                type="date"
                value={form.expectedDischarge}
                onChange={(e) => setForm({ ...form, expectedDischarge: e.target.value })}
                placeholder="Expected discharge"
              />
            </div>
            <textarea
              className="w-full rounded-md border px-3 py-2"
              placeholder="Complaint / presenting problem *"
              rows={2}
              value={form.complaint}
              onChange={(e) => setForm({ ...form, complaint: e.target.value })}
              required
            />
            <div className="grid gap-3 sm:grid-cols-5">
              <input
                className="rounded-md border px-3 py-2"
                placeholder="BP sys"
                type="number"
                value={form.bpSystolic}
                onChange={(e) => setForm({ ...form, bpSystolic: e.target.value })}
              />
              <input
                className="rounded-md border px-3 py-2"
                placeholder="BP dia"
                type="number"
                value={form.bpDiastolic}
                onChange={(e) => setForm({ ...form, bpDiastolic: e.target.value })}
              />
              <input
                className="rounded-md border px-3 py-2"
                placeholder="Pulse"
                type="number"
                value={form.pulse}
                onChange={(e) => setForm({ ...form, pulse: e.target.value })}
              />
              <input
                className="rounded-md border px-3 py-2"
                placeholder="SpO2"
                type="number"
                value={form.spo2}
                onChange={(e) => setForm({ ...form, spo2: e.target.value })}
              />
              <input
                className="rounded-md border px-3 py-2"
                placeholder="Temp °F"
                type="number"
                value={form.temperature}
                onChange={(e) => setForm({ ...form, temperature: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.mlc}
                onChange={(e) => setForm({ ...form, mlc: e.target.checked })}
              />
              Medico-Legal Case (MLC)
            </label>
            {form.mlc && (
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  className="rounded-md border px-3 py-2"
                  placeholder="MLC details / injury description"
                  value={form.mlcDetails}
                  onChange={(e) => setForm({ ...form, mlcDetails: e.target.value })}
                />
                <input
                  className="rounded-md border px-3 py-2"
                  placeholder="Brought by"
                  value={form.broughtBy}
                  onChange={(e) => setForm({ ...form, broughtBy: e.target.value })}
                />
                <input
                  className="rounded-md border px-3 py-2"
                  placeholder="Police station"
                  value={form.policeStation}
                  onChange={(e) => setForm({ ...form, policeStation: e.target.value })}
                />
                <input
                  className="rounded-md border px-3 py-2"
                  placeholder="FIR / reference number"
                  value={form.firNumber}
                  onChange={(e) => setForm({ ...form, firNumber: e.target.value })}
                />
              </div>
            )}
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.admitToIpd}
                onChange={(e) => setForm({ ...form, admitToIpd: e.target.checked })}
              />
              Admit to Emergency Ward (IPD)
            </label>
            <div className="flex justify-end gap-2">
              <AttioButton type="button" variant="secondary" onClick={() => setShowForm(false)} disabled={busy}>
                Cancel
              </AttioButton>
              <AttioButton type="submit" variant="primary" disabled={busy}>
                Save emergency registration
              </AttioButton>
            </div>
          </form>
        </Panel>
      )}

      <Panel title="Recent emergency visits">
        {loading ? (
          <p className="text-[13px] text-[var(--attio-text-tertiary)]">Loading…</p>
        ) : visits.length === 0 ? (
          <p className="text-[13px] text-[var(--attio-text-tertiary)]">No emergency visits yet.</p>
        ) : (
          <div className="space-y-2">
            {visits.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between rounded-lg border p-3 text-[13px]"
              >
                <div>
                  <p className="font-medium">
                    {v.patientName} · <span className="text-[var(--attio-text-tertiary)]">{v.uhid}</span>
                  </p>
                  <p className="text-[var(--attio-text-secondary)]">{v.complaint}</p>
                  <p className="text-[11px] text-[var(--attio-text-tertiary)]">
                    {v.stage === "emergency" ? "Emergency triage" : "Admitted to IPD"} · {v.doctorName} · {new Date(v.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  {v.ipdAdmissionId && (
                    <AttioButton variant="secondary" onClick={() => router.push(`/app/frontdesk/ipd`)}>
                      View IPD
                    </AttioButton>
                  )}
                  <AttioButton variant="secondary" onClick={() => setReferralVisit(v)}>
                    Referral
                  </AttioButton>
                  <AttioButton variant="secondary" onClick={() => router.push(`/app/frontdesk/patients/${v.patientId}`)}>
                    Patient
                  </AttioButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {referralVisit && (
        <Panel title={`Emergency referral · ${referralVisit.patientName}`}>
          <EmergencyReferralForm
            patientId={referralVisit.patientId}
            visitId={referralVisit.id}
            onCreated={() => setReferralVisit(null)}
          />
        </Panel>
      )}
    </PageChrome>
  );
}
