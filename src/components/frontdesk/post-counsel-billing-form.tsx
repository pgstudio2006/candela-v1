"use client";

import type { CounselBillingInput } from "@/components/frontdesk/frontdesk-store";
import { PublishedSchemaForm } from "@/components/candela/published-schema-form";
import { AttioButton, Panel, StatusBadge } from "@/components/frontdesk/ui";
import type { BillingHandoffPayload } from "@/design-system/counsellor-data";
import {
  billingFromPayment,
  resolvePostCounselRoute,
  type PaymentScope,
} from "@/lib/billing-routing";
import { IPD_WARD_OPTIONS } from "@/lib/ipd-sync";
import { cn } from "@/lib/utils";
import { ArrowRight, BedDouble, CreditCard, Wallet } from "lucide-react";
import { useMemo, useState } from "react";

type PostCounselBillingFormProps = {
  handoff: BillingHandoffPayload;
  onSubmit: (input: CounselBillingInput) => void;
};

const PAYMENT_MODES = [
  { value: "upi", label: "UPI" },
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "corporate", label: "Corporate" },
  { value: "split", label: "Split" },
];

export function PostCounselBillingForm({ handoff, onSubmit }: PostCounselBillingFormProps) {
  const net = handoff.quote.netAmount;
  const defaultIpd =
    handoff.admissionRecommended ||
    handoff.treatmentMode === "ipd" ||
    handoff.treatmentMode === "daycare" ||
    handoff.quote.lineItems.some((l) => l.id === "addon_ipd_day");

  const [paymentScope, setPaymentScope] = useState<PaymentScope>(
    handoff.paymentExpectation === "corporate" ? "defer" : "full",
  );
  const [collectedAmount, setCollectedAmount] = useState(Math.round(net * 0.5));
  const [mode, setMode] = useState(handoff.paymentExpectation === "corporate" ? "corporate" : "upi");
  const [convertToIpd, setConvertToIpd] = useState(defaultIpd);
  const [wardId, setWardId] = useState(IPD_WARD_OPTIONS[0]?.id ?? "msk_a");
  const [bed, setBed] = useState(IPD_WARD_OPTIONS[0]?.beds[0] ?? "A-14");
  const [deferReason, setDeferReason] = useState("");
  const [billingMeta, setBillingMeta] = useState<Record<string, string | number | boolean>>({});

  const ward = IPD_WARD_OPTIONS.find((w) => w.id === wardId) ?? IPD_WARD_OPTIONS[0];
  const collected =
    paymentScope === "partial" ? Math.min(net, Math.max(0, collectedAmount)) : paymentScope === "defer" ? 0 : net;
  const balance = Math.max(0, net - collected);

  const routePreview = useMemo(
    () =>
      resolvePostCounselRoute({
        paymentScope,
        convertToIpd,
        netAmount: net,
        collected,
        patientId: handoff.patientId,
        visitId: handoff.visitId,
      }),
    [paymentScope, convertToIpd, net, collected, handoff.patientId, handoff.visitId],
  );

  const billingStatus = billingFromPayment(paymentScope, mode);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[var(--attio-border)] bg-[var(--attio-surface)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--attio-text-tertiary)]">
              Counsellor package
            </p>
            <p className="mt-1 text-[15px] font-semibold">{handoff.quote.packageLabel}</p>
            <p className="mt-1 text-[12px] text-[var(--attio-text-secondary)]">
              {handoff.doctorName} · {handoff.counsellorName}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[22px] font-semibold tabular-nums text-[var(--attio-accent)]">
              ₹{net.toLocaleString("en-IN")}
            </p>
            {handoff.quote.discountPercent > 0 && (
              <p className="text-[11px] text-emerald-600">{handoff.quote.discountPercent}% counsellor discount applied</p>
            )}
          </div>
        </div>
        <ul className="mt-3 space-y-1 border-t border-[var(--attio-border-subtle)] pt-3">
          {handoff.quote.lineItems.map((line) => (
            <li key={line.id} className="flex justify-between text-[12px] text-[var(--attio-text-secondary)]">
              <span>
                {line.label}
                {line.quantity > 1 && <span className="ml-1 text-[11px] text-[var(--attio-text-tertiary)]">×{line.quantity}</span>}
              </span>
              <span className="tabular-nums">₹{(line.amount * line.quantity).toLocaleString("en-IN")}</span>
            </li>
          ))}
        </ul>
        {handoff.counselNotes && (
          <p className="mt-3 rounded-lg bg-white px-3 py-2 text-[12px] text-[var(--attio-text-secondary)]">
            {handoff.counselNotes}
          </p>
        )}
      </div>

      <div>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--attio-text-tertiary)]">
          Payment scope
        </p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: "full" as const, label: "Full payment", icon: Wallet },
              { id: "partial" as const, label: "Partial", icon: CreditCard },
              { id: "defer" as const, label: "Defer", icon: ArrowRight },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setPaymentScope(id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12px] font-medium transition-colors",
                paymentScope === id
                  ? "border-[var(--attio-accent)] bg-[var(--attio-accent)]/10 text-[var(--attio-accent)]"
                  : "border-[var(--attio-border)] bg-white hover:bg-[var(--attio-surface)]",
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {paymentScope === "partial" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-[12px]">
            <span className="mb-1 block text-[var(--attio-text-tertiary)]">Amount collected now</span>
            <input
              type="number"
              min={0}
              max={net}
              value={collectedAmount}
              onChange={(e) => setCollectedAmount(Number(e.target.value))}
              className="h-9 w-full rounded-lg border border-[var(--attio-border)] px-3 tabular-nums"
            />
          </label>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-[11px] text-amber-800">Balance due</p>
            <p className="text-[18px] font-semibold tabular-nums text-amber-900">₹{balance.toLocaleString("en-IN")}</p>
          </div>
        </div>
      )}

      {paymentScope !== "defer" && (
        <label className="block text-[12px]">
          <span className="mb-1 block text-[var(--attio-text-tertiary)]">Payment mode</span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="h-9 w-full rounded-lg border border-[var(--attio-border)] bg-white px-3"
          >
            {PAYMENT_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {paymentScope === "defer" && (
        <label className="block text-[12px]">
          <span className="mb-1 block text-[var(--attio-text-tertiary)]">Defer reason</span>
          <textarea
            value={deferReason}
            onChange={(e) => setDeferReason(e.target.value)}
            rows={2}
            placeholder="Corporate PO pending, family approval, EMI setup…"
            className="w-full rounded-lg border border-[var(--attio-border)] px-3 py-2"
          />
        </label>
      )}

      <div className="rounded-xl border border-[var(--attio-border)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--attio-text-tertiary)]">
              Treatment routing
            </p>
            <p className="mt-1 text-[13px] font-medium">Convert OPD package toward IPD admission?</p>
            <p className="mt-0.5 text-[11px] text-[var(--attio-text-tertiary)]">
              {handoff.admissionRecommended
                ? "Doctor / counsellor flagged admission — IPD pre-selected"
                : "Optional — for daycare or ward-based care packages"}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={convertToIpd}
            onClick={() => setConvertToIpd((v) => !v)}
            className={cn(
              "relative h-6 w-11 shrink-0 rounded-full transition-colors",
              convertToIpd ? "bg-[var(--attio-accent)]" : "bg-[var(--attio-border)]",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform",
                convertToIpd ? "translate-x-5" : "translate-x-0.5",
              )}
            />
          </button>
        </div>

        {convertToIpd && (
          <div className="mt-4 grid gap-3 border-t border-[var(--attio-border-subtle)] pt-4 sm:grid-cols-2">
            <label className="block text-[12px]">
              <span className="mb-1 block text-[var(--attio-text-tertiary)]">Ward</span>
              <select
                value={wardId}
                onChange={(e) => {
                  const next = IPD_WARD_OPTIONS.find((w) => w.id === e.target.value);
                  setWardId(e.target.value);
                  if (next) setBed(next.beds[0] ?? "");
                }}
                className="h-9 w-full rounded-lg border border-[var(--attio-border)] bg-white px-3"
              >
                {IPD_WARD_OPTIONS.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[12px]">
              <span className="mb-1 block text-[var(--attio-text-tertiary)]">Bed</span>
              <select
                value={bed}
                onChange={(e) => setBed(e.target.value)}
                className="h-9 w-full rounded-lg border border-[var(--attio-border)] bg-white px-3"
              >
                {ward.beds.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>

      <Panel
        title="Routing preview"
        action={
          <StatusBadge
            label={billingStatus}
            variant={billingStatus === "paid" ? "success" : billingStatus === "partial" ? "warning" : "info"}
          />
        }
      >
        <div className="flex items-start gap-3">
          {convertToIpd ? (
            <BedDouble className="mt-0.5 size-4 text-[var(--attio-accent)]" />
          ) : (
            <ArrowRight className="mt-0.5 size-4 text-[var(--attio-accent)]" />
          )}
          <div>
            <p className="text-[13px] font-medium">{routePreview.routingLabel}</p>
            <p className="mt-1 text-[12px] text-[var(--attio-text-secondary)]">{routePreview.routingNote}</p>
          </div>
        </div>
      </Panel>

      <Panel title="Additional billing fields">
        <PublishedSchemaForm schemaId="billing" hideSubmit onValuesChange={setBillingMeta} />
      </Panel>

      <AttioButton
        variant="primary"
        className="w-full sm:w-auto"
        onClick={() =>
          onSubmit({
            paymentScope,
            collectedAmount: collected,
            mode,
            convertToIpd,
            ward: ward.label,
            bed,
            deferReason: deferReason || undefined,
            handoff,
            ...billingMeta,
          })
        }
      >
        {convertToIpd ? "Admit & close billing" : "Collect & activate package"}
      </AttioButton>
    </div>
  );
}
