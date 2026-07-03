"use client";

import type { FormSchema } from "@/design-system/frontdesk-schemas";
import type { ReferralDoctor } from "@/design-system/admin-data";
import { doctorsForDepartment, type ClinicalRoster } from "@/lib/clinical-roster";
import { getFormSchema, type FormSchemaId } from "@/lib/schema-registry";
import { useEffect, useMemo, useState } from "react";

function onPublishedSchemaEvent(formId: string, refresh: () => void) {
  return (event: Event) => {
    const detail = (event as CustomEvent<{ id?: string }>).detail;
    if (!detail?.id || detail.id === formId) refresh();
  };
}

function patchSchemaWithRoster(
  base: FormSchema,
  roster: ClinicalRoster | null,
  departmentId?: string,
  referralDoctors?: ReferralDoctor[],
): FormSchema {
  if (!roster) return base;

  const deptOptions = roster.departments.map((d) => ({ value: d.id, label: d.label }));
  const deptValueSet = new Set(deptOptions.map((o) => o.value));
  const fallbackDept = deptOptions[0]?.value ?? "";
  const deptField = base.sections
    .flatMap((s) => s.fields)
    .find((f) => f.id === "department" && f.type === "select");
  const deptDefault =
    typeof deptField?.defaultValue === "string" ? deptField.defaultValue : "";
  const resolvedDept =
    departmentId && deptValueSet.has(departmentId)
      ? departmentId
      : deptValueSet.has(deptDefault)
        ? deptDefault
        : "";
  const hasReferralDoctors = referralDoctors && referralDoctors.length > 0;

  return {
    ...base,
    sections: base.sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) => {
        if (field.id === "department" && field.type === "select") {
          return {
            ...field,
            options: deptOptions,
            defaultValue: deptOptions.length ? resolvedDept : "",
          };
        }
        if (field.id === "doctor" && field.type === "select") {
          const deptDoctors = doctorsForDepartment(roster, resolvedDept || fallbackDept);
          return {
            ...field,
            options: deptDoctors.map((d) => ({ value: d.id, label: d.name })),
          };
        }
        if (field.id === "referralDoctor" && field.type === "select") {
          const baseOptions = (field.options ?? []).filter((o) => o.value !== "none");
          const doctorOptions = (referralDoctors ?? []).map((d) => ({ value: d.id, label: d.name }));
          const noneOption = { value: "none", label: "None" };
          return {
            ...field,
            allowOther: true,
            options: [...doctorOptions, ...baseOptions, noneOption],
            defaultValue: field.defaultValue ?? "none",
          };
        }
        return field;
      }),
    })),
  };
}

export function useFrontdeskFormSchema(
  formId: FormSchemaId,
  roster: ClinicalRoster | null,
  departmentId?: string,
  referralDoctors?: ReferralDoctor[],
): FormSchema {
  const [base, setBase] = useState<FormSchema>(() => getFormSchema(formId));

  useEffect(() => {
    const refresh = () => setBase(getFormSchema(formId));
    refresh();
    const onSchemaUpdated = onPublishedSchemaEvent(formId, refresh);
    window.addEventListener("candela-schema-updated", onSchemaUpdated);
    window.addEventListener("storage", refresh);
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel("candela-schema");
      channel.onmessage = refresh;
    } catch {
      /* ignore */
    }
    return () => {
      window.removeEventListener("candela-schema-updated", onSchemaUpdated);
      window.removeEventListener("storage", refresh);
      channel?.close();
    };
  }, [formId]);

  return useMemo(
    () => patchSchemaWithRoster(base, roster, departmentId, referralDoctors),
    [base, roster, departmentId, referralDoctors],
  );
}
