"use client";

import { useEffect, useMemo, useState } from "react";
import { Panel, AttioButton } from "@/components/frontdesk/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  addIpdCartItemAction,
  previewIpdFinalBillAction,
  removeIpdCartItemAction,
  updateIpdCartItemAction,
} from "@/app/actions/ipd-actions";
import {
  fetchBillingPackagesFromAPI,
  fetchServiceChargesFromAPI,
  type BillingPackage,
  formatPackagePrice,
} from "@/lib/billing-packages";
import { useToast } from "@/components/ui/toast-provider";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/candela/session-provider";
import type { IpdAdmissionDetail } from "@/design-system/ipd-data";

const PATAUDI_BRANCH_ID = "branch_pataudi";

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type IpdServiceCartPanelProps = {
  admission: IpdAdmissionDetail;
  onChange?: () => void;
  onGenerateFinalBill?: () => void;
};

export function IpdServiceCartPanel({ admission, onChange, onGenerateFinalBill }: IpdServiceCartPanelProps) {
  const { toast } = useToast();
  const { session } = useSession();
  const isPataudi = session?.branchId === PATAUDI_BRANCH_ID;
  const [services, setServices] = useState<BillingPackage[]>([]);
  const [packages, setPackages] = useState<BillingPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [serviceSearch, setServiceSearch] = useState("");
  const [packageSearch, setPackageSearch] = useState("");
  const [cart, setCart] = useState(admission.cart);
  const [processing, setProcessing] = useState(false);
  const [preview, setPreview] = useState<{
    subtotal: number;
    discount: number;
    taxableSubtotal: number;
    cgstTotal: number;
    sgstTotal: number;
    igstTotal: number;
    taxAmount: number;
    total: number;
  } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setCart(admission.cart);
  }, [admission.cart]);

  useEffect(() => {
    let cancelled = false;
    setLoadingPreview(true);
    previewIpdFinalBillAction(admission.id, 0)
      .then((res) => {
        if (cancelled) return;
        if (res.ok && res.data) setPreview(res.data as NonNullable<typeof preview>);
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false);
      });
    return () => {
      cancelled = true;
    };
  }, [admission.id, cart]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchBillingPackagesFromAPI(), fetchServiceChargesFromAPI()])
      .then(([pkgs, svcs]) => {
        if (cancelled) return;
        setPackages(pkgs);
        setServices(svcs);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const cartTotal = useMemo(() => cart.reduce((s, item) => s + item.amount * item.quantity, 0), [cart]);

  const addItem = async (pkg: BillingPackage, type: "service" | "package") => {
    setProcessing(true);
    const result = await addIpdCartItemAction(admission.id, {
      type,
      packageId: pkg.id,
      label: pkg.label,
      amount: pkg.amount,
      quantity: 1,
    });
    setProcessing(false);
    if (!result.ok) {
      toast(result.error, "error");
      return;
    }
    setCart(result.data);
    onChange?.();
  };

  const removeItem = async (itemId: string) => {
    setProcessing(true);
    const result = await removeIpdCartItemAction(admission.id, itemId);
    setProcessing(false);
    if (!result.ok) {
      toast(result.error, "error");
      return;
    }
    setCart(result.data);
    onChange?.();
  };

  const updateQuantity = async (itemId: string, quantity: number) => {
    if (quantity < 1) return;
    setProcessing(true);
    const result = await updateIpdCartItemAction(admission.id, itemId, quantity);
    setProcessing(false);
    if (!result.ok) {
      toast(result.error, "error");
      return;
    }
    setCart(result.data);
    onChange?.();
  };

  const goToBilling = () => {
    if (!cart.length || !admission.visitId) {
      toast("Add services to the cart before billing", "error");
      return;
    }
    if (onGenerateFinalBill) {
      onGenerateFinalBill();
    } else {
      router.push(`/app/frontdesk/ipd-billing?visit=${admission.visitId}`);
    }
  };

  const filteredServices = services.filter(
    (svc) =>
      svc.label.toLowerCase().includes(serviceSearch.toLowerCase()) ||
      (svc.description && svc.description.toLowerCase().includes(serviceSearch.toLowerCase())),
  );
  const filteredPackages = packages.filter(
    (pkg) =>
      pkg.label.toLowerCase().includes(packageSearch.toLowerCase()) ||
      (pkg.description && pkg.description.toLowerCase().includes(packageSearch.toLowerCase())),
  );

  return (
    <>
      <Panel title="IPD service cart">
        {loading ? (
          <p className="text-[13px] text-[var(--attio-text-tertiary)]">Loading services & packages…</p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-[12px] font-medium text-[var(--attio-text-secondary)]">Add service</p>
                <Select
                  value=""
                  onValueChange={(value) => {
                    const svc = services.find((s) => s.id === value);
                    if (svc) void addItem(svc, "service");
                  }}
                >
                  <SelectTrigger className="h-9 text-[13px]">
                    <SelectValue placeholder="Select service…" />
                  </SelectTrigger>
                  <SelectContent className="min-w-[280px]">
                    <div className="sticky top-0 z-10 bg-popover px-2 py-2">
                      <Input
                        type="text"
                        placeholder="Search services…"
                        value={serviceSearch}
                        onChange={(e) => setServiceSearch(e.target.value)}
                        onKeyDown={(e) => e.stopPropagation()}
                        onKeyUp={(e) => e.stopPropagation()}
                        className="h-8 text-[12px]"
                      />
                    </div>
                    {filteredServices.map((svc) => (
                      <SelectItem
                        key={svc.id}
                        value={svc.id}
                        className="py-3 [&>[data-slot=select-item-text]]:whitespace-normal"
                      >
                        <div className="flex flex-col">
                          <span className="font-medium">{svc.label}</span>
                          <span className="text-[11px] text-[var(--attio-text-tertiary)]">{formatPackagePrice(svc)}</span>
                        </div>
                      </SelectItem>
                    ))}
                    {filteredServices.length === 0 && (
                      <p className="px-2 py-2 text-[12px] text-[var(--attio-text-tertiary)]">No services match.</p>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="mb-2 text-[12px] font-medium text-[var(--attio-text-secondary)]">Add package</p>
                <Select
                  value=""
                  onValueChange={(value) => {
                    const pkg = packages.find((p) => p.id === value);
                    if (pkg) void addItem(pkg, "package");
                  }}
                >
                  <SelectTrigger className="h-9 text-[13px]">
                    <SelectValue placeholder="Select package…" />
                  </SelectTrigger>
                  <SelectContent className="min-w-[280px]">
                    <div className="sticky top-0 z-10 bg-popover px-2 py-2">
                      <Input
                        type="text"
                        placeholder="Search packages…"
                        value={packageSearch}
                        onChange={(e) => setPackageSearch(e.target.value)}
                        onKeyDown={(e) => e.stopPropagation()}
                        onKeyUp={(e) => e.stopPropagation()}
                        className="h-8 text-[12px]"
                      />
                    </div>
                    {filteredPackages.map((pkg) => (
                      <SelectItem
                        key={pkg.id}
                        value={pkg.id}
                        className="py-3 [&>[data-slot=select-item-text]]:whitespace-normal"
                      >
                        <div className="flex flex-col">
                          <span className="font-medium">{pkg.label}</span>
                          <span className="text-[11px] text-[var(--attio-text-tertiary)]">{formatPackagePrice(pkg)}</span>
                        </div>
                      </SelectItem>
                    ))}
                    {filteredPackages.length === 0 && (
                      <p className="px-2 py-2 text-[12px] text-[var(--attio-text-tertiary)]">No packages match.</p>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {cart.length === 0 ? (
              <p className="text-[13px] text-[var(--attio-text-tertiary)]">No services or packages added yet.</p>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg border">
                  {cart.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between border-b px-3 py-2 text-[13px] last:border-b-0"
                    >
                      <div>
                        <p className="font-medium">{item.label}</p>
                        <p className="text-[12px] text-[var(--attio-text-tertiary)]">
                          ₹{item.amount.toLocaleString("en-IN")} × {item.quantity}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            disabled={processing || item.quantity <= 1}
                            className="flex size-6 items-center justify-center rounded border text-[12px] disabled:opacity-50"
                            aria-label="Decrease quantity"
                          >
                            −
                          </button>
                          <span className="min-w-[1.5rem] text-center text-[13px]">{item.quantity}</span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            disabled={processing}
                            className="flex size-6 items-center justify-center rounded border text-[12px] disabled:opacity-50"
                            aria-label="Increase quantity"
                          >
                            +
                          </button>
                        </div>
                        <p className="font-medium">₹{(item.amount * item.quantity).toLocaleString("en-IN")}</p>
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          disabled={processing}
                          className="text-[12px] text-red-600 hover:underline disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="rounded-md bg-[var(--attio-surface)] p-3 text-[12px]">
                  <p className="font-medium text-[var(--attio-text-secondary)]">Billing preview</p>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                    <span className="text-[var(--attio-text-tertiary)]">Subtotal</span>
                    <span className="text-right tabular-nums">{fmt(preview?.subtotal ?? cartTotal)}</span>
                    <span className="text-[var(--attio-text-tertiary)]">GST</span>
                    <span className="text-right tabular-nums">{fmt(preview?.taxAmount ?? 0)}</span>
                    <span className="text-[var(--attio-text-tertiary)]">Net bill</span>
                    <span className="text-right tabular-nums font-medium">{fmt(preview?.total ?? cartTotal)}</span>
                    <span className="text-[var(--attio-text-tertiary)]">{isPataudi ? "Available advance" : "Wallet balance"}</span>
                    <span className="text-right tabular-nums">{fmt(admission.walletBalance ?? 0)}</span>
                    <span className="text-[var(--attio-text-tertiary)]">
                      {isPataudi ? "Outstanding / due" : "Due after advance"}
                    </span>
                    <span className="text-right tabular-nums">
                      {fmt(Math.max(0, (preview?.total ?? cartTotal) - (admission.walletBalance ?? 0)))}
                    </span>
                    {isPataudi && (admission.walletBalance ?? 0) > (preview?.total ?? cartTotal) && (
                      <>
                        <span className="text-[var(--attio-text-tertiary)]">Refund due</span>
                        <span className="text-right tabular-nums text-emerald-600">
                          {fmt(Math.max(0, (admission.walletBalance ?? 0) - (preview?.total ?? cartTotal)))}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <AttioButton
                  variant="primary"
                  className="w-full"
                  disabled={processing || !cart.length || !admission.visitId || loadingPreview}
                  onClick={goToBilling}
                >
                  {isPataudi ? "Generate final bill" : "Generate final bill & collect payment"}
                </AttioButton>
              </div>
            )}
          </div>
        )}
      </Panel>
    </>
  );
}
