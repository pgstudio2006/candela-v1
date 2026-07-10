"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { FormSchema, SchemaField } from "@/design-system/frontdesk-schemas";
import { PatientSearchField } from "@/components/frontdesk/patient-search-field";
import type { Patient } from "@/design-system/frontdesk-data";
import { deptLabelFromRoster, resolveDoctorName, type ClinicalRoster } from "@/lib/clinical-roster";
import { deptLabel } from "@/lib/frontdesk-workflow";
import { validateFormValues } from "@/lib/schema-registry";
import {
  fieldOptionsForRender,
  otherDetailKey,
  parseMultiValue,
  selectionUsesOther,
  toggleMultiValue,
  schemaFingerprint,
} from "@/lib/schema-field-utils";
import {
  cascadeIndiaLocationChange,
  resolveIndiaLocationOptions,
} from "@/lib/india-locations";
import { searchSocieties } from "@/lib/gurgaon-societies";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useRef, useState } from "react";

function humanizeSelectValue(value: string, fieldId: string, roster?: ClinicalRoster | null): string {
  if (fieldId === "department" || value.startsWith("dept_")) {
    return roster ? deptLabelFromRoster(value, roster) : deptLabel(value);
  }
  if (fieldId === "doctor" || value.startsWith("dr_")) return resolveDoctorName(value, roster);
  return value.replace(/_/g, " ");
}

function SocietySearchInput({
  value,
  onChange,
  placeholder,
  base,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  base: string;
}) {
  const [query, setQuery] = useState(String(value ?? ""));
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<string[]>([]);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQuery(String(value ?? ""));
  }, [value]);

  const doSearch = (q: string) => {
    setQuery(q);
    setResults(searchSocieties(q, 8));
    setOpen(true);
  };

  const pick = (s: string) => {
    setQuery(s);
    onChange(s);
    setOpen(false);
  };

  return (
    <div className="relative">
      <Input
        type="text"
        value={query}
        onChange={(e) => doSearch(e.target.value)}
        onFocus={() => {
          if (blurTimer.current) clearTimeout(blurTimer.current);
          setResults(searchSocieties(query, 8));
          setOpen(true);
        }}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 200);
        }}
        placeholder={placeholder ?? "Search society…"}
        className={cn(base, "h-9")}
      />
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-[var(--attio-border)] bg-white shadow-lg">
          {results.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              className="block w-full px-3 py-2 text-left text-[12px] hover:bg-[var(--attio-hover)]"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      {open && results.length === 0 && query.trim() && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-[var(--attio-border)] bg-white px-3 py-2 text-[12px] text-[var(--attio-text-tertiary)] shadow-lg">
          No matching society — type manually
        </div>
      )}
    </div>
  );
}

function SchemaFieldInput({
  field,
  value,
  onChange,
  searchPatients,
  roster,
  allValues,
}: {
  field: SchemaField;
  value: string | number | boolean;
  onChange: (v: string | number | boolean) => void;
  searchPatients?: Patient[];
  roster?: ClinicalRoster | null;
  allValues?: Record<string, string | number | boolean>;
}) {
  const base = cn(
    "rounded-md border border-[var(--attio-border)] bg-white text-[13px] text-[var(--attio-text)]",
    "placeholder:text-[var(--attio-text-tertiary)] focus-visible:border-[var(--attio-text-tertiary)] focus-visible:ring-0 focus-visible:outline-none",
  );

  if (field.type === "section" || field.type === "divider" || field.type === "help") return null;

  if (field.type === "formula" || field.readOnly) {
    return (
      <div className={cn(base, "flex h-9 items-center bg-[var(--attio-surface)] px-3 text-[var(--attio-text-tertiary)]")}>
        {String(value ?? field.defaultValue ?? "Computed")}
      </div>
    );
  }

  if (field.type === "rating" || field.type === "pain-scale" || field.type === "slider") {
    return (
      <input type="range" min={0} max={10} value={Number(value ?? 0)} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
    );
  }

  if (field.type === "multiselect") {
    const selected = new Set(parseMultiValue(value));
    const options = fieldOptionsForRender(field);
    return (
      <div className="space-y-2">
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-[12px]">
            <input
              type="checkbox"
              checked={selected.has(o.value)}
              onChange={() => onChange(toggleMultiValue(value, o.value))}
            />
            {o.label}
          </label>
        ))}
        {options.length === 0 && (
          <p className="text-[12px] text-[var(--attio-text-tertiary)]">No options configured for this field.</p>
        )}
      </div>
    );
  }

  if (field.type === "checkbox" && field.options?.length) {
    const selected = new Set(parseMultiValue(value));
    return (
      <div className="space-y-1">
        {field.options.map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-[12px]">
            <input
              type="checkbox"
              checked={selected.has(o.value)}
              onChange={() => onChange(toggleMultiValue(value, o.value))}
            />
            {o.label}
          </label>
        ))}
      </div>
    );
  }

  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-2 text-[12px]">
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        {field.label}
      </label>
    );
  }

  if (field.type === "radio") {
    const options = fieldOptionsForRender(field);
    return (
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const selected = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={cn(
                "h-9 rounded-md border px-4 text-[12px] font-medium transition-colors",
                selected
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-[var(--attio-border)] bg-white text-[var(--attio-text-secondary)] hover:bg-[var(--attio-hover)]",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    );
  }

  if (field.type === "file" || field.type === "image" || field.type === "signature") {
    return (
      <div className={cn(base, "flex h-20 items-center justify-center border-dashed text-[12px] text-[var(--attio-text-tertiary)]")}>
        {field.type === "signature" ? "Signature pad (capture in module)" : "Upload (file picker in module)"}
      </div>
    );
  }

  if (field.type === "consent-version") {
    return (
      <label className="flex items-start gap-2 text-[12px]">
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        <span>I consent · template v2026.1</span>
      </label>
    );
  }

  if (["icd-picker", "body-region", "allergy-list", "vitals-group", "package-picker", "discount-percent", "payment-mode"].includes(field.type)) {
    return (
      <Select value={String(value ?? "")} onValueChange={(v) => v != null && onChange(v)}>
        <SelectTrigger className={cn(base, "h-9 w-full")}>
          <SelectValue placeholder={`Select ${field.label}…`} />
        </SelectTrigger>
        <SelectContent>
          {(field.options ?? [{ value: "demo", label: "Demo option" }]).map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (field.type === "society-search") {
    return (
      <SocietySearchInput
        value={String(value ?? "")}
        onChange={(v) => onChange(v)}
        placeholder={field.placeholder}
        base={base}
      />
    );
  }

  if (field.type === "textarea") {
    return (
      <Textarea
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        className={cn(base, "min-h-[80px] resize-none")}
      />
    );
  }

  if ((field.id === "uhid" || field.id === "patient") && searchPatients) {
    return (
      <PatientSearchField
        value={String(value ?? "")}
        patients={searchPatients}
        placeholder={field.placeholder ?? "Search by UHID, phone, or name…"}
        onChange={(q) => onChange(q)}
      />
    );
  }

  if (field.type === "select") {
    const raw = String(value ?? "");
    const indiaOptions = allValues ? resolveIndiaLocationOptions(field.id, allValues) : null;
    let options = indiaOptions ?? fieldOptionsForRender(field);
    if (raw && !options.some((o) => o.value === raw)) {
      options = [{ value: raw, label: humanizeSelectValue(raw, field.id, roster) }, ...options];
    }
    const selectedOption = options.find((o) => o.value === raw);
    return (
      <Select value={raw || undefined} onValueChange={(v) => v != null && onChange(v)}>
        <SelectTrigger className={cn(base, "h-9 w-full")}>
          <SelectValue placeholder={field.placeholder ?? "Select…"}>
            {selectedOption?.label ?? (raw ? humanizeSelectValue(raw, field.id, roster) : undefined)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (field.type === "toggle") {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={Boolean(value)}
        onClick={() => onChange(!value)}
        className={cn(
          "relative h-6 w-11 rounded-full transition-colors",
          value ? "bg-zinc-900" : "bg-zinc-200",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform",
            value ? "left-[22px]" : "left-0.5",
          )}
        />
      </button>
    );
  }

  const inputType =
    field.type === "email"
      ? "email"
      : field.type === "phone"
        ? "tel"
        : field.type === "number" || field.type === "currency" || field.type === "percent"
          ? "number"
          : field.type === "date"
            ? "date"
            : field.type === "time" || field.type === "duration"
              ? "time"
              : field.type === "datetime"
                ? "datetime-local"
                : field.type === "url"
                  ? "url"
                  : field.type === "password"
                    ? "password"
                    : "text";

  return (
    <Input
      type={inputType}
      value={value === undefined || value === null ? "" : String(value)}
      onChange={(e) =>
        onChange(
          field.type === "number" || field.type === "currency" || field.type === "percent"
            ? Number(e.target.value)
            : e.target.value,
        )
      }
      placeholder={field.placeholder}
      className={cn(base, "h-9")}
    />
  );
}

function defaultValues(
  schema: FormSchema,
  initial?: Record<string, string | number | boolean>,
) {
  const vals: Record<string, string | number | boolean> = {};
  for (const section of schema.sections) {
    for (const f of section.fields) {
      if (initial && initial[f.id] !== undefined) vals[f.id] = initial[f.id];
      else if (f.defaultValue !== undefined) vals[f.id] = f.defaultValue;
      else if (f.type === "toggle") vals[f.id] = false;
      else vals[f.id] = "";
    }
  }
  return vals;
}

export function SchemaForm({
  schema,
  onSubmit,
  submitLabel = "Save",
  submitStatus = "idle",
  hideSubmit = false,
  className,
  initialValues,
  formKey,
  onValuesChange,
  searchPatients,
  roster,
}: {
  schema: FormSchema;
  onSubmit?: (data: Record<string, string | number | boolean>) => void;
  submitLabel?: string;
  submitStatus?: "idle" | "saving" | "saved";
  hideSubmit?: boolean;
  className?: string;
  initialValues?: Record<string, string | number | boolean>;
  formKey?: string;
  onValuesChange?: (values: Record<string, string | number | boolean>) => void;
  searchPatients?: Patient[];
  roster?: ClinicalRoster | null;
}) {
  const [values, setValues] = useState(() => defaultValues(schema, initialValues));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const initialKey = useMemo(() => JSON.stringify(initialValues ?? {}), [initialValues]);
  const fingerprint = useMemo(() => schemaFingerprint(schema), [schema]);
  const resetKey = `${formKey ?? schema.id}:${initialKey}:${fingerprint}`;
  const lastResetKey = useRef(resetKey);

  useEffect(() => {
    if (lastResetKey.current === resetKey) return;
    lastResetKey.current = resetKey;
    setValues(defaultValues(schema, initialValues));
    setErrors({});
  }, [resetKey, schema, initialValues]);

  const set = (id: string, v: string | number | boolean) => {
    setValues((prev) => {
      let next = { ...prev, [id]: v };
      next = cascadeIndiaLocationChange(id, next);
      onValuesChange?.(next);
      return next;
    });
    setErrors((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const setWithOther = (field: SchemaField, v: string | number | boolean) => {
    set(field.id, v);
    if (!selectionUsesOther(field, v)) {
      set(otherDetailKey(field.id), "");
      setErrors((prev) => {
        if (!prev[otherDetailKey(field.id)]) return prev;
        const next = { ...prev };
        delete next[otherDetailKey(field.id)];
        return next;
      });
    }
  };

  return (
    <form
      className={cn("space-y-8", className)}
      onSubmit={(e) => {
        e.preventDefault();
        const nextErrors = validateFormValues(schema, values);
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length === 0) onSubmit?.(values);
      }}
    >
      {schema.sections.map((section) => (
        <div key={section.id}>
          <h3 className="mb-3 text-[10px] font-semibold tracking-[0.08em] text-[var(--attio-text-tertiary)] uppercase">
            {section.label}
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {section.fields.map((field) => {
              if (field.type === "divider") {
                return <hr key={field.id} className="sm:col-span-2 border-[var(--attio-border-subtle)]" />;
              }
              if (field.type === "help") {
                return (
                  <p key={field.id} className="sm:col-span-2 text-[12px] text-[var(--attio-text-tertiary)]">{field.hint ?? field.label}</p>
                );
              }
              if (field.type === "section") {
                return (
                  <h4 key={field.id} className="sm:col-span-2 text-[13px] font-semibold">{field.label}</h4>
                );
              }
              return (
              <div
                key={field.id}
                className={cn(
                  "space-y-1.5",
                  field.span === 2 && "sm:col-span-2",
                  field.type === "toggle" && "flex items-center justify-between sm:col-span-2",
                )}
              >
                {!(field.type === "checkbox" && !field.options?.length) && (
                  <Label className="text-[12px] font-medium text-[var(--attio-text-secondary)]">
                    {field.label}
                    {field.required && <span className="text-red-500"> *</span>}
                  </Label>
                )}
                {field.type !== "toggle" && (
                  <SchemaFieldInput
                    field={field}
                    value={values[field.id]}
                    onChange={(v) => setWithOther(field, v)}
                    searchPatients={searchPatients}
                    roster={roster}
                    allValues={values}
                  />
                )}
                {field.type === "toggle" && (
                  <SchemaFieldInput
                    field={field}
                    value={values[field.id]}
                    onChange={(v) => setWithOther(field, v)}
                    searchPatients={searchPatients}
                    roster={roster}
                    allValues={values}
                  />
                )}
                {field.hint && (
                  <p className="text-[11px] text-zinc-400">{field.hint}</p>
                )}
                {selectionUsesOther(field, values[field.id]) && (
                  <Input
                    value={String(values[otherDetailKey(field.id)] ?? "")}
                    onChange={(e) => set(otherDetailKey(field.id), e.target.value)}
                    placeholder={field.otherPlaceholder ?? "Please specify…"}
                    className="h-9 text-[13px]"
                  />
                )}
                {errors[field.id] && (
                  <p className="text-[11px] text-red-600">{errors[field.id]}</p>
                )}
                {errors[otherDetailKey(field.id)] && (
                  <p className="text-[11px] text-red-600">{errors[otherDetailKey(field.id)]}</p>
                )}
              </div>
              );
            })}
          </div>
        </div>
      ))}
      {onSubmit && !hideSubmit && (
        <button
          type="submit"
          disabled={submitStatus === "saving"}
          className={cn(
            "h-8 rounded-md px-3 text-[12px] font-medium text-white transition-colors",
            submitStatus === "saved"
              ? "bg-emerald-600 hover:bg-emerald-700"
              : submitStatus === "saving"
                ? "bg-[var(--attio-text)]/70 cursor-wait"
                : "bg-[var(--attio-text)] hover:bg-[#333]",
          )}
        >
          {submitStatus === "saved" ? "Draft saved" : submitStatus === "saving" ? "Saving..." : submitLabel}
        </button>
      )}
    </form>
  );
}
