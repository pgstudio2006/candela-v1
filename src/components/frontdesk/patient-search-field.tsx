"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Search, User } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { patientDisplayName } from "@/lib/frontdesk-workflow";

type SearchablePatient = {
  id: string;
  uhid: string;
  name: string;
  fullName?: string | null;
  phone: string;
};

type PatientSearchFieldProps<T extends SearchablePatient = SearchablePatient> = {
  value: string;
  onChange: (uhidOrQuery: string, patient?: T) => void;
  patients: T[];
  placeholder?: string;
  className?: string;
};

export function PatientSearchField<T extends SearchablePatient = SearchablePatient>({
  value,
  onChange,
  patients,
  placeholder = "Search by UHID, phone, or name…",
  className,
}: PatientSearchFieldProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left: number; width: number } | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    const phoneNorm = q.replace(/\D/g, "").slice(-10);
    return patients
      .filter((p) => {
        const name = patientDisplayName(p).toLowerCase();
        if (p.uhid.toLowerCase().includes(q)) return true;
        if (name.includes(q)) return true;
        if (phoneNorm && p.phone.replace(/\D/g, "").endsWith(phoneNorm)) return true;
        return false;
      })
      .slice(0, 12);
  }, [query, patients]);

  useEffect(() => {
    if (!open || !wrapperRef.current) {
      setDropdownStyle(null);
      return;
    }
    const update = () => {
      const rect = wrapperRef.current!.getBoundingClientRect();
      setDropdownStyle({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  const dropdown = open && results.length > 0 && dropdownStyle && (
    <ul
      className="fixed z-[500] mt-1 max-h-80 w-full overflow-auto rounded-lg border border-[var(--attio-border)] bg-white py-1 shadow-lg"
      style={{ top: dropdownStyle.top, left: dropdownStyle.left, width: dropdownStyle.width }}
    >
      {results.map((p) => (
        <li key={p.id}>
          <button
            type="button"
            className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[var(--attio-hover)]"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setQuery(p.uhid);
              onChange(p.uhid, p);
              setOpen(false);
            }}
          >
            <div className="flex size-8 items-center justify-center rounded-full bg-[var(--attio-surface)]">
              <User className="size-4 text-[var(--attio-text-tertiary)]" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium">{patientDisplayName(p)}</p>
              <p className="text-[11px] text-[var(--attio-text-tertiary)]">{p.uhid} · {p.phone}</p>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <div className={cn("relative", className)} ref={wrapperRef}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--attio-text-tertiary)]" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className="h-9 pl-9 text-[13px]"
        />
      </div>
      {typeof document !== "undefined" && dropdown && createPortal(dropdown, document.body)}
    </div>
  );
}
