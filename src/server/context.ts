import { auth } from "@/auth";
import { db } from "@/lib/db";
import { ServerActionError } from "@/server/errors";

export type ServerContext = {
  userId: string;
  tenantId: string;
  branchId: string;
  branchName: string;
  role: string;
  sessionToken: string;
};

export async function getServerContext(): Promise<ServerContext> {
  const session = await auth();
  if (!session?.user) {
    throw new ServerActionError("UNAUTHORIZED", "Please sign in first.");
  }

  if (!session.user.tenantId || !session.user.branchId || !session.user.id) {
    throw new ServerActionError("INVALID_SESSION", "Session is missing tenant or branch context.");
  }

  if (session.user.sessionToken) {
    const dbSession = await db.session.findFirst({
      where: {
        sessionToken: session.user.sessionToken,
        status: "ACTIVE",
        userId: session.user.id,
      },
    });
    if (!dbSession) {
      // After deploy/db push the Session table may be empty while the JWT cookie is still valid.
      try {
        await db.session.create({
          data: {
            userId: session.user.id,
            tenantId: session.user.tenantId,
            branchId: session.user.branchId,
            sessionToken: session.user.sessionToken,
            expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
            status: "ACTIVE",
          },
        });
      } catch {
        throw new ServerActionError("UNAUTHORIZED", "Your session has expired. Please sign in again.");
      }
    }
  }

  const currentUser = await db.user.findUnique({
    where: { id: session.user.id },
    select: { activeRole: { select: { key: true } } },
  });

  return {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    branchId: session.user.branchId,
    branchName: session.user.branchName ?? "",
    role: currentUser?.activeRole?.key ?? session.user.role,
    sessionToken: session.user.sessionToken,
  };
}
