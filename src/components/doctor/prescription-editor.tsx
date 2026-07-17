"use client";

import { AttioButton } from "@/components/frontdesk/ui";
import { DoctorDrugSearch } from "@/components/doctor/doctor-drug-search";
import type { PrescriptionLine } from "@/design-system/doctor-data";
import { PRESCRIPTION_FREQUENCY_OPTIONS, DURATION_UNIT_OPTIONS } from "@/design-system/doctor-data";
import { Plus, Trash2 } from "lucide-react";

type PrescriptionEditorProps = {
  lines: PrescriptionLine[];
  onChange: (lines: PrescriptionLine[]) => void;
};

export function PrescriptionEditor({ lines, onChange }: PrescriptionEditorProps) {
  const addLine = () => {
    onChange([
      ...lines,
      {
        id: `rx_${Date.now()}`,
        drug: "",
        dose: "1 tab",
        frequency: "OD",
        days: 7,
        durationUnit: "days",
      },
    ]);
  };

  const update = (id: string, patch: Partial<PrescriptionLine>) => {
    onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const remove = (id: string) => {
    onChange(lines.filter((l) => l.id !== id));
  };

  return (
    <div className="space-y-3">
      {lines.length === 0 && (
        <p className="py-4 text-center text-[13px] text-[var(--attio-text-tertiary)]">
          No medicines — add lines or apply a template
        </p>
      )}

      {lines.map((line, i) => (
        <div
          key={line.id}
          className="grid gap-2 rounded-lg border border-[var(--attio-border-subtle)] bg-[var(--attio-surface)] p-3 sm:grid-cols-[1fr_auto]"
        >
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-[var(--attio-text-tertiary)]">#{i + 1}</span>
              <div className="min-w-0 flex-1">
                <DoctorDrugSearch
                  value={line}
                  onChange={(patch) => update(line.id, patch)}
                  placeholder="Search pharmacy medicine or add manually…"
                />
              </div>
            </div>
            <div className="grid grid-cols-5 gap-2">
              <input
                value={line.dose}
                onChange={(e) => update(line.id, { dose: e.target.value })}
                placeholder="Dose"
                className="rounded border border-[var(--attio-border)] bg-white px-2 py-1.5 text-[12px] outline-none"
              />
              <select
                value={line.frequency}
                onChange={(e) => update(line.id, { frequency: e.target.value })}
                className="rounded border border-[var(--attio-border)] bg-white px-2 py-1.5 text-[12px] outline-none"
              >
                {PRESCRIPTION_FREQUENCY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                value={line.days}
                onChange={(e) => update(line.id, { days: Number(e.target.value) })}
                placeholder="Duration"
                className="rounded border border-[var(--attio-border)] bg-white px-2 py-1.5 text-[12px] outline-none"
              />
              <select
                value={line.durationUnit ?? "days"}
                onChange={(e) => update(line.id, { durationUnit: e.target.value as PrescriptionLine["durationUnit"] })}
                className="rounded border border-[var(--attio-border)] bg-white px-2 py-1.5 text-[12px] outline-none"
              >
                {DURATION_UNIT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <input
                value={line.instructions ?? ""}
                onChange={(e) => update(line.id, { instructions: e.target.value })}
                placeholder="Instructions"
                className="rounded border border-[var(--attio-border)] bg-white px-2 py-1.5 text-[12px] outline-none"
              />
            </div>
            <input
              value={line.notes ?? ""}
              onChange={(e) => update(line.id, { notes: e.target.value })}
              placeholder="Notes for patient (optional)"
              className="w-full rounded border border-[var(--attio-border)] bg-white px-2 py-1.5 text-[12px] outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => remove(line.id)}
            className="self-start rounded p-1.5 text-[var(--attio-text-tertiary)] hover:bg-red-50 hover:text-red-600"
            aria-label="Remove line"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}

      <AttioButton variant="secondary" className="w-full gap-1.5" onClick={addLine}>
        <Plus className="size-3.5" />
        Add medicine
      </AttioButton>
    </div>
  );
}
