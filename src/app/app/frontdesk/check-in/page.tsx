"use client";

import { PublishedSchemaForm } from "@/components/candela/published-schema-form";
import { useFrontdeskStore } from "@/components/frontdesk/frontdesk-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { useFrontdeskFormSchema } from "@/components/frontdesk/use-frontdesk-form-schema";
import { AttioButton, Panel, StatusBadge } from "@/components/frontdesk/ui";
import { useToast } from "@/components/ui/toast-provider";
import { schemaFingerprint } from "@/lib/schema-field-utils";
import { patientDisplayName } from "@/lib/frontdesk-workflow";
import { User } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

function CheckInContent() {
  const router = useRouter();
  const params = useSearchParams();
  const visitParam = params.get("visit") ?? undefined;
  const patientParam = params.get("patient") ?? undefined;
  const { checkInVisit, getPatient, getVisit, getWaitingCheckIns, patients, ready, roster, saveSubmission } =
    useFrontdeskStore();
  const { toast } = useToast();
  const [formDept, setFormDept] = useState<string>();

  const prefill = useMemo(() => {
    const visit = visitParam ? getVisit(visitParam) : undefined;
    const patient = patientParam
      ? getPatient(patientParam)
      : visit
        ? getPatient(visit.patientId)
        : undefined;
    if (!patient && !visit) return undefined;
    const dept = visit?.departmentId || patient?.departmentId || "dept_spine";
    const deptDoctors = roster.doctorsByDept[dept] ?? roster.allDoctors;
    const doctorId = visit?.doctorId || deptDoctors[0]?.id || "";
    return {
      uhid: patient?.uhid ?? "",
      department: dept,
      doctor: doctorId,
    };
  }, [visitParam, patientParam, getPatient, getVisit, ready, roster]);

  const departmentId = formDept ?? String(prefill?.department ?? "dept_spine");
  const schema = useFrontdeskFormSchema("checkin", roster, departmentId);

  const waiting = getWaitingCheckIns();

  return (
    <PageChrome
      breadcrumbs={[
        { label: "Front Desk", href: "/app/frontdesk" },
        { label: "Check-in" },
      ]}
      title="Check-in"
      meta="Verify arrival → assign doctor → route to billing-first OPD"
      actions={<AttioButton variant="secondary">Kiosk mode</AttioButton>}
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Panel title="Check-in form">
          <PublishedSchemaForm
            schema={schema}
            formKey={`checkin-${schemaFingerprint(schema)}-${visitParam ?? "new"}-${prefill?.uhid ?? "blank"}-${departmentId}`}
            initialValues={prefill}
            onValuesChange={(values) => {
              if (values.department && values.department !== formDept) {
                setFormDept(String(values.department));
              }
            }}
            searchPatients={patients}
            roster={roster}
            submitLabel="Complete check-in → Billing"
            onSubmit={async (data) => {
              const result = await checkInVisit(data, visitParam);
              if (!result.ok || !result.visitId) {
                toast(result.error ?? "Check-in failed", "error");
                return;
              }
              await saveSubmission("checkin", data, { visitId: result.visitId, patientId: result.patientId });
              toast("Check-in complete", "success");
              router.push(`/app/frontdesk/opd-billing?visit=${result.visitId}`);
            }}
          />
        </Panel>

        <div className="space-y-4">
          <Panel title="Waiting to check in">
            <ul className="space-y-2">
              {waiting.length === 0 && (
                <li className="py-4 text-center text-[13px] text-[var(--attio-text-tertiary)]">No pending arrivals</li>
              )}
              {waiting.map(({ visit, patient }) => (
                <li key={visit.id}>
                  <button
                    type="button"
                    onClick={() => router.push(`/app/frontdesk/check-in?visit=${visit.id}&patient=${patient.id}`)}
                    className="flex w-full items-center gap-3 rounded-lg border border-[var(--attio-border-subtle)] p-3 text-left hover:bg-[var(--attio-hover)]"
                  >
                    <div className="flex size-9 items-center justify-center rounded-full bg-[var(--attio-surface)]">
                      <User className="size-4 text-[var(--attio-text-tertiary)]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium">{patientDisplayName(patient)}</p>
                      <p className="text-[11px] text-[var(--attio-text-tertiary)]">{visit.doctorName || "Assign doctor"}</p>
                    </div>
                    {visit.appointment ? (
                      <StatusBadge label={visit.appointmentTime ?? "Appt"} variant="info" />
                    ) : (
                      <StatusBadge label="Walk-in" variant="neutral" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Quick arrivals">
            {patients.slice(0, 5).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => router.push(`/app/frontdesk/check-in?patient=${p.id}`)}
                className="mb-2 flex w-full items-center gap-2 rounded-lg bg-[var(--attio-surface)] px-3 py-2 text-left text-[13px] hover:bg-[var(--attio-hover)]"
              >
                {patientDisplayName(p)}
              </button>
            ))}
          </Panel>
        </div>
      </div>
    </PageChrome>
  );
}

export default function CheckInPage() {
  return (
    <Suspense>
      <CheckInContent />
    </Suspense>
  );
}
