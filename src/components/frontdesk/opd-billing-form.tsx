"use client";

import { PublishedSchemaForm } from "@/components/candela/published-schema-form";
import { PatientSearchField } from "@/components/frontdesk/patient-search-field";
import { AttioButton, Panel } from "@/components/frontdesk/ui";
import type { Patient, Visit } from "@/design-system/frontdesk-data";
import type { LabReportCatalog } from "@/design-system/lab-data";
import type { PaymentScope } from "@/lib/billing-routing";
import {
  formatPackagePrice,
  fetchBillingPackagesFromAPI,
  fetchServiceChargesFromAPI,
  type BillingPackage,
} from "@/lib/billing-packages";
import { getVisitBillingAction } from "@/app/actions/clinical-actions";
import { getIpdCartAction } from "@/app/actions/ipd-actions";
import {
  createLabOrderFromModuleAction,
  getPendingLabOrdersForVisitAction,
  listActiveLabCatalogsAction,
} from "@/app/actions/lab-actions";
import { useToast } from "@/components/ui/toast-provider";
import { computeGstInvoice } from "@/lib/gst-invoicing";
import type { BillingPackageLine, PaymentSplit } from "@/lib/opd-billing";
import { resolveBillingDiscount } from "@/lib/opd-billing";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Plus, Trash2, X, Search, Package as PackageIcon, FlaskConical } from "lucide-react";
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
    description: pkg.description,
    gstRatePercent: pkg.gstPercent,
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
  submitLabel = "Collect payment & generate invoice",
}: OpdBillingFormProps) {
  const [packages, setPackages] = useState<BillingPackage[]>([]);
  const [services, setServices] = useState<BillingPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [packageSearch, setPackageSearch] = useState("");
  const [serviceSearch, setServiceSearch] = useState("");
  const [serviceCategory, setServiceCategory] = useState("");
  const [labCatalogs, setLabCatalogs] = useState<LabReportCatalog[]>([]);
  const [labLoading, setLabLoading] = useState(false);
  const [labSearch, setLabSearch] = useState("");
  const [selectedLabCatalogId, setSelectedLabCatalogId] = useState("");
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>("");

  const serviceCategories = useMemo(
    () => Array.from(new Set(services.map((s) => s.category).filter((c): c is string => Boolean(c)))).sort(),
    [services],
  );

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const [pkgs, svcs, labs] = await Promise.all([
        fetchBillingPackagesFromAPI(branchId),
        fetchServiceChargesFromAPI(branchId),
        listActiveLabCatalogsAction(),
      ]);
      setPackages(pkgs);
      setServices(svcs);
      if (labs.ok) setLabCatalogs(labs.data ?? []);
      setLoading(false);
      setLabLoading(false);
    };
    void loadData();
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
  const [previousPayments, setPreviousPayments] = useState<PaymentSplit[]>([]);
  const [existingInvoice, setExistingInvoice] = useState<null | Awaited<ReturnType<typeof getVisitBillingAction>>>(null);
  const [isBalancePayment, setIsBalancePayment] = useState(false);
  const [billingMeta, setBillingMeta] = useState<Record<string, string | number | boolean>>({});

  const { toast } = useToast();

  // Reset local billing state when the visit changes so stale service lines
  // from a prior patient/visit do not leak into the current bill.
  useEffect(() => {
    setLines([]);
    setDiscount(0);
    setDiscountPercent(0);
    setGstRatePercent(0);
    setGstTaxMode("exempt");
    setPaymentScope("full");
    setSkipBilling(false);
    setDeferReason("");
    setPaymentSplits([{ mode: "cash", amount: 0 }]);
    setPreviousPayments([]);
    setExistingInvoice(null);
    setIsBalancePayment(false);
    setBillingMeta({});
    setSelectedLabCatalogId("");
    setLabSearch("");
    setServiceCategory("");
  }, [visit?.id]);

  // Auto-load pending lab orders for the current OPD visit into the billing cart.
  useEffect(() => {
    if (!visit?.id || visit.ipdAdmissionId || existingInvoice || lines.length > 0) return;
    let cancelled = false;
    void getPendingLabOrdersForVisitAction(visit.id).then((res) => {
      if (cancelled) return;
      if (res.ok && res.data?.length) {
        const pendingLines: SelectedLine[] = [];
        for (const order of res.data) {
          for (const item of order.items) {
            if (item.status !== "pending_billing") continue;
            const liveService = item.reportCatalog?.service;
            pendingLines.push({
              key: `lab_${item.id}_${Date.now()}`,
              packageId: item.serviceId ?? `lab-${item.reportCatalogId}`,
              label: item.label,
              amount: liveService?.rate ?? item.price ?? 0,
              quantity: 1,
              description: `Lab order #${order.id}`,
              category: liveService?.category ?? "Laboratory",
              gstRatePercent: liveService?.gstPercent ?? item.gstPercent,
              labOrderItemId: item.id,
              labOrderId: order.id,
            });
          }
        }
        if (pendingLines.length) setLines((prev) => [...prev, ...pendingLines]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [visit?.id, visit?.ipdAdmissionId, existingInvoice]);

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
      gstRatePercent: l.gstRatePercent,
      category: l.category,
    })),
    discount: discountAmount,
  });
  const previousBalance = Number(visit?.balanceDue ?? 0);
  const net = gstBreakdown.grandTotal;
  const splitTotal = paymentSplits.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const payingNow = skipBilling || paymentScope === "defer" ? 0 : splitTotal;
  const totalDue =
    paymentScope === "full" || paymentScope === "defer"
      ? net + (isBalancePayment ? previousBalance : 0)
      : net > 0
        ? net
        : previousBalance;
  const remainingAfterPayment = Math.max(0, totalDue - payingNow);

  const updateSplit = (index: number, patch: Partial<PaymentSplit>) => {
    setPaymentSplits((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const addSplit = () => {
    setPaymentSplits((prev) => [...prev, { mode: "cash", amount: 0 }]);
  };

  const removeSplit = (index: number) => {
    setPaymentSplits((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  // Keep full-payment amount in sync with the total due (current bill + previous balance).
  useEffect(() => {
    if (skipBilling || paymentScope === "defer" || paymentScope !== "full") return;
    setPaymentSplits((prev) => {
      const mode = prev[0]?.mode ?? "cash";
      if (prev.length === 1 && prev[0].amount === totalDue && prev[0].mode === mode) return prev;
      return [{ mode, amount: totalDue }];
    });
  }, [paymentScope, totalDue, skipBilling]);

  useEffect(() => {
    if (!visit?.ipdAdmissionId || lines.length > 0) return;
    let cancelled = false;
    void getIpdCartAction(visit.ipdAdmissionId).then((res) => {
      if (cancelled) return;
      if (res.ok && res.data?.length) {
        setLines(
          res.data.map((item: { packageId: string; label: string; amount: number; quantity: number }) => ({
            packageId: item.packageId,
            label: item.label,
            amount: item.amount,
            quantity: item.quantity,
            key: `${item.packageId}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          })),
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [visit?.ipdAdmissionId]);

  useEffect(() => {
    if (!visit?.id) {
      setExistingInvoice(null);
      setPreviousPayments([]);
      setIsBalancePayment(false);
      return;
    }
    let cancelled = false;
    void getVisitBillingAction(visit.id).then((inv) => {
      if (cancelled) return;
      const balanceDue = Number(visit?.balanceDue ?? 0);
      const amountPaid = Number(visit?.amountPaid ?? 0);
      const billing = visit?.billing;
      const hasBalance = balanceDue > 0 || billing === "partial" || Boolean(inv && (inv.status === "partial" || inv.balanceAmount > 0));
      setIsBalancePayment(hasBalance);

      if (hasBalance) {
        setPreviousPayments([{ mode: "previous", amount: amountPaid }]);
        setExistingInvoice(inv && (inv.status === "partial" || inv.balanceAmount > 0) ? inv : null);
        if (balanceDue > 0 && lines.length === 0) {
          setPaymentScope("partial");
          setPaymentSplits([{ mode: inv?.paymentMode || "cash", amount: balanceDue }]);
        }
      } else if (inv && (inv.status === "partial" || inv.balanceAmount > 0)) {
        setExistingInvoice(inv);
        // Same guard: only drop stale lines for OPD, not IPD cart-based billing.
        if (!visit?.ipdAdmissionId) setLines([]);
        setPreviousPayments(inv.paymentSplits);
        if (inv.discountMode) {
          setDiscountMode(inv.discountMode);
          if (inv.discountMode === "percent") setDiscountPercent(inv.discountPercent ?? 0);
          else setDiscount(inv.discount ?? 0);
        }
        if (inv.gst && typeof inv.gst === "object") {
          const g = inv.gst as Record<string, unknown>;
          setGstRatePercent(Number(g.gstRatePercent ?? 0));
          const taxMode = String(g.taxMode ?? "exempt");
          setGstTaxMode(taxMode === "cgst_sgst" || taxMode === "igst" ? (taxMode as typeof gstTaxMode) : "exempt");
        }
        setPaymentScope("partial");
        setPaymentSplits([{ mode: inv.paymentMode || "cash", amount: inv.balanceAmount }]);
      } else {
        setExistingInvoice(null);
        setPreviousPayments([]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [visit?.id, visit?.amountPaid, visit?.balanceDue, visit?.billing]);

  const handleAddLabOrder = async () => {
    if (!selectedLabCatalogId || !patient || !visit) return;
    const catalog = labCatalogs.find((c) => c.id === selectedLabCatalogId);
    if (!catalog) return;
    setLabLoading(true);
    try {
      const res = await createLabOrderFromModuleAction({
        patientId: patient.id,
        visitId: visit.id,
        source: visit.ipdAdmissionId ? "ipd" : "opd",
        items: [
          {
            reportCatalogId: catalog.id,
            label: catalog.name,
            sampleType: catalog.sampleType,
          },
        ],
      });
      if (!res.ok) {
        toast(res.error ?? "Failed to create lab order", "error");
        return;
      }
      const order = res.data;
      const item = order.items.find((i) => i.reportCatalogId === catalog.id);
      if (!item) {
        toast("Lab order item not found", "error");
        return;
      }
      const service = item.reportCatalog?.service;
      setLines((prev) => [
        ...prev,
        {
          key: `lab_${item.id}_${Date.now()}`,
          packageId: item.serviceId ?? service?.id ?? `lab-${item.reportCatalogId}`,
          label: item.label,
          amount: service?.rate != null ? Number(service.rate) : item.price ?? 0,
          quantity: 1,
          description: `Lab order #${order.id}`,
          category: service?.category ?? "Laboratory",
          gstRatePercent: service?.gstPercent ?? item.gstPercent,
          labOrderItemId: item.id,
          labOrderId: order.id,
        },
      ]);
      setSelectedLabCatalogId("");
      toast("Lab order added to bill", "success");
    } finally {
      setLabLoading(false);
    }
  };

  const handleSubmit = () => {
    if (!patient || !visit) return;
    if (!skipBilling && !lines.length && !isBalancePayment) return;
    if (!skipBilling && paymentScope !== "defer" && splitTotal === 0) return;

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
            : [{ mode: paymentSplits[0]?.mode ?? "cash", amount: splitTotal }],
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
                {patient.referralDoctorName && (
                  <p className="mt-1 text-[12px] text-[var(--attio-text-secondary)]">
                    Referral: {patient.referralDoctorName}
                  </p>
                )}
                {patient.corporateId && (
                  <p className="mt-1 text-[12px] text-[var(--attio-text-secondary)]">
                    Corporate / Insurance ID: {patient.corporateId}
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
                disabled={Boolean(existingInvoice)}
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
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-[12px]">Select service</Label>
                  <select
                    value={serviceCategory}
                    disabled={Boolean(existingInvoice)}
                    onChange={(e) => setServiceCategory(e.target.value)}
                    className="h-9 w-full rounded-md border px-2 text-[13px]"
                  >
                    <option value="">All categories</option>
                    {serviceCategories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <Select
                    value=""
                    disabled={Boolean(existingInvoice)}
                    onValueChange={(value) => {
                      const svc = services.find((s) => s.id === value);
                      if (svc) setLines((prev) => [...prev, lineFromPackage(svc)]);
                    }}
                  >
                    <SelectTrigger className="h-9 text-[13px]">
                      <SelectValue placeholder="Search and select service..." />
                    </SelectTrigger>
                    <SelectContent className="min-w-[320px]">
                      <div className="sticky top-0 z-10 bg-popover px-2 py-2">
                        <Input
                          type="text"
                          placeholder="Search services..."
                          value={serviceSearch}
                          onChange={(e) => setServiceSearch(e.target.value)}
                          onKeyDown={(e) => e.stopPropagation()}
                          onKeyUp={(e) => e.stopPropagation()}
                          className="h-8 text-[12px]"
                        />
                      </div>
                      {Object.entries(
                        services
                          .filter((svc: BillingPackage) =>
                            (!serviceCategory || svc.category === serviceCategory) &&
                            (svc.label.toLowerCase().includes(serviceSearch.toLowerCase()) ||
                              (svc.description && svc.description.toLowerCase().includes(serviceSearch.toLowerCase())))
                          )
                          .reduce((acc, svc) => {
                            (acc[svc.category] ??= []).push(svc);
                            return acc;
                          }, {} as Record<string, BillingPackage[]>)
                      ).map(([category, group]) => (
                        <SelectGroup key={category}>
                          <SelectLabel className="text-[11px] font-semibold uppercase text-[var(--attio-text-tertiary)]">{category}</SelectLabel>
                          {group.map((svc) => (
                            <SelectItem
                              key={svc.id}
                              value={svc.id}
                              className="py-3 [&>[data-slot=select-item-text]]:whitespace-normal"
                            >
                              <div className="flex flex-col gap-0.5">
                                <p className="text-[13px] font-medium leading-tight">{svc.label}</p>
                                {svc.description && (
                                  <p className="text-[11px] text-[var(--attio-text-tertiary)] leading-tight">{svc.description}</p>
                                )}
                                <p className="text-[12px] font-semibold text-[var(--attio-accent)]">{formatPackagePrice(svc)}</p>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[12px]">Select package</Label>
                  <Select
                    value=""
                    disabled={Boolean(existingInvoice)}
                    onValueChange={(value) => {
                      const pkg = packages.find((p) => p.id === value);
                      if (pkg) setLines((prev) => [...prev, lineFromPackage(pkg)]);
                    }}
                  >
                    <SelectTrigger className="h-9 text-[13px]">
                      <SelectValue placeholder="Search and select package..." />
                    </SelectTrigger>
                    <SelectContent className="min-w-[320px]">
                      <div className="sticky top-0 z-10 bg-popover px-2 py-2">
                        <Input
                          type="text"
                          placeholder="Search packages..."
                          value={packageSearch}
                          onChange={(e) => setPackageSearch(e.target.value)}
                          onKeyDown={(e) => e.stopPropagation()}
                          onKeyUp={(e) => e.stopPropagation()}
                          className="h-8 text-[12px]"
                        />
                      </div>
                      {packages
                        .filter((pkg: BillingPackage) =>
                          pkg.label.toLowerCase().includes(packageSearch.toLowerCase()) ||
                          (pkg.description && pkg.description.toLowerCase().includes(packageSearch.toLowerCase()))
                        )
                        .map((pkg: BillingPackage) => (
                          <SelectItem
                            key={pkg.id}
                            value={pkg.id}
                            className="py-3 [&>[data-slot=select-item-text]]:whitespace-normal"
                          >
                            <div className="flex flex-col gap-0.5">
                              <p className="text-[13px] font-medium leading-tight">{pkg.label}</p>
                              {pkg.description && (
                                <p className="text-[11px] text-[var(--attio-text-tertiary)] leading-tight">{pkg.description}</p>
                              )}
                              <p className="text-[12px] font-semibold text-[var(--attio-accent)]">{formatPackagePrice(pkg)}</p>
                            </div>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Panel title="Lab orders">
                <div className="space-y-3">
                  <p className="text-[12px] text-[var(--attio-text-secondary)]">
                    Price is taken from the lab catalog&apos;s linked admin service charge.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-[1fr_100px]">
                    <Select
                      value={selectedLabCatalogId}
                      disabled={Boolean(existingInvoice) || labLoading}
                      onValueChange={(value) => {
                        setSelectedLabCatalogId(value ?? "");
                      }}
                    >
                      <SelectTrigger className="h-9 text-[13px]">
                        <SelectValue placeholder={labLoading ? "Loading labs…" : "Select lab test…"} />
                      </SelectTrigger>
                      <SelectContent className="min-w-[320px]">
                        <div className="sticky top-0 z-10 bg-popover px-2 py-2">
                          <Input
                            type="text"
                            placeholder="Search lab tests..."
                            value={labSearch}
                            onChange={(e) => setLabSearch(e.target.value)}
                            onKeyDown={(e) => e.stopPropagation()}
                            onKeyUp={(e) => e.stopPropagation()}
                            className="h-8 text-[12px]"
                          />
                        </div>
                        {labCatalogs
                          .filter((c) =>
                            c.name.toLowerCase().includes(labSearch.toLowerCase()) ||
                            c.code.toLowerCase().includes(labSearch.toLowerCase())
                          )
                          .map((c) => (
                            <SelectItem key={c.id} value={c.id} className="py-3">
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-[13px] font-medium leading-tight">{c.name}</p>
                                  <p className="text-[12px] font-semibold text-[var(--attio-accent)]">
                                    {c.service?.rate != null ? `₹${Number(c.service.rate).toLocaleString("en-IN")}` : "No price"}
                                  </p>
                                </div>
                                <p className="text-[11px] text-[var(--attio-text-tertiary)]">{c.code} · {c.service?.label ?? "No service linked"}</p>
                              </div>
                            </SelectItem>
                          ))}
                        {labCatalogs.filter((c) =>
                          c.name.toLowerCase().includes(labSearch.toLowerCase()) ||
                          c.code.toLowerCase().includes(labSearch.toLowerCase())
                        ).length === 0 && (
                          <p className="px-2 py-2 text-[12px] text-[var(--attio-text-tertiary)]">No lab tests match.</p>
                        )}
                      </SelectContent>
                    </Select>
                    <AttioButton
                      variant="secondary"
                      disabled={Boolean(existingInvoice) || !selectedLabCatalogId || labLoading}
                      onClick={() => void handleAddLabOrder()}
                    >
                      {labLoading ? "Creating…" : "Add"}
                    </AttioButton>
                  </div>
                </div>
              </Panel>

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
                          <p className="text-[11px] text-[var(--attio-text-tertiary)]">
                            {line.packageId}
                            {(line.category === "Laboratory" || line.category === "lab") && (
                              <span className="ml-1.5 rounded bg-blue-100 px-1 py-0.5 text-[10px] text-blue-700">Lab</span>
                            )}
                          </p>
                        </div>
                        <div>
                          <Label className="text-[11px]">Qty</Label>
                          <Input
                            type="number"
                            min={1}
                            readOnly={Boolean(existingInvoice)}
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
                            readOnly={Boolean(existingInvoice)}
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
                          disabled={Boolean(existingInvoice)}
                          onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                          className="self-end rounded p-1 text-red-600 hover:bg-red-50 disabled:opacity-40"
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
                      readOnly={Boolean(existingInvoice)}
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
                      readOnly={Boolean(existingInvoice)}
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
                    readOnly={Boolean(existingInvoice)}
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
                    disabled={Boolean(existingInvoice)}
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

              {(!isBalancePayment || lines.length > 0) && (
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
              )}

              <Panel title="Outstanding summary">
                <div className="space-y-1 text-[13px]">
                  <div className="flex justify-between">
                    <span className="text-[var(--attio-text-secondary)]">Current bill</span>
                    <span className="tabular-nums">₹{net.toLocaleString("en-IN")}</span>
                  </div>
                  {isBalancePayment && previousBalance > 0 && (
                    <div className="flex justify-between">
                      <span className="text-[var(--attio-text-secondary)]">Previous balance</span>
                      <span className="tabular-nums">₹{previousBalance.toLocaleString("en-IN")}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-[var(--attio-border)] pt-2 text-[15px] font-semibold">
                    <span>Total due</span>
                    <span className="tabular-nums">₹{totalDue.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between text-[var(--attio-text-secondary)]">
                    <span>Paying now</span>
                    <span className="tabular-nums">
                      {skipBilling || paymentScope === "defer" ? "—" : `₹${payingNow.toLocaleString("en-IN")}`}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-[var(--attio-border)] pt-2 font-semibold">
                    <span>Remaining after payment</span>
                    <span className={cn("tabular-nums", remainingAfterPayment > 0 ? "text-amber-600" : "text-emerald-600")}>
                      {skipBilling || paymentScope === "defer" ? "Deferred" : `₹${remainingAfterPayment.toLocaleString("en-IN")}`}
                    </span>
                  </div>
                </div>
                {paymentScope === "partial" && (
                  <p className="mt-3 text-[11px] text-[var(--attio-text-tertiary)]">
                    Invoice is generated only when the current bill is fully paid.
                  </p>
                )}
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
                      Collecting ₹{splitTotal.toLocaleString("en-IN")} of total due ₹
                      {totalDue.toLocaleString("en-IN")}
                      {remainingAfterPayment > 0 && ` · Remaining after payment ₹${remainingAfterPayment.toLocaleString("en-IN")}`}
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
                      <Input value={totalDue} readOnly className="mt-1 h-9 bg-[var(--attio-surface)] text-[13px]" />
                    </div>
                  </div>
                )}
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
            disabled={!skipBilling && lines.length === 0 && !isBalancePayment}
            onClick={handleSubmit}
          >
            {skipBilling
              ? "Skip billing & release to queue"
              : isBalancePayment && !lines.length
                ? "Collect balance"
                : paymentScope === "partial"
                  ? "Collect partial payment"
                  : paymentScope === "defer"
                    ? "Defer billing & release to queue"
                    : submitLabel}
          </AttioButton>
        </>
      )}
    </div>
  );
}
