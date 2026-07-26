/** Laboratory module — seed data & types */

export const LAB_DATA_TYPES = [
  { value: "numeric", label: "Numeric" },
  { value: "text", label: "Text" },
  { value: "select", label: "Select / Dropdown" },
  { value: "boolean", label: "Boolean / Positive-Negative" },
  { value: "note", label: "Note only" },
] as const;

export type LabDataType = (typeof LAB_DATA_TYPES)[number]["value"];

export const LAB_ORDER_STATUS = [
  "ordered",
  "sample_collected",
  "in_progress",
  "completed",
  "cancelled",
] as const;
export type LabOrderStatus = (typeof LAB_ORDER_STATUS)[number];

export const LAB_ORDER_STATUS_LABELS: Record<LabOrderStatus, string> = {
  ordered: "Ordered",
  sample_collected: "Sample Collected",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const LAB_ITEM_STATUS = [
  "ordered",
  "sample_collected",
  "in_progress",
  "completed",
] as const;
export type LabItemStatus = (typeof LAB_ITEM_STATUS)[number];

export const LAB_ITEM_STATUS_LABELS: Record<LabItemStatus, string> = {
  ordered: "Ordered",
  sample_collected: "Sample Collected",
  in_progress: "In Progress",
  completed: "Completed",
};

export const LAB_RESULT_FLAGS = [
  "normal",
  "low",
  "high",
  "critical_low",
  "critical_high",
] as const;
export type LabResultFlag = (typeof LAB_RESULT_FLAGS)[number];

export const LAB_RESULT_FLAG_LABELS: Record<LabResultFlag, string> = {
  normal: "Normal",
  low: "Low",
  high: "High",
  critical_low: "Critical Low",
  critical_high: "Critical High",
};

export type LabFieldRange = {
  id: string;
  fieldMasterId: string;
  gender?: "M" | "F" | "O" | "all";
  ageMin?: number;
  ageMax?: number;
  ageUnit: "years" | "months" | "days";
  sampleType?: string;
  pregnancy?: boolean;
  condition?: string;
  low?: number;
  high?: number;
  criticalLow?: number;
  criticalHigh?: number;
  displayLabel?: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LabFieldMaster = {
  id: string;
  tenantId: string;
  branchId: string;
  code: string;
  name: string;
  unit?: string;
  dataType: LabDataType;
  sampleTypes: string[];
  options?: unknown; // Json: select options array or null
  defaultNote?: string;
  active: boolean;
  ranges: LabFieldRange[];
  createdAt: string;
  updatedAt: string;
};

export type LabReportCatalogField = {
  id: string;
  reportCatalogId: string;
  fieldMasterId: string;
  fieldMaster?: LabFieldMaster;
  section?: string;
  sortOrder: number;
  isVisible: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LabReportCatalog = {
  id: string;
  tenantId: string;
  branchId: string;
  code: string;
  name: string;
  description?: string;
  sampleType?: string;
  headerNote?: string;
  footerNote?: string;
  active: boolean;
  fields: LabReportCatalogField[];
  createdAt: string;
  updatedAt: string;
};

export type LabReportResult = {
  id: string;
  labOrderItemId: string;
  labOrderId: string;
  fieldMasterId: string;
  fieldMaster?: LabFieldMaster;
  value: string;
  numericValue?: number;
  flag?: LabResultFlag;
  note?: string;
  recordedAt: string;
  recordedBy?: string;
  createdAt: string;
  updatedAt: string;
};

export type LabOrderItem = {
  id: string;
  labOrderId: string;
  reportCatalogId: string;
  reportCatalog?: LabReportCatalog;
  serviceId?: string;
  label: string;
  sampleType?: string;
  status: LabItemStatus;
  sampleCollectedAt?: string;
  completedAt?: string;
  results: LabReportResult[];
  createdAt: string;
  updatedAt: string;
};

export type LabOrder = {
  id: string;
  tenantId: string;
  branchId: string;
  patientId: string;
  patientName?: string;
  patientUhid?: string;
  patientGender?: string | null;
  patientDateOfBirth?: string | null;
  patientAge?: number | null;
  patientBloodGroup?: string | null;
  visitId?: string;
  admissionId?: string;
  orderedBy: string;
  orderedByName?: string;
  source: "opd" | "ipd" | "emergency" | "direct";
  pregnancy: boolean;
  status: LabOrderStatus;
  orderedAt: string;
  sampleCollectedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
  items: LabOrderItem[];
  createdAt: string;
  updatedAt: string;
};

export type LabOrderInput = {
  patientId: string;
  visitId?: string;
  admissionId?: string;
  source: LabOrder["source"];
  items: { reportCatalogId: string; label: string; sampleType?: string; serviceId?: string }[];
};

export type LabResultInput = {
  labOrderItemId: string;
  fieldMasterId: string;
  value: string;
  note?: string;
};

export type LabTemplateOverlayField = {
  id: string;
  key: string;
  label: string;
  x: number; // percentage of page width (0-100)
  y: number; // percentage of page height from top (0-100)
  width: number; // percentage
  height: number; // percentage
  fontSize?: number;
  align?: "left" | "center" | "right";
};

export type LabReportTemplate = {
  id: string;
  tenantId: string;
  branchId: string;
  name: string;
  fileData: string;
  mimeType: string;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  overlayFields: LabTemplateOverlayField[];
  isDefault: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};
