import { auth } from "@/auth";
import { resolveAdminOperator } from "@/server/module-operator";
import { sendWhatsApp } from "@/server/whatsapp/service";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Test WhatsApp message send — admin only
 * POST /api/admin/whatsapp/test { phone: "9876543210" }
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Please sign in first." }, { status: 401 });
  }

  try {
    const { ctx } = await resolveAdminOperator();
    const body = await request.json();
    const phone = body.phone?.trim();

    if (!phone) {
      return NextResponse.json({ ok: false, error: "Phone number required" }, { status: 400 });
    }

    const result = await sendWhatsApp(ctx, "lead_greeting", phone, {
      leadName: "Test User",
    });

    return NextResponse.json({
      ok: result.ok,
      data: {
        provider: result.provider ?? "meta-cloud",
        recipient: result.recipient,
        body: result.body,
        detail: result.detail,
        error: result.error,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Test failed.";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
