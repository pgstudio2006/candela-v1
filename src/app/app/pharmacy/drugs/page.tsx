"use client";

import { usePharmacyStore } from "@/components/pharmacy/pharmacy-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, DataTable, StatusBadge } from "@/components/frontdesk/ui";
import { PharmacyDialog, PharmacyInput, PharmacySelect, FormRow } from "@/components/pharmacy/ui";
import type { Drug, DrugSchedule } from "@/design-system/pharmacy-data";
import { useState } from "react";

const SCHEDULES: DrugSchedule[] = ["OTC", "H", "H1", "X"];

export default function PharmacyDrugsPage() {
  const { drugs, stock, addDrug, updateDrug, isManager, isPurchase } = usePharmacyStore();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Drug | null>(null);
  const [form, setForm] = useState<Omit<Drug, "id">>({
    genericName: "",
    brandName: "",
    strength: "",
    form: "Tablet",
    route: "Oral",
    therapeuticClass: "",
    schedule: "H",
    hsn: "3004",
    gstPercent: 12,
    unit: "strip",
    reorderLevel: 20,
    requiresRx: true,
    coldChain: false,
    substitutes: [],
    active: true,
    defaultMrp: 100,
  });

  const canEdit = isManager() || isPurchase();
  const canAdd = true;

  const reset = () => {
    setForm({
      genericName: "",
      brandName: "",
      strength: "",
      form: "Tablet",
      route: "Oral",
      therapeuticClass: "",
      schedule: "H",
      hsn: "3004",
      gstPercent: 12,
      unit: "strip",
      reorderLevel: 20,
      requiresRx: true,
      coldChain: false,
      substitutes: [],
      active: true,
      defaultMrp: 100,
    });
    setSelected(null);
  };

  const save = () => {
    if (!form.brandName || !form.genericName) return;
    if (selected) {
      void updateDrug(selected.id, form).then(() => { setOpen(false); reset(); });
    } else {
      void addDrug(form).then(() => { setOpen(false); reset(); });
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
            reorder: d.reorderLevel,
            active: <StatusBadge label={d.active ? "Active" : "Inactive"} variant={d.active ? "success" : "neutral"} />,
            actions: canEdit ? (
              <button type="button" className="text-[12px] text-[var(--attio-accent)] hover:underline" onClick={() => openEdit(d)}>
                Edit
              </button>
            ) : null,
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
          <div className="mt-4 flex justify-end gap-2">
            <AttioButton variant="secondary" onClick={() => { setOpen(false); reset(); }}>Cancel</AttioButton>
            <AttioButton variant="primary" onClick={save}>Save</AttioButton>
          </div>
        </PharmacyDialog>
      )}
    </PageChrome>
  );
}
