import { SchemaOverrideProvider } from "@/components/candela/schema-override-provider";
import { CrmShell } from "@/components/crm/shell";
import { CrmStoreProvider } from "@/components/crm/crm-store";
import { FrontdeskStoreProvider } from "@/components/frontdesk/frontdesk-store";

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <SchemaOverrideProvider>
      <FrontdeskStoreProvider>
        <CrmStoreProvider>
          <CrmShell>{children}</CrmShell>
        </CrmStoreProvider>
      </FrontdeskStoreProvider>
    </SchemaOverrideProvider>
  );
}
