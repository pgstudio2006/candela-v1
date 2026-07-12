"use client";

import { useCrmStore } from "@/components/crm/crm-store";
import { PublishedSchemaForm } from "@/components/candela/published-schema-form";
import { useFrontdeskFormSchema } from "@/components/frontdesk/use-frontdesk-form-schema";
import { useFrontdeskStore } from "@/components/frontdesk/frontdesk-store";
import { AttioButton } from "@/components/frontdesk/ui";
import {
  EMPTY_LEAD_FORM,
  type CrmLead,
  type CrmLeadFormValues,
  type CrmLeadSource,
} from "@/design-system/crm-data";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

function leadToForm(lead: CrmLead): CrmLeadFormValues {
  return {
    fullName: lead.fullName,
    phone: lead.phone,
    alternatePhone: lead.alternatePhone ?? "",
    email: lead.email ?? "",
    age: lead.age != null ? String(lead.age) : "",
    dob: lead.dob ?? "",
    gender: lead.gender ?? "",
    city: lead.city ?? "",
    district: lead.district ?? "",
    state: lead.state ?? "",
    country: lead.country ?? "India",
    houseNumber: lead.houseNumber ?? "",
    street: lead.street ?? "",
    locality: lead.locality ?? "",
    landmark: lead.landmark ?? "",
    address: lead.address ?? "",
    pincode: lead.pincode ?? "",
    doctorName: lead.doctorName ?? "",
    appointmentDate: lead.appointmentDate ?? "",
    appointmentTime: lead.appointmentTime ?? "",
    appointmentCentre: lead.appointmentCentre ?? "",
    source: lead.source,
    stageId: lead.stageId,
    assigneeId: lead.assigneeId ?? "",
    specialty: lead.specialty ?? "",
    valueEstimate: lead.valueEstimate ? String(lead.valueEstimate) : "",
    priority: lead.priority,
    notes: lead.notes ?? "",
    lostReason: lead.lostReason ?? "",
    formData: lead.formData ?? {},
  };
}

function leadToSchemaValues(form: CrmLeadFormValues): Record<string, string | number | boolean> {
  return {
    fullName: form.fullName,
    phone: form.phone,
    alternatePhone: form.alternatePhone,
    email: form.email,
    age: form.age ? Number(form.age) : "",
    dob: form.dob,
    gender: form.gender,
    city: form.city,
    district: form.district,
    state: form.state,
    country: form.country || "India",
    houseNumber: form.houseNumber,
    street: form.street,
    locality: form.locality,
    landmark: form.landmark,
    address: form.address,
    pincode: form.pincode,
    doctorName: form.doctorName,
    specialty: form.specialty,
    valueEstimate: form.valueEstimate ? Number(form.valueEstimate) : 50000,
    appointmentDate: form.appointmentDate,
    appointmentTime: form.appointmentTime,
    appointmentCentre: form.appointmentCentre || "Navayu Gurgaon",
    source: form.source,
    notes: form.notes,
    ...form.formData,
  };
}

function mergeSchemaIntoForm(
  base: CrmLeadFormValues,
  values: Record<string, string | number | boolean>,
): CrmLeadFormValues {
  return {
    ...base,
    fullName: String(values.fullName ?? base.fullName),
    phone: String(values.phone ?? base.phone),
    alternatePhone: String(values.alternatePhone ?? base.alternatePhone),
    email: String(values.email ?? base.email),
    age: values.age !== "" && values.age != null ? String(values.age) : base.age,
    dob: String(values.dob ?? base.dob),
    gender: (String(values.gender ?? base.gender) || "") as CrmLeadFormValues["gender"],
    city: String(values.city ?? base.city),
    district: String(values.district ?? base.district),
    state: String(values.state ?? base.state),
    country: String(values.country ?? base.country),
    houseNumber: String(values.houseNumber ?? base.houseNumber),
    street: String(values.street ?? base.street),
    locality: String(values.locality ?? base.locality),
    landmark: String(values.landmark ?? base.landmark),
    address: String(values.address ?? base.address),
    pincode: String(values.pincode ?? base.pincode),
    doctorName: String(values.doctorName ?? base.doctorName),
    specialty: String(values.specialty ?? base.specialty),
    valueEstimate: values.valueEstimate != null ? String(values.valueEstimate) : base.valueEstimate,
    appointmentDate: String(values.appointmentDate ?? base.appointmentDate),
    appointmentTime: String(values.appointmentTime ?? base.appointmentTime),
    appointmentCentre: String(values.appointmentCentre ?? base.appointmentCentre),
    source: (String(values.source ?? base.source) as CrmLeadSource) || base.source,
    notes: String(values.notes ?? base.notes),
    formData: { ...values },
  };
}

function formToLeadPayload(form: CrmLeadFormValues) {
  return {
    fullName: form.fullName.trim(),
    phone: form.phone.trim(),
    alternatePhone: form.alternatePhone.trim() || undefined,
    email: form.email.trim() || undefined,
    age: form.age ? Number(form.age) : undefined,
    dob: form.dob || undefined,
    gender: form.gender || undefined,
    city: form.city.trim() || undefined,
    district: form.district.trim() || undefined,
    state: form.state.trim() || undefined,
    country: form.country.trim() || undefined,
    houseNumber: form.houseNumber.trim() || undefined,
    street: form.street.trim() || undefined,
    locality: form.locality.trim() || undefined,
    landmark: form.landmark.trim() || undefined,
    address: form.address.trim() || undefined,
    pincode: form.pincode.trim() || undefined,
    doctorName: form.doctorName.trim() || undefined,
    appointmentDate: form.appointmentDate || undefined,
    appointmentTime: form.appointmentTime || undefined,
    appointmentCentre: form.appointmentCentre || undefined,
    source: form.source,
    stageId: form.stageId,
    assigneeId: form.assigneeId || undefined,
    specialty: form.specialty.trim() || undefined,
    valueEstimate: form.valueEstimate ? Number(form.valueEstimate) : 50000,
    priority: form.priority,
    notes: form.notes.trim(),
    tags: [] as string[],
    lostReason: form.lostReason.trim() || undefined,
    formData: { ...form.formData },
  };
}

type CrmLeadFormModalProps = {
  open: boolean;
  onClose: () => void;
  initial?: CrmLead;
  onSaved?: (leadId: string) => void;
};

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-[12px] text-[var(--attio-text-secondary)]">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </Label>
      {children}
    </div>
  );
}

export function CrmLeadFormModal({ open, onClose, initial, onSaved }: CrmLeadFormModalProps) {
  const { stages, agents, isManager, operatorId, addLead, updateLead } = useCrmStore();
  const { roster } = useFrontdeskStore();
  const schema = useFrontdeskFormSchema("registration", roster, undefined, undefined);
  const filteredSchema = useMemo(() => {
    if (!schema) return schema;
    return {
      ...schema,
      sections: schema.sections.map((section) => ({
        ...section,
        fields: section.fields.filter((f) => !["fullName", "phone", "firstName", "lastName"].includes(f.id)),
      })),
    };
  }, [schema]);
  const [form, setForm] = useState<CrmLeadFormValues>(EMPTY_LEAD_FORM);
  const [captureValues, setCaptureValues] = useState<Record<string, string | number | boolean>>({});
  const [error, setError] = useState("");

  const orderedStages = useMemo(() => [...stages].sort((a, b) => a.order - b.order), [stages]);
  const teamAgents = agents.filter((a) => a.role !== "manager" && a.active);
  const operator = agents.find((a) => a.id === operatorId);
  const isLostStage = form.stageId === "lost" || orderedStages.find((s) => s.id === form.stageId)?.label.toLowerCase() === "lost";

  useEffect(() => {
    if (!open) return;
    const manager = isManager();
    if (initial) {
      const next = leadToForm(initial);
      setForm(next);
      setCaptureValues(leadToSchemaValues(next));
    } else {
      const firstStage = orderedStages[0]?.id ?? "new";
      const next = {
        ...EMPTY_LEAD_FORM,
        stageId: firstStage,
        assigneeId: manager ? "" : operatorId,
        appointmentCentre: "Navayu Gurgaon",
      };
      setForm(next);
      setCaptureValues(leadToSchemaValues(next));
    }
    setError("");
  }, [open, initial?.id, operatorId, orderedStages[0]?.id]);

  if (!open) return null;

  const set = <K extends keyof CrmLeadFormValues>(key: K, value: CrmLeadFormValues[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const mergedForm = mergeSchemaIntoForm(form, captureValues);
    if (!mergedForm.fullName.trim() || !mergedForm.phone.trim()) {
      setError("Name and phone are required.");
      return;
    }
    if (isLostStage && !mergedForm.lostReason.trim()) {
      setError("Lost reason is required when status is Lost.");
      return;
    }

    const payload = formToLeadPayload(mergedForm);
    const assigneeId = isManager() ? payload.assigneeId : operatorId;

    try {
      if (initial) {
        await updateLead(initial.id, { ...payload, assigneeId: assigneeId || initial.assigneeId });
        onSaved?.(initial.id);
      } else {
        await addLead({ ...payload, assigneeId, sourceDetail: "Manual capture" });
        onSaved?.("");
      }
      onClose();
    } catch {
      setError("Could not save lead. Try again.");
    }
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-end justify-center bg-black/35 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-t-2xl border border-[var(--attio-border)] bg-white shadow-2xl sm:rounded-xl">
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-[16px] font-semibold">{initial ? "Edit lead" : "Add lead"}</h2>
            <p className="text-[12px] text-[var(--attio-text-tertiary)]">
              {initial ? "Update patient & appointment details" : "Capture full patient details before adding to pipeline"}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-[var(--attio-hover)]">
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</p>}

          <section className="mb-6">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--attio-text-tertiary)]">
              Status & assignment
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Status">
                <Select value={form.stageId} onValueChange={(v) => v && set("stageId", v)}>
                  <SelectTrigger className="h-9 text-[13px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {orderedStages.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Assignee name">
                {isManager() ? (
                  <Select value={form.assigneeId} onValueChange={(v) => set("assigneeId", v ?? "")}>
                    <SelectTrigger className="h-9 text-[13px]">
                      <SelectValue placeholder="Select counsellor" />
                    </SelectTrigger>
                    <SelectContent>
                      {teamAgents.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={operator?.name ?? ""} readOnly className="h-9 bg-[var(--attio-surface)] text-[13px]" />
                )}
              </Field>
              <Field label="Assignee email">
                <Input
                  value={
                    isManager()
                      ? teamAgents.find((a) => a.id === form.assigneeId)?.email ?? ""
                      : operator?.email ?? ""
                  }
                  readOnly
                  className="h-9 bg-[var(--attio-surface)] text-[13px]"
                />
              </Field>
            </div>
            {isLostStage && (
              <Field label="Lost reason" required className="mt-3">
                <Input
                  value={form.lostReason}
                  onChange={(e) => set("lostReason", e.target.value)}
                  placeholder="Why was this lead lost?"
                  className="h-9 text-[13px]"
                />
              </Field>
            )}
          </section>

          <section className="mb-6">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--attio-text-tertiary)]">
              Patient details
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Full name" required>
                <Input
                  value={form.fullName}
                  onChange={(e) => set("fullName", e.target.value)}
                  placeholder="Patient full name"
                  className="h-9 text-[13px]"
                />
              </Field>
              <Field label="Mobile no" required>
                <Input
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="10-digit mobile"
                  className="h-9 text-[13px]"
                />
              </Field>
            </div>
          </section>

          <PublishedSchemaForm
            schema={filteredSchema}
            hideSubmit
            formKey={initial?.id ?? "new-lead"}
            initialValues={captureValues}
            onValuesChange={setCaptureValues}
            roster={roster}
            className="mb-2"
          />
        </form>

        <div className="flex shrink-0 justify-end gap-2 border-t px-5 py-4">
          <AttioButton variant="secondary" type="button" onClick={onClose}>
            Cancel
          </AttioButton>
          <AttioButton variant="primary" type="submit" onClick={handleSubmit}>
            {initial ? "Save changes" : "Add to pipeline"}
          </AttioButton>
        </div>
      </div>
    </div>
  );
}
