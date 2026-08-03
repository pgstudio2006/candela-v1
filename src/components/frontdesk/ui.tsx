"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/** @deprecated Use PageChrome for page-level headers */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 className="text-[15px] font-semibold text-[var(--attio-text)]">{title}</h2>
        {description && (
          <p className="mt-0.5 text-[13px] text-[var(--attio-text-tertiary)]">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function MetricStrip({
  metrics,
  className,
}: {
  metrics: { label: string; value: string; delta: string; trend?: "up" | "down" | "neutral" }[];
  className?: string;
}) {
  const n = metrics.length;
  const cols =
    n <= 2
      ? "grid-cols-2"
      : n === 3
        ? "grid-cols-2 sm:grid-cols-3"
        : n === 4
          ? "grid-cols-2 lg:grid-cols-4"
          : n === 5
            ? "grid-cols-2 sm:grid-cols-3 xl:grid-cols-5"
            : n === 6
              ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
              : n === 7
                ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
                : "grid-cols-2 sm:grid-cols-4 lg:grid-cols-4";

  return (
    <div
      className={cn(
        "grid gap-px overflow-hidden rounded-lg border border-[var(--attio-border)] bg-[var(--attio-border)]",
        cols,
        className ?? "mb-5",
      )}
    >
      {metrics.map((m) => (
        <div key={m.label} className="bg-white px-4 py-3">
          <p className="text-[11px] text-[var(--attio-text-tertiary)]">{m.label}</p>
          <p className="mt-0.5 text-[20px] font-semibold tabular-nums tracking-tight text-[var(--attio-text)]">
            {m.value}
          </p>
          <p
            className={cn(
              "mt-0.5 text-[11px]",
              m.trend === "up" && "text-emerald-600",
              m.trend === "down" && "text-amber-600",
              (!m.trend || m.trend === "neutral") && "text-[var(--attio-text-tertiary)]",
            )}
          >
            {m.delta}
          </p>
        </div>
      ))}
    </div>
  );
}

export function Panel({
  title,
  children,
  className,
  action,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <div className={cn("rounded-lg border border-[var(--attio-border)] bg-white", className)}>
      <div className="flex items-center justify-between border-b border-[var(--attio-border-subtle)] px-4 py-2.5">
        <h3 className="text-[12px] font-semibold text-[var(--attio-text)]">{title}</h3>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export function StatusBadge({
  label,
  variant,
}: {
  label: string;
  variant: "success" | "warning" | "danger" | "neutral" | "info";
}) {
  const styles = {
    success: "text-emerald-700 bg-emerald-50",
    warning: "text-amber-700 bg-amber-50",
    danger: "text-red-700 bg-red-50",
    neutral: "text-[var(--attio-text-secondary)] bg-[var(--attio-surface)]",
    info: "text-blue-700 bg-blue-50",
  };
  return (
    <span className={cn("inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium", styles[variant])}>
      {label}
    </span>
  );
}

export function DataTable({
  columns,
  rows,
  onRowClick,
}: {
  columns: { key: string; label: string; className?: string }[];
  rows: Record<string, ReactNode>[];
  onRowClick?: (index: number) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--attio-border)]">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-[var(--attio-border)] bg-[var(--attio-surface)]">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "px-3 py-2 text-[11px] font-medium text-[var(--attio-text-tertiary)]",
                  c.className,
                )}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className={cn(
                "border-b border-[var(--attio-border-subtle)] last:border-0",
                onRowClick && "cursor-pointer hover:bg-[var(--attio-surface)]",
              )}
              onClick={() => onRowClick?.(i)}
            >
              {columns.map((c) => (
                <td key={c.key} className={cn("px-3 py-2.5 text-[var(--attio-text-secondary)]", c.className)}>
                  {row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AttioButton({
  children,
  variant = "primary",
  className,
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  }) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12px] font-medium transition-colors",
        variant === "primary" && "bg-[var(--attio-text)] text-white hover:bg-[#333]",
        variant === "secondary" && "border border-[var(--attio-border)] bg-white hover:bg-[var(--attio-surface)]",
        variant === "ghost" && "text-[var(--attio-text-secondary)] hover:bg-[var(--attio-hover)]",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
