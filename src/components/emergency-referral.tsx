"use client";

import { useState } from "react";
import { AttioButton, Panel } from "@/components/frontdesk/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createEmergencyReferralAction } from "@/app/actions/emergency-referral-actions";
import { useToast } from "@/components/ui/toast-provider";

const REFERRAL_TYPES = [
  { value: "department", label: "Department" },
  { value: "doctor", label: "Doctor" },
  { value: "specialist", label: "Specialist" },
  { value: "hospital", label: "Hospital" },
];

export function EmergencyReferralForm({ patientId, visitId, onCreated }: { patientId: string; visitId?: string; onCreated?: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState("department");
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const submit = async () => {
    if (!name.trim() || !reason.trim()) return toast("Referral name and reason are required", "error");
    setBusy(true);
    const res = await createEmergencyReferralAction({
      patientId,
      visitId,
      referredToType: type,
      referredToName: name.trim(),
      referralReason: reason.trim(),
      referralNotes: notes.trim() || undefined,
    });
    if (res.ok) {
      toast("Emergency referral created", "success");
      setName("");
      setReason("");
      setNotes("");
      onCreated?.();
    } else {
      toast(res.error ?? "Failed to create referral", "error");
    }
    setBusy(false);
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-[12px]">Referral type</Label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="h-8 w-full rounded-md border border-[var(--attio-border)] px-2 text-[13px]"
          >
            {REFERRAL_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-[12px]">Referred to</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name / department / hospital" className="h-8 text-[13px]" />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-[12px]">Reason</Label>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for referral" className="h-8 text-[13px]" />
      </div>
      <div className="space-y-1">
        <Label className="text-[12px]">Notes</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional notes" className="min-h-[60px] text-[13px]" />
      </div>
      <div className="flex justify-end">
        <AttioButton onClick={() => void submit()} disabled={busy}>
          {busy ? "Creating..." : "Create referral"}
        </AttioButton>
      </div>
    </div>
  );
}
