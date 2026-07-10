"use client";

import { PublishedSchemaForm } from "@/components/candela/published-schema-form";
import { useFrontdeskStore } from "@/components/frontdesk/frontdesk-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { useFrontdeskFormSchema } from "@/components/frontdesk/use-frontdesk-form-schema";
import { AttioButton, Panel } from "@/components/frontdesk/ui";
import { useToast } from "@/components/ui/toast-provider";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

function splitName(full: string) {
  const parts = full.trim().split(/\s+/);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

export default function PatientEditPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const patientId = params.id as string;
  const { getPatient, updatePatientAsync, roster } = useFrontdeskStore();
  const patient = getPatient(patientId);
  const [submitting, setSubmitting] = useState(false);
  const schema = useFrontdeskFormSchema("registration", roster);

  const initialValues = useMemo(() => {
    if (!patient) return undefined;
    const { firstName, lastName } = splitName(patient.name);
    return {
      fullName: patient.name,
      firstName,
      lastName,
      phone: patient.phone,
      email: patient.email ?? "",
      gender: patient.gender,
      department: patient.departmentId,
      referrer: patient.referrerSource ?? "",
      referrerName: patient.referrer ?? "",
      corporateId: patient.corporateId ?? "",
      consentTreatment: patient.consentTreatment ?? false,
      consentData: patient.consentData ?? false,
      notes: patient.registrationNotes ?? "",
      visitType: patient.tags[0] ?? "opd",
    };
  }, [patient]);

  if (!patient) {
    return (
      <PageChrome breadcrumbs={[{ label: "Front Desk", href: "/app/frontdesk" }, { label: "Edit" }]} title="Patient not found">
        <Link href="/app/frontdesk/patients" className="text-[13px] text-[var(--attio-accent)]">← Back</Link>
      </PageChrome>
    );
  }

  return (
    <PageChrome
      breadcrumbs={[
        { label: "Front Desk", href: "/app/frontdesk" },
        { label: "Patients", href: "/app/frontdesk/patients" },
        { label: patient.name, href: `/app/frontdesk/patients/${patient.id}` },
        { label: "Edit" },
      ]}
      title={`Edit · ${patient.name}`}
      meta={`${patient.uhid} · changes save to patient record`}
    >
      <Link
        href={`/app/frontdesk/patients/${patient.id}`}
        className="mb-4 inline-flex items-center gap-1 text-[13px] text-[var(--attio-text-tertiary)] hover:text-[var(--attio-text)]"
      >
        <ArrowLeft className="size-4" />
        Patient record
      </Link>

      <Panel title="Demographics & registration">
        <PublishedSchemaForm
          schema={{
            ...schema,
            title: "Update patient",
            sections: schema.sections.map((s) => ({
              ...s,
              fields: s.fields.map((f) =>
                f.id === "uhid" ? { ...f, readOnly: true, defaultValue: patient.uhid } : f,
              ),
            })),
          }}
          formKey={`edit-${patient.id}`}
          initialValues={initialValues}
          submitLabel={submitting ? "Saving…" : "Save changes"}
          onSubmit={async (data) => {
            setSubmitting(true);
            const result = await updatePatientAsync(patientId, data);
            setSubmitting(false);
            if (!result.ok) {
              toast(result.error, "error");
              return;
            }
            toast("Patient updated", "success");
            router.push(`/app/frontdesk/patients/${patientId}`);
          }}
        />
        <AttioButton
          variant="secondary"
          className="mt-4"
          onClick={() => router.push(`/app/frontdesk/patients/${patientId}`)}
        >
          Cancel
        </AttioButton>
      </Panel>
    </PageChrome>
  );
}
