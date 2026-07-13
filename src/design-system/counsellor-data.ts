/** Counsellor module — types, packages, discount policy */

import { CARE_PACKAGES } from "@/design-system/doctor-data";
import type { ConsultationRecord, CounsellorQueueItem } from "@/design-system/doctor-data";

export type CounselOutcome = "converted" | "deferred" | "lost" | "callback";

export type DiscountApprovalStatus = "none" | "pending" | "approved" | "rejected";

export type QuoteLineItem = {
  id: string;
  label: string;
  amount: number;
  quantity: number;
  gstPercent: number;
  type: "package" | "addon" | "custom" | "service";
};

export type CounselQuote = {
  visitId: string;
  patientId: string;
  packageId: string;
  packageLabel: string;
  tier: "good" | "better" | "best";
  lineItems: QuoteLineItem[];
  grossAmount: number;
  gstPercent: number;
  gstAmount: number;
  discountPercent: number;
  discountAmount: number;
  netAmount: number;
  discountReason?: string;
  approvalStatus: DiscountApprovalStatus;
  emiMonths?: number;
  corporateRef?: string;
  consentCaptured: boolean;
  whatsappSent: boolean;
};

export type CounselSession = {
  id: string;
  visitId: string;
  patientId: string;
  queueItemId: string;
  counsellorId: string;
  counsellorName: string;
  branchId: string;
  startedAt: string;
  completedAt?: string;
  outcome?: CounselOutcome;
  quote?: CounselQuote;
  internalNotes: string;
  patientObjections: string[];
  callbackAt?: string;
  voiceNote?: string;
  aiScript?: string;
  sentToBilling: boolean;
  billingSentAt?: string;
};

export type DiscountApproval = {
  id: string;
  visitId: string;
  patientId: string;
  patientName: string;
  requestedPercent: number;
  reason: string;
  status: DiscountApprovalStatus;
  requestedAt: string;
  resolvedAt?: string;
  quoteSnapshot: CounselQuote;
};

export type CommercialTimelineEntry = {
  sessionId: string;
  visitId: string;
  date: string;
  outcome: CounselOutcome;
  packageLabel: string;
  netAmount: number;
  doctorName: string;
};

export type DiscountPolicy = {
  counsellorMaxPercent: number;
  seniorMaxPercent: number;
  managerApprovalAbove: number;
  requireReasonAbove: number;
};

export const DEFAULT_DISCOUNT_POLICY: DiscountPolicy = {
  counsellorMaxPercent: 100,
  seniorMaxPercent: 100,
  managerApprovalAbove: 100,
  requireReasonAbove: 100,
};

export type PackageAddon = {
  id: string;
  label: string;
  amount: number;
  dept: string;
};

export const PACKAGE_ADDONS: PackageAddon[] = [
  { id: "addon_physio", label: "Extra physio — 4 sessions", amount: 8000, dept: "dept_spine" },
  { id: "addon_mri", label: "MRI screening", amount: 6500, dept: "dept_spine" },
  { id: "addon_labs", label: "Metabolic lab panel", amount: 3500, dept: "dept_wellness" },
  { id: "addon_bca", label: "Body composition analysis", amount: 2000, dept: "dept_wellness" },
  { id: "addon_ipd_day", label: "IPD daycare — 1 night", amount: 12000, dept: "dept_spine" },
];

export const PACKAGE_TIERS = [
  { id: "good" as const, label: "Essential", packageId: "pkg_opd" },
  { id: "better" as const, label: "Standard", packageId: "pkg_basic" },
  { id: "best" as const, label: "Premium", packageId: "pkg_regen" },
];

export { CARE_PACKAGES };

export const OBJECTION_TAGS = [
  "Price too high",
  "Needs family approval",
  "Wants second opinion",
  "Timing / schedule",
  "Trust / credibility",
  "Insurance / corporate",
  "Clinical mismatch",
];

export const COUNSELLOR_BRANCHES = [
  { id: "branch_gurgaon", label: "Gurgaon Center" },
  { id: "branch_pataudi", label: "Pataudi Center" },
];

export const DEMO_COUNSELLOR_ID = "counsellor_1";
export const DEMO_COUNSELLOR_NAME = "Priya Sharma";

export function packageById(id: string, packages: Array<{ id: string; label: string; amount: number }> = CARE_PACKAGES) {
  return packages.find((p) => p.id === id);
}

export function computeQuote(
  packageId: string,
  addonIds: string[],
  discountPercent: number,
  customLines: QuoteLineItem[] = [],
  packages: Array<{ id: string; label: string; amount: number }> = CARE_PACKAGES,
  gstPercent = 0,
): Omit<CounselQuote, "visitId" | "patientId" | "approvalStatus" | "consentCaptured" | "whatsappSent"> {
  const pkg = packageById(packageId, packages);
  const lineItems: QuoteLineItem[] = [
    ...(pkg ? [{ id: "pkg", label: pkg.label, amount: pkg.amount, quantity: 1, gstPercent: 0, type: "package" as const }] : []),
    ...addonIds
      .map((id) => PACKAGE_ADDONS.find((a) => a.id === id))
      .filter(Boolean)
      .map((a) => ({ id: a!.id, label: a!.label, amount: a!.amount, quantity: 1, gstPercent: 0, type: "addon" as const })),
    ...customLines,
  ];
  const grossAmount = lineItems.reduce((s, l) => s + l.amount * l.quantity, 0);
  const discountAmount = Math.round((grossAmount * discountPercent) / 100);
  const taxableAfterDiscount = grossAmount - discountAmount;
  const gstAmount = Math.round((taxableAfterDiscount * gstPercent) / 100);
  const netAmount = taxableAfterDiscount + gstAmount;
  return {
    packageId: pkg?.id ?? packageId,
    packageLabel: pkg?.label ?? (packageId ? packageId : ""),
    tier: "better",
    lineItems,
    grossAmount,
    gstPercent,
    gstAmount,
    discountPercent,
    discountAmount,
    netAmount,
  };
}

export type BillingHandoffPayload = {
  visitId: string;
  patientId: string;
  patientName: string;
  uhid: string;
  quote: CounselQuote;
  counsellorName: string;
  counselNotes: string;
  doctorName: string;
  doctorId: string;
  sentAt: string;
  paymentExpectation: "pay_now" | "desk" | "corporate";
  treatmentMode?: "opd" | "ipd" | "daycare";
  admissionRecommended?: boolean;
  diagnosisSummary?: string;
};

export function queueWaitMinutes(sentAt: string) {
  return Math.max(0, Math.round((Date.now() - new Date(sentAt).getTime()) / 60000));
}

export type FullHandoffView = CounsellorQueueItem & {
  payload: ConsultationRecord;
};
