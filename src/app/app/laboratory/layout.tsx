import { LabShell } from "@/components/lab/lab-shell";
import { LabStoreProvider } from "@/components/lab/lab-store";

export default function LaboratoryLayout({ children }: { children: React.ReactNode }) {
  return (
    <LabStoreProvider>
      <LabShell>{children}</LabShell>
    </LabStoreProvider>
  );
}
