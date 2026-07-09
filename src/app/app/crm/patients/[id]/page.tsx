"use client";

import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, Panel, StatusBadge } from "@/components/frontdesk/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Calendar, FileText, Package, Pill, Stethoscope, User } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type PatientData = {
  patient: {
    id: string;
    uhid: string;
    name: string;
    fullName: string;
    phone: string;
    email: string | null;
    age: string | null;
    gender: string | null;
    assignedCounsellorId: string | null;
    assignedCounsellorName: string | null;
    leadSourceId: string | null;
    createdAt: string;
  };
  visits: {
    id: string;
    doctorName: string;
    stage: string;
    token: string | null;
    billing: string;
    billAmount: number | null;
    treatmentPath: string | null;
    createdAt: string;
  }[];
  appointments: {
    id: string;
    doctorName: string;
    doctorId: string | null;
    date: string | null;
    time: string | null;
    status: string;
    source: string | null;
    createdAt: string;
  }[];
  prescriptions: {
    id: string;
    visitId: string;
    medicines: any[];
    notes: string;
    createdAt: string;
  }[];
  consultations: {
    id: string;
    visitId: string;
    diagnosis: string;
    treatmentPlan: string;
    advice: string;
    createdAt: string;
  }[];
  packages: {
    id: string;
    label: string;
    amount: number;
    sessions: number | null;
    sessionsUsed: number;
    purchasedAt: string;
    status: string;
  }[];
};

export default function CrmPatientDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<PatientData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/crm/patient/${id}`, { credentials: "include" });
        const json = await res.json();
        if (json.ok) {
          setData(json.data);
          setError(null);
        } else {
          setError(json.error ?? "Failed to load patient.");
        }
      } catch {
        setError("Failed to connect.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <PageChrome breadcrumbs={[{ label: "CRM", href: "/app/crm" }, { label: "Patients", href: "/app/crm/patients" }]} title="Loading…">
        <Panel title="Loading patient…">
          <p className="text-[13px] text-[var(--attio-text-tertiary)]">Please wait.</p>
        </Panel>
      </PageChrome>
    );
  }

  if (error || !data) {
    return (
      <PageChrome breadcrumbs={[{ label: "CRM", href: "/app/crm" }, { label: "Patients", href: "/app/crm/patients" }]} title="Patient not found">
        <Panel title="Error">
          <p className="text-[13px] text-red-600">{error ?? "Patient not found."}</p>
          <Link href="/app/crm/patients" className="mt-3 inline-block text-[12px] text-[var(--attio-accent)]">
            ← Back to patients
          </Link>
        </Panel>
      </PageChrome>
    );
  }

  const { patient, visits, appointments, prescriptions, consultations, packages } = data;

  return (
    <PageChrome
      breadcrumbs={[
        { label: "CRM", href: "/app/crm" },
        { label: "Patients", href: "/app/crm/patients" },
        { label: patient.name },
      ]}
      title={patient.name}
      meta={`${patient.uhid} · ${patient.age ?? "—"}y · ${patient.phone}`}
      actions={
        <Link href="/app/crm/patients">
          <AttioButton variant="secondary" className="gap-1">
            <ArrowLeft className="size-3.5" />
            Back
          </AttioButton>
        </Link>
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-[var(--attio-border-subtle)] p-3">
          <p className="text-[11px] text-[var(--attio-text-tertiary)]">UHID</p>
          <p className="mt-1 font-mono text-[14px] font-medium">{patient.uhid}</p>
        </div>
        <div className="rounded-lg border border-[var(--attio-border-subtle)] p-3">
          <p className="text-[11px] text-[var(--attio-text-tertiary)]">Phone</p>
          <p className="mt-1 text-[14px] tabular-nums">{patient.phone}</p>
        </div>
        <div className="rounded-lg border border-[var(--attio-border-subtle)] p-3">
          <p className="text-[11px] text-[var(--attio-text-tertiary)]">Counsellor</p>
          <p className="mt-1 text-[14px]">{patient.assignedCounsellorName ?? "—"}</p>
        </div>
        <div className="rounded-lg border border-[var(--attio-border-subtle)] p-3">
          <p className="text-[11px] text-[var(--attio-text-tertiary)]">Registered</p>
          <p className="mt-1 text-[14px]">{new Date(patient.createdAt).toLocaleDateString("en-IN")}</p>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="visits">Visits ({visits.length})</TabsTrigger>
          <TabsTrigger value="consultations">Consultations ({consultations.length})</TabsTrigger>
          <TabsTrigger value="prescriptions">Prescriptions ({prescriptions.length})</TabsTrigger>
          <TabsTrigger value="appointments">Appointments ({appointments.length})</TabsTrigger>
          <TabsTrigger value="packages">Packages ({packages.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Patient details">
              <dl className="grid grid-cols-2 gap-3 text-[13px]">
                <div><dt className="text-[var(--attio-text-tertiary)]">Full name</dt><dd>{patient.fullName}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">Age</dt><dd>{patient.age ?? "—"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">Gender</dt><dd>{patient.gender ?? "—"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">Email</dt><dd>{patient.email ?? "—"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">Lead source</dt><dd>{patient.leadSourceId ? "Online CRM" : "Walk-in"}</dd></div>
                <div><dt className="text-[var(--attio-text-tertiary)]">Counsellor</dt><dd>{patient.assignedCounsellorName ?? "—"}</dd></div>
              </dl>
            </Panel>
            <Panel title="Summary">
              <div className="space-y-2 text-[13px]">
                <p><strong>{visits.length}</strong> total visits</p>
                <p><strong>{appointments.length}</strong> appointments</p>
                <p><strong>{consultations.length}</strong> consultations</p>
                <p><strong>{prescriptions.length}</strong> prescriptions</p>
                {patient.leadSourceId && (
                  <Link href={`/app/crm/leads/${patient.leadSourceId}`} className="mt-2 inline-block text-[12px] text-[var(--attio-accent)] hover:underline">
                    View original lead →
                  </Link>
                )}
              </div>
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="visits" className="mt-4">
          <Panel title="Visit history">
            {visits.length === 0 ? (
              <p className="py-4 text-[13px] text-[var(--attio-text-tertiary)]">No visits recorded.</p>
            ) : (
              <ul className="space-y-2">
                {visits.map((v) => (
                  <li key={v.id} className="flex items-center justify-between rounded-lg border border-[var(--attio-border-subtle)] p-3 text-[13px]">
                    <div>
                      <p className="font-medium">{v.doctorName || "Unassigned"}</p>
                      <p className="text-[var(--attio-text-tertiary)]">
                        Token #{v.token ?? "—"} · {new Date(v.createdAt).toLocaleDateString("en-IN")}
                        {v.treatmentPath ? ` · ${v.treatmentPath.toUpperCase()}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {v.billAmount != null && <span className="text-[12px] tabular-nums">₹{v.billAmount.toLocaleString("en-IN")}</span>}
                      <StatusBadge label={v.billing} variant={v.billing === "paid" ? "success" : "warning"} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="consultations" className="mt-4">
          <Panel title="Doctor consultations">
            {consultations.length === 0 ? (
              <p className="py-4 text-[13px] text-[var(--attio-text-tertiary)]">No consultations recorded.</p>
            ) : (
              <div className="space-y-3">
                {consultations.map((c) => (
                  <div key={c.id} className="rounded-lg border border-[var(--attio-border-subtle)] p-3">
                    <div className="flex items-center gap-2 text-[12px] text-[var(--attio-text-tertiary)]">
                      <Stethoscope className="size-3.5" />
                      {new Date(c.createdAt).toLocaleString("en-IN")}
                    </div>
                    {c.diagnosis && <p className="mt-2 text-[13px]"><strong>Diagnosis:</strong> {c.diagnosis}</p>}
                    {c.treatmentPlan && <p className="mt-1 text-[13px]"><strong>Treatment:</strong> {c.treatmentPlan}</p>}
                    {c.advice && <p className="mt-1 text-[13px]"><strong>Advice:</strong> {c.advice}</p>}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="prescriptions" className="mt-4">
          <Panel title="Prescriptions">
            {prescriptions.length === 0 ? (
              <p className="py-4 text-[13px] text-[var(--attio-text-tertiary)]">No prescriptions recorded.</p>
            ) : (
              <div className="space-y-3">
                {prescriptions.map((p) => (
                  <div key={p.id} className="rounded-lg border border-[var(--attio-border-subtle)] p-3">
                    <div className="flex items-center gap-2 text-[12px] text-[var(--attio-text-tertiary)]">
                      <Pill className="size-3.5" />
                      {new Date(p.createdAt).toLocaleString("en-IN")}
                    </div>
                    {Array.isArray(p.medicines) && p.medicines.length > 0 && (
                      <ul className="mt-2 space-y-1 text-[13px]">
                        {p.medicines.map((m: any, i: number) => (
                          <li key={i} className="flex justify-between">
                            <span>{m.name ?? m.medicine ?? "—"}</span>
                            <span className="text-[var(--attio-text-tertiary)]">{m.dosage ?? m.frequency ?? ""}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {p.notes && <p className="mt-2 text-[12px] text-[var(--attio-text-tertiary)]">{p.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="appointments" className="mt-4">
          <Panel title="Appointments">
            {appointments.length === 0 ? (
              <p className="py-4 text-[13px] text-[var(--attio-text-tertiary)]">No appointments recorded.</p>
            ) : (
              <ul className="space-y-2">
                {appointments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between rounded-lg border border-[var(--attio-border-subtle)] p-3 text-[13px]">
                    <div className="flex items-center gap-2">
                      <Calendar className="size-3.5 text-[var(--attio-text-tertiary)]" />
                      <div>
                        <p className="font-medium">{a.doctorName || "—"}</p>
                        <p className="text-[var(--attio-text-tertiary)]">
                          {a.date ?? "—"} {a.time ?? ""}
                          {a.source ? ` · ${a.source}` : ""}
                        </p>
                      </div>
                    </div>
                    <StatusBadge label={a.status} variant={a.status === "scheduled" ? "info" : a.status === "completed" ? "success" : "neutral"} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="packages" className="mt-4">
          <Panel title="Packages purchased">
            {packages.length === 0 ? (
              <p className="py-4 text-[13px] text-[var(--attio-text-tertiary)]">No packages purchased yet.</p>
            ) : (
              <ul className="space-y-2">
                {packages.map((p) => (
                  <li key={p.id} className="flex items-center justify-between rounded-lg border border-[var(--attio-border-subtle)] p-3 text-[13px]">
                    <div className="flex items-center gap-2">
                      <Package className="size-3.5 text-[var(--attio-text-tertiary)]" />
                      <div>
                        <p className="font-medium">{p.label}</p>
                        <p className="text-[var(--attio-text-tertiary)]">
                          {p.sessions != null ? `${p.sessionsUsed} / ${p.sessions} sessions used` : "Sessions: unlimited"}
                          {" · "}
                          {new Date(p.purchasedAt).toLocaleDateString("en-IN")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] tabular-nums">₹{p.amount.toLocaleString("en-IN")}</span>
                      <StatusBadge label={p.status} variant="success" />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </TabsContent>
      </Tabs>
    </PageChrome>
  );
}
