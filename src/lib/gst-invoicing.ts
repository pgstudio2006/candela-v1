/** GST helpers for OPD tax invoices (India). */

export type GstTaxMode = "exempt" | "cgst_sgst" | "igst";

export type GstSettings = {
  gstin: string;
  legalName: string;
  address: string;
  placeOfSupply: string;
  /** SAC for healthcare OPD consultation services */
  sacCode: string;
  hsnCode?: string;
  gstRatePercent: number;
  taxMode: GstTaxMode;
};

export type GstLineBreakdown = {
  label: string;
  quantity: number;
  taxableAmount: number;
  category?: string;
  sacCode: string;
  gstRatePercent: number;
  cgst: number;
  sgst: number;
  igst: number;
  lineTotal: number;
};

export type GstInvoiceBreakdown = {
  settings: GstSettings;
  lines: GstLineBreakdown[];
  taxableSubtotal: number;
  discount: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  taxTotal: number;
  grandTotal: number;
};

const DEFAULT_GST: GstSettings = {
  gstin: process.env.BRANCH_GSTIN ?? "06AABCN1234F1Z9",
  legalName: process.env.BRANCH_LEGAL_NAME ?? "Navayu Spine & Joint Care Pvt Ltd",
  address: process.env.BRANCH_ADDRESS ?? "Sector 44, Gurgaon, Haryana 122003",
  placeOfSupply: process.env.BRANCH_STATE ?? "Haryana",
  sacCode: "999312",
  gstRatePercent: Number(process.env.OPD_GST_RATE ?? "0"),
  taxMode: (process.env.OPD_GST_MODE as GstTaxMode) ?? "exempt",
};

export function parseBranchGstSettings(meta: unknown): GstSettings {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return DEFAULT_GST;
  const m = meta as Record<string, unknown>;
  const gst = (m.gst && typeof m.gst === "object" && !Array.isArray(m.gst) ? m.gst : m) as Record<
    string,
    unknown
  >;
  return {
    gstin: String(gst.gstin ?? DEFAULT_GST.gstin),
    legalName: String(gst.legalName ?? DEFAULT_GST.legalName),
    address: String(gst.address ?? DEFAULT_GST.address),
    placeOfSupply: String(gst.placeOfSupply ?? DEFAULT_GST.placeOfSupply),
    sacCode: String(gst.sacCode ?? DEFAULT_GST.sacCode),
    hsnCode: gst.hsnCode ? String(gst.hsnCode) : undefined,
    gstRatePercent: Number(gst.gstRatePercent ?? DEFAULT_GST.gstRatePercent),
    taxMode: (String(gst.taxMode ?? DEFAULT_GST.taxMode) as GstTaxMode) || "exempt",
  };
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export function computeGstLine(
  label: string,
  quantity: number,
  taxableAmount: number,
  settings: GstSettings,
): GstLineBreakdown {
  const rate = settings.taxMode === "exempt" ? 0 : settings.gstRatePercent;
  const taxBase = Math.max(0, round2(taxableAmount));
  const taxAmount = round2((taxBase * rate) / 100);

  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  if (settings.taxMode === "cgst_sgst" && rate > 0) {
    cgst = round2(taxAmount / 2);
    sgst = round2(taxAmount - cgst);
  } else if (settings.taxMode === "igst" && rate > 0) {
    igst = taxAmount;
  }

  return {
    label,
    quantity,
    taxableAmount: taxBase,
    sacCode: settings.sacCode,
    gstRatePercent: rate,
    cgst,
    sgst,
    igst,
    lineTotal: round2(taxBase + cgst + sgst + igst),
  };
}

export function computeGstInvoice(input: {
  settings: GstSettings;
  lines: { label: string; quantity: number; taxableAmount: number; gstRatePercent?: number; category?: string }[];
  discount?: number;
}): GstInvoiceBreakdown {
  const discount = Math.max(0, input.discount ?? 0);
  const rawLines = input.lines.map((l) => ({
    ...computeGstLine(l.label, l.quantity, l.taxableAmount, {
      ...input.settings,
      gstRatePercent: l.gstRatePercent ?? input.settings.gstRatePercent,
    }),
    category: l.category,
  }));
  const taxableSubtotal = rawLines.reduce((s, l) => s + l.taxableAmount, 0);
  const discountRatio = taxableSubtotal > 0 ? Math.min(1, discount / taxableSubtotal) : 0;

  const lines = rawLines.map((l) => {
    if (discountRatio <= 0) return l;
    const adjustedTaxable = l.taxableAmount * (1 - discountRatio);
    const discounted = computeGstLine(l.label, l.quantity, adjustedTaxable, {
      ...input.settings,
      gstRatePercent: l.gstRatePercent ?? input.settings.gstRatePercent,
    });
    // Keep the original pre-discount taxable amount for display; lineTotal remains discounted.
    return { ...discounted, taxableAmount: l.taxableAmount, category: l.category };
  });

  const cgstTotal = round2(lines.reduce((s, l) => s + l.cgst, 0));
  const sgstTotal = round2(lines.reduce((s, l) => s + l.sgst, 0));
  const igstTotal = round2(lines.reduce((s, l) => s + l.igst, 0));
  const taxTotal = round2(cgstTotal + sgstTotal + igstTotal);
  const grandTotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));

  return {
    settings: input.settings,
    lines,
    taxableSubtotal,
    discount,
    cgstTotal,
    sgstTotal,
    igstTotal,
    taxTotal,
    grandTotal,
  };
}

export function formatGstPercent(rate: number): string {
  return rate > 0 ? `${rate}%` : "Exempt";
}
