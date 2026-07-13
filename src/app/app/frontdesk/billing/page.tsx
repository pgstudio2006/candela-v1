"use client";

import { getVisitForBillingAction } from "@/app/actions/clinical-actions";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

function BillingDispatcher() {
  const router = useRouter();
  const params = useSearchParams();
  const visitParam = params.get("visit");

  useEffect(() => {
    if (!visitParam) {
      router.replace("/app/frontdesk/opd-billing");
      return;
    }

    let cancelled = false;
    void getVisitForBillingAction(visitParam).then((res) => {
      if (cancelled) return;
      const visit = res?.visit;
      const isIpd = visit?.treatmentPath === "ipd" || Boolean(visit?.ipdAdmissionId);
      router.replace(`/app/frontdesk/${isIpd ? "ipd" : "opd"}-billing?visit=${visitParam}`);
    });

    return () => {
      cancelled = true;
    };
  }, [visitParam, router]);

  return null;
}

export default function BillingPage() {
  return (
    <Suspense>
      <BillingDispatcher />
    </Suspense>
  );
}
