"use client";

import { PublishedSchemaForm } from "@/components/candela/published-schema-form";
import { PatientSearchField } from "@/components/frontdesk/patient-search-field";
import { AttioButton, Panel } from "@/components/frontdesk/ui";
import type { Patient, Visit } from "@/design-system/frontdesk-data";
import type { PaymentScope } from "@/lib/billing-routing";
import {
  formatPackagePrice,
  fetchBillingPackagesFromAPI,
  fetchServiceChargesFromAPI,
  type BillingPackage,
} from "@/lib/billing-packages";
import { computeGstInvoice } from "@/lib/gst-invoicing";
import type { BillingPackageLine, PaymentSplit } from "@/lib/opd-billing";
import { resolveBillingDiscount } from "@/lib/opd-billing";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Plus, Trash2, X, Search, Package as PackageIcon } from "lucide-react";
import { useMemo, useState, useEffect } from "react";

const PAYMENT_MODES = [
  { value: "upi", label: "UPI" },
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "corporate", label: "Corporate" },
  { value: "cheque", label: "Cheque" },
];

type SelectedLine = BillingPackageLine & { key: string };

type OpdBillingFormProps = {
  branchId?: string;
  branchName?: string;
  patient?: Patient;
  visit?: Visit;
  patients: Patient[];
  doctors?: { id: string; name: string }[];
  onSelectPatient: (patient: Patient, visit?: Visit) => void;
  onClearPatient: () => void;
  onSubmit: (data: Record<string, string | number | boolean>) => void;
  submitLabel?: string;
};

function lineFromPackage(pkg: BillingPackage): SelectedLine {
  return {
    key: `${pkg.id}_${Date.now()}`,
    packageId: pkg.id,
    label: pkg.label,
    amount: pkg.amount,
    quantity: 1,
  };
}

export function OpdBillingForm({
  branchId,
  branchName,
  patient,
  visit,
  patients,
  doctors = [],
  onSelectPatient,
  onClearPatient,
  onSubmit,
  submitLabel = "Collect payment & release to queue",
}: OpdBillingFormProps) {
  const [packages, setPackages] = useState<BillingPackage[]>([]);
  const [services, setServices] = useState<BillingPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [packageSearch, setPackageSearch] = useState("");
  const [serviceSearch, setServiceSearch] = useState("");
  const [tab, setTab] = useState<"packages" | "services">("services");
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>("");

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const [pkgs, svcs] = await Promise.all([
        fetchBillingPackagesFromAPI(branchId),
        fetchServiceChargesFromAPI(branchId),
      ]);
      setPackages(pkgs);
      setServices(svcs);
      setLoading(false);
    };
    loadData();
  }, [branchId]);

  const [lines, setLines] = useState<SelectedLine[]>([]);
  const [discountMode, setDiscountMode] = useState<"amount" | "percent">("amount");
  const [discount, setDiscount] = useState(0);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [gstRatePercent, setGstRatePercent] = useState(0);
  const [gstTaxMode, setGstTaxMode] = useState<"exempt" | "cgst_sgst" | "igst">("exempt");
  const [paymentScope, setPaymentScope] = useState<PaymentScope>("full");
  const [skipBilling, setSkipBilling] = useState(false);
  const [deferReason, setDeferReason] = useState("");
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([
    { mode: "cash", amount: 0 },
  ]);
  const [billingMeta, setBillingMeta] = useState<Record<string, string | number | boolean>>({});

  const subtotal = lines.reduce((s, l) => s + l.amount * l.quantity, 0);
  const discountResolved = resolveBillingDiscount(subtotal, {
    discountMode,
    discount,
    discountPercent,
  });
  const discountAmount = discountResolved.discount;
  const effectiveGstMode = gstRatePercent > 0 && gstTaxMode === "exempt" ? "cgst_sgst" : gstTaxMode;
  const gstBreakdown = computeGstInvoice({
    settings: {
      gstin: "",
      legalName: "",
      address: "",
      placeOfSupply: "",
      sacCode: "999312",
      gstRatePercent,
      taxMode: effectiveGstMode,
    },
    lines: lines.map((l) => ({
      label: l.label,
      quantity: l.quantity,
      taxableAmount: l.amount * l.quantity,
    })),
    discount: discountAmount,
  });
  const net = gstBreakdown.grandTotal;

  const updateSplit = (index: number, patch: Partial<PaymentSplit>) => {
    setPaymentSplits((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const addSplit = () => {
    setPaymentSplits((prev) => [...prev, { mode: "cash", amount: 0 }]);
  };

  const removeSplit = (index: number) => {
    setPaymentSplits((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const splitTotal = paymentSplits.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const balanceAfterPay = Math.max(0, net - splitTotal);

  const handleSubmit = () => {
    if (!patient || !visit) return;
    if (!skipBilling && !lines.length) return;

    const selectedDoctor = doctors.find((d) => d.id === selectedDoctorId);

    const payload: Record<string, string | number | boolean> = {
      packageLines: JSON.stringify(lines),
      discount: discountAmount,
      discountMode,
      discountPercent: discountMode === "percent" ? discountPercent : 0,
      gstRatePercent,
      gstTaxMode: effectiveGstMode,
      paymentScope: skipBilling ? "defer" : paymentScope,
      skipBilling,
      deferReason: skipBilling || paymentScope === "defer" ? deferReason : "",
      paymentSplits: JSON.stringify(
        skipBilling || paymentScope === "defer"
          ? []
          : paymentScope === "partial"
            ? paymentSplits.filter((p) => p.amount > 0)
            : [{ mode: paymentSplits[0]?.mode ?? "cash", amount: net }],
      ),
      amount: subtotal,
      collectedAmount: splitTotal,
      mode: paymentSplits.length > 1 ? "split" : (paymentSplits[0]?.mode ?? "cash"),
      ...(selectedDoctor ? { doctorId: selectedDoctor.id, doctorName: selectedDoctor.name } : {}),
      ...billingMeta,
    };
    onSubmit(payload);
  };

  return (
    <div className="space-y-6">
      <Panel title="Find patient">
        <div className="space-y-3">
          <PatientSearchField
            value={patient?.uhid ?? ""}
            patients={patients}
            placeholder="Search by UHID, name, or mobile to bill…"
            onChange={(q, selected) => {
              if (selected) onSelectPatient(selected);
            }}
          />
          {patient && (
            <div className="flex items-start justify-between gap-3 rounded-lg border border-[var(--attio-border-subtle)] bg-[var(--attio-surface)] p-3">
              <div>
                <p className="text-[14px] font-semibold">{patient.name}</p>
                <p className="text-[12px] text-[var(--attio-text-tertiary)]">
                  {patient.uhid} · {patient.phone}
                  {visit ? ` · Token ${visit.token ?? "—"}` : ""}
                </p>
                {visit && (
                  <p className="mt-1 text-[12px] text-[var(--attio-text-secondary)]">
                    {visit.doctorName} · Billing: {visit.billing}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClearPatient}
                className="rounded-md p-1 text-[var(--attio-text-tertiary)] hover:bg-white"
                aria-label="Clear patient"
              >
                <X className="size-4" />
              </button>
            </div>
          )}
          {!visit && patient && (
            <p className="text-[12px] text-amber-700">
              No active visit found for billing. Check in the patient first, or pick a pending visit from search results.
            </p>
          )}
        </div>
      </Panel>

      {patient && visit && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] text-[var(--attio-text-tertiary)]">
              Price list:{" "}
              <strong className="text-[var(--attio-text)]">Admin defined</strong>
              {branchName ? ` · ${branchName}` : ""}
            </p>
            <label className="flex items-center gap-2 text-[12px]">
              <input
                type="checkbox"
                checked={skipBilling}
                onChange={(e) => {
                  setSkipBilling(e.target.checked);
                  if (e.target.checked) setPaymentScope("defer");
                }}
              />
              Skip billing for this patient (defer with reason)
            </label>
          </div>

          {!skipBilling && (
            <>
              <div className="grid gap-6 lg:grid-cols-2">
                <Panel title="Services">
                  {loading ? (
                    <p className="text-[13px] text-[var(--attio-text-tertiary)]">Loading services...</p>
                  ) : (
                    <>
                      <div className="mb-3">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--attio-text-tertiary)]" />
                          <Input
                            type="text"
                            placeholder="Search services..."
                            value={serviceSearch}
                            onChange={(e) => setServiceSearch(e.target.value)}
                            className="pl-9 h-9 text-[13px]"
                          />
                        </div>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        {services
                          .filter((svc: BillingPackage) =>
                            svc.label.toLowerCase().includes(serviceSearch.toLowerCase()) ||
                            (svc.description && svc.description.toLowerCase().includes(serviceSearch.toLowerCase()))
                          )
                          .map((svc: BillingPackage) => (
                            <button
                              key={svc.id}
                              type="button"
                              onClick={() => setLines((prev) => [...prev, lineFromPackage(svc)])}
                              className="rounded-lg border border-[var(--attio-border)] bg-white p-3 text-left hover:border-[var(--attio-text-tertiary)]"
                            >
                              <p className="text-[12px] font-medium leading-snug">{svc.label}</p>
                              {svc.description && (
                                <p className="mt-0.5 text-[11px] text-[var(--attio-text-tertiary)]">{svc.description}</p>
                              )}
                              <p className="mt-1 text-[13px] font-semibold tabular-nums text-[var(--attio-accent)]">
                                {formatPackagePrice(svc)}
                              </p>
                            </button>
                          ))}
                      </div>
                    </>
                  )}
                </Panel>

                <Panel title="Packages">
                  {loading ? (
                    <p className="text-[13px] text-[var(--attio-text-tertiary)]">Loading packages...</p>
                  ) : (
                    <>
                      <div className="mb-3">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--attio-text-tertiary)]" />
                          <Input
                            type="text"
                            placeholder="Search packages..."
                            value={packageSearch}
                            onChange={(e) => setPackageSearch(e.target.value)}
                            className="pl-9 h-9 text-[13px]"
                          />
                        </div>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        {packages
                          .filter((pkg: BillingPackage) =>
                            pkg.label.toLowerCase().includes(packageSearch.toLowerCase()) ||
                            (pkg.description && pkg.description.toLowerCase().includes(packageSearch.toLowerCase()))
                          )
                          .map((pkg: BillingPackage) => (
                            <button
                              key={pkg.id}
                              type="button"
                              onClick={() => setLines((prev) => [...prev, lineFromPackage(pkg)])}
                              className="rounded-lg border border-[var(--attio-border)] bg-white p-3 text-left hover:border-[var(--attio-text-tertiary)]"
                            >
                              <p className="text-[12px] font-medium leading-snug">{pkg.label}</p>
                              {pkg.description && (
                                <p className="mt-0.5 text-[11px] text-[var(--attio-text-tertiary)]">{pkg.description}</p>
                              )}
                              <p className="mt-1 text-[13px] font-semibold tabular-nums text-[var(--attio-accent)]">
                                {formatPackagePrice(pkg)}
                              </p>
                            </button>
                          ))}
                      </div>
                    </>
                  )}
                </Panel>
              </div>

              {lines.length > 0 && (
                <Panel title="Selected packages">
                  <ul className="space-y-2">
                    {lines.map((line) => (
                      <li
                        key={line.key}
                        className="grid gap-2 rounded-lg border border-[var(--attio-border-subtle)] p-3 sm:grid-cols-[1fr_80px_120px_32px]"
                      >
                        <div>
                          <p className="text-[13px] font-medium">{line.label}</p>
                          <p className="text-[11px] text-[var(--attio-text-tertiary)]">{line.packageId}</p>
                        </div>
                        <div>
                          <Label className="text-[11px]">Qty</Label>
                          <Input
                            type="number"
                            min={1}
                            value={line.quantity}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((l) =>
                                  l.key === line.key
                                    ? { ...l, quantity: Math.max(1, Number(e.target.value) || 1) }
                                    : l,
                                ),
                              )
                            }
                            className="mt-1 h-8 text-[12px]"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px]">Amount (₹)</Label>
                          <Input
                            type="number"
                            min={0}
                            value={line.amount}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((l) =>
                                  l.key === line.key
                                    ? { ...l, amount: Math.max(0, Number(e.target.value) || 0) }
                                    : l,
                                ),
                              )
                            }
                            className="mt-1 h-8 text-[12px]"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                          className="self-end rounded p-1 text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-[12px]">Discount</Label>
                  <div className="mb-2 flex flex-wrap gap-2">
                    {(
                      [
                        { id: "amount" as const, label: "₹ Amount" },
                        { id: "percent" as const, label: "% Percent" },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setDiscountMode(opt.id)}
                        className={cn(
                          "h-8 rounded-md border px-3 text-[12px] font-medium",
                          discountMode === opt.id
                            ? "border-zinc-900 bg-zinc-900 text-white"
                            : "border-[var(--attio-border)] bg-white",
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {discountMode === "percent" ? (
                    <Input
                      type="number"
                      min={0}
                      step={0.5}
                      value={discountPercent}
                      onChange={(e) =>
                        setDiscountPercent(Math.max(0, Number(e.target.value) || 0))
                      }
                      className="h-9 text-[13px]"
                      placeholder="e.g. 10"
                    />
                  ) : (
                    <Input
                      type="number"
                      min={0}
                      value={discount}
                      onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                      className="h-9 text-[13px]"
                    />
                  )}
                  {discountAmount > 0 && discountMode === "percent" && (
                    <p className="text-[11px] text-[var(--attio-text-tertiary)]">
                      = ₹{discountAmount.toLocaleString("en-IN")} off subtotal
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[12px]">GST rate (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={gstRatePercent}
                    onChange={(e) => {
                      const rate = Math.max(0, Number(e.target.value) || 0);
                      setGstRatePercent(rate);
                      if (rate > 0 && gstTaxMode === "exempt") setGstTaxMode("cgst_sgst");
                    }}
                    className="h-9 text-[13px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[12px]">GST type</Label>
                  <Select
                    value={effectiveGstMode}
                    onValueChange={(v) => v && setGstTaxMode(v as typeof gstTaxMode)}
                  >
                    <SelectTrigger className="h-9 text-[13px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="exempt">Exempt (0%)</SelectItem>
                      <SelectItem value="cgst_sgst">CGST + SGST (intra-state)</SelectItem>
                      <SelectItem value="igst">IGST (inter-state)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Panel title="Totals">
                <div className="space-y-1 text-[13px]">
                  <div className="flex justify-between">
                    <span className="text-[var(--attio-text-secondary)]">Subtotal</span>
                    <span className="tabular-nums">₹{subtotal.toLocaleString("en-IN")}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-[var(--attio-text-secondary)]">
                        Discount{discountMode === "percent" ? ` (${discountPercent}%)` : ""}
                      </span>
                      <span className="tabular-nums">−₹{discountAmount.toLocaleString("en-IN")}</span>
                    </div>
                  )}
                  {gstBreakdown.taxTotal > 0 && (
                    <div className="flex justify-between">
                      <span className="text-[var(--attio-text-secondary)]">GST</span>
                      <span className="tabular-nums">₹{gstBreakdown.taxTotal.toLocaleString("en-IN")}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t pt-2 text-[15px] font-semibold">
                    <span>Net payable</span>
                    <span className="tabular-nums">₹{net.toLocaleString("en-IN")}</span>
                  </div>
                </div>
              </Panel>

              <Panel title="Payment">
                <div className="mb-4 flex flex-wrap gap-2">
                  {(
                    [
                      { id: "full" as const, label: "Full payment" },
                      { id: "partial" as const, label: "Partial payment" },
                      { id: "defer" as const, label: "Defer billing" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setPaymentScope(opt.id)}
                      className={cn(
                        "h-9 rounded-md border px-4 text-[12px] font-medium",
                        paymentScope === opt.id
                          ? "border-zinc-900 bg-zinc-900 text-white"
                          : "border-[var(--attio-border)] bg-white",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {paymentScope === "defer" && (
                  <div className="space-y-1.5">
                    <Label className="text-[12px]">Defer reason (this patient)</Label>
                    <Textarea
                      value={deferReason}
                      onChange={(e) => setDeferReason(e.target.value)}
                      placeholder="Corporate billing, package pending, authorization…"
                      className="min-h-[72px] text-[13px]"
                    />
                  </div>
                )}

                {paymentScope === "partial" && (
                  <div className="space-y-3">
                    <p className="text-[12px] text-[var(--attio-text-secondary)]">
                      Enter how much to collect now and which payment mode for each portion.
                    </p>
                    {paymentSplits.map((split, index) => (
                      <div key={index} className="grid gap-2 sm:grid-cols-[1fr_140px_32px]">
                        <div>
                          <Label className="text-[11px]">Amount (₹)</Label>
                          <Input
                            type="number"
                            min={0}
                            value={split.amount}
                            onChange={(e) => updateSplit(index, { amount: Number(e.target.value) || 0 })}
                            className="mt-1 h-9 text-[13px]"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px]">Payment mode</Label>
                          <Select
                            value={split.mode}
                            onValueChange={(v) => v && updateSplit(index, { mode: v })}
                          >
                            <SelectTrigger className="mt-1 h-9 text-[13px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PAYMENT_MODES.map((m) => (
                                <SelectItem key={m.value} value={m.value}>
                                  {m.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeSplit(index)}
                          className="self-end rounded p-1 text-[var(--attio-text-tertiary)] hover:bg-[var(--attio-hover)]"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    ))}
                    <AttioButton type="button" variant="secondary" className="h-8 gap-1 text-[11px]" onClick={addSplit}>
                      <Plus className="size-3.5" />
                      Add payment mode
                    </AttioButton>
                    <p className="text-[12px] text-[var(--attio-text-tertiary)]">
                      Collecting ₹{splitTotal.toLocaleString("en-IN")} of ₹{net.toLocaleString("en-IN")}
                      {balanceAfterPay > 0 && ` · Balance ₹${balanceAfterPay.toLocaleString("en-IN")} on ledger`}
                    </p>
                  </div>
                )}

                {paymentScope === "full" && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <Label className="text-[11px]">Payment mode</Label>
                      <Select
                        value={paymentSplits[0]?.mode ?? "cash"}
                        onValueChange={(v) => v && updateSplit(0, { mode: v, amount: net })}
                      >
                        <SelectTrigger className="mt-1 h-9 text-[13px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAYMENT_MODES.map((m) => (
                            <SelectItem key={m.value} value={m.value}>
                              {m.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[11px]">Amount collected</Label>
                      <Input value={net} readOnly className="mt-1 h-9 bg-[var(--attio-surface)] text-[13px]" />
                    </div>
                  </div>
                )}
              </Panel>

              <Panel title="Additional billing fields">
                <PublishedSchemaForm
                  schemaId="billing"
                  hideSubmit
                  onValuesChange={setBillingMeta}
                />
              </Panel>
            </>
          )}

          {skipBilling && (
            <Panel title="Skip billing — this patient">
              <Textarea
                value={deferReason}
                onChange={(e) => setDeferReason(e.target.value)}
                placeholder="Why is billing skipped for this patient? (required for audit)"
                className="min-h-[80px] text-[13px]"
              />
              <p className="mt-2 text-[12px] text-[var(--attio-text-tertiary)]">
                Patient will proceed to junior exam queue without payment collection.
              </p>
            </Panel>
          )}

          <AttioButton
            variant="primary"
            className="w-full sm:w-auto"
            disabled={!skipBilling && lines.length === 0}
            onClick={handleSubmit}
          >
            {skipBilling ? "Skip billing & release to queue" : submitLabel}
          </AttioButton>
        </>
      )}
    </div>
  );
}
