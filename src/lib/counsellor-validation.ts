import { z } from "zod";
import type { DiscountPolicy } from "@/design-system/counsellor-data";
import { ServerActionError } from "@/server/errors";

export const counselQuoteSchema = z.object({
  visitId: z.string(),
  patientId: z.string(),
  packageId: z.string(),
  packageLabel: z.string(),
  tier: z.enum(["good", "better", "best"]),
  lineItems: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      amount: z.number(),
      type: z.enum(["package", "addon", "custom", "service"]),
      quantity: z.number().default(1),
      gstPercent: z.number().default(0),
    }),
  ),
  grossAmount: z.number(),
  gstPercent: z.number().default(0),
  gstAmount: z.number().default(0),
  discountPercent: z.number().min(0).max(100),
  discountAmount: z.number(),
  netAmount: z.number(),
  discountReason: z.string().optional(),
  approvalStatus: z.enum(["none", "pending", "approved", "rejected"]),
  emiMonths: z.number().optional(),
  corporateRef: z.string().optional(),
  consentCaptured: z.boolean(),
  whatsappSent: z.boolean(),
});

export const completeCounselSessionSchema = z.object({
  outcome: z.enum(["converted", "deferred", "lost", "callback"]),
  internalNotes: z.string(),
  objections: z.array(z.string()),
  callbackAt: z.string().optional(),
  sendToBilling: z.boolean(),
  paymentExpectation: z.enum(["pay_now", "desk", "corporate"]),
  consentCaptured: z.boolean(),
  whatsappSent: z.boolean(),
  voiceNote: z.string().optional(),
  aiScript: z.string().optional(),
  quote: counselQuoteSchema.optional(),
});

export function validateCompleteCounselSession(
  opts: z.infer<typeof completeCounselSessionSchema>,
  policy: DiscountPolicy,
  maxDiscountPercent: number,
  hasApprovedDiscount: boolean,
) {
  const parsed = completeCounselSessionSchema.safeParse(opts);
  if (!parsed.success) {
    throw new ServerActionError("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid session data");
  }

  const data = parsed.data;

  if (data.outcome === "converted" && data.sendToBilling) {
    if (!data.quote) {
      throw new ServerActionError("VALIDATION", "Quote is required for billing handoff.");
    }
    if (!data.consentCaptured) {
      throw new ServerActionError("VALIDATION", "Patient consent must be captured before billing handoff.");
    }
    if (data.quote.discountPercent > policy.requireReasonAbove && !data.quote.discountReason?.trim()) {
      throw new ServerActionError("VALIDATION", "Discount reason is required above policy threshold.");
    }
    const needsApproval =
      data.quote.discountPercent > maxDiscountPercent ||
      data.quote.discountPercent > policy.managerApprovalAbove;
    if (needsApproval && !hasApprovedDiscount) {
      throw new ServerActionError(
        "VALIDATION",
        "Manager discount approval is required before sending to billing.",
      );
    }
  }

  if (data.outcome === "callback" && !data.callbackAt?.trim()) {
    throw new ServerActionError("VALIDATION", "Callback date/time is required.");
  }

  return data;
}
