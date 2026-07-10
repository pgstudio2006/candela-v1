import type { Prisma } from "@prisma/client";
import {
  DEFAULT_CRM_STAGES,
  SEED_ASSIGNMENT_RULES,
  SEED_CRM_ACTIVITIES,
  SEED_CRM_AGENTS,
  SEED_CRM_INTEGRATIONS,
  SEED_CRM_LEADS,
  type CrmActivity,
  type CrmAgent,
  type CrmAssignmentRule,
  type CrmFollowUp,
  type CrmIntegration,
  type CrmLead,
  type CrmPipelineStage,
} from "@/design-system/crm-data";
import {
  DEFAULT_DISCOUNT_POLICY,
  type CounselSession,
  type DiscountApproval,
  type DiscountPolicy,
} from "@/design-system/counsellor-data";
import { PATIENTS, VISITS, type Patient, type Visit } from "@/design-system/frontdesk-data";
import {
  SEED_BILLS,
  SEED_DRUGS,
  SEED_INDENTS,
  SEED_PHARMACY_STAFF,
  SEED_PRESCRIPTIONS,
  SEED_PURCHASE_ORDERS,
  SEED_RETURNS,
  SEED_SCHEDULE_H,
  SEED_STOCK,
  SEED_SUPPLIERS,
  type Drug,
  type PharmacyActivity,
  type PharmacyBill,
  type PharmacyStaff,
  type Prescription,
  type PurchaseOrder,
  type ReturnRecord,
  type ScheduleHEntry,
  type StockBatch,
  type Supplier,
  type SupplierCatalogueItem,
  type WardIndent,
} from "@/design-system/pharmacy-data";

export type PharmacyStateShape = {
  staff: PharmacyStaff[];
  staffPasswords: Record<string, string>;
  drugs: Drug[];
  stock: StockBatch[];
  suppliers: Supplier[];
  supplierCatalogue: SupplierCatalogueItem[];
  purchaseOrders: PurchaseOrder[];
  prescriptions: Prescription[];
  bills: PharmacyBill[];
  returns: ReturnRecord[];
  indents: WardIndent[];
  scheduleH: ScheduleHEntry[];
  activities: PharmacyActivity[];
  operatorId: string;
};

export type CounsellorStateShape = {
  sessions: CounselSession[];
  approvals: DiscountApproval[];
  discountPolicy: DiscountPolicy;
  activeCounsellorId: string;
  activeBranchId: string;
  seniorMode: boolean;
};

export type CrmStateShape = {
  leads: CrmLead[];
  followUps: CrmFollowUp[];
  agents: CrmAgent[];
  agentPasswords: Record<string, string>;
  integrations: CrmIntegration[];
  stages: CrmPipelineStage[];
  rules: CrmAssignmentRule[];
  activities: CrmActivity[];
  operatorId: string;
  viewAsAgentId: string | null;
};

export type ClinicalSnapshot = {
  patients: Patient[];
  visits: Visit[];
};

export const defaultPharmacyState = (passwords: Record<string, string>): PharmacyStateShape => ({
  staff: structuredClone(SEED_PHARMACY_STAFF),
  staffPasswords: passwords,
  drugs: [],
  stock: [],
  suppliers: [],
  supplierCatalogue: [],
  purchaseOrders: [],
  prescriptions: [],
  bills: [],
  returns: [],
  indents: [],
  scheduleH: [],
  activities: [],
  operatorId: "",
});

export const defaultCounsellorState = (): CounsellorStateShape => ({
  sessions: [],
  approvals: [],
  discountPolicy: DEFAULT_DISCOUNT_POLICY,
  activeCounsellorId: "counsellor_1",
  activeBranchId: "branch_gurgaon",
  seniorMode: false,
});

export const defaultCrmState = (passwords: Record<string, string>): CrmStateShape => ({
  leads: structuredClone(SEED_CRM_LEADS),
  followUps: [],
  agents: structuredClone(SEED_CRM_AGENTS),
  agentPasswords: passwords,
  integrations: structuredClone(SEED_CRM_INTEGRATIONS),
  stages: structuredClone(DEFAULT_CRM_STAGES),
  rules: structuredClone(SEED_ASSIGNMENT_RULES),
  activities: structuredClone(SEED_CRM_ACTIVITIES),
  operatorId: "",
  viewAsAgentId: null,
});

export const defaultClinicalSnapshot = (): ClinicalSnapshot => ({
  patients: structuredClone(PATIENTS),
  visits: structuredClone(VISITS),
});

export function parseJson<T>(value: Prisma.JsonValue): T {
  return value as T;
}
