import { prisma } from "@/lib/prisma";
import type { ServerContext } from "@/server/context";
import { writePlatformAudit } from "@/server/platform-audit";
import {
  processNotificationQueue,
  queueNotification,
} from "@/server/notifications";

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function hrSettingsId(ctx: ServerContext) {
  return `hr_settings_${ctx.tenantId}_${ctx.branchId}`;
}

function adminSettingsId(ctx: ServerContext) {
  return `admin_settings_${ctx.tenantId}_${ctx.branchId}`;
}

async function loadHrAttendanceReminderEnabled(ctx: ServerContext) {
  const row = await prisma.hrSetting.findUnique({ where: { id: hrSettingsId(ctx) } });
  if (row) return row.attendanceReminder;
  const legacy = await prisma.hrSetting.findUnique({ where: { id: "hr_settings" } });
  return legacy?.attendanceReminder ?? false;
}

async function loadAdminMisDailyEnabled(ctx: ServerContext) {
  const row = await prisma.adminSetting.findUnique({ where: { id: adminSettingsId(ctx) } });
  if (row) return row.autoMisDaily;
  const legacy = await prisma.adminSetting.findUnique({ where: { id: "admin_settings" } });
  return legacy?.autoMisDaily ?? false;
}

async function loadAuditRetentionYears(ctx: ServerContext) {
  const row = await prisma.adminSetting.findUnique({ where: { id: adminSettingsId(ctx) } });
  const years = row?.auditRetentionYears ?? 7;
  return Math.max(1, years);
}

/** Remind branch HR staff who have not checked in today (and are not on approved leave). */
export async function runHrAttendanceReminders(ctx: ServerContext) {
  const enabled = await loadHrAttendanceReminderEnabled(ctx);
  if (!enabled) return { queued: 0 };

  const date = todayIsoDate();
  const employees = await prisma.hrEmployee.findMany({
    where: { branchId: ctx.branchId, active: true },
  });
  if (!employees.length) return { queued: 0 };

  const [attendance, leave] = await Promise.all([
    prisma.hrAttendance.findMany({
      where: { date, employeeId: { in: employees.map((e) => e.id) } },
    }),
    prisma.hrLeaveRequest.findMany({
      where: {
        employeeId: { in: employees.map((e) => e.id) },
        status: "approved",
        fromDate: { lte: date },
        toDate: { gte: date },
      },
    }),
  ]);

  const checkedIn = new Set(attendance.map((a) => a.employeeId));
  const onLeave = new Set(leave.map((l) => l.employeeId));
  const missing = employees.filter((e) => !checkedIn.has(e.id) && !onLeave.has(e.id));

  let queued = 0;
  for (const emp of missing) {
    await queueNotification(ctx, {
      channel: "email",
      recipient: emp.email,
      subject: "Attendance reminder",
      body: `${emp.name}, please mark your attendance for ${date} in the HR module.`,
      module: "hr",
      entityId: emp.id,
    });
    queued += 1;
  }

  if (queued > 0) {
    await writePlatformAudit({
      ctx,
      module: "hr",
      action: "attendance_reminder_batch",
      entityType: "hr_attendance",
      entityId: date,
      summary: `Attendance reminders queued for ${queued} employee(s)`,
      payload: { date, employeeIds: missing.map((e) => e.id) },
    });
  }

  return { queued };
}

/** Run all MIS report templates for the branch (updates lastRun + audit). */
export async function runDailyMisReports(ctx: ServerContext) {
  const enabled = await loadAdminMisDailyEnabled(ctx);
  if (!enabled) return { ran: 0 };

  const reports = await prisma.adminMisReport.findMany();
  let ran = 0;

  for (const report of reports) {
    const visitCount = await prisma.opdVisit.count({ where: { branchId: ctx.branchId } });
    const revenue = await prisma.invoice.aggregate({
      where: { branchId: ctx.branchId },
      _sum: { amountPaid: true },
    });
    const rev = Number(revenue._sum.amountPaid ?? 0);

    await prisma.adminMisReport.update({
      where: { id: report.id },
      data: { lastRun: new Date().toISOString() },
    });

    await writePlatformAudit({
      ctx,
      module: "mis",
      action: "mis_daily_run",
      entityType: "mis_report",
      entityId: report.id,
      summary: `Daily MIS: ${report.label} (${visitCount} visits, ₹${rev})`,
      payload: { visitCount, revenue: rev, branchId: ctx.branchId, automated: true },
    });
    ran += 1;
  }

  return { ran };
}

/** Purge admin audit rows older than retention policy (per tenant settings). */
export async function purgeExpiredAuditLogs(ctx: ServerContext) {
  const years = await loadAuditRetentionYears(ctx);
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - years);
  const cutoffIso = cutoff.toISOString();

  const deleted = await prisma.adminAuditLog.deleteMany({
    where: { at: { lt: cutoffIso } },
  });

  if (deleted.count > 0) {
    await writePlatformAudit({
      ctx,
      module: "admin",
      action: "audit_retention_purge",
      entityType: "audit_log",
      entityId: "purge",
      summary: `Purged ${deleted.count} admin audit row(s) older than ${years}y`,
      payload: { cutoff: cutoffIso, count: deleted.count },
    });
  }

  return { purged: deleted.count };
}

export async function runScheduledJobsForContext(ctx: ServerContext) {
  const notifications = await processNotificationQueue(ctx);
  const hrAttendance = await runHrAttendanceReminders(ctx);
  const misDaily = await runDailyMisReports(ctx);
  const auditPurge = await purgeExpiredAuditLogs(ctx);

  return { notifications, hrAttendance, misDaily, auditPurge };
}

export async function runAllScheduledJobs() {
  const tenants = await prisma.tenant.findMany({ where: { active: true } });
  const summary = {
    tenants: 0,
    branches: 0,
    notificationsProcessed: 0,
    attendanceReminders: 0,
    misReportsRun: 0,
    auditPurged: 0,
  };

  for (const tenant of tenants) {
    summary.tenants += 1;
    const branches = await prisma.branch.findMany({
      where: { tenantId: tenant.id, active: true },
    });

    for (const branch of branches) {
      summary.branches += 1;
      const ctx: ServerContext = {
        userId: "system_cron",
        tenantId: tenant.id,
        branchId: branch.id,
        branchName: branch.name,
        role: "admin",
        sessionToken: "",
      };

      const result = await runScheduledJobsForContext(ctx);
      summary.notificationsProcessed += result.notifications.processed;
      summary.attendanceReminders += result.hrAttendance.queued;
      summary.misReportsRun += result.misDaily.ran;
      summary.auditPurged += result.auditPurge.purged;
    }
  }

  return summary;
}

export function verifyCronSecret(request: Request): boolean {
  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret");
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const provided = querySecret ?? bearer;

  const expected = process.env.CRON_SECRET;
  if (process.env.NODE_ENV === "production") {
    if (!expected) return false;
    return provided === expected;
  }

  return provided === (expected ?? "candela-cron-demo");
}
