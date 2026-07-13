"use client";

import { BillingWorkspace } from "@/components/frontdesk/billing-workspace";
import { Suspense } from "react";

function OpdBillingContent() {
  return (
    <BillingWorkspace
      mode="opd"
      defaultTitle="OPD Billing"
      defaultMeta="Search patient · add branch packages · GST · split payment · release to queue"
    />
  );
}

export default function OpdBillingPage() {
  return (
    <Suspense>
      <OpdBillingContent />
    </Suspense>
  );
}
