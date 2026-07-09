/** Admin Control Plane — types, seed data, field taxonomy */

import type { FieldType } from "@/design-system/frontdesk-schemas";

export type AdminRole =
  | "super_admin"
  | "branch_admin"
  | "branch_manager"
  | "finance"
  | "finance_manager"
  | "mrd"
  | "viewer"
  | "doctor"
  | "nurse"
  | "frontdesk"
  | "receptionist"
  | "pharmacist"
  | "counsellor"
  | "crm_executive"
  | "crm_manager"
  | "hr_executive"
  | "lab_technician"
  | "billing_executive";

export type StaffMember = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: AdminRole;
  departmentIds: string[];
  branchId: string;
  licenseNo?: string;
  onDuty: boolean;
  joinedAt: string;
  ward?: string;
};

export type DepartmentConfig = {
  id: string;
  label: string;
  headStaffId?: string;
  doctorIds: string[];
  defaultPackageIds: string[];
  revenuePolicyId?: string;
  bays: string[];
  active: boolean;
};

export type AuditEvent = {
  id: string;
  at: string;
  actor: string;
  actorRole: string;
  module: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  severity: "info" | "warning" | "critical";
};

export type DiseaseMapNode = {
  id: string;
  icd: string;
  label: string;
  departmentId: string;
  templateId?: string;
  packageIds: string[];
  consentTemplateIds: string[];
  billingTemplateId?: string;
};

export type GeoCluster = {
  id: string;
  pincode: string;
  city: string;
  lat: number;
  lng: number;
  patientCount: number;
  opdCount: number;
  ipdCount: number;
  revenue: number;
  topDiagnosis: string;
  severity?: "high" | "medium" | "low";
};

export type DiseaseCluster = {
  id: string;
  locality: string;
  lat: number;
  lng: number;
  caseCount: number;
  severity: "high" | "medium" | "low";
  topDisease: string;
  surgePercent?: number;
};

export type SeasonalDiseaseMonth = {
  month: string;
  dengue: number;
  tuberculosis: number;
  diabetes: number;
  hypertension: number;
};

export type DataMiningKpi = {
  label: string;
  value: string;
  delta: string;
  trend: "up" | "down" | "neutral";
};

export type DataSourceRow = {
  id: string;
  label: string;
  records: number;
  lastUpdated: string;
  anonymized: boolean;
};

export type AgeGenderBand = {
  band: string;
  male: number;
  female: number;
};

export type TreatmentOutcomeMonth = {
  month: string;
  improved: number;
  stable: number;
  referred: number;
  readmitted: number;
};

export type PrevalenceInsight = {
  diagnosis: string;
  count: number;
  percent: number;
  trend: "up" | "down" | "stable";
  ageBand: string;
  anonymized: true;
};

export type ExpenseEntry = {
  id: string;
  date: string;
  vendor: string;
  category: string;
  departmentId?: string;
  amount: number;
  status: "pending" | "approved" | "rejected";
  notes?: string;
};

export type RevenueLeakageFlag = {
  id: string;
  type: "partial_uncollected" | "quote_billing_gap" | "consent_delay" | "defer_aging";
  patientName: string;
  visitId: string;
  amount: number;
  daysOpen: number;
  suggestion: string;
  priority: "high" | "medium" | "low";
};

export type RevenueSharePolicy = {
  id: string;
  label: string;
  departmentId: string;
  doctorId?: string;
  opdConsultPercent: number;
  packageNetPercent: number;
  ipdDayFixed: number;
  appliesToPartial: boolean;
  active: boolean;
};

export type ReferralDoctor = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  clinicName?: string;
  address?: string;
  specialization?: string;
  commissionPercent: number;
  active: boolean;
  notes?: string;
};

export type ShareSimulation = {
  doctorName: string;
  packagesClosed: number;
  gross: number;
  share: number;
};

export type MrdRequest = {
  id: string;
  patientName: string;
  uhid: string;
  requestType: "patient_copy" | "legal" | "insurance" | "internal";
  requestedAt: string;
  status: "pending" | "identity_verified" | "redaction" | "released" | "rejected";
  slaDue: string;
  documents: string[];
};

export type MisReport = {
  id: string;
  label: string;
  category: "revenue" | "clinical" | "operations" | "compliance";
  schedule: "daily" | "weekly" | "monthly" | "ad_hoc";
  lastRun?: string;
  format: "csv" | "pdf";
};

export type DepartmentHawkEye = {
  moduleId: string;
  label: string;
  status: "healthy" | "watch" | "critical";
  queue: number;
  slaBreaches: number;
  revenueToday: number;
  blockers: string[];
};

export const FIELD_TYPE_CATALOG: {
  type: FieldType;
  label: string;
  category: NonNullable<import("@/design-system/frontdesk-schemas").SchemaField["category"]>;
}[] = [
  { type: "text", label: "Text", category: "basic" },
  { type: "textarea", label: "Long text", category: "basic" },
  { type: "email", label: "Email", category: "basic" },
  { type: "phone", label: "Phone", category: "basic" },
  { type: "url", label: "URL", category: "basic" },
  { type: "password", label: "Password", category: "basic" },
  { type: "number", label: "Number", category: "numeric" },
  { type: "currency", label: "Currency", category: "numeric" },
  { type: "percent", label: "Percent", category: "numeric" },
  { type: "rating", label: "Rating (VAS 0–10)", category: "numeric" },
  { type: "date", label: "Date", category: "datetime" },
  { type: "time", label: "Time", category: "datetime" },
  { type: "datetime", label: "Date & time", category: "datetime" },
  { type: "duration", label: "Duration", category: "datetime" },
  { type: "select", label: "Dropdown", category: "choice" },
  { type: "multiselect", label: "Multi-select", category: "choice" },
  { type: "radio", label: "Radio group", category: "choice" },
  { type: "checkbox", label: "Checkbox group", category: "choice" },
  { type: "toggle", label: "Toggle", category: "choice" },
  { type: "icd-picker", label: "ICD diagnosis picker", category: "clinical" },
  { type: "body-region", label: "Body region", category: "clinical" },
  { type: "pain-scale", label: "Pain scale", category: "clinical" },
  { type: "allergy-list", label: "Allergy list", category: "clinical" },
  { type: "vitals-group", label: "Vitals group", category: "clinical" },
  { type: "package-picker", label: "Care package picker", category: "commercial" },
  { type: "discount-percent", label: "Discount %", category: "commercial" },
  { type: "payment-mode", label: "Payment mode", category: "commercial" },
  { type: "file", label: "File upload", category: "media" },
  { type: "image", label: "Image upload", category: "media" },
  { type: "signature", label: "Signature capture", category: "media" },
  { type: "consent-version", label: "Consent + version bind", category: "compliance" },
  { type: "formula", label: "Formula (computed)", category: "computed" },
  { type: "section", label: "Section header", category: "layout" },
  { type: "divider", label: "Divider", category: "layout" },
  { type: "help", label: "Help text", category: "layout" },
];

/** Demo bundle only — production uses admin-only seed or manual staff onboarding. */
export const SEED_STAFF: StaffMember[] = [
  {
    id: "st_1",
    name: "Admin User",
    email: "admin@navayu.in",
    phone: "+91 98765 00001",
    role: "super_admin",
    departmentIds: ["dept_spine", "dept_wellness"],
    branchId: "branch_gurgaon",
    onDuty: true,
    joinedAt: "2024-01-15",
  },
];

export const SEED_DEPARTMENTS: DepartmentConfig[] = [
  {
    id: "dept_spine",
    label: "Spine & Joint Care",
    headStaffId: "st_1",
    doctorIds: [],
    defaultPackageIds: ["pkg_basic", "pkg_regen"],
    revenuePolicyId: "rsp_1",
    bays: ["Physio Bay 1", "Physio Bay 2", "Procedure Room"],
    active: true,
  },
  {
    id: "dept_wellness",
    label: "Wellness & Metabolic",
    headStaffId: "st_1",
    doctorIds: [],
    defaultPackageIds: ["pkg_wellness"],
    revenuePolicyId: "rsp_2",
    bays: ["Wellness Studio"],
    active: true,
  },
];

export const SEED_DISEASE_MAP: DiseaseMapNode[] = [
  { id: "dm_1", icd: "M51.1", label: "Lumbar disc with radiculopathy", departmentId: "dept_spine", templateId: "tpl_lumbar", packageIds: ["pkg_basic", "pkg_regen"], consentTemplateIds: ["consent_general_treatment", "consent_physio"], billingTemplateId: "bt1" },
  { id: "dm_2", icd: "M47.8", label: "Cervical spondylosis", departmentId: "dept_spine", templateId: "tpl_cervical", packageIds: ["pkg_basic"], consentTemplateIds: ["consent_general_treatment", "consent_physio"], billingTemplateId: "bt1" },
  { id: "dm_3", icd: "E88.81", label: "Metabolic syndrome", departmentId: "dept_wellness", templateId: "tpl_wellness", packageIds: ["pkg_wellness"], consentTemplateIds: ["consent_general_treatment"], billingTemplateId: "bt2" },
  { id: "dm_4", icd: "M25.5", label: "Joint pain", departmentId: "dept_spine", templateId: "tpl_lumbar", packageIds: ["pkg_basic"], consentTemplateIds: ["consent_general_treatment"], billingTemplateId: "bt1" },
  { id: "dm_5", icd: "M54.5", label: "Low back pain", departmentId: "dept_spine", templateId: "tpl_lumbar", packageIds: ["pkg_basic", "pkg_regen"], consentTemplateIds: ["consent_general_treatment", "consent_physio"], billingTemplateId: "bt1" },
  { id: "dm_6", icd: "M54.2", label: "Cervicalgia", departmentId: "dept_spine", templateId: "tpl_cervical", packageIds: ["pkg_basic"], consentTemplateIds: ["consent_general_treatment"], billingTemplateId: "bt1" },
  { id: "dm_7", icd: "M17.9", label: "Knee osteoarthritis", departmentId: "dept_spine", templateId: "tpl_lumbar", packageIds: ["pkg_basic", "pkg_regen"], consentTemplateIds: ["consent_general_treatment"], billingTemplateId: "bt1" },
  { id: "dm_8", icd: "M19.90", label: "Unspecified osteoarthritis", departmentId: "dept_spine", templateId: "tpl_lumbar", packageIds: ["pkg_basic"], consentTemplateIds: ["consent_general_treatment"], billingTemplateId: "bt1" },
  { id: "dm_9", icd: "G56.0", label: "Carpal tunnel syndrome", departmentId: "dept_spine", templateId: "tpl_cervical", packageIds: ["pkg_basic"], consentTemplateIds: ["consent_general_treatment"], billingTemplateId: "bt1" },
  { id: "dm_10", icd: "E11.9", label: "Type 2 diabetes mellitus", departmentId: "dept_wellness", templateId: "tpl_wellness", packageIds: ["pkg_wellness"], consentTemplateIds: ["consent_general_treatment"], billingTemplateId: "bt2" },
  { id: "dm_11", icd: "I10", label: "Essential hypertension", departmentId: "dept_wellness", templateId: "tpl_wellness", packageIds: ["pkg_wellness"], consentTemplateIds: ["consent_general_treatment"], billingTemplateId: "bt2" },
  { id: "dm_12", icd: "E66.9", label: "Obesity unspecified", departmentId: "dept_wellness", templateId: "tpl_wellness", packageIds: ["pkg_wellness"], consentTemplateIds: ["consent_general_treatment"], billingTemplateId: "bt2" },
];

export const SEED_GEO: GeoCluster[] = [
  { id: "g1", pincode: "380015", city: "Satellite", lat: 23.0225, lng: 72.5714, patientCount: 342, opdCount: 298, ipdCount: 44, revenue: 8200000, topDiagnosis: "Dengue", severity: "high" },
  { id: "g2", pincode: "380009", city: "Navrangpura", lat: 23.036, lng: 72.561, patientCount: 289, opdCount: 251, ipdCount: 38, revenue: 6900000, topDiagnosis: "Dengue", severity: "high" },
  { id: "g3", pincode: "380015", city: "Vastrapur", lat: 23.033, lng: 72.533, patientCount: 258, opdCount: 220, ipdCount: 38, revenue: 6100000, topDiagnosis: "Hypertension", severity: "high" },
  { id: "g4", pincode: "380058", city: "Bopal", lat: 23.04, lng: 72.47, patientCount: 156, opdCount: 140, ipdCount: 16, revenue: 3800000, topDiagnosis: "Type 2 Diabetes", severity: "medium" },
  { id: "g5", pincode: "382424", city: "Chandkheda", lat: 23.112, lng: 72.596, patientCount: 89, opdCount: 82, ipdCount: 7, revenue: 2100000, topDiagnosis: "COPD", severity: "low" },
  { id: "g6", pincode: "380008", city: "Maninagar", lat: 22.998, lng: 72.601, patientCount: 134, opdCount: 118, ipdCount: 16, revenue: 3200000, topDiagnosis: "Anemia", severity: "medium" },
];

export const SEED_DISEASE_CLUSTERS: DiseaseCluster[] = [
  { id: "dc1", locality: "Satellite", lat: 23.0225, lng: 72.5714, caseCount: 342, severity: "high", topDisease: "Dengue", surgePercent: 42 },
  { id: "dc2", locality: "Navrangpura", lat: 23.036, lng: 72.561, caseCount: 289, severity: "high", topDisease: "Dengue", surgePercent: 65 },
  { id: "dc3", locality: "Vastrapur", lat: 23.033, lng: 72.533, caseCount: 258, severity: "high", topDisease: "Hypertension" },
  { id: "dc4", locality: "Bopal", lat: 23.04, lng: 72.47, caseCount: 156, severity: "medium", topDisease: "Type 2 Diabetes" },
  { id: "dc5", locality: "Chandkheda", lat: 23.112, lng: 72.596, caseCount: 89, severity: "low", topDisease: "COPD" },
  { id: "dc6", locality: "Maninagar", lat: 22.998, lng: 72.601, caseCount: 134, severity: "medium", topDisease: "Anemia" },
];

export const SEED_SEASONAL_PATTERNS: SeasonalDiseaseMonth[] = [
  { month: "Jan", dengue: 12, tuberculosis: 18, diabetes: 45, hypertension: 52 },
  { month: "Feb", dengue: 15, tuberculosis: 20, diabetes: 48, hypertension: 54 },
  { month: "Mar", dengue: 22, tuberculosis: 19, diabetes: 50, hypertension: 56 },
  { month: "Apr", dengue: 38, tuberculosis: 17, diabetes: 52, hypertension: 58 },
  { month: "May", dengue: 55, tuberculosis: 16, diabetes: 54, hypertension: 60 },
  { month: "Jun", dengue: 72, tuberculosis: 15, diabetes: 56, hypertension: 62 },
  { month: "Jul", dengue: 68, tuberculosis: 14, diabetes: 58, hypertension: 64 },
  { month: "Aug", dengue: 61, tuberculosis: 13, diabetes: 60, hypertension: 66 },
];

export const SEED_DATA_MINING_KPIS: DataMiningKpi[] = [
  { label: "Avg patient age", value: "45.2 yrs", delta: "+0.8y vs last quarter", trend: "up" },
  { label: "Male : Female ratio", value: "1.12 : 1", delta: "Stable cohort mix", trend: "neutral" },
  { label: "Avg length of stay", value: "4.2 days", delta: "−0.3d vs last month", trend: "down" },
  { label: "Readmission rate (30d)", value: "8.4%", delta: "−1.2% improvement", trend: "down" },
  { label: "Insurance coverage", value: "62%", delta: "+5% YoY", trend: "up" },
  { label: "Chronic disease %", value: "34%", delta: "+2% vs baseline", trend: "up" },
];

export const SEED_DATA_SOURCES: DataSourceRow[] = [
  { id: "ds1", label: "Patient records", records: 23450, lastUpdated: "2 hours ago", anonymized: true },
  { id: "ds2", label: "Lab results", records: 145870, lastUpdated: "45 min ago", anonymized: true },
  { id: "ds3", label: "Prescription data", records: 89340, lastUpdated: "1 hour ago", anonymized: true },
  { id: "ds4", label: "Radiology reports", records: 12890, lastUpdated: "3 hours ago", anonymized: true },
];

export const SEED_AGE_GENDER: AgeGenderBand[] = [
  { band: "0–10", male: 420, female: 380 },
  { band: "11–20", male: 510, female: 490 },
  { band: "21–30", male: 890, female: 820 },
  { band: "31–40", male: 1120, female: 980 },
  { band: "41–50", male: 1340, female: 1180 },
  { band: "51–60", male: 980, female: 920 },
  { band: "61–70", male: 640, female: 710 },
  { band: "71+", male: 280, female: 340 },
];

export const SEED_TREATMENT_OUTCOMES: TreatmentOutcomeMonth[] = [
  { month: "Jul", improved: 62, stable: 22, referred: 10, readmitted: 6 },
  { month: "Aug", improved: 64, stable: 21, referred: 9, readmitted: 6 },
  { month: "Sep", improved: 66, stable: 20, referred: 9, readmitted: 5 },
  { month: "Oct", improved: 65, stable: 21, referred: 8, readmitted: 6 },
  { month: "Nov", improved: 68, stable: 19, referred: 8, readmitted: 5 },
  { month: "Dec", improved: 70, stable: 18, referred: 7, readmitted: 5 },
  { month: "Jan", improved: 69, stable: 19, referred: 7, readmitted: 5 },
  { month: "Feb", improved: 71, stable: 18, referred: 6, readmitted: 5 },
];

export const SEED_PREVALENCE_BARS = [
  { label: "Type 2 Diabetes", perThousand: 142, trend: "+12%" },
  { label: "Hypertension", perThousand: 128, trend: "+8%" },
  { label: "COPD", perThousand: 86, trend: "−3%" },
  { label: "Coronary artery disease", perThousand: 74, trend: "+5%" },
  { label: "Chronic kidney disease", perThousand: 52, trend: "+2%" },
  { label: "Dengue (seasonal)", perThousand: 48, trend: "+65%" },
  { label: "Tuberculosis", perThousand: 22, trend: "−6%" },
  { label: "Anemia", perThousand: 96, trend: "+4%" },
];

export const SEED_EXPENSES: ExpenseEntry[] = [
  { id: "ex_1", date: "2026-06-15", vendor: "MedSupply Co", category: "Consumables", departmentId: "dept_spine", amount: 45000, status: "approved" },
  { id: "ex_2", date: "2026-06-16", vendor: "AWS India", category: "IT / Cloud", departmentId: "dept_spine", amount: 28000, status: "approved" },
  { id: "ex_3", date: "2026-06-17", vendor: "Facility Maint", category: "Operations", departmentId: "dept_wellness", amount: 12000, status: "pending" },
];

export const SEED_REVENUE_POLICIES: RevenueSharePolicy[] = [
  { id: "rsp_1", label: "Spine — consultant share", departmentId: "dept_spine", doctorId: "", opdConsultPercent: 40, packageNetPercent: 8, ipdDayFixed: 2500, appliesToPartial: false, active: true },
  { id: "rsp_2", label: "Wellness — default", departmentId: "dept_wellness", doctorId: "dr_3", opdConsultPercent: 35, packageNetPercent: 10, ipdDayFixed: 2000, appliesToPartial: true, active: true },
  { id: "rsp_3", label: "Spine — associate", departmentId: "dept_spine", doctorId: "dr_2", opdConsultPercent: 30, packageNetPercent: 6, ipdDayFixed: 1800, appliesToPartial: false, active: true },
];

export const SEED_MRD: MrdRequest[] = [
  { id: "mrd_1", patientName: "Ravi Kumar", uhid: "NV-2026-0041", requestType: "patient_copy", requestedAt: "2026-06-16T10:00:00", status: "identity_verified", slaDue: "2026-06-19", documents: ["Consult record v6", "Consent physio"] },
  { id: "mrd_2", patientName: "Meena Devi", uhid: "NV-2026-0043", requestType: "insurance", requestedAt: "2026-06-17T09:30:00", status: "pending", slaDue: "2026-06-20", documents: ["Full chart", "Billing summary"] },
];

export const SEED_MIS: MisReport[] = [
  { id: "mis_1", label: "Daily revenue & collection", category: "revenue", schedule: "daily", lastRun: "2026-06-17T06:00:00", format: "csv" },
  { id: "mis_2", label: "Conversion funnel (counsellor)", category: "operations", schedule: "weekly", lastRun: "2026-06-16T06:00:00", format: "pdf" },
  { id: "mis_3", label: "Consent compliance audit", category: "compliance", schedule: "monthly", format: "pdf" },
  { id: "mis_4", label: "Doctor revenue share settlement", category: "revenue", schedule: "monthly", lastRun: "2026-06-01T06:00:00", format: "csv" },
  { id: "mis_5", label: "Queue throughput by department", category: "operations", schedule: "daily", format: "csv" },
  { id: "mis_6", label: "Deferred billing aging", category: "revenue", schedule: "weekly", format: "pdf" },
];

export type AdminPlatformSettings = {
  kAnonymityMin: number;
  geoAggregateOnly: boolean;
  auditRetentionYears: number;
  outbreakAlerts: boolean;
  autoMisDaily: boolean;
  whatsappConsentFlag: boolean;
};

export const SEED_ADMIN_SETTINGS: AdminPlatformSettings = {
  kAnonymityMin: 5,
  geoAggregateOnly: true,
  auditRetentionYears: 7,
  outbreakAlerts: true,
  autoMisDaily: true,
  whatsappConsentFlag: false,
};

export const FORM_DEPARTMENTS = [
  "frontdesk",
  "doctor",
  "counsellor",
  "nurse",
  "admin",
  "pharmacy",
  "crm",
  "hr",
] as const;

export type FormDepartment = (typeof FORM_DEPARTMENTS)[number];
