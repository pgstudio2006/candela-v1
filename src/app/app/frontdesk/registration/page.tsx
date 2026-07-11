"use client";

import { PublishedSchemaForm } from "@/components/candela/published-schema-form";
import { useFrontdeskStore } from "@/components/frontdesk/frontdesk-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { useFrontdeskFormSchema } from "@/components/frontdesk/use-frontdesk-form-schema";
import { AttioButton, Panel } from "@/components/frontdesk/ui";
import { useToast } from "@/components/ui/toast-provider";
import { useSession } from "@/components/candela/session-provider";
import type { ReferralDoctor } from "@/design-system/admin-data";
import type { CrmLead } from "@/design-system/crm-data";
import { isPataudiBranch } from "@/lib/auth-types";
import { checkDuplicatePatientAction, getActiveReferralDoctorsAction } from "@/app/actions/clinical-actions";
import {
  detectLeadByMobileAction,
  assignCounsellorToPatientAction,
  convertLeadToPatientAction,
  getWalkInCounsellorAction,
} from "@/server/crm/online-counsellor-actions";
import { schemaFingerprint } from "@/lib/schema-field-utils";
import { AlertTriangle, LogIn, UserCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type DuplicateInfo = { id: string; uhid: string; name: string; phone: string };
type LeadDetection = {
  found: boolean;
  leadId?: string;
  leadName?: string;
  leadStatus?: string;
  assigneeName?: string;
  patientId?: string;
  uhid?: string;
  lead?: Partial<CrmLead> & {
    age?: number | null;
    valueEstimate?: number | null;
  };
};

export default function RegistrationPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { registerPatientAsync, saveSubmission, counters, roster } = useFrontdeskStore();
  const session = useSession();
  const [draft, setDraft] = useState<Record<string, string | number | boolean>>({});
  const [savedUhid, setSavedUhid] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [phoneWarning, setPhoneWarning] = useState<DuplicateInfo | null>(null);
  const [leadDetection, setLeadDetection] = useState<LeadDetection | null>(null);
  const [appliedLeadId, setAppliedLeadId] = useState<string | null>(null);
  const [assignCounsellor, setAssignCounsellor] = useState(false);
  const [counsellorId, setCounsellorId] = useState("");
  const [counsellorName, setCounsellorName] = useState("");
  const [counsellors, setCounsellors] = useState<{ id: string; name: string }[]>([]);
  const [referralDoctors, setReferralDoctors] = useState<ReferralDoctor[]>([]);

  const pataudi = isPataudiBranch(session.session?.branchName);
  const initialValues: Record<string, string | number | boolean> = pataudi
    ? {
        country: "India",
        state: "Haryana",
        district: "Gurugram",
        city: "Pataudi",
        appointmentCentre: "Pataudi Center",
      }
    : {};

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/crm/counsellors", { credentials: "include" });
        const json = await res.json();
        if (json.ok) setCounsellors(json.data);
      } catch {}
    })();
    void (async () => {
      try {
        const res = await getActiveReferralDoctorsAction();
        if (res.ok && res.data) setReferralDoctors(res.data);
      } catch {}
    })();
  }, []);

  const checkPhone = useCallback(async (phone: string) => {
    if (!phone || phone.replace(/\D/g, "").length < 10) {
      setPhoneWarning(null);
      setLeadDetection(null);
      return;
    }
    const result = await checkDuplicatePatientAction(phone);
    setPhoneWarning(result.duplicate ? result.patient : null);
    const leadResult = await detectLeadByMobileAction(phone);
    if (leadResult.ok) {
      setLeadDetection(leadResult.data);
      setAppliedLeadId(null);
      if (leadResult.data.found && leadResult.data.assigneeName) {
        setCounsellorId(leadResult.data.lead?.assigneeId ?? "");
        setCounsellorName(leadResult.data.assigneeName);
        setAssignCounsellor(true);
      } else if (!leadResult.data.found) {
        const walkIn = await getWalkInCounsellorAction();
        if (walkIn.ok && walkIn.data) {
          setCounsellorId(walkIn.data.id);
          setCounsellorName(walkIn.data.name);
          setAssignCounsellor(true);
        } else {
          setCounsellorId("");
          setCounsellorName("");
          setAssignCounsellor(false);
        }
      }
    }
  }, []);

  useEffect(() => {
    const phone = String(draft.phone ?? "");
    const timer = setTimeout(() => void checkPhone(phone), 400);
    return () => clearTimeout(timer);
  }, [draft.phone, checkPhone]);

  const schema = useFrontdeskFormSchema("registration", roster, undefined, referralDoctors);

  const appointmentCentreValues = new Set(
    schema.sections
      .flatMap((s) => s.fields)
      .filter((f) => f.id === "appointmentCentre")
      .flatMap((f) => (f.options ?? []).map((o) => o.value)),
  );

  const leadToRegistrationValues = (
    lead: Partial<CrmLead> & { age?: number | null; valueEstimate?: number | null },
  ): Record<string, string | number | boolean> => {
    const values: Record<string, string | number | boolean> = {};
    if (lead.fullName) values.fullName = lead.fullName;
    if (lead.phone) values.phone = lead.phone;
    if (lead.alternatePhone) values.alternatePhone = lead.alternatePhone;
    if (lead.email) values.email = lead.email;
    if (lead.gender) {
      const genderMap: Record<string, string> = { male: "M", female: "F", other: "O", prefer_not: "O" };
      values.gender = genderMap[lead.gender] ?? "O";
    }
    if (lead.age != null && typeof lead.age === "number") {
      const today = new Date();
      const dob = new Date(today.getFullYear() - lead.age, today.getMonth(), today.getDate());
      values.dob = dob.toISOString().split("T")[0];
    }
    if (lead.country) values.country = lead.country;
    if (lead.state) values.state = lead.state;
    if (lead.district) values.district = lead.district;
    if (lead.city) values.city = lead.city;
    if (lead.appointmentCentre && appointmentCentreValues.has(lead.appointmentCentre)) {
      values.appointmentCentre = lead.appointmentCentre;
    }
    if (lead.notes) values.notes = lead.notes;
    if (lead.specialty && roster) {
      const specialty = lead.specialty.toLowerCase();
      const dept = roster.departments.find(
        (d) => d.label.toLowerCase().includes(specialty) || d.id.toLowerCase().includes(specialty),
      );
      if (dept) values.department = dept.id;
    }
    if (lead.formData) {
      Object.entries(lead.formData).forEach(([key, value]) => {
        if (value !== "" && value !== null && value !== undefined) {
          values[key] = value;
        }
      });
    }
    return values;
  };

  const appliedLead = leadDetection?.leadId === appliedLeadId ? leadDetection?.lead : undefined;
  const registrationInitialValues = {
    ...initialValues,
    ...(appliedLead ? leadToRegistrationValues(appliedLead) : {}),
  };

  const formKey = `registration-${schemaFingerprint(schema)}-${appliedLeadId || "new"}`;

  const normalizeReferralDoctor = (
    data: Record<string, string | number | boolean>,
  ): Record<string, string | number | boolean> => {
    const selection = String(data.referralDoctor ?? "").trim();
    if (!selection || selection === "none") {
      return { ...data, referralDoctor: "none", referralDoctorName: "" };
    }
    const doctor = referralDoctors.find((d) => d.id === selection);
    if (doctor) {
      return { ...data, referralDoctor: doctor.id, referralDoctorName: doctor.name };
    }
    // "Other" selected; detail field is named referralDoctor__other_detail by the schema helper
    const otherName = String(data.referralDoctor__other_detail ?? "").trim();
    return { ...data, referralDoctor: "other", referralDoctorName: otherName };
  };

  const submitRegistration = async (
    data: Record<string, string | number | boolean>,
    opts?: { forceDuplicate?: boolean },
  ) => {
    const payload = normalizeReferralDoctor(data);
    setSubmitting(true);
    const result = await registerPatientAsync(payload, { startVisit: true, forceDuplicate: opts?.forceDuplicate });
    setSubmitting(false);

    if (!result.ok) {
      if (result.code === "DUPLICATE_PHONE" || result.code === "DUPLICATE_PATIENT") {
        toast("Duplicate blocked — open check-in for the existing patient.", "error");
      } else {
        toast(result.error ?? "Registration failed", "error");
      }
      return;
    }

    if (!result.visitId) {
      toast("Patient saved but visit was not created. Open check-in manually.", "error");
      router.push(`/app/frontdesk/patients/${result.patientId}`);
      return;
    }

    await saveSubmission("registration", data, { patientId: result.patientId, visitId: result.visitId });
    setSavedUhid(result.uhid);

    if (leadDetection?.leadId && !leadDetection.uhid) {
      const convertResult = await convertLeadToPatientAction(leadDetection.leadId, { bookAppointment: false, source: "front_desk" });
      if (!convertResult.ok) {
        toast(`Patient registered but lead conversion failed: ${convertResult.error}`, "error");
      }
    }

    if (assignCounsellor && counsellorName.trim()) {
      const assignResult = await assignCounsellorToPatientAction(
        result.patientId,
        counsellorId || `counsellor_manual_${Date.now()}`,
        counsellorName.trim(),
      );
      if (!assignResult.ok) {
        toast(`Patient registered but counsellor assignment failed: ${assignResult.error}`, "error");
      }
    }

    toast(`Registered ${result.uhid}`, "success");
    router.push(`/app/frontdesk/check-in?visit=${result.visitId}&patient=${result.patientId}`);
  };

  const checkInHref = phoneWarning
    ? `/app/frontdesk/check-in?patient=${phoneWarning.id}`
    : "/app/frontdesk/check-in";

  return (
    <PageChrome
      breadcrumbs={[{ label: "Front Desk", href: "/app/frontdesk" }, { label: "Registration" }]}
      title="Patient registration"
      meta="New capture · duplicate phone guard · billing-first routing"
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <Panel title="Patient details">
          <PublishedSchemaForm
            schema={schema}
            formKey={formKey}
            initialValues={registrationInitialValues}
            submitLabel={submitting ? "Saving…" : "Save & continue to check-in"}
            onValuesChange={setDraft}
            roster={roster}
            onSubmit={(data) => void submitRegistration(data)}
          />
        </Panel>

        <div className="space-y-4">
          <Panel title="Duplicate guard">
            {phoneWarning ? (
              <div className="flex gap-3 rounded-md border border-amber-200/80 bg-amber-50/50 p-3">
                <AlertTriangle className="size-4 shrink-0 text-amber-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-amber-900">Phone number already registered</p>
                  <p className="mt-1 text-[12px] text-amber-800">
                    {phoneWarning.name} · {phoneWarning.uhid} · {phoneWarning.phone}
                  </p>
                  <p className="mt-2 text-[11px] text-amber-700">
                    This phone is already used by another patient. You can still register this patient or check in the existing one.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href={checkInHref}>
                      <AttioButton variant="primary" className="h-8 gap-1.5 text-[11px]">
                        <LogIn className="size-3.5" />
                        Go to check-in
                      </AttioButton>
                    </Link>
                    <Link href={`/app/frontdesk/patients/${phoneWarning.id}`}>
                      <AttioButton variant="secondary" className="h-8 text-[11px]">
                        Open record
                      </AttioButton>
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-[12px] text-[var(--attio-text-tertiary)]">No duplicate phone detected</p>
            )}
          </Panel>

          {leadDetection?.found && (
            <Panel title="CRM lead detected">
              <div className="flex gap-3 rounded-md border border-blue-200/80 bg-blue-50/50 p-3">
                <UserCheck className="size-4 shrink-0 text-blue-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-blue-900">Existing lead found</p>
                  <p className="mt-1 text-[12px] text-blue-800">
                    {leadDetection.leadName} · Status: {leadDetection.leadStatus?.replace(/_/g, " ")}
                  </p>
                  {leadDetection.assigneeName && (
                    <p className="mt-0.5 text-[11px] text-blue-700">
                      Assigned to: {leadDetection.assigneeName}
                    </p>
                  )}
                  {leadDetection.uhid && (
                    <p className="mt-0.5 text-[11px] text-blue-700">
                      Already converted — UHID: {leadDetection.uhid}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <AttioButton
                      variant="primary"
                      className="h-8 text-[11px]"
                      disabled={!leadDetection.lead || leadDetection.leadId === appliedLeadId}
                      onClick={() => leadDetection.leadId && setAppliedLeadId(leadDetection.leadId)}
                    >
                      {leadDetection.leadId === appliedLeadId ? "Lead applied" : "Use Lead data"}
                    </AttioButton>
                    <Link href={`/app/crm/leads/${leadDetection.leadId}`}>
                      <AttioButton variant="secondary" className="h-8 text-[11px]">
                        Open lead
                      </AttioButton>
                    </Link>
                  </div>
                </div>
              </div>
            </Panel>
          )}

          <Panel title="Counsellor assignment">
            <label className="flex items-center gap-2 text-[12px]">
              <input
                type="checkbox"
                checked={assignCounsellor}
                onChange={(e) => setAssignCounsellor(e.target.checked)}
                className="size-4 rounded border-[var(--attio-border)]"
              />
              <span>Assign online counsellor to this patient</span>
            </label>
            {assignCounsellor && (
              <select
                value={counsellorId}
                onChange={(e) => {
                  const id = e.target.value;
                  setCounsellorId(id);
                  setCounsellorName(counsellors.find((c) => c.id === id)?.name ?? "");
                }}
                className="mt-2 h-9 w-full rounded-lg border border-[var(--attio-border)] px-3 text-[12px]"
              >
                <option value="">Select counsellor…</option>
                {counsellors.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
            <p className="mt-2 text-[11px] text-[var(--attio-text-tertiary)]">
              {assignCounsellor
                ? "Counsellor will be linked to the patient record on save."
                : "Enable to track this patient's journey from an online counsellor lead."}
            </p>
          </Panel>

          <Panel title="Preview">
            <p className="text-[12px] text-[var(--attio-text-tertiary)]">
              {savedUhid ? "UHID assigned on last save" : "UHID auto-generated on save"}
            </p>
            <p className="mt-1 font-mono text-[13px]">
              {savedUhid ?? `NV-2026-${String(counters.patient + 1).padStart(4, "0")}`}
            </p>
          </Panel>
        </div>
      </div>
    </PageChrome>
  );
}
