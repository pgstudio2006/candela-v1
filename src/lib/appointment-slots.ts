import { APPOINTMENT_SLOTS } from "@/design-system/frontdesk-data";

export type SlotInfo = {
  time: string;
  available: boolean;
  bookedPatient?: string;
  appointmentId?: string;
  mode?: "offline" | "online";
};

export function generateDaySlots(
  deptId: string,
  booked: { time: string; doctorId: string; patientName?: string; mode?: "offline" | "online" }[],
  doctorId?: string,
): SlotInfo[] {
  const config = APPOINTMENT_SLOTS[deptId as keyof typeof APPOINTMENT_SLOTS] ?? APPOINTMENT_SLOTS.dept_spine;
  const slots: SlotInfo[] = [];
  let cursor = 15 * 60;
  const end = 20 * 60 + 30;
  const step = config.durationMin + config.bufferMin;

  while (cursor + config.durationMin <= end) {
    const h = Math.floor(cursor / 60);
    const m = cursor % 60;
    const time = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    const hit = booked.find((b) => b.time === time && (!doctorId || b.doctorId === doctorId));
    slots.push({
      time,
      available: !hit,
      bookedPatient: hit?.patientName,
      mode: hit?.mode,
    });
    cursor += step;
  }
  return slots;
}

export function formatDisplayDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
