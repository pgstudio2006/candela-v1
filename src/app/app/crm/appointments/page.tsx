"use client";

import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, Panel, StatusBadge } from "@/components/frontdesk/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Calendar, Plus, Search, Stethoscope } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type AppointmentData = {
  branches: { id: string; name: string }[];
  selectedBranchId: string;
  departments: { id: string; label: string }[];
  doctors: { id: string; name: string; department: string; departmentIds: string[] }[];
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

  const [bookingOpen, setBookingOpen] = useState(false);
  const [patients, setPatients] = useState<{ id: string; fullName: string | null; uhid: string; phone: string | null }[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [selectedDepartmentId, setSelectedDepartmentId] = useState("");
  const [selectedPatientUhid, setSelectedPatientUhid] = useState("");
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("15");
  const [notes, setNotes] = useState("");
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  const loadPatients = async (branchId: string) => {
    try {
      const res = await fetch(`/api/crm/patients?branchId=${encodeURIComponent(branchId)}`, { credentials: "include" });
      const json = await res.json();
      if (json.ok) setPatients((json.data ?? []).map((p: any) => ({ id: p.id, fullName: p.fullName, uhid: p.uhid, phone: p.phone })));
    } catch {
      setPatients([]);
    }
  };

  useEffect(() => {
    if (bookingOpen && selectedBranchId) {
      void loadPatients(selectedBranchId);
    }
  }, [bookingOpen, selectedBranchId]);

  const load = async (branchId?: string) => {
    try {
      const url = branchId
        ? `/api/crm/appointments?branchId=${encodeURIComponent(branchId)}`
        : "/api/crm/appointments";
      const res = await fetch(url, { credentials: "include" });
      const json = await res.json();
      if (json.ok) {
        setData(json.data);
        setSelectedBranchId(json.data.selectedBranchId);
        setError(null);
      } else {
        setError(json.error ?? "Failed to load appointments.");
      }
    } catch {
      setError("Failed to connect.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
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

  const handleBook = async () => {
    if (!selectedBranchId || !selectedDepartmentId || !selectedDoctorId || !selectedPatientUhid || !date || !time) {
      setBookingError("Please select a branch, department, doctor, patient, date and time.");
      return;
    }
    const doctor = data?.doctors.find((d) => d.id === selectedDoctorId);
    if (!doctor) {
      setBookingError("Selected doctor not found.");
      return;
    }
    setBookingLoading(true);
    setBookingError(null);
    try {
      const res = await fetch("/api/crm/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          patientUhid: selectedPatientUhid,
          doctorId: selectedDoctorId,
          departmentId: selectedDepartmentId,
          branchId: selectedBranchId,
          date,
          time,
          duration,
          notes,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setBookingOpen(false);
        setSelectedPatientUhid("");
        setSelectedDoctorId("");
        setSelectedDepartmentId("");
        setDate("");
        setTime("");
        setDuration("15");
        setNotes("");
        await load();
      } else {
        setBookingError(json.error ?? "Booking failed.");
      }
    } catch {
      setBookingError("Network error. Please try again.");
    } finally {
      setBookingLoading(false);
    }
  };

  return (
    <PageChrome
      breadcrumbs={[{ label: "CRM", href: "/app/crm" }, { label: "Appointments" }]}
      title="Appointments"
      meta="View all branch appointments · book for converted patients"
      actions={
        <AttioButton
          variant="primary"
          onClick={() => setBookingOpen(true)}
        >
          <Plus className="size-3.5" />
          Book appointment
        </AttioButton>
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

      <Dialog open={bookingOpen} onOpenChange={setBookingOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Book appointment</DialogTitle>
            <DialogDescription>Schedule an appointment for a converted patient.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 text-[13px]">
            <div>
              <Label className="text-[12px]">Branch</Label>
              <select
                value={selectedBranchId}
                onChange={(e) => {
                  const branchId = e.target.value;
                  setSelectedBranchId(branchId);
                  setSelectedDepartmentId("");
                  setSelectedDoctorId("");
                  setSelectedPatientUhid("");
                  void load(branchId);
                  void loadPatients(branchId);
                }}
                className="mt-1 h-9 w-full rounded-md border px-2 text-[13px]"
              >
                <option value="">Select branch</option>
                {data?.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-[12px]">Department</Label>
              <select
                value={selectedDepartmentId}
                onChange={(e) => {
                  setSelectedDepartmentId(e.target.value);
                  setSelectedDoctorId("");
                }}
                className="mt-1 h-9 w-full rounded-md border px-2 text-[13px]"
              >
                <option value="">Select department</option>
                {data?.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-[12px]">Doctor</Label>
              <select
                value={selectedDoctorId}
                onChange={(e) => setSelectedDoctorId(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border px-2 text-[13px]"
              >
                <option value="">Select doctor</option>
                {data?.doctors
                  .filter((d) => !selectedDepartmentId || d.departmentIds.includes(selectedDepartmentId))
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} {d.department ? `(${d.department})` : ""}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <Label className="text-[12px]">Patient</Label>
              <select
                value={selectedPatientUhid}
                onChange={(e) => setSelectedPatientUhid(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border px-2 text-[13px]"
              >
                <option value="">Select patient</option>
                {patients.map((p) => (
                  <option key={p.uhid} value={p.uhid}>
                    {p.fullName || p.uhid} · {p.uhid} · {p.phone ?? "—"}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[12px]">Date</Label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border px-2 text-[13px]"
                />
              </div>
              <div>
                <Label className="text-[12px]">Time</Label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border px-2 text-[13px]"
                />
              </div>
            </div>
            <div>
              <Label className="text-[12px]">Duration (minutes)</Label>
              <input
                type="number"
                min={5}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border px-2 text-[13px]"
              />
            </div>
            <div>
              <Label className="text-[12px]">Notes</Label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-md border px-2 py-1.5 text-[13px]"
              />
            </div>
            {bookingError && <p className="text-[12px] text-red-600">{bookingError}</p>}
          </div>
          <DialogFooter>
            <AttioButton variant="secondary" onClick={() => setBookingOpen(false)}>
              Cancel
            </AttioButton>
            <AttioButton variant="primary" disabled={bookingLoading} onClick={() => void handleBook()}>
              {bookingLoading ? "Booking…" : "Book appointment"}
            </AttioButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageChrome>
  );
}
