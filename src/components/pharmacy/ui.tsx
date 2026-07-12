"use client";

import { cn } from "@/lib/utils";
import type { Drug } from "@/design-system/pharmacy-data";
import { Search, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

export function PharmacyDialog({ open, title, subtitle, children, onClose, width = "max-w-2xl" }: {
  open: boolean;
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  width?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/35 p-4">
      <div className={cn("flex max-h-[90vh] w-full flex-col rounded-xl border bg-white shadow-2xl", width)}>
        <div className="flex items-start justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-[16px] font-semibold">{title}</h2>
            {subtitle && <p className="text-[12px] text-[var(--attio-text-tertiary)]">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-[var(--attio-hover)]">
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

export function FormRow({ label, children, required, className }: { label: string; children: ReactNode; required?: boolean; className?: string }) {
  return (
    <label className={cn("block space-y-1", className)}>
      <span className="text-[12px] font-medium text-[var(--attio-text-secondary)]">
        {label}
        {required && <span className="text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}

export function PharmacyInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-9 w-full rounded-md border border-[var(--attio-border)] px-3 text-[13px] outline-none focus:border-[var(--attio-text)]",
        props.className,
      )}
    />
  );
}

export function PharmacySelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "h-9 w-full rounded-md border border-[var(--attio-border)] bg-white px-3 text-[13px] outline-none focus:border-[var(--attio-text)]",
        props.className,
      )}
    />
  );
}

export function PharmacyTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "w-full rounded-md border border-[var(--attio-border)] px-3 py-2 text-[13px] outline-none focus:border-[var(--attio-text)]",
        props.className,
      )}
    />
  );
}

export function TabBar<T extends string>({ tabs, active, onChange }: { tabs: { id: T; label: string }[]; active: T; onChange: (id: T) => void }) {
  return (
    <div className="flex border-b">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cn(
            "border-b-2 px-4 py-2 text-[13px]",
            active === t.id ? "border-[var(--attio-text)] font-medium text-[var(--attio-text)]" : "border-transparent text-[var(--attio-text-tertiary)]",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function DrugSearch({
  drugs,
  value,
  onChange,
  placeholder = "Search medicine…",
}: {
  drugs: Drug[];
  value?: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const selected = drugs.find((d) => d.id === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return drugs.slice(0, 40);
    return drugs
      .filter(
        (d) =>
          d.brandName.toLowerCase().includes(q) ||
          d.genericName.toLowerCase().includes(q) ||
          d.therapeuticClass.toLowerCase().includes(q),
      )
      .slice(0, 40);
  }, [drugs, query]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative min-w-0">
      {selected ? (
        <div className="flex h-9 items-center justify-between rounded-md border border-[var(--attio-border)] bg-white px-3 text-[13px] focus-within:border-[var(--attio-text)] focus-within:ring-1 focus-within:ring-[var(--attio-text)]">
          <span className="truncate" title={`${selected.brandName} (${selected.genericName})`}>
            {selected.brandName}
            <span className="ml-1 text-[var(--attio-text-tertiary)]">({selected.genericName})</span>
          </span>
          <button
            type="button"
            onClick={() => {
              onChange("");
              setQuery("");
              setOpen(true);
            }}
            className="ml-2 shrink-0 rounded p-1 hover:bg-[var(--attio-hover)]"
          >
            <X className="size-3.5 text-[var(--attio-text-tertiary)]" />
          </button>
        </div>
      ) : (
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
            placeholder={placeholder}
            className="h-9 w-full rounded-md border border-[var(--attio-border)] bg-white pl-9 pr-3 text-[13px] outline-none focus:border-[var(--attio-text)] focus:ring-1 focus:ring-[var(--attio-text)]"
          />
        </div>
      )}
      {open && !selected && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-72 min-w-[300px] max-w-[420px] overflow-auto rounded-md border border-[var(--attio-border)] bg-white py-1 shadow-xl">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-[12px] text-[var(--attio-text-tertiary)]">No medicines found</div>
          ) : (
            <>
              <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-[var(--attio-text-tertiary)]">
                {filtered.length} medicine{filtered.length === 1 ? "" : "s"} found
              </div>
              {filtered.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    onChange(d.id);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="w-full px-3 py-2 text-left text-[13px] transition-colors hover:bg-[var(--attio-hover)] focus:bg-[var(--attio-hover)]"
                >
                  <div className="font-medium">{d.brandName}</div>
                  <div className="text-[11px] text-[var(--attio-text-tertiary)]">
                    {d.genericName} · {d.strength} · {d.form}
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
