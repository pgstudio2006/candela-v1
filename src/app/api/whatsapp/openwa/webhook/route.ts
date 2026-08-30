import { prisma } from "@/lib/prisma";
import { NextResponse, type NextRequest } from "next/server";
import { defaultOpenwaSessionId } from "@/server/whatsapp/openwa";

/**
 * OpenWA gateway inbound webhook receiver.
 *
 * Configure a webhook on the OpenWA session pointing at:
 *   POST https://<candela-host>/api/whatsapp/openwa/webhook
 *
 * The gateway posts session events (messages, status). Payload shapes vary by
 * gateway version/engine, so this handler parses the common shapes tolerantly:
 *
 *   { event: "message", data: { from, body, id, session } }
 *   { session: "id", messages: [{ from, body, id }] }
 *   { sessionId, chatId, text, messageId }
 *   [{ from, body, id }]
 */
export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();

    // Optional shared-secret check via query param or header
    const url = new URL(request.url);
    const providedToken =
      url.searchParams.get("token") ?? request.headers.get("x-webhook-token") ?? null;
    const expectedToken = process.env.OPENWA_WEBHOOK_TOKEN ?? null;
    if (expectedToken && providedToken !== expectedToken) {
      return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 403 });
    }

    console.info("[openwa:webhook] Received:", JSON.stringify(body).slice(0, 500));

    type RawMessage = {
      from?: string;
      chatId?: string;
      senderId?: string;
      body?: string;
      text?: string;
      message?: string;
      id?: string;
      messageId?: string;
      session?: string;
      sessionId?: string;
      pushName?: string;
      contactName?: string;
    };

    const collect = (): RawMessage[] => {
      const b = (body ?? {}) as Record<string, unknown>;
      if (Array.isArray(body)) return body as RawMessage[];
      if (b.event === "message" && b.data) return [b.data as RawMessage];
      if (Array.isArray(b.messages)) return b.messages as RawMessage[];
      if (b.from || b.chatId) return [b as RawMessage];
      return [];
    };

    const messages = collect();
    for (const m of messages) {
      const from = m.from ?? m.chatId ?? m.senderId;
      const text = m.body ?? m.text ?? m.message ?? "";
      if (!from) continue;

      // Strip @c.us suffix → phone digits
      const phone = from.replace(/@.*/, "").replace(/\D/g, "");
      if (!phone) continue;

      const sessionId = m.session ?? m.sessionId ?? defaultOpenwaSessionId();
      const conn = await prisma.whatsappConnection.findFirst({
        where: { active: true },
        orderBy: { connectedAt: "desc" },
        select: { id: true, tenantId: true, branchId: true },
      });

      if (conn) {
        let conversation = await prisma.conversation.findFirst({
          where: { connectionId: conn.id, contactPhone: phone },
        });

        if (!conversation) {
          const patient = await prisma.patient.findFirst({
            where: { tenantId: conn.tenantId, phone },
          });
          conversation = await prisma.conversation.create({
            data: {
              tenantId: conn.tenantId,
              branchId: conn.branchId,
              connectionId: conn.id,
              contactPhone: phone,
              patientId: patient?.id,
              contactName: m.pushName ?? m.contactName ?? null,
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
            body: String(text),
            messageId: m.id ?? m.messageId ?? `openwa:${sessionId}:${Date.now()}`,
            status: "delivered",
          },
        });
      }

      console.info(`[openwa:webhook] Inbound message from ${phone}: ${String(text).slice(0, 100)}`);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[openwa:webhook] Error processing webhook:", error);
    // Always 200 so the gateway does not retry forever
    return NextResponse.json({ ok: true });
  }
}
