import type { CounselQuote } from "@/design-system/counsellor-data";
import {
  computeGstInvoice,
  formatGstPercent,
  parseBranchGstSettings,
  type GstInvoiceBreakdown,
} from "@/lib/gst-invoicing";

export function computeQuoteGstBreakdown(quote: CounselQuote, branchMeta?: unknown): GstInvoiceBreakdown {
  const settings = parseBranchGstSettings(branchMeta);
  return computeGstInvoice({
    settings,
    lines: quote.lineItems.map((line) => ({
      label: line.label,
      quantity: line.quantity,
      taxableAmount: line.amount * line.quantity,
    })),
    discount: quote.discountAmount,
  });
}

export { formatGstPercent };
