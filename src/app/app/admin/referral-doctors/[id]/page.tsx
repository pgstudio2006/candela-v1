"use client";

import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, Panel, StatusBadge } from "@/components/frontdesk/ui";
import { getReferralDoctorWithPatientsAction } from "@/app/actions/clinical-actions";
import { useToast } from "@/components/ui/toast-provider";
import { useEffect, useState } from "react";
import Link from "next/link";

type RouteParams = { id: string };

type ReferredPatient = {
  id: string;
  uhid: string;
  name: string;
  phone: string;
  firstVisitAt: string;
  lastVisitAt: string;
  totalBilled: number;
  totalPaid: number;
  commissionEstimate: number;
};

type ReferralProfile = {
  doctor: {
    id: string;
    name: string;
    phone?: string;
    email?: string;
    clinicName?: string;
    address?: string;
    specialization?: string;
    commissionPercent: number;
    active: boolean;
    notes?: string;
  };
  patients: ReferredPatient[];
  totalBilled: number;
  totalPaid: number;
  totalCommission: number;
};

export default function ReferralDoctorDetailPage({ params }: { params: Promise<RouteParams> }) {
  const { toast } = useToast();
  const [paramsResolved, setParamsResolved] = useState<RouteParams | null>(null);
  const [profile, setProfile] = useState<ReferralProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void params.then((p) => setParamsResolved(p));
  }, [params]);

  const id = paramsResolved?.id ?? "";

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getReferralDoctorWithPatientsAction(id)
      .then((res) => {
        if (res.ok && res.data) {
          const data = res.data as ReferralProfile;
          setProfile(data);
        } else {
          toast((res as any).error || "Could not load referral doctor profile", "error");
        }
      })
      .catch((err) => toast(err instanceof Error ? err.message : "Failed to load profile", "error"))
      .finally(() => setLoading(false));
  }, [id, toast]);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <PageChrome
      breadcrumbs={[
        { label: "Admin", href: "/app/admin" },
        { label: "Referral sources", href: "/app/admin/referral-doctors" },
        { label: profile?.doctor.name ?? "Profile" },
      ]}
      title={profile?.doctor.name ?? "Referral doctor profile"}
      meta="Referred patients · Billing totals · Commission estimate"
      actions={
        <Link href="/app/admin/referral-doctors">
          <AttioButton variant="secondary">Back to sources</AttioButton>
        </Link>
      }
    >
      {loading && (
        <Panel title="Loading">
          <p className="text-[13px] text-[var(--attio-text-tertiary)]">Loading profile…</p>
        </Panel>
      )}

      {!loading && !profile && (
        <Panel title="Not found">
          <p className="text-[13px] text-[var(--attio-text-tertiary)]">
            This referral source was not found or is not accessible from your branch.
          </p>
        </Panel>
      )}

      {profile && (
        <>
          <Panel title="Doctor details">
            <div className="grid gap-4 text-[13px] md:grid-cols-2">
              <div className="space-y-1">
                <p className="text-[var(--attio-text-tertiary)]">Name</p>
                <p className="font-medium">{profile.doctor.name}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[var(--attio-text-tertiary)]">Commission</p>
                <p className="font-medium">{profile.doctor.commissionPercent}%</p>
              </div>
              {profile.doctor.phone && (
                <div className="space-y-1">
                  <p className="text-[var(--attio-text-tertiary)]">Phone</p>
                  <p>{profile.doctor.phone}</p>
                </div>
              )}
              {profile.doctor.email && (
                <div className="space-y-1">
                  <p className="text-[var(--attio-text-tertiary)]">Email</p>
                  <p>{profile.doctor.email}</p>
                </div>
              )}
              {profile.doctor.clinicName && (
                <div className="space-y-1">
                  <p className="text-[var(--attio-text-tertiary)]">Clinic</p>
                  <p>{profile.doctor.clinicName}</p>
                </div>
              )}
              {profile.doctor.specialization && (
                <div className="space-y-1">
                  <p className="text-[var(--attio-text-tertiary)]">Specialization</p>
                  <p>{profile.doctor.specialization}</p>
                </div>
              )}
              <div className="space-y-1 md:col-span-2">
                <p className="text-[var(--attio-text-tertiary)]">Status</p>
                <StatusBadge label={profile.doctor.active ? "Active" : "Inactive"} variant={profile.doctor.active ? "success" : "neutral"} />
              </div>
            </div>
          </Panel>

          <Panel title="Summary">
            <div className="grid gap-4 text-[13px] md:grid-cols-3">
              <div className="space-y-1">
                <p className="text-[var(--attio-text-tertiary)]">Referred patients</p>
                <p className="text-[20px] font-semibold tabular-nums">{profile.patients.length}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[var(--attio-text-tertiary)]">Total billed</p>
                <p className="text-[20px] font-semibold tabular-nums">₹{profile.totalBilled.toLocaleString("en-IN")}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[var(--attio-text-tertiary)]">Commission estimate</p>
                <p className="text-[20px] font-semibold tabular-nums text-[var(--attio-accent)]">
                  ₹{profile.totalCommission.toLocaleString("en-IN")}
                </p>
              </div>
            </div>
          </Panel>

          {profile.patients.length === 0 && (
            <Panel title="No referred patients yet">
              <p className="text-[13px] text-[var(--attio-text-tertiary)]">
                No patients have been registered with this referral source yet.
              </p>
            </Panel>
          )}

          {profile.patients.length > 0 && (
            <Panel title="Referred patients">
              <div className="space-y-2">
                {profile.patients.map((patient) => (
                  <div key={patient.id} className="rounded-lg border p-3 text-[13px]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{patient.name}</p>
                        <p className="text-[var(--attio-text-tertiary)]">
                          {patient.uhid} · {patient.phone}
                        </p>
                      </div>
                      <Link href={`/app/admin/patients/${patient.id}`}>
                        <AttioButton variant="secondary">View</AttioButton>
                      </Link>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      <p className="text-[var(--attio-text-tertiary)]">
                        First visit: <span className="text-[var(--attio-text)]">{formatDate(patient.firstVisitAt)}</span>
                      </p>
                      <p className="text-[var(--attio-text-tertiary)]">
                        Billed: <span className="text-[var(--attio-text)]">₹{patient.totalBilled.toLocaleString("en-IN")}</span>
                      </p>
                      <p className="text-[var(--attio-text-tertiary)]">
                        Commission: <span className="text-[var(--attio-accent)]">₹{patient.commissionEstimate.toLocaleString("en-IN")}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </>
      )}
    </PageChrome>
  );
}
