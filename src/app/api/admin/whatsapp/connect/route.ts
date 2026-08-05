import { NextResponse, type NextRequest } from "next/server";
import { getServerContext } from "@/server/context";
import { prisma } from "@/lib/prisma";
import { encryptWhatsAppToken, graphGet } from "@/server/whatsapp/connection";

export async function POST(req: NextRequest) {
  try {
    const ctx = await getServerContext();
    const { accessToken, wabaId, phoneNumberId } = await req.json();

    if (!accessToken) {
      return NextResponse.json({ ok: false, error: "Access token is required" }, { status: 400 });
    }

    // Try to auto-resolve wabaId and phoneNumberId if not provided
    let finalWabaId = wabaId;
    let finalPhoneId = phoneNumberId;
    let displayPhoneNumber = "";

    try {
      if (!finalWabaId || !finalPhoneId) {
        // We will do a generic call for Facebook to get the user's businesses
        const bizRes = await graphGet("me/businesses", accessToken);
        const bizId = bizRes.data?.[0]?.id;
        
        if (bizId) {
          const wabaRes = await graphGet(`${bizId}/owned_whatsapp_business_accounts`, accessToken);
          const firstWaba = wabaRes.data?.[0];
          
          if (firstWaba) {
            finalWabaId = firstWaba.id;
            const phoneRes = await graphGet(`${finalWabaId}/phone_numbers`, accessToken);
            const firstPhone = phoneRes.data?.[0];
            if (firstPhone) {
              finalPhoneId = firstPhone.id;
              displayPhoneNumber = firstPhone.display_phone_number;
            }
          }
        }
      }
    } catch (e) {
      console.warn("Auto-resolution of WABA/Phone failed:", e);
    }

    // fallback to generic WABA fetch if business fetch failed
    try {
      if (!finalWabaId || !finalPhoneId) {
        const clients = await graphGet("me/client_whatsapp_business_accounts", accessToken);
        const waba = clients.data?.[0];
        if (waba) {
          finalWabaId = waba.id;
          const phoneRes = await graphGet(`${finalWabaId}/phone_numbers`, accessToken);
          const firstPhone = phoneRes.data?.[0];
          if (firstPhone) {
            finalPhoneId = firstPhone.id;
            displayPhoneNumber = firstPhone.display_phone_number;
          }
        }
      }
    } catch (e) {
      console.warn("Fallback auto-resolution failed:", e);
    }

    if (!finalWabaId || !finalPhoneId) {
      return NextResponse.json({ 
        ok: false, 
        error: "Could not automatically resolve WhatsApp Account. Please ensure your Meta app is fully configured." 
      }, { status: 400 });
    }

    const encryptedToken = encryptWhatsAppToken(accessToken);

    const existing = await prisma.whatsappConnection.findFirst({
      where: { tenantId: ctx.tenantId, branchId: ctx.branchId },
    });

    if (existing) {
      await prisma.whatsappConnection.update({
        where: { id: existing.id },
        data: {
          wabaId: String(finalWabaId),
          phoneNumberId: String(finalPhoneId),
          accessToken: encryptedToken,
          displayPhoneNumber: displayPhoneNumber || existing.displayPhoneNumber,
          active: true,
        },
      });
    } else {
      await prisma.whatsappConnection.create({
        data: {
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          wabaId: String(finalWabaId),
          phoneNumberId: String(finalPhoneId),
          accessToken: encryptedToken,
          displayPhoneNumber,
          active: true,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("WhatsApp connect error:", error);
    return NextResponse.json({ ok: false, error: error.message || "Failed to connect" }, { status: 500 });
  }
}
