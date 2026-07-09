"use client";

import {
  corruptSchemaOverrideMessage,
  CRM_FORM_SCHEMA_IDS,
  getAnyFormSchema,
  isCorruptSchemaOverride,
  listSchemasForDepartment,
  newFieldId,
  SCHEMA_CATALOG,
  setSchemaOverrideCache,
} from "@/lib/schema-registry";
import type { FieldType, FormSchema, SchemaField } from "@/design-system/frontdesk-schemas";
import { FIELD_TYPE_CATALOG, FORM_DEPARTMENTS, type FormDepartment } from "@/design-system/admin-data";
import { FormFieldEditor } from "@/components/admin/form-field-editor";
import { SchemaForm } from "@/components/candela/schema-form";
import { AttioButton, Panel } from "@/components/frontdesk/ui";
import { schemaLiveRoute, schemaUsageLabel } from "@/lib/schema-usage";
import { schemaFingerprint } from "@/lib/schema-field-utils";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  listFormSchemaOverrides,
  type FormSchemaOverridesResult,
} from "@/server/admin/actions";

type SchemaGroup = FormDepartment;

type SchemaListResponse =
  | { ok: true; data: FormSchemaOverridesResult }
  | { ok: false; error: string };

type SchemaMutationResponse =
  | { ok: true; data: { schemaId: string } }
  | { ok: false; error: string };

async function fetchFormSchemas(purge: boolean): Promise<SchemaListResponse> {
  const params = purge ? "" : "?purge=0";
  const res = await fetch(`/api/admin/form-schemas${params}`, {
    cache: "no-store",
    credentials: "include",
  });
  const json = (await res.json()) as SchemaListResponse;
  if (res.ok && json.ok) return json;
  return {
    ok: false,
    error: (!json.ok && json.error) || "Failed to load form schemas.",
  };
}

async function publishFormSchema(schema: FormSchema, schemaId: string): Promise<SchemaMutationResponse> {
  try {
    const res = await fetch("/api/admin/form-schemas", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schema, schemaId }),
    });
    const json = (await res.json()) as SchemaMutationResponse;
    if (res.ok && json.ok) return json;
    return {
      ok: false,
      error: (!json.ok && json.error) || "Failed to publish schema.",
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to publish schema.",
    };
  }
}

async function resetFormSchema(schemaId: string): Promise<SchemaMutationResponse> {
  const res = await fetch(`/api/admin/form-schemas?schemaId=${encodeURIComponent(schemaId)}`, {
    method: "DELETE",
    credentials: "include",
  });
  const json = (await res.json()) as SchemaMutationResponse;
  if (res.ok && json.ok) return json;
  return {
    ok: false,
    error: (!json.ok && json.error) || "Failed to reset schema.",
  };
}

async function loadFormSchemas(purge: boolean): Promise<SchemaListResponse> {
  const api = await fetchFormSchemas(purge);
  if (api.ok) return api;
  try {
    const action = await listFormSchemaOverrides({ purge });
    if (action.ok) return { ok: true, data: action.data };
    return { ok: false, error: action.error };
  } catch {
    return { ok: false, error: api.error };
  }
}

async function savePublishedSchema(schema: FormSchema, schemaId: string): Promise<SchemaMutationResponse> {
  return publishFormSchema(schema, schemaId);
}

async function resetPublishedSchema(schemaId: string): Promise<SchemaMutationResponse> {
  return resetFormSchema(schemaId);
}

function broadcastSchemaUpdate(schemaId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("candela-schema-updated", { detail: { id: schemaId } }));
  try {
    new BroadcastChannel("candela-schema").postMessage({ type: "updated", id: schemaId, at: Date.now() });
  } catch {
    /* ignore */
  }
}

const FIELD_CATEGORIES = ["basic", "numeric", "datetime", "choice", "clinical", "commercial", "media", "layout", "compliance", "computed"] as const;

function catalogLabel(schemaId: string): string {
  return SCHEMA_CATALOG.find((entry) => entry.id === schemaId)?.label ?? schemaId;
}

function loadSchema(id: string): FormSchema {
  const loaded = getAnyFormSchema(id);
  return { ...loaded, id, title: catalogLabel(id) };
}

export function AdminFormBuilder({
  initialDepartment = "frontdesk",
  initialSchemaId,
  hideDepartmentFilter = false,
}: {
  initialDepartment?: FormDepartment;
  initialSchemaId?: string;
  hideDepartmentFilter?: boolean;
}) {
  const initialDept = initialDepartment;
  const initialSchemas = listSchemasForDepartment(initialDept);
  const [activeId, setActiveId] = useState<string>(initialSchemaId ?? initialSchemas[0]?.id ?? "registration");
  const [deptFilter, setDeptFilter] = useState<SchemaGroup>(initialDept);
  const [schema, setSchema] = useState<FormSchema>(() => loadSchema(initialSchemaId ?? "registration"));
  const [saved, setSaved] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [addType, setAddType] = useState<FieldType>("text");
  const [ready, setReady] = useState(false);
  const [purgedNotice, setPurgedNotice] = useState<string | null>(null);
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  const applyOverrides = useCallback((result: FormSchemaOverridesResult) => {
    setSchemaOverrideCache(result.overrides);
    setSchema(loadSchema(activeIdRef.current));
    if (result.purgedIds.length > 0) {
      setPurgedNotice(
        `Fixed ${result.purgedIds.length} corrupted form(s) that had registration fields on the wrong schema (${result.purgedIds.join(", ")}). Each now uses its correct default until you publish again.`,
      );
    }
  }, []);

  const selectSchema = useCallback((id: string) => {
    setActiveId(id);
    setSchema(loadSchema(id));
    setSaved(false);
    setPublishError(null);
  }, []);

  useEffect(() => {
    void (async () => {
      const result = await loadFormSchemas(true);
      if (result.ok) {
        applyOverrides(result.data);
      }
      setReady(true);
    })();
  }, [applyOverrides]);

  useEffect(() => {
    if (!ready) return;
    const options = listSchemasForDepartment(deptFilter);
    if (!options.some((o) => o.id === activeId) && options[0]) {
      selectSchema(options[0].id);
    }
  }, [deptFilter, ready, activeId, selectSchema]);

  useEffect(() => {
    if (!ready) return;
    setSchema(loadSchema(activeId));
    setSaved(false);
  }, [activeId, ready]);

  const allFields = schema.sections.flatMap((s) => s.fields);
  const filteredSchemas = listSchemasForDepartment(deptFilter);
  const previewKey = `${activeId}:${schemaFingerprint(schema)}`;
  const liveRoute = schemaLiveRoute(activeId);
  const activeLabel = catalogLabel(activeId);
  const schemaLooksLikeRegistration =
    activeId !== "registration" &&
    !CRM_FORM_SCHEMA_IDS.includes(activeId as any) &&
    (schema.sections.some((s) => s.id === "patient" || s.id === "visit" || s.id === "consent") ||
      schema.sections.flatMap((s) => s.fields).some((f) => f.id === "fullName"));

  const pinSchemaMeta = (next: FormSchema): FormSchema => ({
    ...next,
    id: activeId,
    title: activeLabel,
  });

  const fieldsByCategory = useMemo(() => {
    const map = new Map<string, typeof FIELD_TYPE_CATALOG>();
    for (const cat of FIELD_CATEGORIES) {
      map.set(cat, FIELD_TYPE_CATALOG.filter((f) => f.category === cat));
    }
    return map;
  }, []);

  const updateField = (fieldId: string, patch: Partial<SchemaField>) => {
    setSchema((prev) =>
      pinSchemaMeta({
        ...prev,
        sections: prev.sections.map((section) => ({
          ...section,
          fields: section.fields.map((f) =>
            f.id === fieldId
              ? {
                  ...f,
                  ...patch,
                  category: FIELD_TYPE_CATALOG.find((c) => c.type === (patch.type ?? f.type))?.category,
                }
              : f,
          ),
        })),
      }),
    );
    setSaved(false);
    setPublishError(null);
  };

  const removeField = (fieldId: string) => {
    setSchema((prev) =>
      pinSchemaMeta({
        ...prev,
        sections: prev.sections.map((section) => ({
          ...section,
          fields: section.fields.filter((f) => f.id !== fieldId),
        })),
      }),
    );
    setSaved(false);
    setPublishError(null);
  };

  const addField = (sectionId: string) => {
    const meta = FIELD_TYPE_CATALOG.find((f) => f.type === addType);
    const label = meta?.label ?? "New field";
    setSchema((prev) =>
      pinSchemaMeta({
        ...prev,
        sections: prev.sections.map((section) => {
          if (section.id !== sectionId) return section;
          const field: SchemaField = {
            id: newFieldId(label, allFields),
            type: addType,
            label,
            category: meta?.category,
            ...(addType === "select" || addType === "radio" || addType === "multiselect"
              ? { options: [{ value: "opt1", label: "Option 1" }] }
              : {}),
            ...(addType === "help" ? { hint: "Help text for users" } : {}),
            ...(addType === "formula" ? { readOnly: true, defaultValue: "Computed" } : {}),
          };
          return { ...section, fields: [...section.fields, field] };
        }),
      }),
    );
    setSaved(false);
    setPublishError(null);
  };

  const publish = () => {
    void (async () => {
      const payload = pinSchemaMeta(schema);
      setPublishing(true);
      setPublishError(null);
      setSaved(false);

      if (isCorruptSchemaOverride(activeId, payload)) {
        setPublishError(corruptSchemaOverrideMessage(activeId));
        setPublishing(false);
        return;
      }

      try {
        const saveResult = await savePublishedSchema(payload, activeId);
        if (!saveResult.ok) {
          setPublishError(saveResult.error);
          return;
        }

        const listResult = await loadFormSchemas(false);
        if (listResult.ok) {
          applyOverrides(listResult.data);
        } else {
          setPublishError(listResult.error);
          return;
        }
        broadcastSchemaUpdate(activeId);
        setSaved(true);
        setPurgedNotice(null);
      } catch (err) {
        setPublishError(err instanceof Error ? err.message : "Failed to publish schema.");
      } finally {
        setPublishing(false);
      }
    })();
  };

  const reset = () => {
    void (async () => {
      setResetting(true);
      setPublishError(null);
      setSaved(false);
      try {
        const resetResult = await resetPublishedSchema(activeId);
        if (!resetResult.ok) {
          setPublishError(resetResult.error);
          return;
        }

        const listResult = await loadFormSchemas(false);
        if (listResult.ok) {
          applyOverrides(listResult.data);
        }
        broadcastSchemaUpdate(activeId);
      } catch (err) {
        setPublishError(err instanceof Error ? err.message : "Failed to reset schema.");
      } finally {
        setResetting(false);
      }
    })();
  };

  return (
    <div className="space-y-6">
      {!hideDepartmentFilter && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--attio-text-tertiary)]">Department scope</p>
          <div className="flex flex-wrap gap-2">
            {FORM_DEPARTMENTS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDeptFilter(d)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[12px] font-medium capitalize",
                  deptFilter === d ? "bg-[var(--attio-text)] text-white" : "border border-[var(--attio-border)]",
                )}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      )}

      {schemaLooksLikeRegistration && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-900">
          This form is still showing registration fields. Click <strong>Reset to default</strong> to load the correct{" "}
          {activeLabel} form, then publish your changes.
        </p>
      )}

      {purgedNotice && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          {purgedNotice}
        </p>
      )}

      <p className="rounded-lg border border-[var(--attio-border-subtle)] bg-[var(--attio-surface)] px-3 py-2 text-[12px] text-[var(--attio-text-secondary)]">
        <span className="font-medium text-[var(--attio-text)]">Editing:</span> {activeLabel}{" "}
        <span className="font-mono text-[11px] text-[var(--attio-text-tertiary)]">({activeId})</span>
        <span className="mx-2 text-[var(--attio-border)]">·</span>
        <span className="font-medium text-[var(--attio-text)]">Live in Candela:</span> {schemaUsageLabel(activeId)}
        {liveRoute && (
          <>
            <span className="mx-2 text-[var(--attio-border)]">·</span>
            <Link href={liveRoute} className="font-medium text-[var(--attio-accent)] hover:underline">
              Open live screen →
            </Link>
          </>
        )}
      </p>

      <div className="flex flex-wrap gap-2">
        {filteredSchemas.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => selectSchema(id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-[12px] font-medium capitalize",
              activeId === id ? "bg-[var(--attio-accent)] text-white" : "border border-[var(--attio-border)]",
            )}
          >
            {label}
          </button>
        ))}
        {filteredSchemas.length === 0 && (
          <p className="text-[13px] text-[var(--attio-text-tertiary)]">No schemas defined for this department yet.</p>
        )}
      </div>

      <Panel title="Field type catalog" action={<span className="text-[11px] text-[var(--attio-text-tertiary)]">{FIELD_TYPE_CATALOG.length} types</span>}>
        <div className="grid gap-4 lg:grid-cols-2">
          {FIELD_CATEGORIES.map((cat) => (
            <div key={cat}>
              <p className="mb-2 text-[11px] font-medium uppercase text-[var(--attio-text-tertiary)]">{cat}</p>
              <div className="flex flex-wrap gap-1">
                {fieldsByCategory.get(cat)?.map((f) => (
                  <button
                    key={f.type}
                    type="button"
                    onClick={() => setAddType(f.type)}
                    className={cn(
                      "rounded border px-2 py-1 text-[10px]",
                      addType === f.type ? "border-[var(--attio-accent)] bg-blue-50/50" : "border-[var(--attio-border-subtle)]",
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[12px] text-[var(--attio-text-secondary)]">Selected for add: <strong>{FIELD_TYPE_CATALOG.find((f) => f.type === addType)?.label}</strong></p>
      </Panel>

      <div className="flex flex-wrap gap-2">
        <AttioButton variant="primary" onClick={publish} disabled={publishing || resetting}>
          {publishing ? "Publishing…" : "Publish schema"}
        </AttioButton>
        <AttioButton variant="secondary" onClick={reset} disabled={publishing || resetting}>
          {resetting ? "Resetting…" : "Reset to default"}
        </AttioButton>
        {saved && (
          <span className="self-center text-[12px] text-green-700">
            Published — all workspaces update immediately
          </span>
        )}
      </div>

      {publishError && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-900">
          {publishError}
        </p>
      )}

      <div key={activeId} className="space-y-6">
      {schema.sections.map((section) => (
        <Panel
          key={`${activeId}-${section.id}`}
          title={section.label}
          action={
            <AttioButton variant="secondary" className="h-7 text-[11px]" onClick={() => addField(section.id)}>
              Add {addType}
            </AttioButton>
          }
        >
          <ul className="space-y-3">
            {section.fields.map((field) => (
              <FormFieldEditor
                key={`${activeId}-${field.id}`}
                field={field}
                onChange={(patch) => updateField(field.id, patch)}
                onRemove={() => removeField(field.id)}
              />
            ))}
          </ul>
        </Panel>
      ))}

      <Panel title={`Live preview · ${activeLabel}`} action={<span className="text-[11px] text-[var(--attio-text-tertiary)]">Updates as you edit</span>}>
        <div className="rounded-lg border border-[var(--attio-border-subtle)] bg-[var(--attio-canvas)] p-4">
          <SchemaForm key={previewKey} schema={pinSchemaMeta(schema)} submitLabel="Preview submit" hideSubmit />
        </div>
      </Panel>
      </div>
    </div>
  );
}
