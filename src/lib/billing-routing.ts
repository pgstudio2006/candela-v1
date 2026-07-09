import type { BillingStatus, TreatmentPath, VisitStage } from "@/design-system/frontdesk-data";

export type PaymentScope = "full" | "partial" | "defer";

export type BillingRoute = {
  billing: BillingStatus;
  stage: VisitStage;
  routingLabel: string;
  routeHref: string;
  routingNote: string;
};

export function billingFromPayment(paymentScope: PaymentScope, mode: string): BillingStatus {
  if (mode === "defer" || paymentScope === "defer") return "deferred";
  if (paymentScope === "partial") return "partial";
  return "paid";
}

export function resolvePostCounselRoute(input: {
  paymentScope: PaymentScope;
  convertToIpd: boolean;
  netAmount: number;
  collected: number;
  patientId: string;
  visitId: string;
  /** Where the billing UI lives — front desk users cannot open nurse routes */
  audience?: "frontdesk" | "nurse";
}): BillingRoute {
  const { paymentScope, convertToIpd, netAmount, collected, visitId } = input;
  const balance = Math.max(0, netAmount - collected);
  const audience = input.audience ?? "frontdesk";
  const routeHref =
    audience === "nurse"
      ? `/app/nurse/queue?visit=${visitId}`
      : `/app/frontdesk/routing?visit=${visitId}&dest=nursing`;

  if (convertToIpd) {
    if (paymentScope === "defer") {
      return {
        billing: "deferred",
        stage: "ipd_admitted",
        routingLabel: "IPD admission · billing deferred → nursing",
        routeHref,
        routingNote: `Admitted to ward — ₹${netAmount.toLocaleString("en-IN")} deferred. Nursing intake & admission consent required.`,
      };
    }
    if (paymentScope === "partial") {
      return {
        billing: "partial",
        stage: "ipd_admitted",
        routingLabel: "IPD admission · partial → nursing",
        routeHref,
        routingNote: `Ward admission active. ₹${collected.toLocaleString("en-IN")} collected · ₹${balance.toLocaleString("en-IN")} due. Nursing consent gate before treatment.`,
      };
    }
    return {
      billing: "paid",
      stage: "ipd_admitted",
      routingLabel: "IPD admission · paid → nursing",
      routeHref,
      routingNote: "Patient routed to nursing for ward intake, vitals, and admission consent before treatment.",
    };
  }

  if (paymentScope === "defer") {
    return {
      billing: "deferred",
      stage: "nursing_queue",
      routingLabel: "Deferred billing · nursing authorized",
      routeHref,
      routingNote: `Package enrolled with deferred billing. Nursing may proceed per authorization. ₹${netAmount.toLocaleString("en-IN")} due.`,
    };
  }
  if (paymentScope === "partial") {
    return {
      billing: "partial",
      stage: "nursing_queue",
      routingLabel: "Partial payment → nursing execution",
      routeHref,
      routingNote: `₹${collected.toLocaleString("en-IN")} collected · ₹${balance.toLocaleString("en-IN")} balance tracked. Nursing intake & consent required.`,
    };
  }
  return {
    billing: "paid",
    stage: "nursing_queue",
    routingLabel: "Full payment → nursing execution",
    routeHref,
    routingNote: "Package paid in full. Patient routed to nursing for vitals, clinical consent, and session 1.",
  };
}

export function resolveOpdFirstRoute(input: {
  paymentScope: PaymentScope;
  mode: string;
  visitId: string;
  netAmount: number;
  collected: number;
}): BillingRoute {
  const billing = billingFromPayment(input.paymentScope, input.mode);
  const balance = Math.max(0, input.netAmount - input.collected);

  if (billing === "deferred") {
    return {
      billing,
      stage: "junior_exam",
      routingLabel: "Deferred · released to junior exam",
      routeHref: "/app/frontdesk/queue",
      routingNote: "Billing deferred — patient proceeds to junior exam → doctor consult.",
    };
  }
  if (billing === "partial") {
    return {
      billing,
      stage: "billing",
      routingLabel: "Partial · balance due",
      routeHref: "/app/frontdesk/billing",
      routingNote: `₹${input.collected.toLocaleString("en-IN")} collected · ₹${balance.toLocaleString("en-IN")} balance tracked. Patient stays in billing until full payment.`,
    };
  }
  return {
    billing: "paid",
    stage: "junior_exam",
    routingLabel: "Paid · released to junior exam",
    routeHref: "/app/frontdesk/queue",
    routingNote: "Payment complete — patient proceeds to junior exam → doctor consult.",
  };
}

export function treatmentPathFromConvert(convertToIpd: boolean, fallback: TreatmentPath = "opd"): TreatmentPath {
  return convertToIpd ? "ipd" : fallback;
}
