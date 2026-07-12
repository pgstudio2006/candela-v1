import { PharmacyStoreProvider } from "@/components/pharmacy/pharmacy-store";

export default function AdminPharmacyLayout({ children }: { children: React.ReactNode }) {
  return <PharmacyStoreProvider>{children}</PharmacyStoreProvider>;
}
