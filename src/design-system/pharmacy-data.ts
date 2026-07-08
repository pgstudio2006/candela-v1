/** Candela Pharmacy — formulary, fulfillment, inventory & procurement (India-ready demo) */

export type PharmacyStaffRole = "manager" | "opd" | "purchase";

export type DrugSchedule = "OTC" | "H" | "H1" | "X";

export type RxStatus =
  | "pending"
  | "verified"
  | "partially_dispensed"
  | "dispensed"
  | "cancelled"
  | "rejected";

export type RxPriority = "routine" | "urgent" | "stat";

export type RxSource = "opd" | "ipd" | "er" | "walk_in";

export type PoStatus = "draft" | "submitted" | "approved" | "partial" | "received" | "cancelled";

export type PaymentMode = "cash" | "upi" | "card" | "credit_ipd";

export type PharmacyStaff = {
  id: string;
  name: string;
  email: string;
  role: PharmacyStaffRole;
  licenseNo?: string;
  active: boolean;
};

export type Drug = {
  id: string;
  genericName: string;
  brandName: string;
  strength: string;
  form: string;
  route: string;
  therapeuticClass: string;
  schedule: DrugSchedule;
  hsn: string;
  gstPercent: number;
  unit: string;
  reorderLevel: number;
  requiresRx: boolean;
  coldChain: boolean;
  substitutes: string[];
  active: boolean;
  defaultMrp: number;
};

export type StockBatch = {
  id: string;
  drugId: string;
  batchNo: string;
  expiry: string;
  qtyOnHand: number;
  reserved: number;
  purchaseRate: number;
  mrp: number;
  rack: string;
  supplierId?: string;
  quarantined: boolean;
};

export type Supplier = {
  id: string;
  name: string;
  gstin: string;
  drugLicense: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  paymentTerms: string;
  preferred: boolean;
  active: boolean;
};

export type PoLine = {
  drugId: string;
  qtyOrdered: number;
  qtyReceived: number;
  rate: number;
  gstPercent: number;
};

export type PurchaseOrder = {
  id: string;
  supplierId: string;
  status: PoStatus;
  createdAt: string;
  expectedAt?: string;
  lines: PoLine[];
  notes?: string;
};

export type PrescriptionLine = {
  id: string;
  drugId: string;
  dose: string;
  frequency: string;
  duration: string;
  days: number;
  qtyPrescribed: number;
  qtyDispensed: number;
  substituteDrugId?: string;
  notes?: string;
};

export type Prescription = {
  id: string;
  patientName: string;
  uhid: string;
  age?: number;
  gender?: string;
  allergies?: string[];
  doctorName: string;
  source: RxSource;
  priority: RxPriority;
  status: RxStatus;
  assigneeId?: string;
  encounterId?: string;
  lines: PrescriptionLine[];
  rejectReason?: string;
  counselingNotes?: string;
  witnessName?: string;
  createdAt: string;
  updatedAt: string;
  verifiedAt?: string;
  dispensedAt?: string;
};

export type PharmacyBillLine = {
  drugId: string;
  batchId: string;
  qty: number;
  rate: number;
  gstPercent: number;
};

export type PharmacyBill = {
  id: string;
  prescriptionId?: string;
  patientName: string;
  uhid?: string;
  lines: PharmacyBillLine[];
  subtotal: number;
  gstTotal: number;
  discount: number;
  total: number;
  paymentMode: PaymentMode;
  paid: boolean;
  createdAt: string;
  createdBy: string;
};

export type ReturnRecord = {
  id: string;
  type: "patient" | "ward" | "supplier";
  drugId: string;
  batchId?: string;
  qty: number;
  reason: string;
  patientName?: string;
  billId?: string;
  status: "pending" | "approved" | "restocked" | "rejected";
  createdAt: string;
};

export type WardIndent = {
  id: string;
  ward: string;
  bed?: string;
  drugId: string;
  qtyRequested: number;
  qtyIssued: number;
  urgency: RxPriority;
  nurseName: string;
  status: "pending" | "issued" | "cancelled";
  createdAt: string;
};

export type ScheduleHEntry = {
  id: string;
  prescriptionId: string;
  patientName: string;
  uhid: string;
  doctorName: string;
  drugId: string;
  batchId: string;
  qty: number;
  balanceAfter: number;
  pharmacistId: string;
  witnessName?: string;
  at: string;
};

export type PharmacyActivity = {
  id: string;
  at: string;
  actor: string;
  type: string;
  summary: string;
  refId?: string;
};

export const PHARMACY_MANAGER_ID = "phm_mgr";

export const SEED_PHARMACY_STAFF: PharmacyStaff[] = [
  { id: PHARMACY_MANAGER_ID, name: "Pharmacy Manager", email: "pharmacy@navayu.in", role: "manager", licenseNo: "DL-GJ-12345", active: true },
  { id: "phm_opd", name: "Kavita Nair", email: "opd@navayu.in", role: "opd", licenseNo: "DL-GJ-67890", active: true },
  { id: "phm_pur", name: "Rajesh Patel", email: "purchase@navayu.in", role: "purchase", licenseNo: "DL-GJ-11223", active: true },
];

export const SEED_DRUGS: Drug[] = [
  { id: "dr_preg", genericName: "Pregabalin", brandName: "Pregeb", strength: "75mg", form: "Capsule", route: "Oral", therapeuticClass: "Analgesic", schedule: "H", hsn: "3004", gstPercent: 12, unit: "strip", reorderLevel: 20, requiresRx: true, coldChain: false, substitutes: ["dr_preg_gen"], active: true, defaultMrp: 185 },
  { id: "dr_preg_gen", genericName: "Pregabalin", brandName: "Pregaba", strength: "75mg", form: "Capsule", route: "Oral", therapeuticClass: "Analgesic", schedule: "H", hsn: "3004", gstPercent: 12, unit: "strip", reorderLevel: 15, requiresRx: true, coldChain: false, substitutes: [], active: true, defaultMrp: 120 },
  { id: "dr_para", genericName: "Paracetamol", brandName: "Calpol", strength: "650mg", form: "Tablet", route: "Oral", therapeuticClass: "Antipyretic", schedule: "OTC", hsn: "3004", gstPercent: 12, unit: "strip", reorderLevel: 50, requiresRx: false, coldChain: false, substitutes: [], active: true, defaultMrp: 35 },
  { id: "dr_amox", genericName: "Amoxicillin", brandName: "Mox", strength: "500mg", form: "Capsule", route: "Oral", therapeuticClass: "Antibiotic", schedule: "H", hsn: "3004", gstPercent: 12, unit: "strip", reorderLevel: 30, requiresRx: true, coldChain: false, substitutes: [], active: true, defaultMrp: 95 },
  { id: "dr_ins", genericName: "Insulin Glargine", brandName: "Lantus", strength: "100IU/ml", form: "Injection", route: "SC", therapeuticClass: "Antidiabetic", schedule: "H1", hsn: "3004", gstPercent: 12, unit: "vial", reorderLevel: 10, requiresRx: true, coldChain: true, substitutes: [], active: true, defaultMrp: 680 },
  { id: "dr_tram", genericName: "Tramadol", brandName: "Tramasure", strength: "50mg", form: "Tablet", route: "Oral", therapeuticClass: "Analgesic", schedule: "H1", hsn: "3004", gstPercent: 12, unit: "strip", reorderLevel: 10, requiresRx: true, coldChain: false, substitutes: [], active: true, defaultMrp: 220 },
  { id: "dr_ome", genericName: "Omeprazole", brandName: "Omez", strength: "20mg", form: "Capsule", route: "Oral", therapeuticClass: "PPI", schedule: "H", hsn: "3004", gstPercent: 12, unit: "strip", reorderLevel: 25, requiresRx: true, coldChain: false, substitutes: [], active: true, defaultMrp: 78 },
  { id: "dr_vitd", genericName: "Cholecalciferol", brandName: "D-Rise", strength: "60k IU", form: "Sachet", route: "Oral", therapeuticClass: "Supplement", schedule: "OTC", hsn: "3004", gstPercent: 12, unit: "sachet", reorderLevel: 40, requiresRx: false, coldChain: false, substitutes: [], active: true, defaultMrp: 42 },
];

export const SEED_SUPPLIERS: Supplier[] = [
  { id: "sup_1", name: "MedSupply India Pvt Ltd", gstin: "24AABCM1234F1Z5", drugLicense: "GJ/20/2024/001", contactPerson: "Vikram Shah", phone: "+91 98765 10001", email: "orders@medsupply.in", address: "Ahmedabad, Gujarat", paymentTerms: "Net 30", preferred: true, active: true },
  { id: "sup_2", name: "HealthLine Distributors", gstin: "24AABCH5678G1Z2", drugLicense: "GJ/21/2023/045", contactPerson: "Neha Desai", phone: "+91 98765 10002", email: "purchase@healthline.in", address: "Gurgaon, Haryana", paymentTerms: "Net 15", preferred: false, active: true },
  { id: "sup_3", name: "ColdChain Pharma", gstin: "24AABCC9012H1Z8", drugLicense: "GJ/20/2022/112", contactPerson: "Arun Mehta", phone: "+91 98765 10003", email: "cold@coldchain.in", address: "Mumbai, Maharashtra", paymentTerms: "Advance 50%", preferred: true, active: true },
];

const exp = (months: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
};

export const SEED_STOCK: StockBatch[] = [
  { id: "stk_1", drugId: "dr_preg", batchNo: "PG2401", expiry: exp(8), qtyOnHand: 45, reserved: 5, purchaseRate: 140, mrp: 185, rack: "A-12", supplierId: "sup_1", quarantined: false },
  { id: "stk_2", drugId: "dr_preg", batchNo: "PG2402", expiry: exp(2), qtyOnHand: 12, reserved: 0, purchaseRate: 138, mrp: 185, rack: "A-12", supplierId: "sup_1", quarantined: false },
  { id: "stk_3", drugId: "dr_para", batchNo: "CP650-24", expiry: exp(14), qtyOnHand: 200, reserved: 0, purchaseRate: 22, mrp: 35, rack: "B-01", supplierId: "sup_2", quarantined: false },
  { id: "stk_4", drugId: "dr_amox", batchNo: "AMX500-A", expiry: exp(6), qtyOnHand: 8, reserved: 0, purchaseRate: 72, mrp: 95, rack: "C-04", supplierId: "sup_1", quarantined: false },
  { id: "stk_5", drugId: "dr_ins", batchNo: "INS-COLD-01", expiry: exp(4), qtyOnHand: 15, reserved: 2, purchaseRate: 520, mrp: 680, rack: "FRIDGE-1", supplierId: "sup_3", quarantined: false },
  { id: "stk_6", drugId: "dr_tram", batchNo: "TR50-H1", expiry: exp(10), qtyOnHand: 6, reserved: 0, purchaseRate: 165, mrp: 220, rack: "CD-01", supplierId: "sup_1", quarantined: false },
  { id: "stk_7", drugId: "dr_ome", batchNo: "OM20-24", expiry: exp(1), qtyOnHand: 30, reserved: 0, purchaseRate: 55, mrp: 78, rack: "A-08", supplierId: "sup_2", quarantined: false },
  { id: "stk_8", drugId: "dr_vitd", batchNo: "VD60K", expiry: exp(20), qtyOnHand: 100, reserved: 0, purchaseRate: 28, mrp: 42, rack: "B-06", supplierId: "sup_2", quarantined: false },
];

export const SEED_PRESCRIPTIONS: Prescription[] = [
  {
    id: "rx_1",
    patientName: "Suresh Patel",
    uhid: "NYU-2026-00142",
    age: 58,
    gender: "Male",
    allergies: ["Penicillin"],
    doctorName: "Dr. Sharma",
    source: "opd",
    priority: "routine",
    status: "pending",
    assigneeId: "phm_opd",
    encounterId: "enc_001",
    lines: [
      { id: "rxl_1", drugId: "dr_preg", dose: "75mg", frequency: "BD", duration: "14 days", days: 14, qtyPrescribed: 28, qtyDispensed: 0 },
      { id: "rxl_2", drugId: "dr_ome", dose: "20mg", frequency: "OD", duration: "14 days", days: 14, qtyPrescribed: 14, qtyDispensed: 0 },
    ],
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: "rx_2",
    patientName: "Meena Devi",
    uhid: "NYU-2026-00188",
    age: 45,
    gender: "Female",
    doctorName: "Dr. Gupta",
    source: "ipd",
    priority: "urgent",
    status: "verified",
    assigneeId: "phm_opd",
    lines: [
      { id: "rxl_3", drugId: "dr_amox", dose: "500mg", frequency: "TDS", duration: "5 days", days: 5, qtyPrescribed: 15, qtyDispensed: 0 },
    ],
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    updatedAt: new Date(Date.now() - 1800000).toISOString(),
    verifiedAt: new Date(Date.now() - 1800000).toISOString(),
  },
  {
    id: "rx_3",
    patientName: "Ravi Shah",
    uhid: "NYU-2026-00201",
    age: 62,
    gender: "Male",
    doctorName: "Dr. Mehta",
    source: "opd",
    priority: "stat",
    status: "partially_dispensed",
    assigneeId: "phm_opd",
    lines: [
      { id: "rxl_4", drugId: "dr_ins", dose: "10 units", frequency: "OD", duration: "30 days", days: 30, qtyPrescribed: 2, qtyDispensed: 1 },
    ],
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 3600000).toISOString(),
    verifiedAt: new Date(Date.now() - 7200000).toISOString(),
  },
  {
    id: "rx_4",
    patientName: "Walk-in Customer",
    uhid: "WALK-001",
    doctorName: "OTC",
    source: "walk_in",
    priority: "routine",
    status: "dispensed",
    assigneeId: "phm_opd",
    lines: [{ id: "rxl_5", drugId: "dr_para", dose: "650mg", frequency: "SOS", duration: "3 days", days: 3, qtyPrescribed: 6, qtyDispensed: 6 }],
    createdAt: new Date(Date.now() - 172800000).toISOString(),
    updatedAt: new Date(Date.now() - 172800000).toISOString(),
    dispensedAt: new Date(Date.now() - 172800000).toISOString(),
  },
];

export const SEED_PURCHASE_ORDERS: PurchaseOrder[] = [
  {
    id: "po_1",
    supplierId: "sup_1",
    status: "approved",
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    expectedAt: exp(0),
    lines: [
      { drugId: "dr_amox", qtyOrdered: 50, qtyReceived: 0, rate: 72, gstPercent: 12 },
      { drugId: "dr_preg", qtyOrdered: 30, qtyReceived: 0, rate: 140, gstPercent: 12 },
    ],
  },
  {
    id: "po_2",
    supplierId: "sup_3",
    status: "received",
    createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
    lines: [{ drugId: "dr_ins", qtyOrdered: 20, qtyReceived: 20, rate: 520, gstPercent: 12 }],
  },
];

export const SEED_BILLS: PharmacyBill[] = [];

export const SEED_RETURNS: ReturnRecord[] = [
  { id: "ret_1", type: "patient", drugId: "dr_para", batchId: "stk_3", qty: 2, reason: "Unopened strip — patient recovered", patientName: "Amit Kumar", status: "pending", createdAt: new Date().toISOString() },
];

export const SEED_INDENTS: WardIndent[] = [
  { id: "ind_1", ward: "Orthopedic Ward", bed: "B-12", drugId: "dr_tram", qtyRequested: 10, qtyIssued: 0, urgency: "urgent", nurseName: "Anita Desai", status: "pending", createdAt: new Date().toISOString() },
];

export const SEED_SCHEDULE_H: ScheduleHEntry[] = [];

export const RX_STATUS_LABELS: Record<RxStatus, string> = {
  pending: "Pending",
  verified: "Verified",
  partially_dispensed: "Partial",
  dispensed: "Dispensed",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

export const PO_STATUS_LABELS: Record<PoStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  partial: "Partial",
  received: "Received",
  cancelled: "Cancelled",
};
