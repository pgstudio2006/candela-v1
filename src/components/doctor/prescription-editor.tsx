"use client";

import { useEffect, useState } from "react";
import { AttioButton } from "@/components/frontdesk/ui";
import { DoctorDrugSearch } from "@/components/doctor/doctor-drug-search";
import type { PrescriptionLine } from "@/design-system/doctor-data";
import { PRESCRIPTION_FREQUENCY_OPTIONS, DURATION_UNIT_OPTIONS } from "@/design-system/doctor-data";
import { Plus, Trash2, FileText, Pencil, X, GripVertical } from "lucide-react";

const DEFAULT_INSTRUCTION_SUGGESTIONS = [
  "After meals",
  "Before meals",
  "With water",
  "Empty stomach",
  "At bedtime",
  "Avoid sunlight",
  "Apply thin layer",
  "Avoid eyes",
  "With food",
  "Avoid alcohol",
  "Do not crush",
  "Shake well",
  "Refrigerate",
  "Complete course",
];

const CUSTOM_SUGGESTIONS_KEY = "candela-custom-instruction-suggestions";

type PrescriptionEditorProps = {
  lines: PrescriptionLine[];
  onChange: (lines: PrescriptionLine[]) => void;
};

function loadCustomSuggestions(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_SUGGESTIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string" && s.trim()) : [];
  } catch {
    return [];
  }
}

function saveCustomSuggestions(suggestions: string[]) {
  try {
    localStorage.setItem(CUSTOM_SUGGESTIONS_KEY, JSON.stringify(suggestions));
  } catch {}
}

export function PrescriptionEditor({ lines, onChange }: PrescriptionEditorProps) {
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [editingSuggestions, setEditingSuggestions] = useState(false);
  const [customSuggestions, setCustomSuggestions] = useState<string[]>([]);
  const [newSuggestion, setNewSuggestion] = useState("");

  useEffect(() => {
    setCustomSuggestions(loadCustomSuggestions());
  }, []);

  const instructionSuggestions = [...DEFAULT_INSTRUCTION_SUGGESTIONS, ...customSuggestions];

  const addLine = () => {
    const newId = `rx_${Date.now()}`;
    onChange([
      ...lines,
      {
        id: newId,
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
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const toggleNotes = (id: string) => {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleChip = (lineId: string, chip: string) => {
    const line = lines.find((l) => l.id === lineId);
    if (!line) return;
    const current = (line.instructions ?? "").trim();
    const chips = current ? current.split(", ").map((s) => s.trim()).filter(Boolean) : [];
    const idx = chips.findIndex((c) => c.toLowerCase() === chip.toLowerCase());
    if (idx >= 0) {
      chips.splice(idx, 1);
    } else {
      chips.push(chip);
    }
    update(lineId, { instructions: chips.join(", ") });
  };

  const isChipActive = (line: PrescriptionLine, chip: string): boolean => {
    const current = (line.instructions ?? "").toLowerCase();
    return current.split(",").map((s) => s.trim()).includes(chip.toLowerCase());
  };

  return (
    <div className="space-y-3">
      {lines.length === 0 && (
        <p className="py-4 text-center text-[13px] text-[var(--attio-text-tertiary)]">
          No medicines — add lines or apply a template
        </p>
      )}

      {lines.map((line, i) => {
        const isExpanded = expandedNotes.has(line.id);
        const hasNotes = !!(line.instructions?.trim() || line.notes?.trim());

        return (
          <div
            key={line.id}
            className="rounded-lg border border-[var(--attio-border-subtle)] bg-[var(--attio-surface)] p-3"
          >
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <div className="space-y-2">
                {/* Drug name + row number */}
                <div className="flex items-center gap-2">
                  <GripVertical className="size-3.5 shrink-0 text-[var(--attio-text-tertiary)] opacity-40" />
                  <span className="inline-flex size-5 shrink-0 items-center justify-center rounded bg-amber-100 text-[10px] font-bold text-amber-700">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <DoctorDrugSearch
                      value={line}
                      onChange={(patch) => update(line.id, patch)}
                      placeholder="Search pharmacy medicine or add manually…"
                    />
                  </div>
                </div>

                {/* Dose / Frequency / Duration / Unit */}
                <div className="grid grid-cols-4 gap-2">
                  <input
                    value={line.dose}
                    onChange={(e) => update(line.id, { dose: e.target.value })}
                    placeholder="Dose"
                    className="rounded border border-[var(--attio-border)] bg-white px-2 py-1.5 text-[12px] outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200"
                  />
                  <select
                    value={line.frequency}
                    onChange={(e) => update(line.id, { frequency: e.target.value })}
                    className="rounded border border-[var(--attio-border)] bg-white px-2 py-1.5 text-[12px] outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200"
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
                    className="rounded border border-[var(--attio-border)] bg-white px-2 py-1.5 text-[12px] outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200"
                  />
                  <select
                    value={line.durationUnit ?? "days"}
                    onChange={(e) => update(line.id, { durationUnit: e.target.value as PrescriptionLine["durationUnit"] })}
                    className="rounded border border-[var(--attio-border)] bg-white px-2 py-1.5 text-[12px] outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200"
                  >
                    {DURATION_UNIT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-start gap-1 sm:flex-col">
                <button
                  type="button"
                  onClick={() => toggleNotes(line.id)}
                  className={`rounded p-1.5 transition-colors ${
                    isExpanded || hasNotes
                      ? "bg-amber-50 text-amber-600"
                      : "text-[var(--attio-text-tertiary)] hover:bg-amber-50 hover:text-amber-600"
                  }`}
                  aria-label="Toggle instructions"
                  title="Patient instructions / notes"
                >
                  <FileText className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(line.id)}
                  className="rounded p-1.5 text-[var(--attio-text-tertiary)] transition-colors hover:bg-red-50 hover:text-red-600"
                  aria-label="Remove line"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>

            {/* Expandable instructions / notes panel */}
            {isExpanded && (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-amber-700 uppercase">
                    <FileText className="size-3.5" />
                    Patient Instructions / Notes
                  </div>
                  <span className="text-[10px] text-amber-500 italic">Printed on prescription</span>
                </div>

                {/* Suggestion chips */}
                <div className="mb-2.5 flex flex-wrap gap-1.5">
                  {instructionSuggestions.map((chip: string) => {
                    const active = isChipActive(line, chip);
                    const isCustom = customSuggestions.includes(chip);
                    return (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => toggleChip(line.id, chip)}
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all ${
                          active
                            ? "border-amber-400 bg-amber-200/70 text-amber-800 shadow-sm"
                            : "border-amber-300 bg-white text-amber-700 hover:border-amber-400 hover:bg-amber-100"
                        }`}
                      >
                        {active ? (
                          <span className="text-[10px]">✓</span>
                        ) : (
                          <Plus className="size-3" />
                        )}
                        {chip}
                        {editingSuggestions && isCustom && (
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              const next = customSuggestions.filter((s) => s !== chip);
                              setCustomSuggestions(next);
                              saveCustomSuggestions(next);
                            }}
                            className="ml-0.5 inline-flex cursor-pointer items-center text-amber-600 hover:text-amber-800"
                            title="Remove custom suggestion"
                          >
                            <X className="size-3" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setEditingSuggestions((v) => !v)}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all ${
                      editingSuggestions
                        ? "border-amber-400 bg-amber-200/70 text-amber-800"
                        : "border-amber-300 bg-white text-amber-700 hover:border-amber-400 hover:bg-amber-100"
                    }`}
                    title="Edit common instructions"
                  >
                    <Pencil className="size-3" />
                    {editingSuggestions ? "Done" : "Edit"}
                  </button>
                </div>

                {editingSuggestions && (
                  <div className="mb-2.5 flex items-center gap-2">
                    <input
                      value={newSuggestion}
                      onChange={(e) => setNewSuggestion(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const trimmed = newSuggestion.trim();
                          if (!trimmed) return;
                          if (instructionSuggestions.some((s) => s.toLowerCase() === trimmed.toLowerCase())) return;
                          const next = [...customSuggestions, trimmed];
                          setCustomSuggestions(next);
                          saveCustomSuggestions(next);
                          setNewSuggestion("");
                        }
                      }}
                      placeholder="Add common instruction…"
                      className="min-w-0 flex-1 rounded border border-amber-300 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const trimmed = newSuggestion.trim();
                        if (!trimmed) return;
                        if (instructionSuggestions.some((s) => s.toLowerCase() === trimmed.toLowerCase())) return;
                        const next = [...customSuggestions, trimmed];
                        setCustomSuggestions(next);
                        saveCustomSuggestions(next);
                        setNewSuggestion("");
                      }}
                      className="inline-flex shrink-0 items-center gap-1 rounded bg-amber-600 px-2.5 py-1.5 text-[12px] font-medium text-white hover:bg-amber-700"
                    >
                      <Plus className="size-3.5" />
                      Add
                    </button>
                  </div>
                )}

                {/* Free-text textarea */}
                <textarea
                  value={line.instructions ?? ""}
                  onChange={(e) => update(line.id, { instructions: e.target.value })}
                  placeholder="Type patient instructions, warnings, or special notes..."
                  rows={2}
                  className="w-full resize-none rounded-md border border-amber-200 bg-white px-3 py-2 text-[12px] outline-none placeholder:text-amber-400 focus:border-amber-400 focus:ring-1 focus:ring-amber-200"
                />
              </div>
            )}
          </div>
        );
      })}

      <AttioButton variant="secondary" className="w-full gap-1.5" onClick={addLine}>
        <Plus className="size-3.5" />
        Add medicine
      </AttioButton>
    </div>
  );
}
