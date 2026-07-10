"use client";

import { SchemaForm } from "@/components/candela/schema-form";
import type { Patient } from "@/design-system/frontdesk-data";
import type { FormSchema } from "@/design-system/frontdesk-schemas";
import { usePublishedFormSchema } from "@/hooks/use-published-form-schema";
import type { ClinicalRoster } from "@/lib/clinical-roster";

type PublishedSchemaFormBaseProps = {
  onSubmit?: (data: Record<string, string | number | boolean>) => void;
  onValuesChange?: (data: Record<string, string | number | boolean>) => void;
  submitLabel?: string;
  submitStatus?: "idle" | "saving" | "saved";
  hideSubmit?: boolean;
  className?: string;
  initialValues?: Record<string, string | number | boolean>;
  formKey?: string;
  searchPatients?: Patient[];
  roster?: ClinicalRoster | null;
};

type PublishedSchemaFormProps = PublishedSchemaFormBaseProps &
  (
    | { schemaId: string; schema?: never }
    | { schema: FormSchema; schemaId?: never }
  );

function PublishedSchemaFormById({
  schemaId,
  ...props
}: PublishedSchemaFormBaseProps & { schemaId: string }) {
  const schema = usePublishedFormSchema(schemaId);
  return <SchemaForm schema={schema} {...props} />;
}

/** Renders a module form from the universal schema registry + admin-published overrides. */
export function PublishedSchemaForm(props: PublishedSchemaFormProps) {
  if ("schema" in props && props.schema) {
    const { schema, ...rest } = props;
    return <SchemaForm schema={schema} {...rest} />;
  }
  const { schemaId, ...rest } = props;
  return <PublishedSchemaFormById schemaId={schemaId} {...rest} />;
}
