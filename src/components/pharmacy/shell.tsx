"use client";

import { StoreGate } from "@/components/candela/store-gate";
import { usePharmacyStore } from "@/components/pharmacy/pharmacy-store";
import { PharmacyCommandPalette } from "@/components/pharmacy/command-palette";
import { PharmacySidebar } from "@/components/pharmacy/sidebar";
import { PHARMACY_MANAGER_ID } from "@/components/pharmacy/pharmacy-store";
import { usePharmacyPoll } from "@/hooks/use-pharmacy-poll";
import { useSession } from "@/components/candela/session-provider";
import { useRequireClientSession } from "@/hooks/use-require-client-session";
import { CopilotPanel } from "@/components/frontdesk/copilot-panel";
import { getPharmacyNavItem } from "@/design-system/pharmacy-nav";
import { PHARMACY_NAV } from "@/design-system/pharmacy-nav";
import { WORKSPACE_SIGN_IN_PATH } from "@/lib/auth-storage";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

export function PharmacyShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, signOut, setCommandOpen, commandOpen } = useSession();
  const { loading: sessionLoading } = useRequireClientSession();
  const { ready, error, refresh } = usePharmacyStore();
  usePharmacyPoll();
  const [copilotOpen, setCopilotOpen] = useState(false);
  const current = getPharmacyNavItem(pathname);
  const isAdmin = session?.role === "admin";
  const effectiveOperatorId = session?.pharmacyOperatorId ?? (isAdmin ? PHARMACY_MANAGER_ID : "");

  useEffect(() => {
    if (sessionLoading || !session) return;
    if (session.role !== "pharmacy" && !isAdmin) {
      router.replace(`/app/${session.role}`);
      return;
    }
    if (!session.pharmacyOperatorId && !isAdmin) {
      router.replace("/workspace");
    }
  }, [session, sessionLoading, router, isAdmin]);

  useEffect(() => {
    if (!effectiveOperatorId) return;
    const manager = effectiveOperatorId === PHARMACY_MANAGER_ID;
    if (!manager) {
      const blocked = PHARMACY_NAV.find((n) => n.managerOnly && !n.purchaseOnly && pathname.startsWith(n.href));
      if (blocked) router.replace("/app/pharmacy");
    }
  }, [pathname, effectiveOperatorId, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandOpen(!commandOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commandOpen, setCommandOpen]);

  if (sessionLoading || !session || !effectiveOperatorId) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--attio-canvas)] text-[var(--attio-text)]" data-candela-app>
      <PharmacySidebar
        branchName={session.branchName}
        userName={session.userName}
        copilotOpen={copilotOpen}
        onToggleCopilot={() => setCopilotOpen((o) => !o)}
        onOpenCommand={() => setCommandOpen(true)}
        onSignOut={() => {
          signOut();
          router.push(WORKSPACE_SIGN_IN_PATH);
        }}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="border-b border-[var(--attio-border-subtle)] bg-[var(--attio-surface)] px-6 py-2 text-[12px] text-[var(--attio-text-secondary)]">
          <span className="font-medium">{session.userName}</span>
          <span className="mx-2">·</span>
          <span>{session.userEmail}</span>
        </div>
        <main className="scrollbar-none min-h-0 min-w-0 flex-1 overflow-y-auto">
          <StoreGate ready={ready} error={error} onRetry={() => void refresh()}>
            {children}
          </StoreGate>
        </main>
      </div>
      <CopilotPanel open={copilotOpen} onClose={() => setCopilotOpen(false)} context={current.label} />
      <PharmacyCommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
    </div>
  );
}
