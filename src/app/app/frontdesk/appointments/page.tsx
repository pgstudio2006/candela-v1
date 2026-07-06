"use client";

import { useFrontdeskStore } from "@/components/frontdesk/frontdesk-store";
import { PublishedSchemaForm } from "@/components/candela/published-schema-form";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { useFrontdeskFormSchema } from "@/components/frontdesk/use-frontdesk-form-schema";
import { AttioButton, Panel, StatusBadge } from "@/components/frontdesk/ui";
import { PatientSearchField } from "@/components/frontdesk/patient-search-field";
import { useToast } from "@/components/ui/toast-provider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { generateDaySlots, formatDisplayDate } from "@/lib/appointment-slots";
import { patientDisplayName } from "@/lib/frontdesk-workflow";
import { subsetSchema } from "@/lib/schema-registry";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";

export default function AppointmentsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const {
    bookAppointment,
    cancelAppointment,
    rescheduleAppointment,
    appointments,
    getPatient,
    patients,
    roster,
    saveSubmission,
  } = useFrontdeskStore();
  const appointmentSchema = useFrontdeskFormSchema("appointment", roster);
  const bookingFieldsSchema = useMemo(
    () => subsetSchema(appointmentSchema, ["duration", "notes"]),
    [appointmentSchema],
  );
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [listDate, setListDate] = useState(new Date().toISOString().slice(0, 10));
  const [deptId, setDeptId] = useState("dept_spine");
  const [doctorId, setDoctorId] = useState("");
  const [selectedPatientUhid, setSelectedPatientUhid] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [duration, setDuration] = useState(20);
  const [notes, setNotes] = useState("");
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");

  const doctors = roster.doctorsByDept[deptId] ?? roster.allDoctors;
  const activeDoctorId = doctorId || doctors[0]?.id || "";

  const booked = useMemo(
    () =>
      appointments
        .filter((a) => a.status !== "cancelled" && a.date === date)
        .map((a) => ({
          time: a.time,
          doctorId: a.doctorId,
          patientName: getPatient(a.patientId)?.name,
        })),
    [appointments, date, getPatient],
  );

  const [adminSlots, setAdminSlots] = useState<any[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const loadAdminSlots = async () => {
    setLoadingSlots(true);
    try {
      const res = await fetch(`/api/admin/slots?date=${date}&doctorId=${activeDoctorId}`, { credentials: "include" });
      const json = await res.json();
      if (json.ok) {
        setAdminSlots(json.data);
      }
    } catch (error) {
      console.error("Failed to load slots:", error);
    } finally {
      setLoadingSlots(false);
    }
  };

  useEffect(() => {
    loadAdminSlots();
  }, [date, activeDoctorId]);

  const slots = useMemo(() => {
    if (adminSlots.length > 0) {
      return adminSlots.map((slot) => ({
        time: slot.startTime,
        available: slot.status === "available" && slot.booked < slot.capacity,
        bookedPatient: slot.booked > 0 ? "Booked" : undefined,
        slotId: slot.id,
      }));
    }
    return generateDaySlots(deptId, booked, activeDoctorId);
  }, [adminSlots, deptId, booked, activeDoctorId]);

  const dayAppointments = useMemo(
    () =>
      appointments
        .filter((a) => a.date === listDate)
        .sort((a, b) => a.time.localeCompare(b.time)),
    [appointments, listDate],
  );

  const handleBook = async () => {
    if (!selectedPatientUhid) {
      toast("Select a patient first", "error");
      return;
    }
    if (!selectedTime) {
      toast("Select a time slot", "error");
      return;
    }

    const result = await bookAppointment({
      patient: selectedPatientUhid,
      department: deptId,
      doctor: activeDoctorId,
      date,
      time: selectedTime,
      duration: String(duration),
      notes,
    });
    if (result.error || !result.visitId) {
      toast(result.error ?? "Could not book — patient not found or slot taken", "error");
      return;
    }
    await saveSubmission("appointment", {
      patient: selectedPatientUhid,
      department: deptId,
      doctor: activeDoctorId,
      date,
      time: selectedTime,
      duration,
      notes,
    }, { visitId: result.visitId });
    toast("Appointment booked", "success");
    router.push(`/app/frontdesk/check-in?visit=${result.visitId}`);
  };

  const handleCancel = async (appointmentId: string) => {
    const result = await cancelAppointment(appointmentId);
    if (!result.ok) {
      toast(result.error ?? "Could not cancel", "error");
      return;
    }
    toast("Appointment cancelled", "success");
  };

  const handleReschedule = async (appointmentId: string) => {
    if (!rescheduleDate || !rescheduleTime) {
      toast("Pick a new date and time", "error");
      return;
    }

    const result = await rescheduleAppointment(appointmentId, {
      date: rescheduleDate,
      time: rescheduleTime,
    });
    if (!result.ok) {
      toast(result.error ?? "Could not reschedule", "error");
      return;
    }
    toast("Appointment rescheduled", "success");
    setRescheduleId(null);
    setRescheduleDate("");
    setRescheduleTime("");
  };

  return (
    <PageChrome
      breadcrumbs={[{ label: "Front Desk", href: "/app/frontdesk" }, { label: "Appointments" }]}
      title="Appointments"
      meta="Book · list · cancel · reschedule"
    >
      <Tabs defaultValue="book">
        <TabsList>
          <TabsTrigger value="book">Book</TabsTrigger>
          <TabsTrigger value="list">Today&apos;s list</TabsTrigger>
        </TabsList>

        <TabsContent value="book" className="mt-4">
          <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
            <Panel title={`Schedule · ${formatDisplayDate(date)}`}>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <AttioButton variant="secondary" className="!h-8" onClick={() => {
                  const d = new Date(date);
                  d.setDate(d.getDate() - 1);
                  setDate(d.toISOString().slice(0, 10));
                }}><ChevronLeft className="size-3.5" /></AttioButton>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-40 text-[13px]" />
                <AttioButton variant="secondary" className="!h-8" onClick={() => {
                  const d = new Date(date);
                  d.setDate(d.getDate() + 1);
                  setDate(d.toISOString().slice(0, 10));
                }}><ChevronRight className="size-3.5" /></AttioButton>
                <select className="h-9 rounded-md border px-2 text-[13px]" value={deptId} onChange={(e) => setDeptId(e.target.value)}>
                  {roster.departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.label}</option>
                  ))}
                </select>
                <select className="h-9 rounded-md border px-2 text-[13px]" value={activeDoctorId} onChange={(e) => setDoctorId(e.target.value)}>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
                {slots.map((slot) => (
                  <button
                    key={slot.time}
                    type="button"
                    disabled={!slot.available}
                    onClick={() => slot.available && setSelectedTime(slot.time)}
                    className={cn(
                      "rounded-lg border px-2 py-3 text-center text-[12px] transition-colors",
                      !slot.available && "cursor-not-allowed border-zinc-100 bg-zinc-50 text-zinc-400",
                      slot.available && selectedTime === slot.time && "border-[var(--attio-accent)] bg-blue-50 font-medium text-blue-900",
                      slot.available && selectedTime !== slot.time && "border-[var(--attio-border-subtle)] hover:bg-[var(--attio-hover)]",
                    )}
                  >
                    <p>{slot.time}</p>
                    {slot.bookedPatient && <p className="mt-0.5 truncate text-[10px]">{slot.bookedPatient.split(" ")[0]}</p>}
                  </button>
                ))}
              </div>
            </Panel>

            <Panel title="Book appointment">
              <div className="space-y-4">
                <div>
                  <p className="mb-1.5 text-[12px] font-medium text-[var(--attio-text-secondary)]">Patient *</p>
                  <PatientSearchField
                    value={selectedPatientUhid}
                    patients={patients}
                    onChange={(uhid) => setSelectedPatientUhid(uhid)}
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-[12px] font-medium text-[var(--attio-text-secondary)]">Selected slot</p>
                  <p className="rounded-md bg-[var(--attio-surface)] px-3 py-2 text-[13px]">
                    {selectedTime ? `${formatDisplayDate(date)} · ${selectedTime}` : "Click a slot on the calendar"}
                  </p>
                </div>
                <PublishedSchemaForm
                  schema={bookingFieldsSchema}
                  hideSubmit
                  initialValues={{ duration: String(duration), notes }}
                  onValuesChange={(values) => {
                    if (values.duration != null && values.duration !== "") {
                      setDuration(Number(values.duration));
                    }
                    if (values.notes != null) setNotes(String(values.notes));
                  }}
                />
                <AttioButton variant="primary" className="w-full" onClick={handleBook}>
                  Book slot
                </AttioButton>
              </div>
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="list" className="mt-4">
          <Panel title={`Appointments · ${formatDisplayDate(listDate)}`}>
            <div className="mb-4 flex items-center gap-2">
              <Input
                type="date"
                value={listDate}
                onChange={(e) => setListDate(e.target.value)}
                className="h-9 w-40 text-[13px]"
              />
            </div>
            <ul className="divide-y divide-[var(--attio-border-subtle)]">
              {dayAppointments.length === 0 && (
                <li className="py-8 text-center text-[13px] text-[var(--attio-text-tertiary)]">No appointments</li>
              )}
              {dayAppointments.map((a) => {
                const p = getPatient(a.patientId);
                const isRescheduling = rescheduleId === a.id;
                return (
                  <li key={a.id} className="py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[13px] font-medium">
                          {a.time} · {p ? patientDisplayName(p) : "Unknown"}
                        </p>
                        <p className="text-[12px] text-[var(--attio-text-tertiary)]">
                          {a.doctorName} · {p?.uhid ?? "—"}
                        </p>
                        {a.notes && <p className="mt-1 text-[12px] text-[var(--attio-text-secondary)]">{a.notes}</p>}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge
                          label={a.status}
                          variant={a.status === "cancelled" ? "neutral" : a.status === "checked_in" ? "success" : "info"}
                        />
                        {a.status === "booked" && (
                          <>
                            <AttioButton
                              variant="secondary"
                              className="!h-8 text-[11px]"
                              onClick={() => {
                                setRescheduleId(a.id);
                                setRescheduleDate(a.date);
                                setRescheduleTime(a.time);
                              }}
                            >
                              Reschedule
                            </AttioButton>
                            <AttioButton
                              variant="secondary"
                              className="!h-8 text-[11px]"
                              onClick={() => void handleCancel(a.id)}
                            >
                              Cancel
                            </AttioButton>
                            {a.visitId && (
                              <AttioButton
                                variant="primary"
                                className="!h-8 text-[11px]"
                                onClick={() => router.push(`/app/frontdesk/check-in?visit=${a.visitId}`)}
                              >
                                Check in
                              </AttioButton>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    {isRescheduling && (
                      <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-[var(--attio-surface)] p-3">
                        <div>
                          <p className="mb-1 text-[11px] text-[var(--attio-text-tertiary)]">New date</p>
                          <Input
                            type="date"
                            value={rescheduleDate}
                            onChange={(e) => setRescheduleDate(e.target.value)}
                            className="h-9 w-36 text-[13px]"
                          />
                        </div>
                        <div>
                          <p className="mb-1 text-[11px] text-[var(--attio-text-tertiary)]">New time</p>
                          <Input
                            type="time"
                            value={rescheduleTime}
                            onChange={(e) => setRescheduleTime(e.target.value)}
                            className="h-9 w-28 text-[13px]"
                          />
                        </div>
                        <AttioButton variant="primary" className="!h-9" onClick={() => void handleReschedule(a.id)}>
                          Confirm
                        </AttioButton>
                        <AttioButton variant="secondary" className="!h-9" onClick={() => setRescheduleId(null)}>
                          Cancel
                        </AttioButton>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Panel>
        </TabsContent>
      </Tabs>
    </PageChrome>
  );
}
