"use client";

import type { AdminRole, DepartmentConfig, StaffMember } from "@/design-system/admin-data";
import {
  HEALTHCARE_STAFF_ROLES,
  doctorIdFromStaffId,
  generateStaffPassword,
  staffRoleLabel,
} from "@/lib/healthcare-roles";
import { getIpdWardsAction } from "@/app/actions/ipd-actions";
import { AttioButton } from "@/components/frontdesk/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { useEffect, useState } from "react";

type StaffFormProps = {
  open: boolean;
  onClose: () => void;
  departments: DepartmentConfig[];
  branchId: string;
  initial?: StaffMember;
  onSave: (
    data: Omit<StaffMember, "id">,
    opts?: { createLogin?: boolean; password?: string; resetPassword?: boolean },
  ) => Promise<void>;
};

export function StaffFormModal({ open, onClose, departments, branchId, initial, onSave }: StaffFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<AdminRole>("frontdesk");
  const [departmentIds, setDepartmentIds] = useState<string[]>([]);
  const [licenseNo, setLicenseNo] = useState("");
  const [degree, setDegree] = useState("");
  const [designation, setDesignation] = useState("");
  const [signature, setSignature] = useState<string | undefined>(undefined);
  const [signatureLoading, setSignatureLoading] = useState(false);
  const [onDuty, setOnDuty] = useState(true);
  const [ward, setWard] = useState("");
  const [createLogin, setCreateLogin] = useState(true);
  const [resetPassword, setResetPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [wards, setWards] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    getIpdWardsAction().then((res) => {
      if (res.ok && res.data) setWards((res.data as { id: string; label: string; category: string; active: boolean }[]).map((w) => ({ id: w.id, label: w.label })));
    });
    setName(initial?.name ?? "");
    setEmail(initial?.email ?? "");
    setPhone(initial?.phone ?? "");
    setRole(initial?.role ?? "frontdesk");
    setDepartmentIds(initial?.departmentIds ?? []);
    setLicenseNo(initial?.licenseNo ?? "");
    setDegree(initial?.degree ?? "");
    setDesignation(initial?.designation ?? "");
    setSignature(initial?.signature);
    setSignatureLoading(false);
    setOnDuty(initial?.onDuty ?? true);
    setWard((initial as any)?.ward ?? "");
    setCreateLogin(!initial);
    setResetPassword(false);
    setPassword("");
    setFormError(null);
    setSaving(false);
  }, [open, initial]);

  if (!open) return null;

  const toggleDept = (id: string) => {
    if (role === "nurse") {
      // Nurses are assigned to exactly one department/ward.
      setDepartmentIds((prev) => (prev.includes(id) ? [] : [id]));
    } else {
      setDepartmentIds((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));
    }
  };

  const needsDepartment = role === "doctor" || role === "nurse";
  const doctorWorkspaceId = initial && role === "doctor" ? doctorIdFromStaffId(initial.id) : null;

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSignatureLoading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string | undefined;
      if (result) setSignature(result);
      setSignatureLoading(false);
    };
    reader.onerror = () => setSignatureLoading(false);
    reader.readAsDataURL(file);
  };

  const clearSignature = () => setSignature(undefined);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    if (role === "doctor" && departmentIds.length === 0) {
      setFormError("Assign at least one department for doctors — this sets their private OPD queue.");
      return;
    }
    if (role === "nurse" && departmentIds.length === 0) {
      setFormError("Assign at least one department for nurses.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      await onSave(
        {
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || "+910000000000",
          role,
          departmentIds,
          branchId: initial?.branchId ?? branchId,
          licenseNo: licenseNo.trim() || undefined,
          degree: degree.trim() || undefined,
          designation: designation.trim() || undefined,
          signature: signature?.trim() || undefined,
          onDuty,
          ward: role === "nurse" ? ward.trim() || undefined : undefined,
          joinedAt: initial?.joinedAt ?? new Date().toISOString().slice(0, 10),
        },
        initial
          ? resetPassword
            ? { resetPassword: true, password }
            : undefined
          : { createLogin, password },
      );
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save staff member.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--attio-border)] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--attio-border-subtle)] px-4 py-3">
          <h2 className="text-[15px] font-semibold">{initial ? "Edit staff member" : "Add staff member"}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-[var(--attio-hover)]">
            <X className="size-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-4">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
              {formError}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-[12px]">Full name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-[13px]" required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">Email *</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-9 text-[13px]"
                required
                readOnly={!!initial}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-9 text-[13px]" placeholder="+91 98765 00000" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-[12px]">Healthcare role</Label>
              <Select value={role} onValueChange={(v) => v && setRole(v as AdminRole)}>
                <SelectTrigger className="h-9 text-[13px]">
                  <SelectValue placeholder="Select role">{staffRoleLabel(role)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {HEALTHCARE_STAFF_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">License / ID</Label>
              <Input value={licenseNo} onChange={(e) => setLicenseNo(e.target.value)} className="h-9 text-[13px]" placeholder="Optional" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">Degree / Qualification</Label>
              <Input value={degree} onChange={(e) => setDegree(e.target.value)} className="h-9 text-[13px]" placeholder="e.g. MBBS MD (Pathology)" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">Designation</Label>
              <Input value={designation} onChange={(e) => setDesignation(e.target.value)} className="h-9 text-[13px]" placeholder="e.g. Consultant Pathologist" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-[12px]">Signature image</Label>
              <div className="flex items-center gap-3">
                <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[var(--attio-border-subtle)] bg-[var(--attio-surface)] px-3 text-[13px] text-[var(--attio-text-primary)] hover:bg-[var(--attio-hover)]">
                  <span>{signatureLoading ? "Loading…" : "Choose file"}</span>
                  <input type="file" accept="image/png,image/jpeg,image/jpg" className="hidden" onChange={onFileChange} disabled={signatureLoading} />
                </label>
                {signature && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={signature} alt="Signature preview" className="h-12 w-auto rounded border border-[var(--attio-border-subtle)] bg-white object-contain" />
                    <button
                      type="button"
                      onClick={clearSignature}
                      className="text-[12px] text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
              <p className="text-[11px] text-[var(--attio-text-tertiary)]">PNG/JPEG up to ~100 KB. This signature appears on lab report printouts.</p>
            </div>
            {role === "nurse" && (
              <div className="space-y-1.5">
                <Label className="text-[12px]">Ward assignment</Label>
                <Select value={ward} onValueChange={(v) => setWard(v ?? "")}>
                  <SelectTrigger className="h-9 text-[13px]">
                    <SelectValue placeholder="Select IPD ward">{ward || "Select IPD ward"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {wards.length === 0 && <SelectItem value="">No wards configured</SelectItem>}
                    {wards.map((w) => (
                      <SelectItem key={w.id} value={w.label}>
                        {w.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {doctorWorkspaceId && (
            <div className="rounded-lg border border-blue-100 bg-blue-50/80 px-3 py-2 text-[12px] text-blue-900">
              <p className="font-medium">Doctor workspace</p>
              <p className="mt-1 text-blue-800">
                ID <span className="font-mono">{doctorWorkspaceId}</span> · sign in at{" "}
                <span className="font-mono">/workspace</span> with this email
              </p>
            </div>
          )}

          {!initial && (
            <div className="space-y-2 rounded-lg border border-[var(--attio-border-subtle)] p-3">
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={createLogin} onChange={(e) => setCreateLogin(e.target.checked)} />
                Create platform login (User account)
              </label>
              {createLogin && (
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-9 flex-1 text-[13px]"
                    placeholder="Auto-generated if blank"
                  />
                  <AttioButton
                    type="button"
                    variant="secondary"
                    className="h-9 shrink-0 text-[12px]"
                    onClick={() => setPassword(generateStaffPassword())}
                  >
                    Generate
                  </AttioButton>
                </div>
              )}
              {createLogin && (
                <p className="text-[11px] text-[var(--attio-text-tertiary)]">
                  Password is shown once after save — copy it for the new user. Min 8 characters.
                </p>
              )}
            </div>
          )}

          {initial && (
            <div className="space-y-2 rounded-lg border border-[var(--attio-border-subtle)] p-3">
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={resetPassword} onChange={(e) => setResetPassword(e.target.checked)} />
                Reset platform login password
              </label>
              {resetPassword && (
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-9 flex-1 text-[13px]"
                    placeholder="Auto-generated if blank"
                  />
                  <AttioButton
                    type="button"
                    variant="secondary"
                    className="h-9 shrink-0 text-[12px]"
                    onClick={() => setPassword(generateStaffPassword())}
                  >
                    Generate
                  </AttioButton>
                </div>
              )}
              {resetPassword && (
                <p className="text-[11px] text-amber-800">
                  Password changes only when you check this box and save. Editing other fields does not reset the login password.
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-[12px]">
              Departments{needsDepartment ? " *" : ""}
            </Label>
            {role === "doctor" && (
              <p className="text-[11px] text-[var(--attio-text-tertiary)]">
                Required for doctors — links their login to a private queue and dashboard.
              </p>
            )}
            {departments.length === 0 ? (
              <p className="text-[12px] text-amber-700">Add departments in Admin → Departments first.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {departments.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => toggleDept(d.id)}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-[12px] transition-colors",
                      departmentIds.includes(d.id)
                        ? "border-[var(--attio-text)] bg-[var(--attio-text)] text-white"
                        : "border-[var(--attio-border)] hover:bg-[var(--attio-surface)]",
                    )}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={onDuty} onChange={(e) => setOnDuty(e.target.checked)} />
            On duty now
          </label>
          <div className="flex justify-end gap-2 border-t border-[var(--attio-border-subtle)] pt-4">
            <AttioButton variant="secondary" type="button" onClick={onClose} disabled={saving}>
              Cancel
            </AttioButton>
            <AttioButton variant="primary" type="submit" disabled={saving}>
              {saving ? "Saving…" : initial ? "Save changes" : "Add staff"}
            </AttioButton>
          </div>
        </form>
      </div>
    </div>
  );
}
