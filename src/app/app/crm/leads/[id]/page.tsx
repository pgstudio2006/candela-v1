"use client";

import {
  convertLeadToPatientAction,
  updateLeadCallOutcomeAction,
  updateLeadStatusAction,
} from "@/server/crm/online-counsellor-actions";
import { useCrmStore } from "@/components/crm/crm-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { Panel, StatusBadge, AttioButton } from "@/components/frontdesk/ui";
import { SOURCE_LABELS, type CrmCallOutcome, type CrmLeadStatus } from "@/design-system/crm-data";
import { cn } from "@/lib/utils";
import { ArrowRight, Calendar, CheckCircle2, Phone, PhoneOff, UserPlus, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const STATUS_LABELS: Record<string, string> = {
  fresh: "Fresh",
  call_picked: "Call picked",
  call_not_picked: "Call not picked",
  lead_form_filled: "Form filled",
  wants_visit: "Wants to visit",
  appointment_booked: "Appointment booked",
  visit_done: "Visit done",
  converted: "Converted",
  patient: "Patient",
  lost: "Lost",
};

const STATUS_VARIANT: Record<string, "success" | "info" | "warning" | "neutral"> = {
  fresh: "neutral",
  call_picked: "info",
  call_not_picked: "warning",
  lead_form_filled: "info",
  wants_visit: "info",
  appointment_booked: "success",
  visit_done: "success",
  converted: "success",
  patient: "success",
  lost: "warning",
};

export default function OnlineCounsellorLeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { getFilteredLeads, agents, activities, updateLead } = useCrmStore();
  const [paramsResolved, setParamsResolved] = useState<{ id: string } | null>(null);
  const [converting, setConverting] = useState(false);
  const [bookAppointment, setBookAppointment] = useState(true);
  const [doctors, setDoctors] = useState<{ id: string; name: string; department: string }[]>([]);
  const [doctorId, setDoctorId] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [appointmentDate, setAppointmentDate] = useState("");
  const [appointmentTime, setAppointmentTime] = useState("");
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [converted, setConverted] = useState<{ uhid: string } | null>(null);

  // Resolve params (Next.js 15 async params)
  useEffect(() => {
    void params.then((p) => setParamsResolved(p));
  }, [params]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/crm/appointments", { credentials: "include" });
        const json = await res.json();
        if (json.ok) setDoctors((json.data?.doctors ?? []) as typeof doctors);
      } catch {
        setDoctors([]);
      }
    })();
  }, []);

  const selectedDoctor = useMemo(() => doctors.find((d) => d.id === doctorId), [doctors, doctorId]);

  const leadId = paramsResolved?.id ?? "";
  const allLeads = getFilteredLeads();
  const lead = allLeads.find((l) => l.id === leadId);
  const leadActivities = activities.filter((a) => a.leadId === leadId);
  const agent = agents.find((a) => a.id === lead?.assigneeId);

  if (!lead) {
    return (
      <PageChrome breadcrumbs={[{ label: "CRM", href: "/app/crm" }, { label: "Lead" }]} title="Lead not found">
        <Panel title="Lead not found">
          <p className="text-[13px] text-[var(--attio-text-tertiary)]">This lead may have been reassigned or removed.</p>
        </Panel>
      </PageChrome>
    );
  }

  const handleCallOutcome = async (outcome: CrmCallOutcome) => {
    const result = await updateLeadCallOutcomeAction(lead.id, outcome);
    if (!result.ok) {
      alert(result.error);
      return;
    }
    const leadStatus: CrmLeadStatus =
      outcome === "picked" ? "call_picked" : outcome === "not_picked" ? "call_not_picked" : "fresh";
    await updateLead(lead.id, { callOutcome: outcome, leadStatus });
  };

  const handleFormSubmit = async () => {
    const result = await updateLeadStatusAction(lead.id, "lead_form_filled", formData);
    if (!result.ok) alert(result.error);
  };

  const handleMarkLost = async () => {
    const result = await updateLeadStatusAction(lead.id, "lost");
    if (!result.ok) alert(result.error);
  };

  const handleConvert = async () => {
    setConverting(true);
    const result = await convertLeadToPatientAction(lead.id, {
      bookAppointment,
      doctorId: bookAppointment ? doctorId : undefined,
      doctorName: bookAppointment ? (selectedDoctor?.name ?? doctorName) : undefined,
      appointmentDate: bookAppointment ? appointmentDate : undefined,
      appointmentTime: bookAppointment ? appointmentTime : undefined,
    });
    setConverting(false);
    if (result.ok) {
      setConverted({ uhid: result.data.uhid });
      const leadStatus: CrmLeadStatus = bookAppointment ? "appointment_booked" : "patient";
      await updateLead(lead.id, {
        leadStatus,
        patientId: result.data.patientId,
        uhid: result.data.uhid,
      });
    } else {
      alert(result.error);
    }
  };

  const currentStatus = lead.leadStatus ?? "fresh";

  return (
    <PageChrome
      breadcrumbs={[
        { label: "CRM", href: "/app/crm" },
        { label: "Leads", href: "/app/crm/leads" },
        { label: lead.fullName },
      ]}
      title={lead.fullName}
      meta={`${SOURCE_LABELS[lead.source]} · ${agent?.name ?? "Unassigned"} · ${lead.phone}`}
      actions={<StatusBadge label={STATUS_LABELS[currentStatus] ?? currentStatus} variant={STATUS_VARIANT[currentStatus] ?? "neutral"} />}
    >
      {converted && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-900">
          <p className="font-medium">Patient registered — UHID: {converted.uhid}</p>
          <p className="mt-1 text-[12px]">Patient is now visible in the branch database. Front desk has been notified.</p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          {/* Call flow */}
          <Panel title="Call outcome">
            <p className="mb-3 text-[12px] text-[var(--attio-text-tertiary)]">
              Call the patient and record the outcome. This drives the next steps in the workflow.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void handleCallOutcome("picked")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12px] font-medium transition-colors",
                  lead.callOutcome === "picked"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-[var(--attio-border)] bg-white hover:bg-[var(--attio-surface)]",
                )}
              >
                <Phone className="size-3.5" />
                Call picked
              </button>
              <button
                onClick={() => void handleCallOutcome("not_picked")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12px] font-medium transition-colors",
                  lead.callOutcome === "not_picked"
                    ? "border-amber-500 bg-amber-50 text-amber-700"
                    : "border-[var(--attio-border)] bg-white hover:bg-[var(--attio-surface)]",
                )}
              >
                <PhoneOff className="size-3.5" />
                Not picked
              </button>
              <button
                onClick={() => void handleMarkLost()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-2 text-[12px] font-medium text-red-600 transition-colors hover:bg-red-50"
              >
                <XCircle className="size-3.5" />
                Mark lost
              </button>
            </div>
          </Panel>

          {/* Lead form — visible after call picked */}
          {(currentStatus === "call_picked" || currentStatus === "lead_form_filled" || currentStatus === "wants_visit") && (
            <Panel title="Lead form">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-[12px]">
                  <span className="mb-1 block text-[var(--attio-text-tertiary)]">Full name</span>
                  <input
                    value={formData.fullName ?? lead.fullName}
                    onChange={(e) => setFormData((f) => ({ ...f, fullName: e.target.value }))}
                    className="h-9 w-full rounded-lg border border-[var(--attio-border)] px-3"
                  />
                </label>
                <label className="block text-[12px]">
                  <span className="mb-1 block text-[var(--attio-text-tertiary)]">Phone</span>
                  <input
                    value={formData.phone ?? lead.phone}
                    onChange={(e) => setFormData((f) => ({ ...f, phone: e.target.value }))}
                    className="h-9 w-full rounded-lg border border-[var(--attio-border)] px-3"
                  />
                </label>
                <label className="block text-[12px]">
                  <span className="mb-1 block text-[var(--attio-text-tertiary)]">City</span>
                  <input
                    value={formData.city ?? lead.city ?? ""}
                    onChange={(e) => setFormData((f) => ({ ...f, city: e.target.value }))}
                    className="h-9 w-full rounded-lg border border-[var(--attio-border)] px-3"
                  />
                </label>
                <label className="block text-[12px]">
                  <span className="mb-1 block text-[var(--attio-text-tertiary)]">Concern / specialty</span>
                  <input
                    value={formData.specialty ?? lead.specialty ?? ""}
                    onChange={(e) => setFormData((f) => ({ ...f, specialty: e.target.value }))}
                    className="h-9 w-full rounded-lg border border-[var(--attio-border)] px-3"
                  />
                </label>
                <label className="block text-[12px] sm:col-span-2">
                  <span className="mb-1 block text-[var(--attio-text-tertiary)]">Notes</span>
                  <textarea
                    value={formData.notes ?? lead.notes ?? ""}
                    onChange={(e) => setFormData((f) => ({ ...f, notes: e.target.value }))}
                    rows={3}
                    className="w-full rounded-lg border border-[var(--attio-border)] px-3 py-2"
                  />
                </label>
              </div>
              <div className="mt-3 flex gap-2">
                <AttioButton variant="secondary" onClick={() => void handleFormSubmit()}>
                  <CheckCircle2 className="size-3.5" />
                  Save form
                </AttioButton>
                <AttioButton
                  variant="primary"
                  onClick={() => void updateLeadStatusAction(lead.id, "wants_visit")}
                >
                  <ArrowRight className="size-3.5" />
                  Patient wants to visit
                </AttioButton>
              </div>
            </Panel>
          )}

          {/* Convert to patient — visible after wants_visit */}
          {(currentStatus === "wants_visit" || currentStatus === "converted" || currentStatus === "patient") && (
            <Panel title="Convert to patient">
              {(currentStatus === "converted" || currentStatus === "patient") && lead.patientId ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-900">
                  <p className="font-medium">Converted — UHID: {lead.uhid}</p>
                  <p className="mt-1 text-[12px]">Patient is in the branch database.</p>
                </div>
              ) : (
                <>
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-[12px] text-[var(--attio-text-tertiary)]">
                      Pre-fill registration from lead data and create a patient record.
                    </p>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={bookAppointment}
                      onClick={() => setBookAppointment((v) => !v)}
                      className={cn(
                        "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                        bookAppointment ? "bg-[var(--attio-accent)]" : "bg-[var(--attio-border)]",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform",
                          bookAppointment ? "translate-x-5" : "translate-x-0.5",
                        )}
                      />
                    </button>
                  </div>

                  {bookAppointment && (
                    <div className="mb-3 grid gap-3 sm:grid-cols-3">
                      <label className="block text-[12px]">
                        <span className="mb-1 block text-[var(--attio-text-tertiary)]">Doctor</span>
                        <select
                          value={doctorId}
                          onChange={(e) => {
                            setDoctorId(e.target.value);
                            const d = doctors.find((x) => x.id === e.target.value);
                            if (d) setDoctorName(d.name);
                          }}
                          className="h-9 w-full rounded-lg border border-[var(--attio-border)] bg-white px-3 text-[13px]"
                        >
                          <option value="">Select doctor</option>
                          {doctors.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name} {d.department ? `(${d.department})` : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-[12px]">
                        <span className="mb-1 block text-[var(--attio-text-tertiary)]">Date</span>
                        <input
                          type="date"
                          value={appointmentDate}
                          onChange={(e) => setAppointmentDate(e.target.value)}
                          className="h-9 w-full rounded-lg border border-[var(--attio-border)] px-3"
                        />
                      </label>
                      <label className="block text-[12px]">
                        <span className="mb-1 block text-[var(--attio-text-tertiary)]">Time</span>
                        <input
                          type="time"
                          value={appointmentTime}
                          onChange={(e) => setAppointmentTime(e.target.value)}
                          className="h-9 w-full rounded-lg border border-[var(--attio-border)] px-3"
                        />
                      </label>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <AttioButton variant="primary" onClick={() => void handleConvert()} disabled={converting}>
                      <UserPlus className="size-3.5" />
                      {converting ? "Converting…" : bookAppointment ? "Register + book appointment" : "Register patient"}
                    </AttioButton>
                    <AttioButton variant="secondary" onClick={() => void updateLeadStatusAction(lead.id, "visit_done")}>
                      <Calendar className="size-3.5" />
                      Mark visit done
                    </AttioButton>
                  </div>
                </>
              )}
            </Panel>
          )}
        </div>

        {/* Right column — lead info + activity */}
        <div className="space-y-4">
          <Panel title="Lead details">
            <dl className="space-y-2 text-[12px]">
              <div className="flex justify-between">
                <dt className="text-[var(--attio-text-tertiary)]">Source</dt>
                <dd>{SOURCE_LABELS[lead.source]}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--attio-text-tertiary)]">Phone</dt>
                <dd className="tabular-nums">{lead.phone}</dd>
              </div>
              {lead.email && (
                <div className="flex justify-between">
                  <dt className="text-[var(--attio-text-tertiary)]">Email</dt>
                  <dd>{lead.email}</dd>
                </div>
              )}
              {lead.age && (
                <div className="flex justify-between">
                  <dt className="text-[var(--attio-text-tertiary)]">Age</dt>
                  <dd>{lead.age}</dd>
                </div>
              )}
              {lead.city && (
                <div className="flex justify-between">
                  <dt className="text-[var(--attio-text-tertiary)]">City</dt>
                  <dd>{lead.city}</dd>
                </div>
              )}
              {lead.specialty && (
                <div className="flex justify-between">
                  <dt className="text-[var(--attio-text-tertiary)]">Specialty</dt>
                  <dd>{lead.specialty}</dd>
                </div>
              )}
              {lead.valueEstimate > 0 && (
                <div className="flex justify-between">
                  <dt className="text-[var(--attio-text-tertiary)]">Est. value</dt>
                  <dd className="tabular-nums">₹{lead.valueEstimate.toLocaleString("en-IN")}</dd>
                </div>
              )}
              {Array.isArray(lead.tags) && lead.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {lead.tags.map((t) => (
                    <span key={t} className="rounded bg-[var(--attio-surface)] px-1.5 py-0.5 text-[10px] text-[var(--attio-text-tertiary)]">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </dl>
          </Panel>

          <Panel title="Activity timeline">
            {leadActivities.length === 0 ? (
              <p className="py-3 text-[12px] text-[var(--attio-text-tertiary)]">No activity yet.</p>
            ) : (
              <ul className="space-y-2">
                {leadActivities.map((a) => (
                  <li key={a.id} className="border-l-2 border-[var(--attio-border-subtle)] pl-3 text-[12px]">
                    <p>{a.summary}</p>
                    <p className="text-[10px] text-[var(--attio-text-tertiary)]">{new Date(a.at).toLocaleString("en-IN")}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </PageChrome>
  );
}
