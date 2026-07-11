"use client";

import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, Panel, StatusBadge } from "@/components/frontdesk/ui";
import {
  createIpdBedAction,
  createIpdWardAction,
  deleteIpdBedAction,
  deleteIpdWardAction,
  getIpdWardsAction,
  updateIpdBedAction,
  updateIpdWardAction,
} from "@/app/actions/ipd-actions";
import { useToast } from "@/components/ui/toast-provider";
import { useEffect, useState } from "react";
import type { IpdBedRow } from "@/design-system/ipd-data";

const CATEGORIES = ["general", "icu", "vip", "daycare"];

type WardRow = {
  id: string;
  label: string;
  category: string;
  active: boolean;
  beds: IpdBedRow[];
};

export default function AdminIpdPage() {
  const { toast } = useToast();
  const [wards, setWards] = useState<WardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showWardForm, setShowWardForm] = useState(false);
  const [wardForm, setWardForm] = useState({ label: "", category: "general" });
  const [editingWard, setEditingWard] = useState<WardRow | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [newBedLabel, setNewBedLabel] = useState<Record<string, string>>({});

  const load = () => {
    setLoading(true);
    getIpdWardsAction()
      .then((res) => {
        if (res.ok && res.data) setWards(res.data as WardRow[]);
        else toast((res as any).error || "Failed to load wards", "error");
      })
      .catch((err) => toast(err instanceof Error ? err.message : "Failed to load wards", "error"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const totalBeds = wards.reduce((sum, w) => sum + w.beds.filter((b) => b.active).length, 0);
  const occupiedBeds = wards.reduce((sum, w) => sum + w.beds.filter((b) => b.active && b.occupied).length, 0);

  const handleCreateWard = async () => {
    if (!wardForm.label.trim()) return toast("Ward name is required", "error");
    setBusy(true);
    const res = await createIpdWardAction(wardForm);
    if (res.ok) {
      toast("Ward created", "success");
      setWardForm({ label: "", category: "general" });
      setShowWardForm(false);
      load();
    } else toast((res as any).error || "Failed to create ward", "error");
    setBusy(false);
  };

  const handleUpdateWard = async () => {
    if (!editingWard) return;
    setBusy(true);
    const res = await updateIpdWardAction(editingWard.id, {
      label: editingWard.label,
      category: editingWard.category,
      active: editingWard.active,
    });
    if (res.ok) {
      toast("Ward updated", "success");
      setEditingWard(null);
      load();
    } else toast((res as any).error || "Failed to update ward", "error");
    setBusy(false);
  };

  const handleDeleteWard = async (id: string) => {
    if (!confirm("Delete this ward and all its beds?")) return;
    setBusy(true);
    const res = await deleteIpdWardAction(id);
    if (res.ok) {
      toast("Ward deleted", "success");
      load();
    } else toast((res as any).error || "Failed to delete ward", "error");
    setBusy(false);
  };

  const handleCreateBed = async (wardId: string) => {
    const label = newBedLabel[wardId]?.trim();
    if (!label) return toast("Bed label is required", "error");
    setBusy(true);
    const res = await createIpdBedAction(wardId, { label });
    if (res.ok) {
      toast("Bed added", "success");
      setNewBedLabel((prev) => ({ ...prev, [wardId]: "" }));
      load();
    } else toast((res as any).error || "Failed to add bed", "error");
    setBusy(false);
  };

  const handleToggleBed = async (bed: IpdBedRow) => {
    setBusy(true);
    const res = await updateIpdBedAction(bed.id, { active: !bed.active });
    if (res.ok) {
      toast(bed.active ? "Bed deactivated" : "Bed activated", "success");
      load();
    } else toast((res as any).error || "Failed to update bed", "error");
    setBusy(false);
  };

  const handleDeleteBed = async (id: string) => {
    if (!confirm("Delete this bed?")) return;
    setBusy(true);
    const res = await deleteIpdBedAction(id);
    if (res.ok) {
      toast("Bed deleted", "success");
      load();
    } else toast((res as any).error || "Failed to delete bed", "error");
    setBusy(false);
  };

  return (
    <PageChrome
      breadcrumbs={[{ label: "Admin", href: "/app/admin" }, { label: "IPD wards" }]}
      title="IPD wards & beds"
      meta="Create wards, manage beds, and view occupancy"
      actions={
        <AttioButton onClick={() => setShowWardForm(true)} disabled={busy}>
          + Add ward
        </AttioButton>
      }
    >
      <Panel title="Occupancy summary">
        <div className="grid gap-4 text-[13px] md:grid-cols-3">
          <div className="space-y-1">
            <p className="text-[var(--attio-text-tertiary)]">Total beds</p>
            <p className="text-[20px] font-semibold tabular-nums">{totalBeds}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[var(--attio-text-tertiary)]">Occupied</p>
            <p className="text-[20px] font-semibold tabular-nums text-red-600">{occupiedBeds}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[var(--attio-text-tertiary)]">Free</p>
            <p className="text-[20px] font-semibold tabular-nums text-green-600">{totalBeds - occupiedBeds}</p>
          </div>
        </div>
      </Panel>

      {showWardForm && (
        <Panel title="Add ward">
          <div className="grid gap-3 text-[13px] md:grid-cols-3">
            <input
              className="rounded-md border px-3 py-2"
              placeholder="Ward name (e.g. MSK Ward A)"
              value={wardForm.label}
              onChange={(e) => setWardForm({ ...wardForm, label: e.target.value })}
            />
            <select
              className="rounded-md border px-3 py-2"
              value={wardForm.category}
              onChange={(e) => setWardForm({ ...wardForm, category: e.target.value })}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c[0].toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <AttioButton onClick={handleCreateWard} disabled={busy}>
                Save
              </AttioButton>
              <AttioButton variant="secondary" onClick={() => setShowWardForm(false)} disabled={busy}>
                Cancel
              </AttioButton>
            </div>
          </div>
        </Panel>
      )}

      {editingWard && (
        <Panel title={`Edit ${editingWard.label}`}>
          <div className="grid gap-3 text-[13px] md:grid-cols-4">
            <input
              className="rounded-md border px-3 py-2"
              value={editingWard.label}
              onChange={(e) => setEditingWard({ ...editingWard, label: e.target.value })}
            />
            <select
              className="rounded-md border px-3 py-2"
              value={editingWard.category}
              onChange={(e) => setEditingWard({ ...editingWard, category: e.target.value })}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c[0].toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={editingWard.active}
                onChange={(e) => setEditingWard({ ...editingWard, active: e.target.checked })}
              />
              Active
            </label>
            <div className="flex gap-2">
              <AttioButton onClick={handleUpdateWard} disabled={busy}>
                Save
              </AttioButton>
              <AttioButton variant="secondary" onClick={() => setEditingWard(null)} disabled={busy}>
                Cancel
              </AttioButton>
            </div>
          </div>
        </Panel>
      )}

      {loading && (
        <Panel title="Loading">
          <p className="text-[13px] text-[var(--attio-text-tertiary)]">Loading wards…</p>
        </Panel>
      )}

      {!loading && wards.length === 0 && (
        <Panel title="No wards configured">
          <p className="text-[13px] text-[var(--attio-text-tertiary)]">
            Add your first ward to start managing IPD beds and occupancy.
          </p>
        </Panel>
      )}

      {!loading &&
        wards.map((ward) => (
          <Panel key={ward.id} title={`${ward.label} (${ward.category})`}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <StatusBadge label={ward.active ? "Active" : "Inactive"} variant={ward.active ? "success" : "neutral"} />
                <span className="text-[13px] text-[var(--attio-text-tertiary)]">
                  {ward.beds.filter((b) => b.active).length} beds · {ward.beds.filter((b) => b.occupied).length} occupied
                </span>
              </div>
              <div className="flex gap-2">
                <AttioButton variant="secondary" onClick={() => setEditingWard(ward)} disabled={busy}>
                  Edit ward
                </AttioButton>
                <AttioButton variant="secondary" onClick={() => handleDeleteWard(ward.id)} disabled={busy}>
                  Delete ward
                </AttioButton>
                <AttioButton
                  variant="secondary"
                  onClick={() =>
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(ward.id)) next.delete(ward.id);
                      else next.add(ward.id);
                      return next;
                    })
                  }
                >
                  {expanded.has(ward.id) ? "Collapse" : "Manage beds"}
                </AttioButton>
              </div>
            </div>

            {expanded.has(ward.id) && (
              <div className="space-y-2">
                {ward.beds.length === 0 && (
                  <p className="text-[13px] text-[var(--attio-text-tertiary)]">No beds yet in this ward.</p>
                )}
                {ward.beds.map((bed) => (
                  <div
                    key={bed.id}
                    className={`flex items-center justify-between rounded-lg border p-3 text-[13px] ${
                      bed.occupied ? "border-red-200 bg-red-50" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{bed.label}</span>
                      <StatusBadge label={bed.active ? "Active" : "Inactive"} variant={bed.active ? "success" : "neutral"} />
                      {bed.occupied && <StatusBadge label="Occupied" variant="danger" />}
                      {bed.admission && (
                        <span className="text-[var(--attio-text-tertiary)]">
                          · {bed.admission.patientName} · {bed.admission.doctorName}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <AttioButton variant="secondary" onClick={() => handleToggleBed(bed)} disabled={busy}>
                        {bed.active ? "Deactivate" : "Activate"}
                      </AttioButton>
                      <AttioButton variant="secondary" onClick={() => handleDeleteBed(bed.id)} disabled={busy}>
                        Delete
                      </AttioButton>
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-2">
                  <input
                    className="rounded-md border px-3 py-2 text-[13px]"
                    placeholder="New bed label"
                    value={newBedLabel[ward.id] ?? ""}
                    onChange={(e) => setNewBedLabel((prev) => ({ ...prev, [ward.id]: e.target.value }))}
                  />
                  <AttioButton onClick={() => handleCreateBed(ward.id)} disabled={busy}>
                    + Add bed
                  </AttioButton>
                </div>
              </div>
            )}
          </Panel>
        ))}
    </PageChrome>
  );
}
