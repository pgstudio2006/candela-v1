"use client";

import { BillingWorkspace } from "@/components/frontdesk/billing-workspace";
import { Suspense } from "react";

function IpdBillingContent() {
  return (
    <BillingWorkspace
      mode="ipd"
      defaultTitle="IPD Billing"
      defaultMeta="Admitted patient services · cart charges · pharmacy · GST · payment"
    />
  );
}

export default function IpdBillingPage() {
  return (
    <Suspense>
      <IpdBillingContent />
    </Suspense>
  );
}
