import type { NotificationChannel, QueuedNotification } from "@/server/notifications";

export type DeliveryResult = {
  ok: boolean;
  provider?: string;
  detail?: string;
};

function demoMode() {
  return process.env.NOTIFICATIONS_DEMO !== "false";
}

/** Email via Resend HTTP API */
export async function deliverEmail(
  recipient: string,
  subject: string,
  body: string,
): Promise<DeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFICATION_FROM_EMAIL ?? "Candela <notifications@navayu.in>";

  if (!apiKey) {
    if (demoMode()) {
      console.info("[notifications:demo:email]", recipient, subject, body.slice(0, 120));
      return { ok: true, provider: "demo", detail: "RESEND_API_KEY not set — logged only" };
    }
    return { ok: false, provider: "resend", detail: "RESEND_API_KEY not configured" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [recipient],
      subject,
      text: body,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return { ok: false, provider: "resend", detail: err.slice(0, 200) };
  }

  return { ok: true, provider: "resend" };
}

/** SMS via Twilio REST API */
export async function deliverSms(
  recipient: string,
  body: string,
): Promise<DeliveryResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!sid || !token || !from) {
    if (demoMode()) {
      console.info("[notifications:demo:sms]", recipient, body.slice(0, 120));
      return { ok: true, provider: "demo", detail: "Twilio not configured — logged only" };
    }
    return { ok: false, provider: "twilio", detail: "Twilio env vars missing" };
  }

  const phone = recipient.replace(/\D/g, "");
  const to = phone.startsWith("91") ? `+${phone}` : phone.length === 10 ? `+91${phone}` : recipient;

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    return { ok: false, provider: "twilio", detail: err.slice(0, 200) };
  }

  return { ok: true, provider: "twilio" };
}

async function fetchWabaPhoneNumbers(
  baseUrl: string,
  token: string,
  wabaId: string,
): Promise<string[]> {
  try {
    const res = await fetch(
      `${baseUrl}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    return (data?.data ?? [])
      .map((p: { id?: string }) => p.id)
      .filter((id: string | undefined): id is string => Boolean(id));
  } catch {
    return [];
  }
}

/** WhatsApp via Meta Cloud API (WACA) */
export async function deliverWhatsApp(
  recipient: string,
  body: string,
): Promise<DeliveryResult> {
  const token = process.env.WHATSAPP_API_TOKEN;
  let baseUrl = process.env.WHATSAPP_API_BASE_URL ?? "https://graph.facebook.com/v21.0";
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  // TeleCRM provides a webhook URL (e.g. https://next-api.telecrm.in/waca) for
  // *receiving* messages/events. The access token they provide is a Meta token,
  // so outbound sends must go to Meta's Graph API, not the TeleCRM webhook path.
  if (baseUrl.includes("telecrm.in") || baseUrl.includes("/waca")) {
    console.warn(
      "[whatsapp] WHATSAPP_API_BASE_URL looks like a TeleCRM webhook URL.",
      "TeleCRM webhook URLs are for receiving events; outbound sends must use Meta Graph API.",
      "Falling back to https://graph.facebook.com/v21.0",
    );
    baseUrl = "https://graph.facebook.com/v21.0";
  }

  if (!token) {
    if (demoMode()) {
      console.info("[notifications:demo:whatsapp]", recipient, body.slice(0, 120));
      return { ok: true, provider: "demo", detail: "WHATSAPP_API_TOKEN not set — logged only" };
    }
    return { ok: false, provider: "whatsapp-cloud-api", detail: "WHATSAPP_API_TOKEN not configured" };
  }

  if (!phoneNumberId) {
    return {
      ok: false,
      provider: "whatsapp-cloud-api",
      detail: "WHATSAPP_PHONE_NUMBER_ID is required. Copy the Phone Number ID from your Meta WhatsApp Cloud API account and add it to environment variables.",
    };
  }

  // Normalize phone: strip non-digits, ensure country code
  const phone = recipient.replace(/\D/g, "");
  const to = phone.length === 10 ? `91${phone}` : phone;

  // Meta WACA endpoint: {baseUrl}/{phoneNumberId}/messages
  const url = `${baseUrl}/${phoneNumberId}/messages`;

  // If an approved template name is provided, send a template message.
  // This is required for the first outbound message to a user outside the 24h window.
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME;
  let payload: Record<string, unknown>;
  if (templateName) {
    payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? "en" },
        components: [
          {
            type: "body",
            parameters: [{ type: "text", text: body }],
          },
        ],
      },
    };
  } else {
    payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { body: body },
    };
  }

  async function trySend(id: string): Promise<Response> {
    return fetch(`${baseUrl}/${id}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  }

  let res = await trySend(phoneNumberId);

  // If the configured ID is a WhatsApp Business Account ID rather than a Phone Number ID,
  // Meta returns "Unsupported post request". Try to discover the real phone number ID.
  if (!res.ok) {
    const err = await res.text();
    const looksLikeWabaId =
      err.includes("Unsupported post request") ||
      err.includes("does not exist") ||
      err.includes("cannot be loaded");

    if (looksLikeWabaId) {
      const candidates = await fetchWabaPhoneNumbers(baseUrl, token, phoneNumberId);
      if (candidates.length > 0) {
        const retryId = candidates[0];
        console.warn(
          `[whatsapp] ${phoneNumberId} is not a phone-number id. Retrying with discovered phone number id:`,
          retryId,
        );
        res = await trySend(retryId);
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          const messageId = data?.messages?.[0]?.id ?? data?.id ?? "unknown";
          return {
            ok: true,
            provider: "whatsapp-cloud-api",
            detail: `Message ID: ${messageId}`,
          };
        }
        const retryErr = await res.text();
        console.error("[whatsapp:meta-waca] Retry failed:", retryId, res.status, retryErr);
        return {
          ok: false,
          provider: "whatsapp-cloud-api",
          detail: `Configured ID ${phoneNumberId} is not a phone-number ID. Discovered ${candidates.length} phone number(s), but send failed: ${retryErr.slice(0, 300)}`,
        };
      }
    }

    console.error("[whatsapp:meta-waca] Send failed:", phoneNumberId, res.status, err);
    return { ok: false, provider: "whatsapp-cloud-api", detail: err.slice(0, 300) };
  }

  const data = await res.json().catch(() => ({}));
  const messageId = data?.messages?.[0]?.id ?? data?.id ?? "unknown";

  return { ok: true, provider: "whatsapp-cloud-api", detail: `Message ID: ${messageId}` };
}

export async function deliverNotification(n: QueuedNotification): Promise<DeliveryResult> {
  switch (n.channel as NotificationChannel) {
    case "email":
      return deliverEmail(n.recipient, n.subject, n.body);
    case "sms":
      return deliverSms(n.recipient, n.body);
    case "whatsapp":
      return deliverWhatsApp(n.recipient, n.body);
    case "in_app":
      return { ok: true, provider: "in_app", detail: "Stored in audit queue" };
    default:
      return { ok: false, detail: `Unknown channel: ${n.channel}` };
  }
}
