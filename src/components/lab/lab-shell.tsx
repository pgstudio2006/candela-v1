"use client";

import { StoreGate } from "@/components/candela/store-gate";
import { useSession } from "@/components/candela/session-provider";
import { useRequireClientSession } from "@/hooks/use-require-client-session";
import { LabSidebar } from "@/components/lab/sidebar";
import { useLabStore } from "@/components/lab/lab-store";
import { WORKSPACE_SIGN_IN_PATH } from "@/lib/auth-storage";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function LabShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, signOut } = useSession();
  const { loading: sessionLoading } = useRequireClientSession();
  const { ready, error, refresh } = useLabStore();

  useEffect(() => {
    if (sessionLoading || !session) return;
    if (session.role !== "laboratory" && session.role !== "admin") {
      router.replace(`/app/${session.role}`);
    }
  }, [session, sessionLoading, router]);

  if (sessionLoading || !session) return null;

  const isAdmin = session.role === "admin";

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--attio-canvas)] text-[var(--attio-text)]" data-candela-app>
      <LabSidebar
        branchName={session.branchName}
        userName={session.userName}
        onSignOut={() => {
          signOut();
          router.push(WORKSPACE_SIGN_IN_PATH);
        }}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-[var(--attio-border-subtle)] bg-[var(--attio-surface)] px-6 py-2 text-[12px] text-[var(--attio-text-secondary)]">
          <div>
            <span className="font-medium">{session.userName}</span>
            <span className="mx-2">·</span>
            <span>{session.userEmail}</span>
          </div>
          {isAdmin && (
            <Link
              href="/app/admin"
              className="flex items-center gap-1.5 rounded-md bg-[var(--attio-active)] px-2 py-1 text-[12px] font-medium text-[var(--attio-text)] hover:bg-[var(--attio-hover)]"
            >
              <ArrowLeft className="size-3.5" />
              Back to Admin
            </Link>
          )}
        </div>
        <main className="scrollbar-none min-h-0 min-w-0 flex-1 overflow-y-auto">
          <StoreGate ready={ready} error={error} onRetry={() => void refresh()}>
            {children}
          </StoreGate>
        </main>
      </div>
    </div>
  );
}
