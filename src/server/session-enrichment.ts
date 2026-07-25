import { prisma } from "@/lib/prisma";
import { ensureRevenueSeeded } from "@/server/revenue/bootstrap";

export type CompatSession = {
  tenant: string;
  tenantName: string;
  branchId: string;
  branchName: string;
  role: string;
  userName: string;
  userEmail: string;
  crmOperatorId?: string;
  pharmacyOperatorId?: string;
  hrOperatorId?: string;
};

/** Resolve module operator ids from DB so JWT-only session hydration works after refresh. */
export async function enrichCompatSession(session: CompatSession): Promise<CompatSession> {
  const email = session.userEmail?.trim().toLowerCase();
  if (!email) return session;

  const enriched = { ...session };

  try {
    const user = await prisma.user.findFirst({
      where: { email, tenant: { slug: session.tenant } },
      select: { activeRole: { select: { key: true } } },
    });
    if (user?.activeRole?.key) enriched.role = user.activeRole.key;


    if (enriched.role === "pharmacy" && !enriched.pharmacyOperatorId) {
      await ensureRevenueSeeded();
      const cred = await prisma.pharmacyOperatorCredential.findUnique({ where: { email } });
      if (cred?.active) enriched.pharmacyOperatorId = cred.id;
    }

    if (enriched.role === "crm" && !enriched.crmOperatorId) {
      await ensureRevenueSeeded();
      const cred = await prisma.crmOperatorCredential.findUnique({ where: { email } });
      if (cred?.active) enriched.crmOperatorId = cred.id;
    }

    if (enriched.role === "hr" && !enriched.hrOperatorId) {
      const employee = await prisma.hrEmployee.findFirst({
        where: { email, active: true },
        select: { id: true },
      });
      if (employee) enriched.hrOperatorId = employee.id;
    }
  } catch {
    // Table may not exist yet if prisma db push hasn't completed
  }

  return enriched;
}
