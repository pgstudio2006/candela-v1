import { compare } from "bcryptjs";
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { db } from "@/lib/db";
import { resolveEffectiveRoleForUser } from "@/server/admin/role-sync";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  branchId: z.string().optional(),
});

function roleKeyFromUser(user: {
  activeRole?: { key: string } | null;
  userRoles: { role: { key: string } }[];
}) {
  return user.activeRole?.key ?? user.userRoles[0]?.role.key ?? "frontdesk";
}

export const authConfig = {
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const email = parsed.data.email.trim().toLowerCase();
        const password = parsed.data.password;

        const user = await db.user.findFirst({
          where: {
            email,
            status: "ACTIVE",
            tenant: { active: true },
          },
          include: {
            tenant: true,
            branch: true,
            activeRole: true,
            userRoles: { include: { role: true } },
          },
        });

        if (!user || !user.passwordHash) return null;
        const valid = await compare(password, user.passwordHash);
        if (!valid) return null;

        let effectiveBranchId = user.branchId;
        if (parsed.data.branchId?.trim()) {
          const branchOk = await db.branch.findFirst({
            where: {
              id: parsed.data.branchId.trim(),
              tenantId: user.tenantId,
              active: true,
            },
          });
          if (!branchOk) return null;
          effectiveBranchId = branchOk.id;
          await db.user.update({
            where: { id: user.id },
            data: { branchId: branchOk.id },
          });
        }

        const sessionToken = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

        await db.session.create({
          data: {
            userId: user.id,
            tenantId: user.tenantId,
            branchId: effectiveBranchId,
            sessionToken,
            expiresAt,
            status: "ACTIVE",
          },
        });

        await db.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        const branchRecord =
          effectiveBranchId && effectiveBranchId !== user.branchId
            ? await db.branch.findUnique({ where: { id: effectiveBranchId } })
            : user.branch;

        const effectiveRole = await resolveEffectiveRoleForUser(
          user.id,
          effectiveBranchId ?? user.branchId ?? "",
        );

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          tenantId: user.tenantId,
          tenantSlug: user.tenant.slug,
          tenantName: user.tenant.name,
          branchId: effectiveBranchId ?? "",
          branchName: branchRecord?.name ?? "",
          role: effectiveRole,
          sessionToken,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.tenantId = user.tenantId;
        token.tenantSlug = user.tenantSlug;
        token.tenantName = user.tenantName;
        token.branchId = user.branchId;
        token.branchName = user.branchName;
        token.role = user.role;
        token.sessionToken = user.sessionToken;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId ?? "";
        session.user.tenantId = token.tenantId ?? "";
        session.user.tenantSlug = token.tenantSlug ?? "";
        session.user.tenantName = token.tenantName ?? "";
        session.user.branchId = token.branchId ?? "";
        session.user.branchName = token.branchName ?? "";
        session.user.role = token.role ?? "frontdesk";
        session.user.sessionToken = token.sessionToken ?? "";
      }
      return session;
    },
    async authorized({ auth, request }) {
      const isAppRoute = request.nextUrl.pathname.startsWith("/app");
      if (!isAppRoute) return true;
      return !!auth?.user;
    },
  },
  events: {
    async signOut(message) {
      const sessionToken =
        "token" in message
          ? message.token?.sessionToken
          : message.session?.sessionToken;
      if (!sessionToken) return;
      await db.session.updateMany({
        where: { sessionToken, status: "ACTIVE" },
        data: { status: "REVOKED", revokedAt: new Date() },
      });
    },
  },
} satisfies NextAuthConfig;
