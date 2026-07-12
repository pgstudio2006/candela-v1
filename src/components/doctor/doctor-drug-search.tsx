"use client";

import { getPharmacyDrugsForDoctorAction, type PharmacyDrugOption } from "@/app/actions/pharmacy-actions";
import type { PrescriptionLine } from "@/design-system/doctor-data";
import { Check, PenLine, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export type DoctorDrugSearchProps = {
  value: PrescriptionLine;
  onChange: (patch: Partial<PrescriptionLine>) => void;
  placeholder?: string;
};

export function DoctorDrugSearch({ value, onChange, placeholder = "Search medicine…" }: DoctorDrugSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<PharmacyDrugOption[]>([]);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void getPharmacyDrugsForDoctorAction().then((res) => {
      if (cancelled) return;
      if (res.ok && res.data) setOptions(res.data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selected = useMemo(() => options.find((d) => d.id === value.drugId), [options, value.drugId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 40);
    return options
      .filter(
        (d) =>
          d.brandName.toLowerCase().includes(q) ||
          (d.genericName ?? "").toLowerCase().includes(q) ||
          (d.strength ?? "").toLowerCase().includes(q),
      )
      .slice(0, 40);
  }, [options, query]);

  const setManual = () => {
    onChange({ drugId: undefined, isManual: true, drug: query || value.drug || "" });
    setOpen(false);
  };

  const selectDrug = (drug: PharmacyDrugOption) => {
    onChange({
      drugId: drug.id,
      drug: drug.brandName,
      genericName: drug.genericName,
      isManual: false,
    });
    setQuery("");
    setOpen(false);
  };

  if (value.isManual || (!value.drugId && value.drug)) {
    return (
      <div className="relative" ref={ref}>
        <div className="flex h-9 items-center gap-2 rounded-md border border-[var(--attio-border)] bg-white px-2 focus-within:border-[var(--attio-text)] focus-within:ring-1 focus-within:ring-[var(--attio-text)]">
          <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">Manual</span>
          <input
            type="text"
            value={value.drug}
            onChange={(e) => onChange({ drug: e.target.value })}
            placeholder="Enter medicine name"
            className="min-w-0 flex-1 bg-transparent py-1.5 text-[13px] outline-none"
          />
          <button
            type="button"
            onClick={() => onChange({ isManual: false, drugId: undefined, drug: "" })}
            className="shrink-0 rounded p-1 hover:bg-[var(--attio-hover)]"
            title="Switch to pharmacy search"
          >
            <Search className="size-3.5 text-[var(--attio-text-tertiary)]" />
          </button>
        </div>
      </div>
    );
  }

  if (selected) {
    return (
      <div className="relative" ref={ref}>
        <div className="flex h-9 items-center justify-between rounded-md border border-[var(--attio-border)] bg-white px-3 text-[13px] focus-within:border-[var(--attio-text)] focus-within:ring-1 focus-within:ring-[var(--attio-text)]">
          <span className="truncate">
            {selected.brandName}
            {selected.genericName ? <span className="ml-1 text-[var(--attio-text-tertiary)]">({selected.genericName})</span> : null}
          </span>
          <div className="ml-2 flex shrink-0 items-center gap-1.5">
            <span className="flex items-center gap-1 text-[11px] text-emerald-600">
              <Check className="size-3" />
              {selected.stock}
            </span>
            <button
              type="button"
              onClick={() => {
                onChange({ drugId: undefined, drug: "", genericName: undefined });
                setQuery("");
                setOpen(true);
              }}
              className="rounded p-1 hover:bg-[var(--attio-hover)]"
            >
              <X className="size-3.5 text-[var(--attio-text-tertiary)]" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--attio-text-tertiary)]" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={loading ? "Loading pharmacy medicines…" : placeholder}
          disabled={loading}
          className="h-9 w-full rounded-md border border-[var(--attio-border)] bg-white pl-9 pr-3 text-[13px] outline-none focus:border-[var(--attio-text)] focus:ring-1 focus:ring-[var(--attio-text)] disabled:bg-[var(--attio-surface)]"
        />
      </div>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-80 min-w-[320px] max-w-[520px] overflow-auto rounded-md border border-[var(--attio-border)] bg-white py-1 shadow-xl">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-3 py-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--attio-text-tertiary)]">
              {filtered.length} medicine{filtered.length === 1 ? "" : "s"} found
            </span>
            <button
              type="button"
              onClick={setManual}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium hover:bg-[var(--attio-hover)]"
            >
              <Plus className="size-3" />
              Manual
            </button>
          </div>
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-[12px] text-[var(--attio-text-tertiary)]">
              No medicines found.
              <button type="button" onClick={setManual} className="ml-1 font-medium text-[var(--attio-accent)] hover:underline">
                Add manually
              </button>
            </div>
          ) : (
            filtered.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => selectDrug(d)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] transition-colors hover:bg-[var(--attio-hover)] focus:bg-[var(--attio-hover)]"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{d.brandName}</div>
                  <div className="text-[11px] text-[var(--attio-text-tertiary)]">
                    {d.genericName ? `${d.genericName} · ` : ""}
                    {d.strength}
                  </div>
                </div>
                <div className="ml-3 flex shrink-0 items-center gap-2 text-[11px]">
                  <span className="flex items-center gap-0.5 text-emerald-600">
                    <Check className="size-3" />
                    {d.stock}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
