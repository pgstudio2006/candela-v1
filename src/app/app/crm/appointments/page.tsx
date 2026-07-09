"use client";

import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, Panel, StatusBadge } from "@/components/frontdesk/ui";
import { Calendar, ExternalLink, Search, Stethoscope } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type AppointmentData = {
  doctors: { id: string; name: string; department: string }[];
  appointments: {
    id: string;
    patientId: string;
    patientName: string;
    patientUhid: string;
    patientPhone: string;
    doctorId: string | null;
    doctorName: string;
    date: string | null;
    time: string | null;
    status: string;
    source: string | null;
  }[];
};

export default function CrmAppointmentsPage() {
  const [data, setData] = useState<AppointmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [doctorFilter, setDoctorFilter] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/crm/appointments", { credentials: "include" });
        const json = await res.json();
        if (json.ok) {
          setData(json.data);
          setError(null);
        } else {
          setError(json.error ?? "Failed to load appointments.");
        }
      } catch {
        setError("Failed to connect.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredAppointments = useMemo(() => {
    if (!data) return [];
    return data.appointments.filter((a) => {
      if (doctorFilter && a.doctorId !== doctorFilter) return false;
      if (query) {
        const q = query.toLowerCase();
        return (
          a.patientName.toLowerCase().includes(q) ||
          a.patientUhid.toLowerCase().includes(q) ||
          a.patientPhone.includes(q) ||
          a.doctorName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [data, doctorFilter, query]);

  const groupedByDate = useMemo(() => {
    const map = new Map<string, typeof filteredAppointments>();
    for (const a of filteredAppointments) {
      const date = a.date ?? "No date";
      const existing = map.get(date) ?? [];
      existing.push(a);
      map.set(date, existing);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredAppointments]);

  return (
    <PageChrome
      breadcrumbs={[{ label: "CRM", href: "/app/crm" }, { label: "Appointments" }]}
      title="Appointments"
      meta="View all branch appointments · book for converted patients"
      actions={
        <Link
          href="/app/frontdesk/appointments"
          target="_blank"
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--attio-text)] px-3 text-[12px] font-medium text-white hover:opacity-90"
        >
          <ExternalLink className="size-3.5" />
          Book appointment
        </Link>
      }
    >
      <Panel title="Filters">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--attio-text-tertiary)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search patient, doctor, UHID…"
              className="h-9 w-full rounded-lg border border-[var(--attio-border)] pl-9 pr-3 text-[13px]"
            />
          </div>
          <select
            value={doctorFilter}
            onChange={(e) => setDoctorFilter(e.target.value)}
            className="h-9 rounded-lg border border-[var(--attio-border)] px-3 text-[13px]"
          >
            <option value="">All doctors</option>
            {data?.doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} {d.department ? `(${d.department})` : ""}
              </option>
            ))}
          </select>
        </div>
      </Panel>

      <div className="mt-4">
        {loading ? (
          <Panel title="Loading…">
            <p className="py-4 text-[13px] text-[var(--attio-text-tertiary)]">Fetching appointments…</p>
          </Panel>
        ) : error ? (
          <Panel title="Error">
            <p className="py-4 text-[13px] text-red-600">{error}</p>
          </Panel>
        ) : groupedByDate.length === 0 ? (
          <Panel title="No appointments">
            <p className="py-4 text-[13px] text-[var(--attio-text-tertiary)]">
              No appointments found. Book a new appointment from the Front Desk workspace using the button above.
            </p>
          </Panel>
        ) : (
          <div className="space-y-4">
            {groupedByDate.map(([date, appts]) => (
              <Panel key={date} title={date === "No date" ? "Unscheduled" : new Date(date).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}>
                <ul className="space-y-2">
                  {appts.map((a) => (
                    <li key={a.id} className="flex items-center justify-between rounded-lg border border-[var(--attio-border-subtle)] p-3 text-[13px]">
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 items-center justify-center rounded-full bg-[var(--attio-surface)]">
                          <Calendar className="size-4 text-[var(--attio-text-tertiary)]" />
                        </div>
                        <div>
                          <p className="font-medium">{a.patientName} <span className="text-[var(--attio-text-tertiary)]">· {a.patientUhid}</span></p>
                          <p className="text-[var(--attio-text-tertiary)]">
                            {a.time ?? "—"} · {a.doctorName || "Unassigned"}
                            {a.source ? ` · ${a.source}` : ""}
                          </p>
                        </div>
                      </div>
                      <StatusBadge
                        label={a.status}
                        variant={a.status === "scheduled" ? "info" : a.status === "completed" ? "success" : "neutral"}
                      />
                    </li>
                  ))}
                </ul>
              </Panel>
            ))}
          </div>
        )}
      </div>

      {data && data.doctors.length > 0 && (
        <Panel title="Doctors" className="mt-4">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {data.doctors.map((d) => (
              <div key={d.id} className="rounded-lg border border-[var(--attio-border-subtle)] p-3">
                <div className="flex items-center gap-2">
                  <Stethoscope className="size-4 text-[var(--attio-text-tertiary)]" />
                  <p className="text-[13px] font-medium">{d.name}</p>
                </div>
                {d.department && <p className="mt-1 text-[11px] text-[var(--attio-text-tertiary)]">{d.department}</p>}
                <p className="mt-1 text-[11px] text-[var(--attio-text-tertiary)]">
                  {data.appointments.filter((a) => a.doctorId === d.id).length} appointments
                </p>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </PageChrome>
  );
}
