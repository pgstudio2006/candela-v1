"use client";

import { useRequireClientSession } from "@/hooks/use-require-client-session";
import { canAccessPath, getWorkspace, roleForPath } from "@/design-system/workspace-config";
import type { CandelaRole } from "@/design-system/modules";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

/** Session guard only — workspace layouts provide their own shell */
export function AppShell({ children }: { children: ReactNode }) {
  const { session, loading } = useRequireClientSession();
  const router = useRouter();
  const pathname = usePathname();

  const hasOwnShell =
    pathname.startsWith("/app/frontdesk") ||
    pathname.startsWith("/app/doctor") ||
    pathname.startsWith("/app/counsellor") ||
    pathname.startsWith("/app/nurse") ||
    pathname.startsWith("/app/admin") ||
    pathname.startsWith("/app/crm") ||
    pathname.startsWith("/app/pharmacy") ||
    pathname.startsWith("/app/hr") ||
    pathname.startsWith("/app/laboratory");

  useEffect(() => {
    if (loading || !session) return;
    if (!hasOwnShell) {
      router.replace(getWorkspace(session.role as CandelaRole).homePath);
      return;
    }
    if (session.role !== "admin") {
      const pathRole = roleForPath(pathname);
      if (pathRole && !canAccessPath(session.role as CandelaRole, pathname)) {
        router.replace(getWorkspace(session.role as CandelaRole).homePath);
      }
    }
  }, [session, loading, hasOwnShell, pathname, router]);

  if (loading || !hasOwnShell) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Loading…
      </div>
    );
  }

  return <>{children}</>;
}
