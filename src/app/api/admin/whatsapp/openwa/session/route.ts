import { NextResponse, type NextRequest } from "next/server";
import { getServerContext } from "@/server/context";
import {
  defaultOpenwaSessionId,
  ensureOpenwaSession,
  getOpenwaQr,
  getOpenwaSession,
  openwaHealth,
} from "@/server/whatsapp/openwa";

/**
 * GET /api/admin/whatsapp/openwa/session
 * Returns gateway health + current session status for the branch's OpenWA session.
 */
export async function GET() {
  try {
    const ctx = await getServerContext();
    const sessionId = defaultOpenwaSessionId();
    const health = await openwaHealth();

    if (!health.ok) {
      return NextResponse.json({
        ok: true,
        data: {
          gatewayOnline: false,
          detail: health.detail ?? "OpenWA gateway unreachable",
          sessionId,
        },
      });
    }

    let session: Awaited<ReturnType<typeof getOpenwaSession>> = null;
    try {
      session = await getOpenwaSession(sessionId);
    } catch {
      session = null;
    }

    return NextResponse.json({
      ok: true,
      data: {
        gatewayOnline: true,
        sessionId,
        status: session?.status ?? "missing",
        phone: session?.phone ?? null,
        pushName: session?.pushName ?? null,
      },
    });
  } catch (error) {
    console.error("[openwa] session GET error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load OpenWA session" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/whatsapp/openwa/session
 * { action: "start" | "qr" | "stop" }
 * - start: ensure session exists and is started (initiates QR auth if needed)
 * - qr: fetch current QR string for pairing
 * - stop: disconnect the session
 */
export async function POST(req: NextRequest) {
  try {
    await getServerContext();
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "start");
    const sessionId = defaultOpenwaSessionId();

    if (action === "start") {
      const result = await ensureOpenwaSession(sessionId);
      return NextResponse.json({ ok: result.ok, data: { sessionId, detail: result.detail } });
    }

    if (action === "qr") {
      const qr = await getOpenwaQr(sessionId);
      return NextResponse.json({ ok: true, data: { sessionId, qr: qr.qr ?? qr.qrCode ?? qr.dataUrl ?? null, status: qr.status } });
    }

    if (action === "stop") {
      const { stopOpenwaSession } = await import("@/server/whatsapp/openwa");
      const result = await stopOpenwaSession(sessionId);
      return NextResponse.json({ ok: result.ok, data: { sessionId, detail: result.detail } });
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error("[openwa] session POST error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "OpenWA action failed" },
      { status: 500 },
    );
  }
}
