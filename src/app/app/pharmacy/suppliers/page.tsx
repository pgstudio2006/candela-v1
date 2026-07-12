"use client";

import { usePharmacyStore } from "@/components/pharmacy/pharmacy-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, DataTable, StatusBadge, Panel } from "@/components/frontdesk/ui";
import { PharmacyDialog, PharmacyInput, PharmacySelect, PharmacyTextarea, FormRow } from "@/components/pharmacy/ui";
import type { Supplier } from "@/design-system/pharmacy-data";
import { Trash2 } from "lucide-react";
import { useState } from "react";

export default function PharmacySuppliersPage() {
  const { suppliers, drugs, stock, purchaseOrders, addSupplier, updateSupplier, deleteSupplier, isManager, isPurchase } = usePharmacyStore();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Supplier | null>(null);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<{ 
    name: string; 
    company: string;
    gstin: string; 
    drugLicense: string; 
    contactPerson: string; 
    phone: string; 
    mobile: string;
    email: string; 
    address: string; 
    paymentTerms: string; 
    credit: number;
    type: "wholesaler" | "manufacturer" | "distributor";
    additionalDetails: string;
    preferred: boolean; 
    active: boolean;
  }>({ 
    name: "", 
    company: "",
    gstin: "", 
    drugLicense: "", 
    contactPerson: "", 
    phone: "", 
    mobile: "",
    email: "", 
    address: "", 
    paymentTerms: "Net 30", 
    credit: 0,
    type: "wholesaler",
    additionalDetails: "",
    preferred: false, 
    active: true 
  });

  const canDelete = isManager();

  if (!isManager() && !isPurchase()) {
    return (
      <PageChrome breadcrumbs={[{ label: "Pharmacy", href: "/app/pharmacy" }, { label: "Suppliers" }]} title="Suppliers" meta="Purchase team only">
        <p className="text-[13px] text-[var(--attio-text-secondary)]">Supplier management requires purchase or manager access.</p>
      </PageChrome>
    );
  }

  const reset = () => {
    setForm({ 
      name: "", 
      company: "",
      gstin: "", 
      drugLicense: "", 
      contactPerson: "", 
      phone: "", 
      mobile: "",
      email: "", 
      address: "", 
      paymentTerms: "Net 30", 
      credit: 0,
      type: "wholesaler",
      additionalDetails: "",
      preferred: false, 
      active: true 
    });
    setSelected(null);
    setEditing(null);
  };

  const handleEdit = (supplier: Supplier) => {
    setEditing(supplier);
    setForm({
      name: supplier.name,
      company: supplier.company || "",
      gstin: supplier.gstin,
      drugLicense: supplier.drugLicense,
      contactPerson: supplier.contactPerson,
      phone: supplier.phone,
      mobile: supplier.mobile || "",
      email: supplier.email,
      address: supplier.address,
      paymentTerms: supplier.paymentTerms,
      credit: supplier.credit ?? 0,
      type: supplier.type || "wholesaler",
      additionalDetails: supplier.additionalDetails || "",
      preferred: supplier.preferred,
      active: supplier.active,
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (editing) {
      await updateSupplier(editing.id, form);
    } else {
      await addSupplier(form);
    }
    setOpen(false);
    reset();
  };

  return (
    <PageChrome
      breadcrumbs={[{ label: "Pharmacy", href: "/app/pharmacy" }, { label: "Suppliers" }]}
      title="Suppliers"
      meta="Name · mobile · company · credit · type · GSTIN · drug license · payment terms"
      actions={
        <AttioButton variant="primary" onClick={() => { reset(); setOpen(true); }}>
          Add supplier
        </AttioButton>
      }
    >
      <DataTable
        columns={[
          { key: "name", label: "Name" },
          { key: "company", label: "Company" },
          { key: "contact", label: "Contact" },
          { key: "credit", label: "Credit" },
          { key: "type", label: "Type" },
          { key: "status", label: "Status" },
          { key: "actions", label: "" },
        ]}
        rows={suppliers.map((s) => ({
          name: (
            <button type="button" className="text-left hover:underline" onClick={() => setSelected(s)}>
              {s.name}
            </button>
          ),
          company: s.company || "—",
          contact: `${s.contactPerson} · ${s.mobile || s.phone}`,
          credit: `₹${s.credit ?? 0}`,
          type: (s.type || "wholesaler").replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          status: <StatusBadge label={s.active ? (s.preferred ? "Preferred" : "Active") : "Inactive"} variant="success" />,
          actions: (
            <div className="flex items-center gap-3">
              <button type="button" className="text-[12px] text-[var(--attio-accent)] hover:underline" onClick={() => setSelected(s)}>
                View
              </button>
              <button type="button" className="text-[12px] text-[var(--attio-accent)] hover:underline" onClick={() => handleEdit(s)}>
                Edit
              </button>
              {canDelete && (
                <button
                  type="button"
                  className="text-red-600 hover:text-red-700"
                  title="Delete supplier"
                  onClick={() => {
                    if (window.confirm(`Delete supplier ${s.name}? This cannot be undone.`)) {
                      void deleteSupplier(s.id).catch((err: Error) => alert(err.message));
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          ),
        }))}
      />

      {open && (
        <PharmacyDialog open={open} title={editing ? "Edit supplier" : "New supplier"} onClose={() => { setOpen(false); reset(); }}>
          <div className="space-y-4 text-[13px]">
            <Panel title="Basic Information">
              <div className="grid gap-3 sm:grid-cols-2">
                <FormRow label="Name *" required>
                  <PharmacyInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Supplier name" />
                </FormRow>
                <FormRow label="Company">
                  <PharmacyInput value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Company name" />
                </FormRow>
                <FormRow label="Contact Person *" required>
                  <PharmacyInput value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} placeholder="Contact person" />
                </FormRow>
                <FormRow label="Mobile *" required>
                  <PharmacyInput value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} placeholder="Mobile number" />
                </FormRow>
                <FormRow label="Phone">
                  <PharmacyInput value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Landline / alternate phone" />
                </FormRow>
                <FormRow label="Email">
                  <PharmacyInput value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email address" />
                </FormRow>
                <FormRow label="Type">
                  <PharmacySelect value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as typeof form.type })}>
                    <option value="wholesaler">Wholesaler</option>
                    <option value="manufacturer">Manufacturer</option>
                    <option value="distributor">Distributor</option>
                  </PharmacySelect>
                </FormRow>
              </div>
            </Panel>

            <Panel title="License & GST">
              <div className="grid gap-3 sm:grid-cols-2">
                <FormRow label="GSTIN *" required>
                  <PharmacyInput value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} placeholder="GSTIN number" />
                </FormRow>
                <FormRow label="Drug License *" required>
                  <PharmacyInput value={form.drugLicense} onChange={(e) => setForm({ ...form, drugLicense: e.target.value })} placeholder="Drug license number" />
                </FormRow>
              </div>
            </Panel>

            <Panel title="Address & Payment">
              <div className="grid gap-3 sm:grid-cols-2">
                <FormRow label="Address">
                  <PharmacyInput value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Full address" />
                </FormRow>
                <FormRow label="Payment Terms">
                  <PharmacySelect value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })}>
                    <option value="Net 30">Net 30</option>
                    <option value="Net 45">Net 45</option>
                    <option value="Net 60">Net 60</option>
                    <option value="COD">COD</option>
                  </PharmacySelect>
                </FormRow>
                <FormRow label="Credit Limit (₹)">
                  <PharmacyInput type="number" value={form.credit} onChange={(e) => setForm({ ...form, credit: Number(e.target.value) })} placeholder="0" />
                </FormRow>
                <FormRow label="Additional Details" className="sm:col-span-2">
                  <PharmacyTextarea value={form.additionalDetails} onChange={(e) => setForm({ ...form, additionalDetails: e.target.value })} placeholder="Notes, bank details, etc." />
                </FormRow>
              </div>
            </Panel>

            <Panel title="Settings">
              <div className="grid gap-3 sm:grid-cols-2">
                <FormRow label="Preferred">
                  <PharmacySelect value={form.preferred ? "yes" : "no"} onChange={(e) => setForm({ ...form, preferred: e.target.value === "yes" })}>
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
            </Panel>

            <div className="flex justify-end gap-2">
              <AttioButton variant="secondary" onClick={() => { setOpen(false); reset(); }}>Cancel</AttioButton>
              <AttioButton variant="primary" onClick={handleSave}>{editing ? "Update" : "Save"}</AttioButton>
            </div>
          </div>
        </PharmacyDialog>
      )}

      {selected && (
        <PharmacyDialog open={!!selected} title={selected.name} subtitle={`${selected.gstin} · ${selected.drugLicense}`} onClose={() => setSelected(null)} width="max-w-2xl">
          <div className="space-y-4 text-[13px]">
            <Panel title="Contact Information">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-[11px] text-[var(--attio-text-tertiary)]">Contact Person</p><p>{selected.contactPerson}</p></div>
                <div><p className="text-[11px] text-[var(--attio-text-tertiary)]">Mobile</p><p>{selected.phone}</p></div>
                <div><p className="text-[11px] text-[var(--attio-text-tertiary)]">Email</p><p>{selected.email}</p></div>
                <div><p className="text-[11px] text-[var(--attio-text-tertiary)]">Address</p><p>{selected.address}</p></div>
              </div>
            </Panel>

            <Panel title="Payment & Credit">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-[11px] text-[var(--attio-text-tertiary)]">Payment Terms</p><p>{selected.paymentTerms}</p></div>
                <div><p className="text-[11px] text-[var(--attio-text-tertiary)]">Credit Limit</p><p>₹{selected.credit ?? 0}</p></div>
                <div><p className="text-[11px] text-[var(--attio-text-tertiary)]">Type</p><p>{(selected.type || "wholesaler").replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}</p></div>
                <div><p className="text-[11px] text-[var(--attio-text-tertiary)]">Status</p><p>{selected.active ? (selected.preferred ? "Preferred" : "Active") : "Inactive"}</p></div>
              </div>
            </Panel>

            <Panel title="Supplier Medicine Catalogue">
              <p className="mb-2 text-[11px] text-[var(--attio-text-tertiary)]">Medicines supplied by this vendor with pricing details</p>
              <ul className="divide-y">
                {stock
                  .filter((s) => s.supplierId === selected.id)
                  .map((s) => {
                    const drug = drugs.find((d) => d.id === s.drugId);
                    return (
                      <li key={s.id} className="flex justify-between px-3 py-2">
                        <div className="flex-1">
                          <p className="font-medium">{drug?.brandName ?? s.drugId}</p>
                          <p className="text-[11px] text-[var(--attio-text-tertiary)]">
                            Unit: {drug?.unit} · Power: {drug?.strength}
                          </p>
                          <p className="text-[11px] text-[var(--attio-text-tertiary)]">
                            Batch {s.batchNo} · Exp {s.expiry}
                          </p>
                        </div>
                        <div className="text-right text-[11px]">
                          <p>Purchase: ₹{s.purchaseRate}</p>
                          <p>Selling: ₹{s.mrp}</p>
                          <p>MRP: ₹{s.mrp}</p>
                        </div>
                      </li>
                    );
                  })}
                {stock.filter((s) => s.supplierId === selected.id).length === 0 && (
                  <li className="px-3 py-2 text-[var(--attio-text-tertiary)]">No stock received from this supplier yet.</li>
                )}
              </ul>
            </Panel>

            <Panel title="Purchase Orders">
              <ul className="divide-y">
                {purchaseOrders
                  .filter((p) => p.supplierId === selected.id)
                  .map((p) => (
                    <li key={p.id} className="flex justify-between px-3 py-2">
                      <span>{p.id}</span>
                      <StatusBadge label={p.status} variant="info" />
                    </li>
                  ))}
                {purchaseOrders.filter((p) => p.supplierId === selected.id).length === 0 && (
                  <li className="px-3 py-2 text-[var(--attio-text-tertiary)]">No purchase orders yet.</li>
                )}
              </ul>
            </Panel>
          </div>
        </PharmacyDialog>
      )}
    </PageChrome>
  );
}
