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

/** WhatsApp via Meta Cloud API (WACA) */
export async function deliverWhatsApp(
  recipient: string,
  body: string,
): Promise<DeliveryResult> {
  const token = process.env.WHATSAPP_API_TOKEN;
  const baseUrl = process.env.WHATSAPP_API_BASE_URL ?? "https://graph.facebook.com/v20.0";
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

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

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: {
        body: body,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[whatsapp:meta-waca] Send failed:", res.status, err);
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
