"use client";

import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import type { ReactNode } from "react";

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
