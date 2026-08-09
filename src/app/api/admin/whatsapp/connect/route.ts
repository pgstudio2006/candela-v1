import { NextResponse, type NextRequest } from "next/server";
import { getServerContext } from "@/server/context";
import { prisma } from "@/lib/prisma";
import {
  encryptWhatsAppToken,
  exchangeCodeForToken,
  getActiveConnection,
  graphGet,
} from "@/server/whatsapp/connection";

/**
 * GET /api/admin/whatsapp/connect
 * Returns the active WhatsApp connection for the current branch.
 */
export async function GET() {
  try {
    const ctx = await getServerContext();
    const connection = await getActiveConnection(ctx);
    if (!connection) {
      return NextResponse.json({ ok: true, data: null });
    }

    return NextResponse.json({
      ok: true,
      data: {
        wabaId: connection.wabaId,
        phoneNumberId: connection.phoneNumberId,
        displayPhoneNumber: connection.displayPhoneNumber,
        connectedAt: connection.connectedAt,
        active: connection.active,
      },
    });
  } catch (error) {
    console.error("WhatsApp connection GET error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to load connection";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/whatsapp/connect
 * Receives a WhatsApp Embedded Signup authorization code, exchanges it for
 * a customer-scoped access token, resolves the WABA and phone number, and
 * stores the connection for the current branch.
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await getServerContext();
    const body = await req.json();
    const {
      code,
      wabaId: inputWabaId,
      phoneNumberId: inputPhoneId,
      displayPhoneNumber: inputDisplay,
    } = body;

    if (!code) {
      return NextResponse.json(
        { ok: false, error: "Authorization code is required" },
        { status: 400 },
      );
    }

    const appId =
      process.env.WHATSAPP_APP_ID ??
      process.env.NEXT_PUBLIC_WHATSAPP_APP_ID ??
      "2599951033795789";
    const appSecret = process.env.WHATSAPP_APP_SECRET;

    if (!appSecret) {
      return NextResponse.json(
        { ok: false, error: "WHATSAPP_APP_SECRET is not configured" },
        { status: 500 },
      );
    }

    let accessToken: string;
    try {
      accessToken = await exchangeCodeForToken(code, appId, appSecret);
    } catch (e) {
      console.error("Failed to exchange WhatsApp signup code:", e);
      const msg = e instanceof Error ? e.message : "Unknown error";
      return NextResponse.json(
        { ok: false, error: `Could not exchange signup code: ${msg}` },
        { status: 400 },
      );
    }

    let finalWabaId = inputWabaId ? String(inputWabaId) : "";
    let finalPhoneId = inputPhoneId ? String(inputPhoneId) : "";
    let displayPhoneNumber = inputDisplay ? String(inputDisplay) : "";

    if (!finalWabaId || !finalPhoneId) {
      try {
        const bizRes = await graphGet("me/businesses", accessToken);
        const bizId = bizRes.data?.[0]?.id;
        if (bizId) {
          const wabaRes = await graphGet(
            `${bizId}/owned_whatsapp_business_accounts`,
            accessToken,
          );
          const firstWaba = wabaRes.data?.[0];
          if (firstWaba) {
            finalWabaId = firstWaba.id;
            const phoneRes = await graphGet(
              `${finalWabaId}/phone_numbers?fields=id,display_phone_number,verified_name`,
              accessToken,
            );
            const firstPhone = phoneRes.data?.[0];
            if (firstPhone) {
              finalPhoneId = firstPhone.id;
              displayPhoneNumber =
                firstPhone.display_phone_number ??
                firstPhone.verified_name ??
                "";
            }
          }
        }
      } catch (e) {
        console.warn("Auto-resolution of WABA/Phone failed:", e);
      }
    }

    if (!finalWabaId || !finalPhoneId) {
      try {
        const clients = await graphGet(
          "me/client_whatsapp_business_accounts",
          accessToken,
        );
        const waba = clients.data?.[0];
        if (waba) {
          finalWabaId = waba.id;
          const phoneRes = await graphGet(
            `${finalWabaId}/phone_numbers?fields=id,display_phone_number,verified_name`,
            accessToken,
          );
          const firstPhone = phoneRes.data?.[0];
          if (firstPhone) {
            finalPhoneId = firstPhone.id;
            displayPhoneNumber =
              firstPhone.display_phone_number ??
              firstPhone.verified_name ??
              "";
          }
        }
      } catch (e) {
        console.warn("Fallback auto-resolution failed:", e);
      }
    }

    if (!finalWabaId || !finalPhoneId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Could not resolve WhatsApp Account. Please complete the signup flow and try again.",
        },
        { status: 400 },
      );
    }

    const encryptedToken = encryptWhatsAppToken(accessToken);

    const existing = await prisma.whatsappConnection.findFirst({
      where: { tenantId: ctx.tenantId, branchId: ctx.branchId },
    });

    const upsertData = {
      wabaId: finalWabaId,
      phoneNumberId: finalPhoneId,
      accessToken: encryptedToken,
      displayPhoneNumber:
        displayPhoneNumber || existing?.displayPhoneNumber || "",
      active: true,
    };

    if (existing) {
      await prisma.whatsappConnection.update({
        where: { id: existing.id },
        data: upsertData,
      });
    } else {
      await prisma.whatsappConnection.create({
        data: {
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          ...upsertData,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("WhatsApp connect error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to connect";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
