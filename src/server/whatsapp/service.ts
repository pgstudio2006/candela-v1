import { prisma } from "@/lib/prisma";
import type { ServerContext } from "@/server/context";
import { deliverWhatsApp } from "@/server/notification-delivery";

export type WhatsAppTrigger =
  | "checkin_doctor_schedule"
  | "lead_greeting"
  | "appointment_confirmation"
  | "visit_thankyou_review"
  | "billing_invoice"
  | "prescription_sent"
  | "call_not_picked"
  | "lead_lost"
  | "pharmacy_bill"
  | "purchase_order";

export type TemplateVars = Record<string, string | number | undefined>;

const DEFAULT_TEMPLATES: Record<
  WhatsAppTrigger,
  { label: string; body: string }
> = {
  checkin_doctor_schedule: {
    label: "Doctor Schedule Notification (on Check-in)",
    body:
      "Dear Dr. {{doctorName}}, a new patient {{patientName}} (UHID: {{uhid}}) has checked in for your consultation at {{time}}. Department: {{department}}. Please prepare for the visit.",
  },
  lead_greeting: {
    label: "New Lead Greeting",
    body:
      "Hello {{leadName}}, welcome to Candela Eye & Retina Center! Thank you for your interest. Our team will reach out to you shortly. For any queries, feel free to call us. We look forward to serving you.",
  },
  appointment_confirmation: {
    label: "Appointment Confirmation",
    body:
      "Dear {{patientName}}, your appointment with Dr. {{doctorName}} has been confirmed for {{date}} at {{time}} at Candela Eye & Retina Center, Gurgaon. Please arrive 15 minutes early. For rescheduling, call us. Reply YES to confirm.",
  },
  visit_thankyou_review: {
    label: "Visit Thank You + Google Review",
    body:
      "Dear {{patientName}}, thank you for visiting Candela Eye & Retina Center today. We hope your experience was excellent. Please share your feedback: {{reviewLink}}. Your review helps us serve you better!",
  },
  billing_invoice: {
    label: "Billing Invoice",
    body:
      "Dear {{patientName}}, your invoice {{invoiceNumber}} for ₹{{amount}} has been generated. Payment status: {{paymentStatus}}. Balance due: ₹{{balanceDue}}. Thank you for choosing Candela Eye & Retina Center.",
  },
  prescription_sent: {
    label: "Prescription Sent",
    body:
      "Dear {{patientName}}, your prescription ({{itemCount}} items) from Dr. {{doctorName}} is ready. Please collect it from our pharmacy. Follow the dosage instructions carefully. For queries, call us.",
  },
  call_not_picked: {
    label: "Missed Call Follow-up",
    body:
      "Hello {{leadName}}, we missed your call. Let us know a convenient time to reconnect or reply to this message. We're here to help you with your healthcare needs.",
  },
  lead_lost: {
    label: "Lead Lost",
    body:
      "Hello {{leadName}}, we noticed you couldn't proceed with us this time. If anything changes or you need assistance in the future, we're happy to help. Thank you for considering us.",
  },
  pharmacy_bill: {
    label: "Pharmacy Bill",
    body:
      "Dear {{patientName}}, your pharmacy bill {{billId}} is ready. Total: ₹{{amount}}. Payment status: {{paymentStatus}}. Thank you for choosing Candela.",
  },
  purchase_order: {
    label: "Purchase Order",
    body:
      "Dear {{supplierName}}, please find our purchase order {{poId}}. Items: {{items}}. Total: ₹{{total}}. Expected delivery: {{expectedDate}}. Thank you.",
  },
};

const GOOGLE_REVIEW_LINK = "https://www.google.com/search?q=Candela+Eye+%26+Retina+Center+Gurgaon#reviews";

function interpolateTemplate(body: string, vars: TemplateVars): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const val = vars[key];
    return val !== undefined && val !== null ? String(val) : `{{${key}}}`;
  });
}

export async function getTemplate(
  ctx: ServerContext,
  trigger: WhatsAppTrigger,
): Promise<{ label: string; body: string } | null> {
  const tpl = await prisma.whatsAppTemplate.findFirst({
    where: {
      branchId: ctx.branchId,
      trigger,
      enabled: true,
    },
  });

  if (tpl) {
    return { label: tpl.label, body: tpl.body };
  }

  const defaults = DEFAULT_TEMPLATES[trigger];
  if (!defaults) return null;
  return defaults;
}

export async function getAllTemplates(ctx: ServerContext) {
  const rows = await prisma.whatsAppTemplate.findMany({
    where: { branchId: ctx.branchId },
  });

  const byTrigger = new Map(rows.map((r) => [r.trigger, r]));

  const allTriggers = Object.keys(DEFAULT_TEMPLATES) as WhatsAppTrigger[];

  return allTriggers.map((trigger) => {
    const existing = byTrigger.get(trigger);
    const defaults = DEFAULT_TEMPLATES[trigger];
    return {
      id: existing?.id ?? null,
      trigger,
      label: existing?.label ?? defaults.label,
      body: existing?.body ?? defaults.body,
      enabled: existing?.enabled ?? true,
    };
  });
}

export async function upsertTemplate(
  ctx: ServerContext,
  trigger: WhatsAppTrigger,
  data: { label: string; body: string; enabled: boolean },
) {
  return prisma.whatsAppTemplate.upsert({
    where: {
      branchId_trigger: {
        branchId: ctx.branchId,
        trigger,
      },
    },
    update: {
      label: data.label,
      body: data.body,
      enabled: data.enabled,
    },
    create: {
      branchId: ctx.branchId,
      tenantId: ctx.tenantId,
      trigger,
      label: data.label,
      body: data.body,
      enabled: data.enabled,
    },
  });
}

export type SendWhatsAppResult = {
  ok: boolean;
  trigger: WhatsAppTrigger;
  recipient: string;
  body: string;
  provider?: string;
  detail?: string;
  error?: string;
};

export async function sendWhatsApp(
  ctx: ServerContext,
  trigger: WhatsAppTrigger,
  recipient: string,
  vars: TemplateVars,
): Promise<SendWhatsAppResult> {
  if (!recipient?.trim()) {
    return { ok: false, trigger, recipient: "", body: "", error: "No recipient phone" };
  }

  const template = await getTemplate(ctx, trigger);
  if (!template) {
    return { ok: false, trigger, recipient, body: "", error: "No template found" };
  }

  const enrichedVars: TemplateVars = {
    ...vars,
    reviewLink: GOOGLE_REVIEW_LINK,
  };

  const body = interpolateTemplate(template.body, enrichedVars);

  let logId: string | null = null;
  try {
    const log = await prisma.whatsAppLog.create({
      data: {
        branchId: ctx.branchId,
        tenantId: ctx.tenantId,
        trigger,
        recipient,
        body,
        status: "queued",
      },
    });
    logId = log.id;
  } catch (e) {
    console.error("[whatsapp] Failed to create log:", e);
  }

  try {
    const result = await deliverWhatsApp(recipient, body);

    if (logId) {
      await prisma.whatsAppLog.update({
        where: { id: logId },
        data: {
          status: result.ok ? "sent" : "failed",
          error: result.detail ?? null,
        },
      }).catch(() => undefined);
    }

    return {
      ok: result.ok,
      trigger,
      recipient,
      body,
      provider: result.provider,
      detail: result.detail,
      error: result.ok ? undefined : result.detail,
    };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : "Unknown error";
    if (logId) {
      await prisma.whatsAppLog.update({
        where: { id: logId },
        data: { status: "failed", error: errorMsg },
      }).catch(() => undefined);
    }
    return { ok: false, trigger, recipient, body, error: errorMsg };
  }
}

export async function sendWhatsAppAsync(
  ctx: ServerContext,
  trigger: WhatsAppTrigger,
  recipient: string,
  vars: TemplateVars,
): Promise<void> {
  sendWhatsApp(ctx, trigger, recipient, vars).catch((e) => {
    console.error(`[whatsapp] Async send failed for ${trigger}:`, e);
  });
}

export { DEFAULT_TEMPLATES, GOOGLE_REVIEW_LINK };
