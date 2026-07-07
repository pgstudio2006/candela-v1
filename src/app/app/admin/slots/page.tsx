"use client";

import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, Panel, StatusBadge } from "@/components/frontdesk/ui";
import { useAdminStore } from "@/components/admin/admin-store";
import { doctorIdFromStaffId } from "@/lib/clinical-roster";
import { useState, useEffect } from "react";
import { Calendar, Clock, Plus, Trash2, Copy, Filter, Timer } from "lucide-react";

type Slot = {
  id: string;
  doctorId?: string;
  doctorName?: string;
  departmentId?: string;
  date: string;
  startTime: string;
  endTime: string;
  capacity: number;
  booked: number;
  status: string;
  notes?: string;
};

type BulkSlotConfig = {
  doctorId: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  intervalMinutes: number;
  capacity: number;
  weekdays: string[];
  breakStartTime: string;
  breakEndTime: string;
};

export default function SlotManagementPage() {
  const { staff } = useAdminStore();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState("");
  const [filterDoctor, setFilterDoctor] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showBulkForm, setShowBulkForm] = useState(false);
  const [editing, setEditing] = useState<Slot | null>(null);
  const [bulkCreating, setBulkCreating] = useState(false);
  const [formData, setFormData] = useState({
    doctorId: "",
    doctorName: "",
    departmentId: "",
    date: "",
    startTime: "",
    endTime: "",
    duration: 30,
    capacity: 1,
    booked: 0,
    status: "available",
    notes: "",
  });
  const [bulkConfig, setBulkConfig] = useState<BulkSlotConfig>({
    doctorId: "",
    startDate: "",
    endDate: "",
    startTime: "15:00",
    endTime: "20:30",
    intervalMinutes: 30,
    capacity: 1,
    weekdays: ["mon", "tue", "wed", "thu", "fri"],
    breakStartTime: "",
    breakEndTime: "",
  });

  const calcEndTime = (start: string, durationMin: number) => {
    if (!start) return "";
    const [h, m] = start.split(":").map(Number);
    const total = h * 60 + m + durationMin;
    const eh = Math.floor(total / 60);
    const em = total % 60;
    return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
  };

  const calcSlotDuration = (start: string, end: string) => {
    if (!start || !end) return 0;
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    return (eh * 60 + em) - (sh * 60 + sm);
  };

  const previewSlotCount = (() => {
    if (!bulkConfig.startDate || !bulkConfig.endDate || !bulkConfig.startTime || !bulkConfig.endTime) return 0;
    const weekdayMap: Record<string, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 };
    const start = new Date(bulkConfig.startDate);
    const end = new Date(bulkConfig.endDate);
    const [sh, sm] = bulkConfig.startTime.split(":").map(Number);
    const [eh, em] = bulkConfig.endTime.split(":").map(Number);
    const dayStart = sh * 60 + sm;
    const dayEnd = eh * 60 + em;
    let perDay = Math.floor((dayEnd - dayStart) / bulkConfig.intervalMinutes);
    if (perDay <= 0) return 0;

    const breakStartMin = bulkConfig.breakStartTime ? bulkConfig.breakStartTime.split(":").map(Number).reduce((h: number, m: number) => h * 60 + m, 0) : -1;
    const breakEndMin = bulkConfig.breakEndTime ? bulkConfig.breakEndTime.split(":").map(Number).reduce((h: number, m: number) => h * 60 + m, 0) : -1;
    if (breakStartMin >= 0 && breakEndMin > breakStartMin) {
      let breakSlots = 0;
      let t = dayStart;
      while (t + bulkConfig.intervalMinutes <= dayEnd) {
        const slotEnd = t + bulkConfig.intervalMinutes;
        if (t < breakEndMin && slotEnd > breakStartMin) breakSlots++;
        t += bulkConfig.intervalMinutes;
      }
      perDay -= breakSlots;
    }

    let days = 0;
    const current = new Date(start);
    while (current <= end) {
      const dayKey = Object.keys(weekdayMap).find((k) => weekdayMap[k] === current.getDay());
      if (dayKey && bulkConfig.weekdays.includes(dayKey)) days++;
      current.setDate(current.getDate() + 1);
    }
    return days * perDay;
  })();

  const groupedSlots = (() => {
    const groups: Record<string, Slot[]> = {};
    for (const slot of slots) {
      if (!groups[slot.date]) groups[slot.date] = [];
      groups[slot.date].push(slot);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  })();

  const loadSlots = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterDate) params.set("date", filterDate);
      if (filterDoctor) params.set("doctorId", filterDoctor);
      const query = params.toString();
      const res = await fetch(`/api/admin/slots${query ? `?${query}` : ""}`, { credentials: "include" });
      const json = await res.json();
      if (json.ok) {
        setSlots(json.data);
      }
    } catch (error) {
      console.error("Failed to load slots:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSlots();
  }, [filterDate, filterDoctor]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const slotPayload = {
        ...formData,
        doctorId: formData.doctorId ? doctorIdFromStaffId(formData.doctorId) : formData.doctorId,
      };
      if (editing) {
        const res = await fetch(`/api/admin/slots/${editing.id}`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(slotPayload),
        });
        const json = await res.json();
        if (json.ok) {
          await loadSlots();
          setEditing(null);
        }
      } else {
        const res = await fetch("/api/admin/slots", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(slotPayload),
        });
        const json = await res.json();
        if (json.ok) {
          await loadSlots();
        }
      }
      setShowForm(false);
      setFormData({
        doctorId: "",
        doctorName: "",
        departmentId: "",
        date: "",
        startTime: "",
        endTime: "",
        duration: 30,
        capacity: 1,
        booked: 0,
        status: "available",
        notes: "",
      });
    } catch (error) {
      console.error("Failed to save slot:", error);
    }
  };

  const handleEdit = (slot: Slot) => {
    setEditing(slot);
    setFormData({
      doctorId: slot.doctorId || "",
      doctorName: slot.doctorName || "",
      departmentId: slot.departmentId || "",
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      duration: calcSlotDuration(slot.startTime, slot.endTime) || 30,
      capacity: slot.capacity,
      booked: slot.booked,
      status: slot.status,
      notes: slot.notes || "",
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/slots/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json();
      if (json.ok) {
        await loadSlots();
      } else {
        alert(json.error || "Failed to delete slot");
      }
    } catch (error) {
      console.error("Failed to delete slot:", error);
      alert("Failed to delete slot");
    }
  };

  const handleToggleStatus = async (id: string) => {
    const slot = slots.find((s) => s.id === id);
    if (!slot) return;
    try {
      const newStatus = slot.status === "available" ? "blocked" : "available";
      const res = await fetch(`/api/admin/slots/${id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...slot, status: newStatus }),
      });
      const json = await res.json();
      if (json.ok) {
        await loadSlots();
      }
    } catch (error) {
      console.error("Failed to toggle slot status:", error);
    }
  };

  const handleClearAll = async () => {
    if (!confirm("Are you sure you want to delete ALL slots? This cannot be undone.")) {
      return;
    }
    try {
      const res = await fetch("/api/admin/slots?all=true", {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json();
      if (json.ok) {
        alert(`Deleted ${json.deleted} slots`);
        await loadSlots();
      } else {
        alert(json.error || "Failed to clear slots");
      }
    } catch (error) {
      console.error("Failed to clear slots:", error);
      alert("Failed to clear slots");
    }
  };

  const handleClearByDate = async () => {
    if (!filterDate) {
      alert("Select a date to clear slots for that date");
      return;
    }
    if (!confirm(`Delete all slots for ${filterDate}? This will cancel any booked appointments.`)) {
      return;
    }
    try {
      const params = new URLSearchParams({ date: filterDate });
      if (filterDoctor) params.set("doctorId", filterDoctor);
      const res = await fetch(`/api/admin/slots?${params.toString()}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json();
      if (json.ok) {
        alert(`Deleted ${json.deleted} slots for ${filterDate}`);
        await loadSlots();
      } else {
        alert(json.error || "Failed to clear slots");
      }
    } catch (error) {
      console.error("Failed to clear slots by date:", error);
      alert("Failed to clear slots");
    }
  };

  const handleToggleDate = async () => {
    if (!filterDate) {
      alert("Select a date first");
      return;
    }
    const dateSlots = slots.filter((s) => s.date === filterDate);
    if (dateSlots.length === 0) {
      alert(`No slots found for ${filterDate}`);
      return;
    }
    const allBlocked = dateSlots.every((s) => s.status === "blocked");
    const newStatus = allBlocked ? "available" : "blocked";
    const action = allBlocked ? "unblock" : "block";
    if (!confirm(`${action === "block" ? "Block" : "Unblock"} all ${dateSlots.length} slots for ${filterDate}?`)) {
      return;
    }
    let ok = 0;
    let fail = 0;
    for (const slot of dateSlots) {
      try {
        const res = await fetch(`/api/admin/slots/${slot.id}`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...slot, status: newStatus }),
        });
        const json = await res.json();
        if (json.ok) ok++; else fail++;
      } catch {
        fail++;
      }
    }
    await loadSlots();
    alert(`${action === "block" ? "Blocked" : "Unblocked"} ${ok} slots${fail > 0 ? `, ${fail} failed` : ""}`);
  };

  const handleBulkCreate = async () => {
    const { doctorId, startDate, endDate, startTime, endTime, intervalMinutes, capacity, weekdays, breakStartTime, breakEndTime } = bulkConfig;
    
    console.log("Bulk create config:", bulkConfig);
    
    if (!doctorId) {
      alert("Please select a doctor");
      return;
    }
    if (!startDate || !endDate) {
      alert("Please select date range");
      return;
    }
    if (weekdays.length === 0) {
      alert("Please select at least one weekday");
      return;
    }

    setBulkCreating(true);

    const doctor = staff.find((s) => s.id === doctorId);
    const doctorName = doctor?.name || "";
    const normalizedDoctorId = doctorId ? doctorIdFromStaffId(doctorId) : doctorId;

    const start = new Date(startDate);
    const end = new Date(endDate);
    const weekdayMap: Record<string, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 };

    const breakStartMin = breakStartTime ? breakStartTime.split(":").map(Number).reduce((h: number, m: number) => h * 60 + m, 0) : -1;
    const breakEndMin = breakEndTime ? breakEndTime.split(":").map(Number).reduce((h: number, m: number) => h * 60 + m, 0) : -1;

    const slotsToCreate: any[] = [];
    let current = new Date(start);

    while (current <= end) {
      const dayOfWeek = current.getDay();
      const dayKey = Object.keys(weekdayMap).find((k) => weekdayMap[k] === dayOfWeek);
      
      if (dayKey && weekdays.includes(dayKey)) {
        const [startHour, startMin] = startTime.split(":").map(Number);
        const [endHour, endMin] = endTime.split(":").map(Number);

        let slotTime = startHour * 60 + startMin;
        const endTimeMinutes = endHour * 60 + endMin;

        while (slotTime + intervalMinutes <= endTimeMinutes) {
          const slotEnd = slotTime + intervalMinutes;

          if (breakStartMin >= 0 && breakEndMin > breakStartMin) {
            const overlapsBreak = slotTime < breakEndMin && slotEnd > breakStartMin;
            if (overlapsBreak) {
              slotTime += intervalMinutes;
              continue;
            }
          }

          const slotStart = `${String(Math.floor(slotTime / 60)).padStart(2, "0")}:${String(slotTime % 60).padStart(2, "0")}`;
          const slotEndStr = `${String(Math.floor(slotEnd / 60)).padStart(2, "0")}:${String(slotEnd % 60).padStart(2, "0")}`;

          slotsToCreate.push({
            doctorId: normalizedDoctorId,
            doctorName,
            date: current.toISOString().slice(0, 10),
            startTime: slotStart,
            endTime: slotEndStr,
            capacity,
            booked: 0,
            status: "available",
          });

          slotTime += intervalMinutes;
        }
      }
      current.setDate(current.getDate() + 1);
    }

    console.log(`Creating ${slotsToCreate.length} slots...`);

    if (slotsToCreate.length === 0) {
      setBulkCreating(false);
      alert("No slots to create based on the configuration");
      return;
    }

    try {
      let successCount = 0;
      let failCount = 0;
      
      for (const slot of slotsToCreate) {
        try {
          const res = await fetch("/api/admin/slots", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(slot),
          });
          const json = await res.json();
          if (json.ok) {
            successCount++;
          } else {
            console.error("Failed to create slot:", json.error);
            failCount++;
          }
        } catch (error) {
          console.error("Error creating slot:", error);
          failCount++;
        }
      }
      
      await loadSlots();
      setShowBulkForm(false);
      setBulkCreating(false);
      
      if (failCount > 0) {
        alert(`Created ${successCount} slots, ${failCount} failed`);
      } else {
        alert(`Successfully created ${successCount} slots`);
      }
    } catch (error) {
      console.error("Failed to create bulk slots:", error);
      setBulkCreating(false);
      alert("Failed to create slots");
    }
  };

  return (
    <PageChrome
      breadcrumbs={[{ label: "Admin", href: "/app/admin" }, { label: "Slot Management" }]}
      title="Slot management"
      meta="Manage appointment slots · Doctor scheduling · Capacity control"
      actions={
        <div className="flex gap-2">
          {slots.length > 0 && (
            <AttioButton variant="secondary" onClick={handleClearAll}>
              <Trash2 className="size-3.5 mr-1.5" />
              Clear all
            </AttioButton>
          )}
          <AttioButton variant="secondary" onClick={() => setShowBulkForm(true)}>
            <Copy className="size-3.5 mr-1.5" />
            Availability schedule
          </AttioButton>
          <AttioButton variant="primary" onClick={() => setShowForm(true)}>
            <Plus className="size-3.5 mr-1.5" />
            Add slot
          </AttioButton>
        </div>
      }
    >
      <Panel title="Filter slots">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[12px] font-medium mb-1">Filter by Date</label>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="h-9 rounded border px-3 text-[13px]"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium mb-1">Filter by Doctor</label>
            <select
              value={filterDoctor}
              onChange={(e) => setFilterDoctor(e.target.value)}
              className="h-9 rounded border px-3 text-[13px]"
            >
              <option value="">All doctors</option>
              {staff.filter((s) => s.role === "doctor").map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          {(filterDate || filterDoctor) && (
            <AttioButton variant="secondary" onClick={() => { setFilterDate(""); setFilterDoctor(""); }}>
              <Filter className="size-3.5 mr-1.5" />
              Clear filter
            </AttioButton>
          )}
          {filterDate && slots.length > 0 && (
            <>
              <AttioButton variant="secondary" onClick={handleToggleDate}>
                {slots.filter((s) => s.date === filterDate).every((s) => s.status === "blocked") ? "Unblock date" : "Block date"}
              </AttioButton>
              <AttioButton variant="secondary" onClick={handleClearByDate}>
                <Trash2 className="size-3.5 mr-1.5" />
                Clear date
              </AttioButton>
            </>
          )}
        </div>
      </Panel>

      {showBulkForm && (
        <Panel title="Doctor availability schedule">
          <div className="space-y-4">
            {bulkCreating && (
              <div className="rounded-md bg-blue-50 p-3 text-center text-[13px] text-blue-900">
                Creating slots... Please wait.
              </div>
            )}
            <p className="text-[12px] text-neutral-500">
              Set up a doctor's availability: pick a date range, daily working hours, and slot duration.
              The system will auto-generate individual time slots for each day.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-[12px] font-medium mb-1">Select Doctor</label>
                <select
                  value={bulkConfig.doctorId}
                  onChange={(e) => setBulkConfig({ ...bulkConfig, doctorId: e.target.value })}
                  className="h-9 w-full rounded border px-3 text-[13px]"
                  disabled={bulkCreating}
                >
                  <option value="">Select a doctor...</option>
                  {staff.filter((s) => s.role === "doctor").map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-[12px] font-medium mb-1">Quick Date Range</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const today = new Date();
                      const start = today.toISOString().slice(0, 10);
                      const end = new Date(today);
                      end.setMonth(end.getMonth() + 1);
                      setBulkConfig({ ...bulkConfig, startDate: start, endDate: end.toISOString().slice(0, 10) });
                    }}
                    className="h-8 rounded border px-3 text-[12px] hover:bg-neutral-50"
                    disabled={bulkCreating}
                  >
                    1 Month
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const today = new Date();
                      const start = today.toISOString().slice(0, 10);
                      const end = new Date(today);
                      end.setMonth(end.getMonth() + 3);
                      setBulkConfig({ ...bulkConfig, startDate: start, endDate: end.toISOString().slice(0, 10) });
                    }}
                    className="h-8 rounded border px-3 text-[12px] hover:bg-neutral-50"
                    disabled={bulkCreating}
                  >
                    3 Months
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const today = new Date();
                      const start = today.toISOString().slice(0, 10);
                      const end = new Date(today);
                      end.setMonth(end.getMonth() + 6);
                      setBulkConfig({ ...bulkConfig, startDate: start, endDate: end.toISOString().slice(0, 10) });
                    }}
                    className="h-8 rounded border px-3 text-[12px] hover:bg-neutral-50"
                    disabled={bulkCreating}
                  >
                    6 Months
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const today = new Date();
                      const start = today.toISOString().slice(0, 10);
                      const end = new Date(today);
                      end.setFullYear(end.getFullYear() + 1);
                      setBulkConfig({ ...bulkConfig, startDate: start, endDate: end.toISOString().slice(0, 10) });
                    }}
                    className="h-8 rounded border px-3 text-[12px] hover:bg-neutral-50"
                    disabled={bulkCreating}
                  >
                    1 Year
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const today = new Date();
                      const start = today.toISOString().slice(0, 10);
                      const end = new Date(today.getFullYear(), 11, 31);
                      setBulkConfig({ ...bulkConfig, startDate: start, endDate: end.toISOString().slice(0, 10) });
                    }}
                    className="h-8 rounded border px-3 text-[12px] hover:bg-neutral-50"
                    disabled={bulkCreating}
                  >
                    Till End of Year
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-[12px] font-medium mb-1">Available From</label>
                <input
                  type="date"
                  value={bulkConfig.startDate}
                  onChange={(e) => setBulkConfig({ ...bulkConfig, startDate: e.target.value })}
                  className="h-9 w-full rounded border px-3 text-[13px]"
                  disabled={bulkCreating}
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium mb-1">Available Until</label>
                <input
                  type="date"
                  value={bulkConfig.endDate}
                  onChange={(e) => setBulkConfig({ ...bulkConfig, endDate: e.target.value })}
                  className="h-9 w-full rounded border px-3 text-[13px]"
                  disabled={bulkCreating}
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium mb-1">Daily Start Time</label>
                <input
                  type="time"
                  value={bulkConfig.startTime}
                  onChange={(e) => setBulkConfig({ ...bulkConfig, startTime: e.target.value })}
                  className="h-9 w-full rounded border px-3 text-[13px]"
                  disabled={bulkCreating}
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium mb-1">Daily End Time</label>
                <input
                  type="time"
                  value={bulkConfig.endTime}
                  onChange={(e) => setBulkConfig({ ...bulkConfig, endTime: e.target.value })}
                  className="h-9 w-full rounded border px-3 text-[13px]"
                  disabled={bulkCreating}
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium mb-1">Break Start (optional)</label>
                <input
                  type="time"
                  value={bulkConfig.breakStartTime}
                  onChange={(e) => setBulkConfig({ ...bulkConfig, breakStartTime: e.target.value })}
                  className="h-9 w-full rounded border px-3 text-[13px]"
                  disabled={bulkCreating}
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium mb-1">Break End (optional)</label>
                <input
                  type="time"
                  value={bulkConfig.breakEndTime}
                  onChange={(e) => setBulkConfig({ ...bulkConfig, breakEndTime: e.target.value })}
                  className="h-9 w-full rounded border px-3 text-[13px]"
                  disabled={bulkCreating}
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium mb-1">Slot Duration (minutes)</label>
                <div className="flex gap-2">
                  {[15, 20, 30, 45, 60].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setBulkConfig({ ...bulkConfig, intervalMinutes: d })}
                      className={`h-9 rounded border px-3 text-[13px] ${bulkConfig.intervalMinutes === d ? "border-blue-500 bg-blue-50 text-blue-700" : ""}`}
                      disabled={bulkCreating}
                    >
                      {d}m
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[12px] font-medium mb-1">Capacity per slot</label>
                <input
                  type="number"
                  min="1"
                  value={bulkConfig.capacity}
                  onChange={(e) => setBulkConfig({ ...bulkConfig, capacity: Number(e.target.value) })}
                  className="h-9 w-full rounded border px-3 text-[13px]"
                  disabled={bulkCreating}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-[12px] font-medium mb-1">Working Days</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: "mon", label: "Monday" },
                    { key: "tue", label: "Tuesday" },
                    { key: "wed", label: "Wednesday" },
                    { key: "thu", label: "Thursday" },
                    { key: "fri", label: "Friday" },
                    { key: "sat", label: "Saturday" },
                    { key: "sun", label: "Sunday" },
                  ].map((day) => (
                    <label key={day.key} className="flex items-center gap-1 text-[12px]">
                      <input
                        type="checkbox"
                        checked={bulkConfig.weekdays.includes(day.key)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setBulkConfig({ ...bulkConfig, weekdays: [...bulkConfig.weekdays, day.key] });
                          } else {
                            setBulkConfig({ ...bulkConfig, weekdays: bulkConfig.weekdays.filter((d) => d !== day.key) });
                          }
                        }}
                        disabled={bulkCreating}
                      />
                      {day.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            {previewSlotCount > 0 && (
              <div className="rounded-md bg-blue-50 p-3 text-[13px] text-blue-800">
                <strong>{previewSlotCount}</strong> slots will be created · Each slot is <strong>{bulkConfig.intervalMinutes} minutes</strong> long
                {bulkConfig.breakStartTime && bulkConfig.breakEndTime && (
                  <> · Break: <strong>{bulkConfig.breakStartTime}–{bulkConfig.breakEndTime}</strong> (no slots during break)</>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <AttioButton variant="primary" onClick={handleBulkCreate} disabled={bulkCreating || previewSlotCount === 0}>
                {bulkCreating ? "Creating slots..." : `Create ${previewSlotCount > 0 ? previewSlotCount : ""} slots`}
              </AttioButton>
              <AttioButton variant="secondary" onClick={() => setShowBulkForm(false)} disabled={bulkCreating}>
                Cancel
              </AttioButton>
            </div>
          </div>
        </Panel>
      )}

      {showForm && (
        <Panel title={editing ? "Edit slot" : "New slot"}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-[12px] font-medium mb-1">Select Doctor</label>
                <select
                  value={formData.doctorId}
                  onChange={(e) => {
                    const selectedDoctor = staff.find((s) => s.id === e.target.value);
                    setFormData({
                      ...formData,
                      doctorId: e.target.value,
                      doctorName: selectedDoctor?.name || "",
                    });
                  }}
                  className="h-9 w-full rounded border px-3 text-[13px]"
                >
                  <option value="">Select a doctor...</option>
                  {staff.filter((s) => s.role === "doctor").map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-medium mb-1">Date</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="h-9 w-full rounded border px-3 text-[13px]"
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium mb-1">Start Time</label>
                <input
                  type="time"
                  value={formData.startTime}
                  onChange={(e) => {
                    const newStart = e.target.value;
                    setFormData({
                      ...formData,
                      startTime: newStart,
                      endTime: editing ? formData.endTime : calcEndTime(newStart, formData.duration),
                    });
                  }}
                  className="h-9 w-full rounded border px-3 text-[13px]"
                />
              </div>
              {!editing && (
                <div>
                  <label className="block text-[12px] font-medium mb-1">Slot Duration</label>
                  <div className="flex gap-2">
                    {[15, 20, 30, 45, 60].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setFormData({ ...formData, duration: d, endTime: calcEndTime(formData.startTime, d) })}
                        className={`h-9 rounded border px-3 text-[13px] ${formData.duration === d ? "border-blue-500 bg-blue-50 text-blue-700" : ""}`}
                      >
                        {d}m
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-[12px] font-medium mb-1">End Time</label>
                <input
                  type="time"
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                  className="h-9 w-full rounded border px-3 text-[13px]"
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium mb-1">Capacity</label>
                <input
                  type="number"
                  min="1"
                  value={formData.capacity}
                  onChange={(e) => setFormData({ ...formData, capacity: Number(e.target.value) })}
                  className="h-9 w-full rounded border px-3 text-[13px]"
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="h-9 w-full rounded border px-3 text-[13px]"
                >
                  <option value="available">Available</option>
                  <option value="booked">Booked</option>
                  <option value="blocked">Blocked</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[12px] font-medium mb-1">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="h-20 w-full rounded border px-3 text-[13px]"
                rows={3}
              />
            </div>
            <div className="flex gap-2">
              <AttioButton variant="primary" type="submit">
                {editing ? "Update slot" : "Create slot"}
              </AttioButton>
              <AttioButton variant="secondary" type="button" onClick={() => setShowForm(false)}>
                Cancel
              </AttioButton>
            </div>
          </form>
        </Panel>
      )}

      <Panel title={`All slots (${slots.length})`}>
        {loading ? (
          <p className="text-[13px] text-[var(--attio-text-tertiary)]">Loading slots…</p>
        ) : slots.length === 0 ? (
          <p className="text-[13px] text-[var(--attio-text-tertiary)]">No slots configured yet. Use "Availability schedule" to generate slots for a doctor.</p>
        ) : (
          <div className="space-y-4">
            {groupedSlots.map(([date, dateSlots]) => (
              <div key={date}>
                <div className="mb-2 flex items-center gap-2 border-b border-[var(--attio-border-subtle)] pb-1">
                  <Calendar className="size-4 text-neutral-600" />
                  <span className="text-[13px] font-semibold">{date}</span>
                  <span className="text-[11px] text-neutral-400">({dateSlots.length} slots)</span>
                </div>
                <div className="space-y-2">
                  {dateSlots.map((slot) => {
                    const duration = calcSlotDuration(slot.startTime, slot.endTime);
                    return (
                      <div
                        key={slot.id}
                        className="flex items-center justify-between rounded-lg border border-[var(--attio-border-subtle)] p-3"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1 text-[13px] font-medium">
                              <Clock className="size-3.5" />
                              {slot.startTime} - {slot.endTime}
                            </div>
                            <span className="flex items-center gap-1 rounded bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
                              <Timer className="size-3" />
                              {duration} min
                            </span>
                            <StatusBadge
                              label={slot.status}
                              variant={slot.status === "available" ? "success" : slot.status === "booked" ? "warning" : "neutral"}
                            />
                          </div>
                          <p className="mt-1 text-[12px]">
                            {slot.doctorName || "Unassigned"} · {slot.departmentId || "No department"}
                          </p>
                          <p className="mt-0.5 text-[11px] text-[var(--attio-text-tertiary)]">
                            Capacity: {slot.capacity} · Booked: {slot.booked}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <AttioButton variant="secondary" onClick={() => handleEdit(slot)}>
                            Edit
                          </AttioButton>
                          <AttioButton variant="secondary" onClick={() => handleToggleStatus(slot.id)}>
                            {slot.status === "available" ? "Block" : "Unblock"}
                          </AttioButton>
                          <AttioButton variant="secondary" onClick={() => handleDelete(slot.id)}>
                            <Trash2 className="size-3" />
                          </AttioButton>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </PageChrome>
  );
}
