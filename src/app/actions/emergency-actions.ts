"use server";

import { runAction } from "@/server/action-result";
import { requireModule } from "@/server/auth";
import { getEmergencyVisits, registerEmergency } from "@/server/emergency";

export async function registerEmergencyAction(input: Parameters<typeof registerEmergency>[1]) {
  return runAction(async () => {
    const ctx = await requireModule("frontdesk");
    return registerEmergency(ctx, input);
  });
}

export async function getEmergencyVisitsAction() {
  return runAction(async () => {
    const ctx = await requireModule("frontdesk");
    return getEmergencyVisits(ctx);
  });
}
