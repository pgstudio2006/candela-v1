import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveAdminOperator } from "@/server/module-operator";
import { serializeForClient } from "@/server/serialize";
import { throwIfPrismaError } from "@/server/prisma-errors";
import { ServerActionError } from "@/server/errors";
import type {
  AdminPlatformSettings,
  DepartmentConfig,
  DiseaseMapNode,
  ExpenseEntry,
  MrdRequest,
  ReferralDoctor,
  RevenueSharePolicy,
  StaffMember,
} from "@/design-system/admin-data";

type ActionBody = {
  op: string;
  id?: string;
  patch?: Partial<StaffMember> | Partial<DepartmentConfig> | Partial<DiseaseMapNode> | Partial<AdminPlatformSettings> | Partial<RevenueSharePolicy> | Partial<ReferralDoctor>;
  input?: Omit<StaffMember, "id"> | Omit<DepartmentConfig, "id"> | Omit<DiseaseMapNode, "id"> | Omit<ExpenseEntry, "id"> | Omit<RevenueSharePolicy, "id"> | Omit<MrdRequest, "id" | "requestedAt" | "status"> | Omit<ReferralDoctor, "id">;
  approved?: boolean;
  status?: MrdRequest["status"];
  flagId?: string;
  summary?: string;
  // exportRevenueShare
  policyId?: string;
  doctorName?: string;
  gross?: number;
  share?: number;
  packagesClosed?: number;
};

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Please sign in first." }, { status: 401 });
  }

  let body: ActionBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  try {
    const { ctx, operator } = await resolveAdminOperator();
    const core = await import("@/server/admin/index");
    const { op } = body;
    let result: unknown;

    switch (op) {
      case "updateStaff":
        result = await core.updateStaff(ctx, operator, body.id!, body.patch as Partial<StaffMember>);
        break;
      case "addStaff":
        result = await core.addStaff(ctx, operator, body.input as Omit<StaffMember, "id">);
        break;
      case "removeStaff":
        result = await core.removeStaff(ctx, operator, body.id!);
        break;
      case "updateDepartment":
        result = await core.updateDepartment(ctx, operator, body.id!, body.patch as Partial<DepartmentConfig>);
        break;
      case "addDepartment":
        result = await core.addDepartment(ctx, operator, body.input as Omit<DepartmentConfig, "id">);
        break;
      case "removeDepartment":
        result = await core.removeDepartment(ctx, operator, body.id!);
        break;
      case "updateDiseaseNode":
        result = await core.updateDiseaseNode(ctx, operator, body.id!, body.patch as Partial<DiseaseMapNode>);
        break;
      case "addDiseaseNode":
        result = await core.addDiseaseNode(ctx, operator, body.input as Omit<DiseaseMapNode, "id">);
        break;
      case "removeDiseaseNode":
        result = await core.removeDiseaseNode(ctx, operator, body.id!);
        break;
      case "addExpense":
        result = await core.addExpense(ctx, operator, body.input as Omit<ExpenseEntry, "id">);
        break;
      case "approveExpense":
        result = await core.approveExpense(ctx, operator, body.id!, body.approved!);
        break;
      case "updateRevenuePolicy":
        result = await core.updateRevenuePolicy(ctx, operator, body.id!, body.patch as Partial<RevenueSharePolicy>);
        break;
      case "addRevenuePolicy":
        result = await core.addRevenuePolicy(ctx, operator, body.input as Omit<RevenueSharePolicy, "id">);
        break;
      case "updateMrdStatus":
        result = await core.updateMrdStatus(ctx, operator, body.id!, body.status!);
        break;
      case "addMrdRequest":
        result = await core.addMrdRequest(ctx, operator, body.input as Omit<MrdRequest, "id" | "requestedAt" | "status">);
        break;
      case "updateReferralDoctor":
        result = await core.updateReferralDoctor(ctx, operator, body.id!, body.patch as Partial<ReferralDoctor>);
        break;
      case "addReferralDoctor":
        result = await core.addReferralDoctor(ctx, operator, body.input as Omit<ReferralDoctor, "id">);
        break;
      case "removeReferralDoctor":
        result = await core.removeReferralDoctor(ctx, operator, body.id!);
        break;
      case "runMisReport": {
        const misResult = await core.runMisReport(ctx, operator, body.id!);
        result = { ...misResult, snapshot: serializeForClient(misResult.snapshot) };
        break;
      }
      case "updateAdminSettings":
        result = await core.updateAdminSettings(ctx, operator, body.patch as Partial<AdminPlatformSettings>);
        break;
      case "resolveLeakageFlag":
        result = await core.resolveLeakageFlag(ctx, operator, body.flagId!);
        break;
      case "logAdminAction":
        result = await core.logAdminAction(ctx, operator, body.summary!);
        break;
      case "exportRevenueShareCsv":
        result = await core.exportRevenueShareCsv(ctx, operator, body.policyId!, body.doctorName!, body.gross!, body.share!, body.packagesClosed!);
        break;
      default:
        return NextResponse.json({ ok: false, error: `Unknown operation: ${op}` }, { status: 400 });
    }

    // Most operations return an AdminSnapshot via withSnapshot pattern
    // The runMisReport returns { snapshot, csv, filename }
    // exportRevenueShareCsv returns { csv, filename }
    const isMisResult = op === "runMisReport";
    const isExportCsv = op === "exportRevenueShareCsv";

    if (isMisResult) {
      return NextResponse.json({ ok: true, data: result });
    } else if (isExportCsv) {
      return NextResponse.json({ ok: true, data: result });
    } else {
      // Other ops return AdminSnapshot directly
      return NextResponse.json({ ok: true, data: serializeForClient(result) });
    }
  } catch (error) {
    try {
      throwIfPrismaError(error);
    } catch (mapped) {
      if (mapped instanceof ServerActionError) {
        return NextResponse.json({ ok: false, error: mapped.message }, { status: 400 });
      }
    }
    if (error instanceof ServerActionError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    const msg = error instanceof Error ? error.message : "Something went wrong.";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
