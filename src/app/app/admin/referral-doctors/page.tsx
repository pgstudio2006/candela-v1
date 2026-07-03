"use client";

import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, Panel, StatusBadge } from "@/components/frontdesk/ui";
import { useAdminStore } from "@/components/admin/admin-store";
import { useToast } from "@/components/ui/toast-provider";
import type { ReferralDoctor } from "@/design-system/admin-data";
import { useState } from "react";
import Link from "next/link";

export default function ReferralDoctorsPage() {
  const { referralDoctors, addReferralDoctor, updateReferralDoctor, removeReferralDoctor } = useAdminStore();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ReferralDoctor | null>(null);
  const [busy, setBusy] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    clinicName: "",
    address: "",
    specialization: "",
    commissionPercent: 0,
    active: true,
    notes: "",
  });

  const resetForm = () => {
    setFormData({
      name: "",
      phone: "",
      email: "",
      clinicName: "",
      address: "",
      specialization: "",
      commissionPercent: 0,
      active: true,
      notes: "",
    });
    setEditing(null);
    setShowForm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    setBusy(true);
    try {
      const payload = {
        ...formData,
        name: formData.name.trim(),
        commissionPercent: Number(formData.commissionPercent) || 0,
      };
      if (editing) {
        await updateReferralDoctor(editing.id, payload);
        toast("Referral source updated", "success");
      } else {
        await addReferralDoctor(payload);
        toast("Referral source added", "success");
      }
      resetForm();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to save referral source", "error");
    } finally {
      setBusy(false);
    }
  };

  const handleEdit = (doctor: ReferralDoctor) => {
    setEditing(doctor);
    setFormData({
      name: doctor.name,
      phone: doctor.phone ?? "",
      email: doctor.email ?? "",
      clinicName: doctor.clinicName ?? "",
      address: doctor.address ?? "",
      specialization: doctor.specialization ?? "",
      commissionPercent: doctor.commissionPercent,
      active: doctor.active,
      notes: doctor.notes ?? "",
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this referral source?")) return;
    setBusy(true);
    try {
      await removeReferralDoctor(id);
      toast("Referral source removed", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to remove referral source", "error");
    } finally {
      setBusy(false);
    }
  };

  const handleToggleActive = async (doctor: ReferralDoctor) => {
    try {
      await updateReferralDoctor(doctor.id, { active: !doctor.active });
      toast(doctor.active ? "Referral source deactivated" : "Referral source activated", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to update referral source", "error");
    }
  };

  return (
    <PageChrome
      breadcrumbs={[{ label: "Admin", href: "/app/admin" }, { label: "Referral sources" }]}
      title="Referral sources"
      meta="Configure referring doctors · Drive registration dropdown · Track commissions"
      actions={
        <AttioButton variant="primary" onClick={() => setShowForm(true)}>
          Add referral source
        </AttioButton>
      }
    >
      {showForm && (
        <Panel title={editing ? "Edit referral source" : "Add referral source"}>
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 text-[13px]">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                Doctor name
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="mt-1 h-9 w-full rounded-lg border px-3"
                />
              </label>
              <label className="block">
                Phone
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="mt-1 h-9 w-full rounded-lg border px-3"
                />
              </label>
              <label className="block">
                Email
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="mt-1 h-9 w-full rounded-lg border px-3"
                />
              </label>
              <label className="block">
                Clinic name
                <input
                  type="text"
                  value={formData.clinicName}
                  onChange={(e) => setFormData({ ...formData, clinicName: e.target.value })}
                  className="mt-1 h-9 w-full rounded-lg border px-3"
                />
              </label>
              <label className="block md:col-span-2">
                Address
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="mt-1 h-9 w-full rounded-lg border px-3"
                />
              </label>
              <label className="block">
                Specialization
                <input
                  type="text"
                  value={formData.specialization}
                  onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
                  className="mt-1 h-9 w-full rounded-lg border px-3"
                />
              </label>
              <label className="block">
                Commission %
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={formData.commissionPercent}
                  onChange={(e) => setFormData({ ...formData, commissionPercent: Number(e.target.value) })}
                  className="mt-1 h-9 w-full rounded-lg border px-3"
                />
              </label>
            </div>
            <label className="block">
              Notes
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="mt-1 h-20 w-full rounded-lg border px-3"
              />
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
              />
              Active
            </label>
            <div className="flex gap-2">
              <AttioButton type="submit" variant="primary" disabled={busy}>
                {editing ? "Update" : "Add"} source
              </AttioButton>
              <AttioButton type="button" variant="secondary" disabled={busy} onClick={resetForm}>
                Cancel
              </AttioButton>
            </div>
          </form>
        </Panel>
      )}

      {referralDoctors.length === 0 && !showForm && (
        <Panel title="No referral sources">
          <p className="text-[13px] text-[var(--attio-text-tertiary)]">
            No referral sources have been added yet. Click "Add referral source" to get started. The dropdown on the front-desk registration form will show all active sources plus "Other" and "None".
          </p>
        </Panel>
      )}

      {referralDoctors.length > 0 && (
        <Panel title="Referral sources">
          <div className="space-y-2">
            {referralDoctors.map((doctor) => (
              <div
                key={doctor.id}
                className="flex items-center justify-between rounded-lg border p-3 text-[13px]"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{doctor.name}</p>
                    <StatusBadge label={doctor.active ? "Active" : "Inactive"} variant={doctor.active ? "success" : "neutral"} />
                  </div>
                  <p className="mt-1 text-[var(--attio-text-tertiary)]">
                    {doctor.clinicName && `${doctor.clinicName} · `}
                    {doctor.specialization && `${doctor.specialization} · `}
                    {doctor.phone && doctor.phone}
                    {doctor.address && ` · ${doctor.address}`}
                  </p>
                  <p className="mt-1 text-[var(--attio-accent)]">Commission: {doctor.commissionPercent}%</p>
                </div>
                <div className="flex gap-2">
                  <Link href={`/app/admin/referral-doctors/${doctor.id}`}>
                    <AttioButton variant="secondary">View patients</AttioButton>
                  </Link>
                  <AttioButton variant="secondary" onClick={() => handleEdit(doctor)} disabled={busy}>
                    Edit
                  </AttioButton>
                  <AttioButton variant="secondary" onClick={() => void handleToggleActive(doctor)} disabled={busy}>
                    {doctor.active ? "Deactivate" : "Activate"}
                  </AttioButton>
                  <AttioButton variant="secondary" onClick={() => void handleDelete(doctor.id)} disabled={busy}>
                    Delete
                  </AttioButton>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </PageChrome>
  );
}
