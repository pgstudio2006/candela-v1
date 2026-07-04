import { auth } from "@/auth";
import type { FormSchema } from "@/design-system/frontdesk-schemas";
import {
  listFormSchemaOverrides,
  resetFormSchemaOverride,
  saveFormSchemaOverride,
} from "@/server/admin/form-schemas";
import { resolveAdminOperator } from "@/server/module-operator";
import { requireAuth } from "@/server/auth";
import { ServerActionError } from "@/server/errors";
import { serializeForClient } from "@/server/serialize";
import { NextResponse, type NextRequest } from "next/server";

/** List published form schemas — avoids masked server-action failures in production. */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Please sign in first." }, { status: 401 });
  }

  try {
    const ctx = await requireAuth();
    const purge = request.nextUrl.searchParams.get("purge") !== "0";
    const data = await listFormSchemaOverrides(ctx, purge);
    return NextResponse.json({ ok: true, data: serializeForClient(data) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load form schemas.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** Publish a form schema override. */
export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Please sign in first." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { schema: FormSchema; schemaId?: string };
    if (!body?.schema) {
      return NextResponse.json({ ok: false, error: "Schema payload is required." }, { status: 400 });
    }
    const { ctx, operator } = await resolveAdminOperator();
    await saveFormSchemaOverride(ctx, operator, body.schema, body.schemaId);
    const schemaId = body.schemaId ?? body.schema.id;
    return NextResponse.json({ ok: true, data: { schemaId } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to publish schema.";
    const status =
      error instanceof ServerActionError
        ? error.code === "FORBIDDEN"
          ? 403
          : error.code === "VALIDATION"
            ? 400
            : 500
        : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

/** Reset a form schema to its built-in default. */
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Please sign in first." }, { status: 401 });
  }

  try {
    const schemaId = request.nextUrl.searchParams.get("schemaId")?.trim();
    if (!schemaId) {
      return NextResponse.json({ ok: false, error: "schemaId is required." }, { status: 400 });
    }
    const { ctx, operator } = await resolveAdminOperator();
    await resetFormSchemaOverride(ctx, operator, schemaId);
    return NextResponse.json({ ok: true, data: { schemaId } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reset schema.";
    const status = error instanceof ServerActionError && error.code === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
