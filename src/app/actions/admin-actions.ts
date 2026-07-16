"use server";

import { runAction, type ActionResult } from "@/server/action-result";
import { requireModule } from "@/server/auth";
import { getAdminRevenueCollection, type RevenueCollectionResult } from "@/server/admin/revenue";

export async function getAdminRevenueCollectionAction(date: string): Promise<ActionResult<RevenueCollectionResult>> {
  return runAction(async () => {
    const ctx = await requireModule("admin");
    const parsed = new Date(date);
    if (isNaN(parsed.getTime())) {
      throw new Error("Invalid date");
    }
    return getAdminRevenueCollection(ctx, parsed, 30);
  });
}
