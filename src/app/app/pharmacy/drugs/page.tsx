"use client";

import { usePharmacyStore } from "@/components/pharmacy/pharmacy-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, DataTable, StatusBadge } from "@/components/frontdesk/ui";
import { PharmacyDialog, PharmacyInput, PharmacySelect, FormRow } from "@/components/pharmacy/ui";
import type { Drug, DrugSchedule } from "@/design-system/pharmacy-data";
import { Trash2 } from "lucide-react";
import { useState } from "react";

const SCHEDULES: DrugSchedule[] = ["OTC"];

export default function PharmacyDrugsPage() {
  const { drugs, stock, addDrug, updateDrug, deleteDrug, isManager, isPurchase } = usePharmacyStore();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Drug | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Drug, "id">>({
    genericName: "",
    brandName: "",
    strength: "",
    form: "Tablet",
    route: "Oral",
    therapeuticClass: "",
    schedule: "OTC",
    hsn: "3004",
    gstPercent: 12,
    unit: "strip",
    reorderLevel: 20,
    requiresRx: true,
    coldChain: false,
    substitutes: [],
    active: true,
    defaultMrp: 100,
    purchasePrice: 0,
  });

  const canEdit = isManager() || isPurchase();
  const canDelete = isManager();
  const canAdd = true;

  const reset = () => {
    setSaveError(null);
    setForm({
      genericName: "",
      brandName: "",
      strength: "",
      form: "Tablet",
      route: "Oral",
      therapeuticClass: "",
      schedule: "OTC",
      hsn: "3004",
      gstPercent: 12,
      unit: "strip",
      reorderLevel: 20,
      requiresRx: true,
      coldChain: false,
      substitutes: [],
      active: true,
      defaultMrp: 100,
      purchasePrice: 0,
    });
    setSelected(null);
  };

  const save = async () => {
    if (!form.brandName || !form.genericName) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (selected) {
        await updateDrug(selected.id, form);
      } else {
        await addDrug(form);
      }
      setOpen(false);
      reset();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save drug");
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (d: Drug) => {
    setSelected(d);
    setForm({ ...d });
    setOpen(true);
  };

  return (
    <PageChrome
      breadcrumbs={[{ label: "Pharmacy", href: "/app/pharmacy" }, { label: "Drugs" }]}
      title="Drugs & formulary"
      meta="Generic · brand · Schedule H/H1 · HSN · GST · stock · suppliers"
      actions={
        canAdd ? (
          <AttioButton variant="primary" onClick={() => { reset(); setOpen(true); }}>
            Add drug
          </AttioButton>
        ) : undefined
      }
    >
      <DataTable
        columns={[
          { key: "brand", label: "Brand" },
          { key: "generic", label: "Generic" },
          { key: "strength", label: "Strength" },
          { key: "schedule", label: "Schedule" },
          { key: "stock", label: "Stock" },
          { key: "mrp", label: "MRP" },
          { key: "purchase", label: "Purchase" },
          { key: "reorder", label: "Reorder" },
          { key: "active", label: "Status" },
          { key: "actions", label: "" },
        ]}
        rows={drugs.map((d) => {
          const onHand = stock.filter((s) => s.drugId === d.id && !s.quarantined).reduce((n, s) => n + s.qtyOnHand, 0);
          return {
            brand: (
              <button type="button" className="text-left hover:underline" onClick={() => openEdit(d)}>
                {d.brandName}
              </button>
            ),
            generic: d.genericName,
            strength: `${d.strength} ${d.form}`,
            schedule: d.schedule,
            stock: `${onHand} ${d.unit}`,
            mrp: `₹${d.defaultMrp}`,
            purchase: `₹${d.purchasePrice ?? 0}`,
            reorder: d.reorderLevel,
            active: <StatusBadge label={d.active ? "Active" : "Inactive"} variant={d.active ? "success" : "neutral"} />,
            actions: (
              <div className="flex items-center gap-3">
                {canEdit && (
                  <button type="button" className="text-[12px] text-[var(--attio-accent)] hover:underline" onClick={() => openEdit(d)}>
                    Edit
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    className="text-red-600 hover:text-red-700"
                    title="Delete drug"
                    onClick={() => {
                      if (window.confirm(`Delete ${d.brandName}? This cannot be undone.`)) {
                        void deleteDrug(d.id).catch((err: Error) => alert(err.message));
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            ),
          };
        })}
      />

      {open && (
        <PharmacyDialog
          open={open}
          title={selected ? `Edit ${selected.brandName}` : "Add drug"}
          subtitle="Formulary entry"
          onClose={() => { setOpen(false); reset(); }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <FormRow label="Brand name" required>
              <PharmacyInput value={form.brandName} onChange={(e) => setForm({ ...form, brandName: e.target.value })} placeholder="Brand name" />
            </FormRow>
            <FormRow label="Generic name" required>
              <PharmacyInput value={form.genericName} onChange={(e) => setForm({ ...form, genericName: e.target.value })} placeholder="Generic name" />
            </FormRow>
            <FormRow label="Strength / power" required>
              <PharmacyInput value={form.strength} onChange={(e) => setForm({ ...form, strength: e.target.value })} placeholder="e.g. 75mg" />
            </FormRow>
            <FormRow label="Form" required>
              <PharmacySelect value={form.form} onChange={(e) => setForm({ ...form, form: e.target.value })}>
                <option>Tablet</option>
                <option>Capsule</option>
                <option>Injection</option>
                <option>Syrup</option>
                <option>Sachet</option>
                <option>Cream</option>
                <option>Ointment</option>
                <option>Drops</option>
                <option>Inhaler</option>
                <option>Patch</option>
              </PharmacySelect>
            </FormRow>
            <FormRow label="Route" required>
              <PharmacySelect value={form.route} onChange={(e) => setForm({ ...form, route: e.target.value })}>
                <option>Oral</option>
                <option>IV</option>
                <option>IM</option>
                <option>SC</option>
                <option>Topical</option>
                <option>Inhalation</option>
                <option>Sublingual</option>
              </PharmacySelect>
            </FormRow>
            <FormRow label="Therapeutic class" required>
              <PharmacyInput value={form.therapeuticClass} onChange={(e) => setForm({ ...form, therapeuticClass: e.target.value })} placeholder="e.g. Analgesic" />
            </FormRow>
            <FormRow label="Schedule" required>
              <PharmacySelect value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value as DrugSchedule })}>
                {SCHEDULES.map((s) => <option key={s} value={s}>{s}</option>)}
              </PharmacySelect>
            </FormRow>
            <FormRow label="HSN" required>
              <PharmacyInput value={form.hsn} onChange={(e) => setForm({ ...form, hsn: e.target.value })} placeholder="3004" />
            </FormRow>
            <FormRow label="GST %" required>
              <PharmacyInput type="number" value={form.gstPercent} onChange={(e) => setForm({ ...form, gstPercent: Number(e.target.value) })} placeholder="12" />
            </FormRow>
            <FormRow label="Unit" required>
              <PharmacySelect value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                <option value="strip">strip</option>
                <option value="bottle">bottle</option>
                <option value="tube">tube</option>
                <option value="tab">tab</option>
                <option value="vial">vial</option>
                <option value="sachet">sachet</option>
                <option value="ml">ml</option>
                <option value="gm">gm</option>
              </PharmacySelect>
            </FormRow>
            <FormRow label="Default MRP" required>
              <PharmacyInput type="number" value={form.defaultMrp} onChange={(e) => setForm({ ...form, defaultMrp: Number(e.target.value) })} placeholder="100" />
            </FormRow>
            <FormRow label="Purchase price" required>
              <PharmacyInput type="number" value={form.purchasePrice ?? 0} onChange={(e) => setForm({ ...form, purchasePrice: Number(e.target.value) })} placeholder="80" />
            </FormRow>
            <FormRow label="Reorder level" required>
              <PharmacyInput type="number" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: Number(e.target.value) })} placeholder="20" />
            </FormRow>
            <FormRow label="Requires Rx">
              <PharmacySelect value={form.requiresRx ? "yes" : "no"} onChange={(e) => setForm({ ...form, requiresRx: e.target.value === "yes" })}>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </PharmacySelect>
            </FormRow>
            <FormRow label="Cold chain">
              <PharmacySelect value={form.coldChain ? "yes" : "no"} onChange={(e) => setForm({ ...form, coldChain: e.target.value === "yes" })}>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </PharmacySelect>
            </FormRow>
            <FormRow label="Active">
              <PharmacySelect value={form.active ? "yes" : "no"} onChange={(e) => setForm({ ...form, active: e.target.value === "yes" })}>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </PharmacySelect>
            </FormRow>
          </div>
          {saveError && (
            <p className="mt-3 text-[13px] text-red-600">{saveError}</p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <AttioButton variant="secondary" onClick={() => { setOpen(false); reset(); }} disabled={saving}>Cancel</AttioButton>
            <AttioButton variant="primary" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</AttioButton>
          </div>
        </PharmacyDialog>
      )}
    </PageChrome>
  );
}
