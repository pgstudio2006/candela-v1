"use client";

import { StoreGate } from "@/components/candela/store-gate";
import { useCrmStore } from "@/components/crm/crm-store";
import { CrmCommandPalette } from "@/components/crm/command-palette";
import { CrmOperatorBanner } from "@/components/crm/operator-picker";
import { CrmSidebar } from "@/components/crm/sidebar";
import { useCrmPoll } from "@/hooks/use-crm-poll";
import { useSession } from "@/components/candela/session-provider";
import { useRequireClientSession } from "@/hooks/use-require-client-session";
import { CopilotPanel } from "@/components/frontdesk/copilot-panel";
import { CRM_NAV } from "@/design-system/crm-nav";
import { getCrmNavItem } from "@/design-system/crm-nav";
import { WORKSPACE_SIGN_IN_PATH } from "@/lib/auth-storage";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

export function CrmShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, signOut, setCommandOpen, commandOpen } = useSession();
  const { loading: sessionLoading } = useRequireClientSession();
  const { ready, error, refresh, isManager } = useCrmStore();
  const [copilotOpen, setCopilotOpen] = useState(false);
  const current = getCrmNavItem(pathname);

  useCrmPoll();

  useEffect(() => {
    if (sessionLoading || !session) return;
    if (session.role !== "crm") {
      router.replace(`/app/${session.role}`);
      return;
    }
    if (!session.crmOperatorId) {
      router.replace("/workspace");
    }
  }, [session, sessionLoading, router]);

  useEffect(() => {
    if (!session?.crmOperatorId) return;
    const manager = isManager();
    if (!manager) {
      const blocked = CRM_NAV.find((n) => n.managerOnly && pathname.startsWith(n.href));
      if (blocked) router.replace("/app/crm");
    }
  }, [pathname, session?.crmOperatorId, router, isManager]);

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

  if (sessionLoading || !session?.crmOperatorId) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--attio-canvas)] text-[var(--attio-text)]" data-candela-app>
      <CrmSidebar
        branchName={session.branchName}
        userName={session.userName}
        userEmail={session.userEmail}
        copilotOpen={copilotOpen}
        onToggleCopilot={() => setCopilotOpen((o) => !o)}
        onOpenCommand={() => setCommandOpen(true)}
        onSignOut={() => {
          signOut();
          router.push(WORKSPACE_SIGN_IN_PATH);
        }}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <CrmOperatorBanner />
        <main className="scrollbar-none min-h-0 min-w-0 flex-1 overflow-y-auto">
          <StoreGate ready={ready} error={error} onRetry={() => void refresh()}>
            {children}
          </StoreGate>
        </main>
      </div>
      <CopilotPanel open={copilotOpen} onClose={() => setCopilotOpen(false)} context={current.label} />
      <CrmCommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
    </div>
  );
}
