import { NextResponse } from "next/server";
import { requireAuth } from "@/server/auth";
import { importNavayuCsv } from "@/server/import/navayu-csv";

export async function POST() {
  try {
    const ctx = await requireAuth();
    const result = await importNavayuCsv(ctx);
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    console.error("[navayu-csv-import] error:", error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
