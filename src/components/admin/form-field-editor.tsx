"use client";

import type { FieldType, SchemaField } from "@/design-system/frontdesk-schemas";
import { FIELD_TYPE_CATALOG } from "@/design-system/admin-data";
import { isChoiceField } from "@/lib/schema-field-utils";
import { AttioButton } from "@/components/frontdesk/ui";
import { cn } from "@/lib/utils";
import { Plus, Trash2 } from "lucide-react";

type FormFieldEditorProps = {
  field: SchemaField;
  onChange: (patch: Partial<SchemaField>) => void;
  onRemove: () => void;
};

function slugValue(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "") || "option";
}

export function FormFieldEditor({ field, onChange, onRemove }: FormFieldEditorProps) {
  const choice = isChoiceField(field.type);
  const options = field.options ?? [];

  const updateOption = (index: number, patch: Partial<{ value: string; label: string }>) => {
    const next = options.map((o, i) => (i === index ? { ...o, ...patch } : o));
    onChange({ options: next });
  };

  const addOption = () => {
    const n = options.length + 1;
    const label = `Option ${n}`;
    onChange({
      options: [...options, { value: slugValue(label), label }],
    });
  };

  const removeOption = (index: number) => {
    onChange({ options: options.filter((_, i) => i !== index) });
  };

  return (
    <li className="rounded-lg border border-[var(--attio-border-subtle)] bg-white p-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_140px_80px_auto] sm:items-center">
        <input
          value={field.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Field label"
          className="h-8 rounded-md border border-[var(--attio-border)] px-2 text-[13px]"
        />
        <select
          value={field.type}
          onChange={(e) => {
            const type = e.target.value as FieldType;
            const patch: Partial<SchemaField> = {
              type,
              category: FIELD_TYPE_CATALOG.find((c) => c.type === type)?.category,
            };
            if (isChoiceField(type) && !field.options?.length) {
              patch.options = [{ value: "option_1", label: "Option 1" }];
            }
            onChange(patch);
          }}
          className="h-8 rounded-md border border-[var(--attio-border)] px-2 text-[11px]"
        >
          {FIELD_TYPE_CATALOG.map((t) => (
            <option key={t.type} value={t.type}>
              {t.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-[12px]">
          <input
            type="checkbox"
            checked={Boolean(field.required)}
            onChange={(e) => onChange({ required: e.target.checked })}
          />
          Required
        </label>
        <button type="button" onClick={onRemove} className="text-[12px] text-red-600 hover:underline">
          Remove
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-[11px]">
          <span className="mb-1 block text-[var(--attio-text-tertiary)]">Placeholder</span>
          <input
            value={field.placeholder ?? ""}
            onChange={(e) => onChange({ placeholder: e.target.value || undefined })}
            className="h-8 w-full rounded-md border border-[var(--attio-border)] px-2 text-[12px]"
          />
        </label>
        <label className="block text-[11px]">
          <span className="mb-1 block text-[var(--attio-text-tertiary)]">Default value</span>
          <input
            value={field.defaultValue != null ? String(field.defaultValue) : ""}
            onChange={(e) => onChange({ defaultValue: e.target.value || undefined })}
            className="h-8 w-full rounded-md border border-[var(--attio-border)] px-2 text-[12px]"
          />
        </label>
        <label className="block text-[11px] sm:col-span-2">
          <span className="mb-1 block text-[var(--attio-text-tertiary)]">Hint (help text under field)</span>
          <input
            value={field.hint ?? ""}
            onChange={(e) => onChange({ hint: e.target.value || undefined })}
            className="h-8 w-full rounded-md border border-[var(--attio-border)] px-2 text-[12px]"
          />
        </label>
        <label className="flex items-center gap-2 text-[12px]">
          <input
            type="checkbox"
            checked={field.span === 2}
            onChange={(e) => onChange({ span: e.target.checked ? 2 : 1 })}
          />
          Full width (2 columns)
        </label>
      </div>

      {choice && (
        <div className="mt-4 rounded-md border border-dashed border-[var(--attio-border)] bg-[var(--attio-surface)] p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--attio-text-tertiary)]">
              Dropdown / choice options
            </p>
            <AttioButton variant="secondary" className="h-7 gap-1 text-[11px]" onClick={addOption}>
              <Plus className="size-3" />
              Add option
            </AttioButton>
          </div>
          {options.length === 0 && (
            <p className="text-[12px] text-[var(--attio-text-tertiary)]">No options yet — add at least one.</p>
          )}
          <ul className="space-y-2">
            {options.map((opt, index) => (
              <li key={`${field.id}-opt-${index}`} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
                <input
                  value={opt.label}
                  onChange={(e) => {
                    const label = e.target.value;
                    updateOption(index, { label, value: opt.value || slugValue(label) });
                  }}
                  placeholder="Label shown to user"
                  className="h-8 rounded-md border border-[var(--attio-border)] bg-white px-2 text-[12px]"
                />
                <input
                  value={opt.value}
                  onChange={(e) => updateOption(index, { value: e.target.value })}
                  placeholder="Stored value"
                  className="h-8 rounded-md border border-[var(--attio-border)] bg-white px-2 font-mono text-[11px]"
                />
                <button
                  type="button"
                  onClick={() => removeOption(index)}
                  className="flex size-8 items-center justify-center rounded-md text-red-600 hover:bg-red-50"
                  aria-label="Remove option"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <label className="mt-3 flex items-start gap-2 text-[12px]">
            <input
              type="checkbox"
              checked={Boolean(field.allowOther)}
              onChange={(e) => onChange({ allowOther: e.target.checked })}
              className="mt-0.5"
            />
            <span>
              Include <strong>Other</strong> option — shows a text field when selected so users can enter custom details
            </span>
          </label>
          {field.allowOther && (
            <label className="mt-2 block text-[11px]">
              <span className="mb-1 block text-[var(--attio-text-tertiary)]">Other detail placeholder</span>
              <input
                value={field.otherPlaceholder ?? ""}
                onChange={(e) => onChange({ otherPlaceholder: e.target.value || undefined })}
                placeholder="Please specify…"
                className="h-8 w-full rounded-md border border-[var(--attio-border)] bg-white px-2 text-[12px]"
              />
            </label>
          )}
        </div>
      )}

      {choice && (
        <div className="mt-4 rounded-md border border-dashed border-indigo-200 bg-indigo-50/40 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
              Cascading options (per parent value)
            </p>
            <label className="flex items-center gap-1.5 text-[11px] text-indigo-700">
              <input
                type="checkbox"
                checked={Boolean(field.cascadeFrom)}
                onChange={(e) =>
                  onChange({
                    cascadeFrom: e.target.checked ? "department" : undefined,
                    cascadeOptions: e.target.checked ? { dept_spine: [], dept_wellness: [] } : undefined,
                  })
                }
                className="mt-0.5"
              />
              Enable cascading
            </label>
          </div>
          {field.cascadeFrom ? (
            <div className="space-y-3">
              <p className="text-[11px] text-indigo-600">
                Parent field: <code className="rounded bg-indigo-100 px-1 py-0.5 font-mono text-[10px]">{field.cascadeFrom}</code>
              </p>
              {Object.entries(field.cascadeOptions ?? {}).map(([parentValue, opts], groupIndex) => (
                <div key={parentValue} className="rounded border border-indigo-100 bg-white p-2.5">
                  <div className="mb-2 flex items-center gap-2">
                    <input
                      value={parentValue}
                      onChange={(e) => {
                        const newValue = e.target.value.trim();
                        const all = field.cascadeOptions ?? {};
                        const ordered = Object.entries(all);
                        ordered[groupIndex] = [newValue, opts];
                        onChange({ cascadeOptions: Object.fromEntries(ordered) });
                      }}
                      placeholder="Parent value (e.g. dept_spine)"
                      className="h-7 flex-1 rounded border border-indigo-200 bg-white px-2 text-[12px] font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const all = { ...field.cascadeOptions };
                        delete all[parentValue];
                        onChange({ cascadeOptions: all });
                      }}
                      className="flex size-7 items-center justify-center rounded text-red-600 hover:bg-red-50"
                      aria-label="Remove group"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <ul className="space-y-1.5">
                    {opts.map((opt, index) => (
                      <li key={`${parentValue}-${index}`} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
                        <input
                          value={opt.label}
                          onChange={(e) => {
                            const label = e.target.value;
                            const next = opts.map((o, i) => (i === index ? { ...o, label, value: o.value || slugValue(label) } : o));
                            const all = { ...field.cascadeOptions, [parentValue]: next };
                            onChange({ cascadeOptions: all });
                          }}
                          placeholder="Problem label"
                          className="h-7 rounded border border-indigo-200 bg-white px-2 text-[12px]"
                        />
                        <input
                          value={opt.value}
                          onChange={(e) => {
                            const next = opts.map((o, i) => (i === index ? { ...o, value: e.target.value } : o));
                            const all = { ...field.cascadeOptions, [parentValue]: next };
                            onChange({ cascadeOptions: all });
                          }}
                          placeholder="Stored value"
                          className="h-7 rounded border border-indigo-200 bg-white px-2 font-mono text-[11px]"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const next = opts.filter((_, i) => i !== index);
                            const all = { ...field.cascadeOptions, [parentValue]: next };
                            onChange({ cascadeOptions: all });
                          }}
                          className="flex size-7 items-center justify-center rounded text-red-600 hover:bg-red-50"
                          aria-label="Remove option"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <AttioButton
                    variant="secondary"
                    className="mt-2 h-7 gap-1 text-[11px]"
                    onClick={() => {
                      const next = [...opts, { value: "", label: "" }];
                      const all = { ...field.cascadeOptions, [parentValue]: next };
                      onChange({ cascadeOptions: all });
                    }}
                  >
                    <Plus className="size-3" />
                    Add problem for {parentValue || "parent"}
                  </AttioButton>
                </div>
              ))}
              <AttioButton
                variant="secondary"
                className="h-7 gap-1 text-[11px]"
                onClick={() => {
                  const key = `dept_new_${Object.keys(field.cascadeOptions ?? {}).length + 1}`;
                  onChange({ cascadeOptions: { ...field.cascadeOptions, [key]: [] } });
                }}
              >
                <Plus className="size-3" />
                Add department group
              </AttioButton>
            </div>
          ) : (
            <p className="text-[12px] text-indigo-600">
              Enable cascading to show different options depending on another field (e.g. Department → Problem).
            </p>
          )}
        </div>
      )}

      <p className="mt-2 font-mono text-[10px] text-[var(--attio-text-tertiary)]">id: {field.id}</p>
    </li>
  );
}
