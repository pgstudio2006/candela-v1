"use server";

import { requireAnyModule } from "@/server/auth";
import { runAction, type ActionResult } from "@/server/action-result";
import { readPharmacyWorkspace } from "@/server/workspace-state";
import { defaultPharmacyState } from "@/server/revenue/state-seeds";
import type { Drug, StockBatch } from "@/design-system/pharmacy-data";

export type PharmacyDrugOption = {
  id: string;
  brandName: string;
  genericName?: string;
  strength?: string;
  schedule?: string;
  stock: number;
  defaultMrp: number;
  gstPercent: number;
};

export async function getPharmacyDrugsForDoctorAction(): Promise<ActionResult<PharmacyDrugOption[]>> {
  return runAction(async () => {
    const ctx = await requireAnyModule("doctor", "pharmacy");
    const state = await readPharmacyWorkspace(ctx, () => defaultPharmacyState({}));

    const stockMap = state.stock
      .filter((s) => !s.quarantined)
      .reduce((acc, batch) => {
        acc.set(batch.drugId, (acc.get(batch.drugId) ?? 0) + batch.qtyOnHand);
        return acc;
      }, new Map<string, number>());

    return state.drugs.map((d) => ({
      id: d.id,
      brandName: d.brandName,
      genericName: d.genericName,
      strength: d.strength,
      schedule: d.schedule,
      stock: stockMap.get(d.id) ?? 0,
      defaultMrp: d.defaultMrp ?? 0,
      gstPercent: d.gstPercent ?? 0,
    }));
  });
}
