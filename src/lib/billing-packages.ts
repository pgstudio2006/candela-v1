/** Navayu global healthcare price list — branch-specific OPD & procedure packages. */

export type BillingBranchGroup = "gurgaon" | "pataudi_pune";

export type BillingPackage = {
  id: string;
  label: string;
  description?: string;
  category: "opd" | "injection" | "therapy" | "procedure" | "admission";
  amount: number;
  amountMax?: number;
  /** Display hint when list price is a range */
  priceLabel?: string;
  sessions?: number;
  dept?: string;
  gstPercent?: number;
  services?: Array<{ serviceId: string; label: string; quantity: number; rate: number }>;
};

// Fetch packages from database API
export async function fetchBillingPackagesFromAPI(branchId?: string): Promise<BillingPackage[]> {
  try {
    const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
    const res = await fetch(`/api/admin/packages${query}`);
    const data = await res.json();
    if (data.ok) {
      return data.data.map((pkg: { id: string; label: string; description?: string; amount: number; sessions?: number; dept?: string; gstPercent?: number; services?: unknown }) => ({
        id: pkg.id,
        label: pkg.label,
        description: pkg.description,
        category: "opd" as const,
        amount: Number(pkg.amount),
        sessions: pkg.sessions,
        dept: pkg.dept,
        gstPercent: Number(pkg.gstPercent ?? 0),
        services: pkg.services,
      }));
    }
  } catch (err) {
    console.error("Failed to fetch packages from API, using fallback", err);
  }
  return [];
}

// Fetch service charges from database API
export async function fetchServiceChargesFromAPI(branchId?: string): Promise<BillingPackage[]> {
  try {
    const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
    const res = await fetch(`/api/admin/service-charges${query}`);
    const data = await res.json();
    if (data.ok) {
      return data.data.map((charge: { id: string; label: string; description?: string; category?: string; rate: number; gstPercent?: number }) => ({
        id: charge.id,
        label: charge.label,
        description: charge.description,
        category: (charge.category as BillingPackage["category"]) ?? "opd",
        amount: Number(charge.rate),
        gstPercent: Number(charge.gstPercent ?? 0),
      }));
    }
  } catch (err) {
    console.error("Failed to fetch service charges from API, using fallback", err);
  }
  return [];
}

export async function getBillingPackagesForBranch(): Promise<BillingPackage[]> {
  return fetchBillingPackagesFromAPI();
}

export async function getBillingPackage(
  packageId: string,
): Promise<BillingPackage | undefined> {
  const packages = await getBillingPackagesForBranch();
  return packages.find((p) => p.id === packageId);
}

export function formatPackagePrice(pkg: BillingPackage): string {
  if (pkg.priceLabel) return pkg.priceLabel;
  if (pkg.amountMax && pkg.amountMax > pkg.amount) {
    return `₹${pkg.amount.toLocaleString("en-IN")} – ₹${pkg.amountMax.toLocaleString("en-IN")}`;
  }
  return `₹${pkg.amount.toLocaleString("en-IN")}`;
}
