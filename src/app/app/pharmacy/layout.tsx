import { SchemaOverrideProvider } from "@/components/candela/schema-override-provider";
import { FrontdeskStoreProvider } from "@/components/frontdesk/frontdesk-store";
import { PharmacyShell } from "@/components/pharmacy/shell";
import { PharmacyStoreProvider } from "@/components/pharmacy/pharmacy-store";

export default function PharmacyLayout({ children }: { children: React.ReactNode }) {
  return (
    <SchemaOverrideProvider>
      <FrontdeskStoreProvider>
        <PharmacyStoreProvider>
          <PharmacyShell>{children}</PharmacyShell>
        </PharmacyStoreProvider>
      </FrontdeskStoreProvider>
    </SchemaOverrideProvider>
  );
}
