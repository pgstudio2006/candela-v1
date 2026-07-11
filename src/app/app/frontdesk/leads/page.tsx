"use client";

import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, Panel } from "@/components/frontdesk/ui";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-provider";
import { useEffect, useState } from "react";

export default function FrontdeskLeadsPage() {
  const { toast } = useToast();
  const [counsellors, setCounsellors] = useState<{ id: string; name: string }[]>([]);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/crm/counsellors", { credentials: "include" });
        const json = await res.json();
        if (json.ok) setCounsellors(json.data ?? []);
      } catch {}
    })();
  }, []);

  const handleSubmit = async () => {
    if (!fullName.trim() || !phone.trim() || !assigneeId) {
      toast("Please fill name, phone and select a counsellor.", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/crm/offline-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fullName: fullName.trim(),
          phone: phone.trim(),
          notes: notes.trim(),
          assigneeId,
          source: "walk_in",
        }),
      });
      const json = await res.json();
      if (json.ok) {
        toast("Offline lead created and assigned.", "success");
        setFullName("");
        setPhone("");
        setNotes("");
        setAssigneeId("");
      } else {
        toast(json.error ?? "Failed to create lead.", "error");
      }
    } catch {
      toast("Network error. Please try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageChrome
      breadcrumbs={[{ label: "Front Desk", href: "/app/frontdesk" }, { label: "Offline Leads" }]}
      title="Offline lead entry"
      meta="Create and assign walk-in leads to a counsellor"
    >
      <Panel title="New offline lead">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="text-[12px]">Full name</Label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Patient name"
              className="mt-1 h-9 w-full rounded-md border px-3 text-[13px]"
            />
          </div>
          <div>
            <Label className="text-[12px]">Phone</Label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Mobile number"
              className="mt-1 h-9 w-full rounded-md border px-3 text-[13px]"
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-[12px]">Assign to counsellor</Label>
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border px-2 text-[13px]"
            >
              <option value="">Select counsellor</option>
              {counsellors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-[12px]">Notes</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes about the lead"
              rows={3}
              className="mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
            />
          </div>
        </div>
        <div className="mt-4">
          <AttioButton variant="primary" disabled={saving} onClick={() => void handleSubmit()}>
            {saving ? "Saving…" : "Create & assign lead"}
          </AttioButton>
        </div>
      </Panel>
    </PageChrome>
  );
}
