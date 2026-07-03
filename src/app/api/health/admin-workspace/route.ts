import { buildAdminOperator } from "@/server/admin/guards";
import { getAdminSnapshotForContext } from "@/server/admin/index";
import type { ServerContext } from "@/server/context";
import { serializeForClient } from "@/server/serialize";
import { NextResponse } from "next/server";

const PROBE_CTX: ServerContext = {
  userId: "health_probe",
  tenantId: "tenant_navayu",
  branchId: "branch_gurgaon",
  branchName: "Gurgaon",
  role: "admin",
  sessionToken: "",
};

const PROBE_OPERATOR = buildAdminOperator({
  operatorId: "health_probe",
  name: "Health Probe",
  email: "health@probe.local",
  staffRole: "super_admin",
});

/** Ops — build admin snapshot without auth to surface production failures. */
export async function GET() {
  try {
    const snapshot = await getAdminSnapshotForContext(PROBE_CTX, PROBE_OPERATOR);
    const serialized = serializeForClient(snapshot);
    const json = JSON.stringify(serialized);
    return NextResponse.json({
      ok: true,
      bytes: json.length,
      patients: snapshot.patients.length,
      visits: snapshot.visits.length,
      auditEvents: snapshot.auditEvents.length,
      at: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        at: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
