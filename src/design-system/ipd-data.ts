export type IpdWard = {
  id: string;
  label: string;
  category: "general" | "icu" | "vip" | "daycare";
  beds: string[];
};

export type IpdBedRow = {
  id: string;
  wardId: string;
  label: string;
  active: boolean;
  occupied: boolean;
  admission?: IpdBedSummary["beds"][number]["admission"];
};

export const IPD_WARD_OPTIONS: IpdWard[] = [
  { id: "msk_a", label: "MSK Ward A", category: "general", beds: ["A-12", "A-13", "A-14", "A-15"] },
  { id: "msk_b", label: "MSK Ward B", category: "general", beds: ["B-01", "B-02", "B-03"] },
  { id: "icu", label: "ICU", category: "icu", beds: ["ICU-01", "ICU-02", "ICU-03"] },
  { id: "vip", label: "VIP Suite", category: "vip", beds: ["VIP-01", "VIP-02"] },
  { id: "daycare", label: "Daycare Bay", category: "daycare", beds: ["D-01", "D-02", "D-03"] },
];

export type IpdBillingMode = "prepaid" | "postpaid";

export type IpdPatientType = "general" | "corporate" | "insurance" | "vip";

export type IpdAdmissionStatus = "admitted" | "discharge_planned" | "doctor_ready" | "discharged" | "deceased";

export type IpdBedSummary = {
  wardId: string;
  ward: string;
  category: IpdWard["category"];
  active: boolean;
  beds: Array<{
    id: string;
    label: string;
    active: boolean;
    occupied: boolean;
    admission?: {
      id: string;
      patientId: string;
      patientName: string;
      doctorName: string;
      diagnosis: string;
      status: IpdAdmissionStatus;
      admittedAt: string;
      expectedDischarge?: string;
    };
  }>;
};

export type IpdPatientOption = {
  id: string;
  name: string;
  fullName?: string | null;
  uhid: string;
  phone: string;
};

export type IpdDoctorOption = {
  id: string;
  name: string;
};

export type IpdDepartmentOption = {
  id: string;
  label: string;
};

export type IpdSnapshot = {
  wards: IpdBedSummary[];
  totalBeds: number;
  occupiedBeds: number;
  freeBeds: number;
  patients: IpdPatientOption[];
  doctors: IpdDoctorOption[];
  departments: IpdDepartmentOption[];
};

export type IpdAdmissionInput = {
  patientId: string;
  doctorId: string;
  departmentId: string;
  diagnosis: string;
  wardId: string;
  bed: string;
  patientType?: IpdPatientType;
  billingMode?: IpdBillingMode;
  expectedDischarge?: string;
};

export type IpdCartItem = {
  id: string;
  type: "service" | "package";
  packageId: string;
  label: string;
  amount: number;
  quantity: number;
  addedAt: string;
};

export type IpdAdvancePayment = {
  id: string;
  admissionId: string;
  patientId: string;
  amount: number;
  receivedAmount: number;
  pendingAmount: number;
  mode: string;
  splits?: { mode: string; amount: number }[] | null;
  status: "received" | "pending" | "cancelled" | "refunded";
  referenceNo?: string | null;
  notes?: string | null;
  receivedAt: string;
  receivedBy?: string | null;
};

export type IpdRefundVoucher = {
  id: string;
  admissionId: string;
  patientId: string;
  invoiceId?: string | null;
  amount: number;
  mode: string;
  status: "pending" | "approved" | "issued" | "cancelled";
  approvedBy?: string | null;
  requestedBy?: string | null;
  referenceNo?: string | null;
  notes?: string | null;
  createdAt: string;
};

export type IpdAdmissionDetail = {
  id: string;
  visitId: string;
  patientId: string;
  patientName: string;
  uhid?: string | null;
  phone?: string | null;
  age?: number | null;
  gender?: string | null;
  ward: string;
  bed: string;
  category?: string | null;
  patientType: IpdPatientType;
  billingMode: IpdBillingMode;
  expectedDischarge?: string | null;
  admittedAt: string;
  diagnosis: string;
  attendingDoctorId: string;
  doctorName: string;
  lastRoundAt?: string | null;
  lastRoundNote?: string | null;
  status: IpdAdmissionStatus;
  cart: IpdCartItem[];
  balanceDue?: number | null;
  amountPaid?: number | null;
  billAmount?: number | null;
  walletBalance?: number | null;
  advancePayments: IpdAdvancePayment[];
  refundVouchers: IpdRefundVoucher[];
  refundAmount?: number | null;
  finalInvoiceId?: string | null;
  dischargeSummary?: unknown;
  deathSummary?: unknown;
};
