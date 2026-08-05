import { prisma } from "@/lib/prisma";
import { NextResponse, type NextRequest } from "next/server";

/**
 * WhatsApp Webhook verification (Meta Cloud API + TeleCRM WACA)
 * Meta sends hub.mode=subscribe, hub.verify_token and hub.challenge.
 * TeleCRM WACA sends the verify token as a ?token= query param.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const mode = searchParams.get("hub.mode");
  const hubToken = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  const token = searchParams.get("token") ?? hubToken;

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  // Meta Cloud API verification
  if (mode === "subscribe" && hubToken === verifyToken && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  // TeleCRM WACA verification (?token=...)
  if (token && token === verifyToken) {
    return new NextResponse(challenge ?? "ok", { status: 200 });
  }

  return NextResponse.json({ ok: false, error: "Verification failed" }, { status: 403 });
}

/**
 * WhatsApp Webhook receiver (Meta Cloud API)
 * Receives incoming messages and status updates (sent, delivered, read, failed).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Log incoming webhook for debugging
    console.info("[whatsapp:webhook] Received:", JSON.stringify(body).slice(0, 500));

    // Meta Cloud API webhook structure
    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    const phoneNumberId = value?.metadata?.phone_number_id;
    let connectionId: string | undefined;
    let tenantId: string | undefined;
    let branchId: string | undefined;

    if (phoneNumberId) {
      const conn = await prisma.whatsappConnection.findFirst({
        where: { phoneNumberId: String(phoneNumberId), active: true },
        select: { id: true, tenantId: true, branchId: true },
      });
      if (conn) {
        connectionId = conn.id;
        tenantId = conn.tenantId;
        branchId = conn.branchId;
      }
    }

    if (value?.messages?.[0]) {
      const message = value.messages[0];
      const from = message.from;
      const text = message.text?.body ?? "";
      const messageId = message.id;

      console.info(`[whatsapp:webhook] Incoming message from ${from}: ${text.slice(0, 100)}`);

      if (connectionId && tenantId && branchId) {
        let conversation = await prisma.conversation.findFirst({
          where: { connectionId, contactPhone: from },
        });

        if (!conversation) {
          const patient = await prisma.patient.findFirst({
            where: { tenantId, phone: from },
          });
          conversation = await prisma.conversation.create({
            data: {
              tenantId,
              branchId,
              connectionId,
              contactPhone: from,
              patientId: patient?.id,
              contactName: message.profile?.name,
            },
          });
        } else {
          await prisma.conversation.update({
            where: { id: conversation.id },
            data: { lastMessageAt: new Date() },
          });
        }

        await prisma.message.create({
          data: {
            conversationId: conversation.id,
            direction: "inbound",
            body: text,
            messageId,
            status: "delivered",
          },
        });
      }
    }

    if (value?.statuses?.[0]) {
      const status = value.statuses[0];
      const statusValue = status.status;
      const messageId = status.id;
      const recipient = status.recipient_id;

      console.info(`[whatsapp:webhook] Status: ${statusValue} for ${recipient} (msg: ${messageId})`);

      if (messageId) {
        const errorText = status.errors?.[0]?.title ?? status.errors?.[0]?.message ?? null;
        await prisma.whatsAppLog
          .updateMany({
            where: { messageId },
            data: {
              status: statusValue === "failed" ? "failed" : statusValue,
              error: statusValue === "failed" && errorText ? errorText : undefined,
            },
          })
          .catch((err) => console.error("[whatsapp:webhook] Failed to update log:", err));
      }
    }

    // Always return 200 quickly — Meta expects fast acknowledgment
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[whatsapp:webhook] Error processing webhook:", error);
    return NextResponse.json({ ok: true });
  }
}
