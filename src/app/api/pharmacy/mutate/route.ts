import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireModule } from "@/server/auth";
import { serializeForClient } from "@/server/serialize";
import { throwIfPrismaError } from "@/server/prisma-errors";
import { ServerActionError } from "@/server/errors";
import {
  addDrug,
  addSupplier,
  addSupplierCatalogueItem,
  createPharmacyBill,
  deleteDrug,
  deletePurchaseOrder,
  deleteStockBatch,
  deleteSupplier,
  adjustStock,
  applyBillDiscount,
  approveReturn,
  createManualPrescription,
  createPO,
  createReturn,
  dispensePrescription,
  fulfillIndent,
  markBillPaid,
  payPOBill,
  quarantineBatch,
  receivePO,
  rejectPrescription,
  resetPharmacyWorkspace,
  restockReturn,
  updateDrug,
  updatePOStatus,
  updateSupplier,
  updateSupplierCatalogueItem,
  verifyPrescription,
} from "@/server/pharmacy/index";
import type { Drug, PaymentMode, PoLine, PurchaseOrder, Supplier, SupplierCatalogueItem } from "@/design-system/pharmacy-data";

type ActionBody = {
  op: string;
  operatorId: string;
  rxId?: string;
  counselingNotes?: string;
  reason?: string;
  quantities?: Record<string, number>;
  witnessName?: string;
  batchIds?: Record<string, string>;
  newLines?: Array<import("@/design-system/pharmacy-data").PrescriptionLine>;
  billId?: string;
  mode?: PaymentMode;
  batchId?: string;
  delta?: number;
  quarantined?: boolean;
  drug?: Omit<Drug, "id">;
  id?: string;
  patch?: Partial<Drug> | Partial<Supplier>;
  supplier?: Omit<Supplier, "id">;
  supplierId?: string;
  lines?: PoLine[];
  notes?: string;
  status?: PurchaseOrder["status"];
  poId?: string;
  received?: Record<string, { qty: number; batchNo: string; expiry: string; shelf?: string; box?: string }>;
  qty?: number;
  patientName?: string;
  uhid?: string;
  mobile?: string;
  age?: number;
  priority?: "routine" | "urgent" | "stat";
  patientType?: "registered" | "other_doctor" | "without_prescription";
  referral?: { doctorName?: string; hospital?: string; clinicDetails?: string; address?: string };
  rxLines?: Array<{ drug: string; dose: string; frequency: string; duration: string; instructions?: string }>;
  discount?: number;
  discountReason?: string;
  billLines?: Array<{ drugId: string; qty: number }>;
  returnType?: "patient" | "ipd" | "walk_in";
  lineIndex?: number;
  amount?: number;
  paymentMode?: "cash" | "upi" | "transfer" | "credit";
  billUrl?: string;
  catalogueItem?: Omit<SupplierCatalogueItem, "id">;
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
    const ctx = await requireModule("pharmacy");
    const { op, operatorId } = body;
    let result: unknown;

    switch (op) {
      case "verifyPrescription":
        result = await verifyPrescription(ctx, operatorId, body.rxId!, body.counselingNotes);
        break;
      case "rejectPrescription":
        result = await rejectPrescription(ctx, operatorId, body.rxId!, body.reason!);
        break;
      case "dispensePrescription":
        result = await dispensePrescription(ctx, operatorId, body.rxId!, body.quantities!, body.witnessName, body.batchIds, body.newLines);
        break;
      case "markBillPaid":
        result = await markBillPaid(ctx, operatorId, body.billId!, body.mode!);
        break;
      case "adjustStock":
        result = await adjustStock(ctx, operatorId, body.batchId!, body.delta!, body.reason!);
        break;
      case "quarantineBatch":
        result = await quarantineBatch(ctx, operatorId, body.batchId!, body.quarantined!);
        break;
      case "addDrug":
        result = await addDrug(ctx, operatorId, body.drug!);
        break;
      case "updateDrug":
        result = await updateDrug(ctx, operatorId, body.id!, body.patch as Partial<Drug>);
        break;
      case "deleteDrug":
        result = await deleteDrug(ctx, operatorId, body.id!);
        break;
      case "addSupplier":
        result = await addSupplier(ctx, operatorId, body.supplier!);
        break;
      case "updateSupplier":
        result = await updateSupplier(ctx, operatorId, body.id!, body.patch as Partial<Supplier>);
        break;
      case "deleteSupplier":
        result = await deleteSupplier(ctx, operatorId, body.id!);
        break;
      case "createPO":
        result = await createPO(ctx, operatorId, body.supplierId!, body.lines!, body.notes);
        break;
      case "updatePOStatus":
        result = await updatePOStatus(ctx, operatorId, body.id!, body.status!);
        break;
      case "receivePO":
        result = await receivePO(ctx, operatorId, body.poId!, body.received!);
        break;
      case "deletePurchaseOrder":
        result = await deletePurchaseOrder(ctx, operatorId, body.id!);
        break;
      case "deleteStockBatch":
        result = await deleteStockBatch(ctx, operatorId, body.id!);
        break;
      case "approveReturn":
        result = await approveReturn(ctx, operatorId, body.id!);
        break;
      case "restockReturn":
        result = await restockReturn(ctx, operatorId, body.id!);
        break;
      case "fulfillIndent":
        result = await fulfillIndent(ctx, operatorId, body.id!, body.qty!);
        break;
      case "createManualPrescription":
        result = await createManualPrescription(ctx, operatorId, {
          patientName: body.patientName!,
          uhid: body.uhid!,
          mobile: body.mobile,
          age: body.age,
          priority: body.priority,
          patientType: body.patientType,
          referral: body.referral,
          lines: body.rxLines!,
        });
        break;
      case "createPharmacyBill":
        result = await createPharmacyBill(ctx, operatorId, {
          patientName: body.patientName!,
          uhid: body.uhid,
          lines: body.billLines ?? [],
          discount: body.discount,
          discountReason: body.discountReason,
          paymentMode: body.mode as PaymentMode,
        });
        break;
      case "applyBillDiscount":
        result = await applyBillDiscount(ctx, operatorId, body.billId!, body.discount!, body.discountReason!);
        break;
      case "createReturn":
        result = await createReturn(ctx, operatorId, {
          type: body.returnType!,
          billId: body.billId!,
          lineIndex: body.lineIndex!,
          qty: body.qty!,
          reason: body.reason!,
        });
        break;
      case "payPOBill":
        result = await payPOBill(ctx, operatorId, body.poId!, body.amount!, body.paymentMode!, body.billUrl);
        break;
      case "addSupplierCatalogueItem":
        result = await addSupplierCatalogueItem(ctx, operatorId, body.catalogueItem!);
        break;
      case "updateSupplierCatalogueItem":
        result = await updateSupplierCatalogueItem(ctx, operatorId, body.id!, body.patch as Partial<import("@/design-system/pharmacy-data").SupplierCatalogueItem>);
        break;
      case "resetWorkspace":
        result = await resetPharmacyWorkspace(ctx, operatorId);
        break;
      default:
        return NextResponse.json({ ok: false, error: `Unknown operation: ${op}` }, { status: 400 });
    }

    return NextResponse.json({ ok: true, data: serializeForClient(result) });
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
