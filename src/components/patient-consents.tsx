"use client";

import { useCallback, useEffect, useState } from "react";
import { Panel, AttioButton } from "@/components/frontdesk/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createConsentAction, listConsentsAction, signConsentAction, deleteConsentAction, type ConsentListItem } from "@/app/actions/consent-actions";
import { useToast } from "@/components/ui/toast-provider";
import { FileSignature, Check, Trash2 } from "lucide-react";

export function PatientConsentsPanel({ patientId, visitId }: { patientId: string; visitId?: string }) {
  const { toast } = useToast();
  const [consents, setConsents] = useState<ConsentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [signing, setSigning] = useState<string | null>(null);
  const [signer, setSigner] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listConsentsAction(patientId);
    if (res.ok) setConsents(res.data);
    setLoading(false);
  }, [patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    if (!label.trim()) return;
    setBusy(true);
    const res = await createConsentAction({ patientId, visitId, label: label.trim() });
    if (res.ok) {
      toast("Consent form created", "success");
      setLabel("");
      await load();
    } else {
      toast(res.error ?? "Failed to create consent", "error");
    }
    setBusy(false);
  };

  const sign = async (id: string) => {
    if (!signer.trim()) return;
    setSigning(id);
    const res = await signConsentAction(id, { signerName: signer.trim() });
    if (res.ok) {
      toast("Consent signed", "success");
      setSigner("");
      await load();
    } else {
      toast(res.error ?? "Failed to sign consent", "error");
    }
    setSigning(null);
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this consent?")) return;
    const res = await deleteConsentAction(id);
    if (res.ok) {
      await load();
    } else {
      toast(res.error ?? "Failed to delete", "error");
    }
  };

  return (
    <div className="space-y-4">
      <Panel title="Create consent form">
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-[12px]">Consent label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Treatment consent, Procedure consent" className="h-8 text-[13px]" />
          </div>
          <div className="flex justify-end">
            <AttioButton onClick={() => void create()} disabled={busy || !label.trim()}>
              {busy ? "Creating..." : "Create consent"}
            </AttioButton>
          </div>
        </div>
      </Panel>

      <Panel title="Consent forms">
        {loading ? (
          <p className="py-4 text-center text-[13px] text-[var(--attio-text-tertiary)]">Loading...</p>
        ) : consents.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-[var(--attio-text-tertiary)]">No consent forms yet.</p>
        ) : (
          <ul className="space-y-3">
            {consents.map((c) => (
              <li key={c.id} className="rounded-lg border border-[var(--attio-border-subtle)] bg-[var(--attio-surface)] p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FileSignature className="size-4 text-[var(--attio-accent)]" />
                    <div>
                      <p className="text-[13px] font-medium">{c.label}</p>
                      <p className="text-[11px] text-[var(--attio-text-tertiary)]">
                        {c.status} · {c.signedAt ? new Date(c.signedAt).toLocaleString("en-IN") : new Date(c.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {c.status === "signed" ? (
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700">
                        <Check className="size-3" /> Signed
                      </span>
                    ) : (
                      <>
                        <Input
                          value={signing === c.id ? signer : ""}
                          onChange={(e) => { setSigning(c.id); setSigner(e.target.value); }}
                          placeholder="Signer name"
                          className="h-7 w-32 text-[12px]"
                        />
                        <AttioButton
                          variant="secondary"
                          className="h-7 px-2 text-[12px]"
                          onClick={() => void sign(c.id)}
                          disabled={!signer.trim()}
                        >
                          Sign
                        </AttioButton>
                      </>
                    )}
                    <AttioButton variant="ghost" className="h-7 w-7 px-0" onClick={() => void remove(c.id)}>
                      <Trash2 className="size-3.5 text-red-600" />
                    </AttioButton>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
