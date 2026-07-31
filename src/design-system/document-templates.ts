/** Printable document templates — extensible layout registry */

export type DocumentTemplateKind =
  | "prescription"
  | "invoice"
  | "consult_summary"
  | "lab_report"
  | "file_sticker"
  | "room_plate"
  | "ipd_overview"
  | "discharge_summary";

export type DocumentLayoutId = "navayu-letterhead" | "dr-sunil-saini-letterhead" | "uploaded-pdf" | "uploaded-image";

export type DocumentTemplateOverlayField = {
  id: string;
  key: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  align?: "left" | "center" | "right";
  fontStyle?: "normal" | "bold" | "italic" | "bold-italic";
  color?: string; // hex color, e.g. #1a1a1a
  wrap?: boolean;
  zIndex?: number;
};

export type DocumentTemplateSpec = {
  fileData?: string;
  mimeType?: string;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  overlayFields: DocumentTemplateOverlayField[];
};

export type DocumentTemplate = {
  id: string;
  kind: DocumentTemplateKind;
  label: string;
  layout: DocumentLayoutId;
  description: string;
  fileData?: string | null;
  mimeType?: string | null;
  marginTop?: number | null;
  marginBottom?: number | null;
  marginLeft?: number | null;
  marginRight?: number | null;
  overlayFields?: DocumentTemplateOverlayField[];
  isDefault?: boolean;
  enabled: boolean;
  isSystem: boolean;
};

export const CLINIC_BRAND = {
  name: "Navayu",
  tagline: "Healing Reimagined",
  legalEntity: "A Unit of ASP Global Health & Educare PVT LTD",
  website: "www.navayuhealth.com",
  address: "J-1/61 (3rd Floor), Vatika India Next, Gurugram - 122004",
  centres: ["Pataudi", "Gurugram- Sector 83", "Pune"],
  stats: { patients: "15,000+", successRate: "95%" },
  disclaimer: "This document is not valid for medico-legal purposes",
  phone: "+91 98765 43210",
  email: "care@navayuhealth.com",
  gstNumber: "",
};

function headerOverlayFields(): DocumentTemplateOverlayField[] {
  return [
    { id: "h_name", key: "hospitalName", label: CLINIC_BRAND.name, x: 8, y: 7, width: 55, height: 5, fontSize: 14, fontStyle: "bold", color: "#1a1a1a" },
    { id: "h_address", key: "hospitalAddress", label: CLINIC_BRAND.address, x: 8, y: 11, width: 55, height: 4, fontSize: 8, color: "#4a4a4a" },
    { id: "h_phone", key: "hospitalPhone", label: CLINIC_BRAND.phone, x: 8, y: 14, width: 30, height: 4, fontSize: 8, color: "#4a4a4a" },
    { id: "h_email", key: "hospitalEmail", label: CLINIC_BRAND.email, x: 8, y: 16.5, width: 30, height: 4, fontSize: 8, color: "#4a4a4a" },
    { id: "h_gst", key: "hospitalGst", label: "", x: 65, y: 7, width: 30, height: 4, fontSize: 8, align: "right", color: "#4a4a4a" },
  ];
}

export const DEFAULT_DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  {
    id: "doc_rx_navayu",
    kind: "prescription",
    label: "Navayu Prescription",
    layout: "navayu-letterhead",
    description: "Official letterhead prescription with Rx table",
    enabled: true,
    isSystem: true,
  },
  {
    id: "doc_inv_navayu",
    kind: "invoice",
    label: "Navayu Invoice",
    layout: "navayu-letterhead",
    description: "Billing invoice on Navayu letterhead",
    enabled: true,
    isSystem: true,
  },
  {
    id: "doc_consult_navayu",
    kind: "consult_summary",
    label: "Consultation Summary",
    layout: "navayu-letterhead",
    description: "Full consult record including AI scribe transcript",
    enabled: true,
    isSystem: true,
  },
  {
    id: "doc_rx_saini",
    kind: "prescription",
    label: "Dr. Sunil Saini Prescription",
    layout: "dr-sunil-saini-letterhead",
    description: "Prescription on Dr. Sunil Saini letterhead with patient info overlay",
    enabled: true,
    isSystem: true,
  },
  {
    id: "doc_lab_shared",
    kind: "lab_report",
    label: "Navayu Lab Report",
    layout: "uploaded-pdf",
    description: "Shared-header laboratory report",
    fileData: "/templates/60984.pdf",
    mimeType: "application/pdf",
    marginTop: 250,
    marginBottom: 60,
    marginLeft: 40,
    marginRight: 40,
    overlayFields: [
      { id: "lab_title", key: "documentTitle", label: "Laboratory Report", x: 35, y: 18, width: 30, height: 5, fontSize: 13, fontStyle: "bold", align: "center", color: "#1a1a1a" },
      { id: "lab_patient", key: "patientName", label: "Patient", x: 8, y: 23, width: 40, height: 4, fontSize: 9, fontStyle: "bold" },
      { id: "lab_uhid", key: "uhid", label: "UHID", x: 50, y: 23, width: 22, height: 4, fontSize: 9 },
      { id: "lab_age_gender", key: "ageGender", label: "Age / Gender", x: 72, y: 23, width: 20, height: 4, fontSize: 9 },
      { id: "lab_mobile", key: "mobileNo", label: "Mobile", x: 8, y: 26, width: 25, height: 4, fontSize: 9 },
      { id: "lab_doctor", key: "doctorName", label: "Referred By", x: 35, y: 26, width: 30, height: 4, fontSize: 9 },
      { id: "lab_sample_id", key: "sampleId", label: "Sample ID", x: 72, y: 26, width: 20, height: 4, fontSize: 9 },
      { id: "lab_collection", key: "collectionTime", label: "Collection", x: 8, y: 29, width: 25, height: 4, fontSize: 8, color: "#4a4a4a" },
      { id: "lab_receiving", key: "receivingTime", label: "Receiving", x: 35, y: 29, width: 25, height: 4, fontSize: 8, color: "#4a4a4a" },
      { id: "lab_reporting", key: "reportingTime", label: "Reporting", x: 72, y: 29, width: 20, height: 4, fontSize: 8, color: "#4a4a4a" },
      { id: "lab_footer_generated", key: "generatedOn", label: "Generated on", x: 8, y: 96, width: 40, height: 3, fontSize: 8, color: "#4a4a4a" },
      { id: "lab_footer_doctor", key: "orderedBy", label: "Authorized by", x: 60, y: 96, width: 35, height: 3, fontSize: 8, align: "right", color: "#4a4a4a" },
    ],
    enabled: true,
    isSystem: true,
  },
  {
    id: "doc_discharge_shared",
    kind: "discharge_summary",
    label: "Navayu Discharge Summary",
    layout: "uploaded-pdf",
    description: "Shared-header discharge summary",
    fileData: "/templates/60984.pdf",
    mimeType: "application/pdf",
    marginTop: 160,
    marginBottom: 70,
    marginLeft: 42,
    marginRight: 42,
    overlayFields: [
      ...headerOverlayFields(),
      { id: "ds_title", key: "documentTitle", label: "DISCHARGE SUMMARY", x: 30, y: 17, width: 40, height: 5, fontSize: 14, fontStyle: "bold", align: "center", color: "#1a1a1a" },
      { id: "ds_patient", key: "patientName", label: "Patient", x: 8, y: 22, width: 40, height: 4, fontSize: 9, fontStyle: "bold" },
      { id: "ds_uhid", key: "uhid", label: "UHID", x: 50, y: 22, width: 20, height: 4, fontSize: 9 },
      { id: "ds_age_gender", key: "ageGender", label: "Age / Gender", x: 72, y: 22, width: 20, height: 4, fontSize: 9 },
      { id: "ds_ipd_no", key: "ipdNo", label: "IPD No", x: 8, y: 25.5, width: 25, height: 4, fontSize: 9 },
      { id: "ds_admission", key: "admissionDate", label: "Admission", x: 35, y: 25.5, width: 30, height: 4, fontSize: 9 },
      { id: "ds_discharge", key: "dischargeDate", label: "Discharge", x: 65, y: 25.5, width: 30, height: 4, fontSize: 9 },
      { id: "ds_mobile", key: "mobileNo", label: "Mobile", x: 8, y: 29, width: 25, height: 4, fontSize: 9 },
      { id: "ds_doctor", key: "doctorName", label: "Doctor", x: 35, y: 29, width: 30, height: 4, fontSize: 9 },
      { id: "ds_address", key: "address", label: "Address", x: 65, y: 29, width: 30, height: 4, fontSize: 8, color: "#4a4a4a", wrap: true },
    ],
    enabled: true,
    isSystem: true,
  },
  {
    id: "doc_invoice_shared",
    kind: "invoice",
    label: "Navayu Invoice",
    layout: "uploaded-pdf",
    description: "Shared-header billing invoice",
    fileData: "/templates/60984.pdf",
    mimeType: "application/pdf",
    marginTop: 170,
    marginBottom: 70,
    marginLeft: 42,
    marginRight: 42,
    overlayFields: [
      ...headerOverlayFields(),
      { id: "inv_title", key: "documentTitle", label: "INVOICE / RECEIPT", x: 32, y: 18, width: 36, height: 5, fontSize: 13, fontStyle: "bold", align: "center", color: "#1a1a1a" },
      { id: "inv_patient", key: "patientName", label: "Patient", x: 8, y: 23, width: 40, height: 4, fontSize: 9, fontStyle: "bold" },
      { id: "inv_uhid", key: "uhid", label: "UHID", x: 50, y: 23, width: 20, height: 4, fontSize: 9 },
      { id: "inv_age_gender", key: "ageGender", label: "Age / Gender", x: 72, y: 23, width: 20, height: 4, fontSize: 9 },
      { id: "inv_mobile", key: "mobileNo", label: "Mobile", x: 8, y: 26.5, width: 25, height: 4, fontSize: 9 },
      { id: "inv_doctor", key: "doctorName", label: "Doctor", x: 35, y: 26.5, width: 30, height: 4, fontSize: 9 },
      { id: "inv_token", key: "token", label: "Token", x: 72, y: 26.5, width: 20, height: 4, fontSize: 9 },
      { id: "inv_no", key: "invoiceNo", label: "Invoice No", x: 8, y: 30, width: 25, height: 4, fontSize: 9 },
      { id: "inv_date", key: "invoiceDate", label: "Date", x: 35, y: 30, width: 25, height: 4, fontSize: 9 },
      { id: "inv_payment_mode", key: "paymentMode", label: "Payment Mode", x: 65, y: 30, width: 30, height: 4, fontSize: 9 },
      { id: "inv_patient_type", key: "patientType", label: "Patient Type", x: 65, y: 23, width: 25, height: 4, fontSize: 9 },
    ],
    enabled: true,
    isSystem: true,
  },
  {
    id: "doc_room_plate_shared",
    kind: "room_plate",
    label: "Navayu Room Sticker",
    layout: "uploaded-pdf",
    description: "Patient room plate sticker",
    fileData: "/templates/patientroomsticker.pdf",
    mimeType: "application/pdf",
    marginTop: 20,
    marginBottom: 20,
    marginLeft: 20,
    marginRight: 20,
    overlayFields: [
      { id: "rp_ward", key: "ward", label: "Ward", x: 10, y: 30, width: 80, height: 15, fontSize: 18, fontStyle: "bold", align: "center" },
      { id: "rp_bed", key: "bed", label: "Bed", x: 10, y: 50, width: 80, height: 18, fontSize: 24, fontStyle: "bold", align: "center" },
      { id: "rp_patient", key: "patientName", label: "Patient", x: 10, y: 70, width: 80, height: 10, fontSize: 14, fontStyle: "bold", align: "center" },
      { id: "rp_uhid", key: "uhid", label: "UHID", x: 10, y: 82, width: 80, height: 6, fontSize: 10, align: "center" },
    ],
    enabled: true,
    isSystem: true,
  },
  {
    id: "doc_file_sticker_shared",
    kind: "file_sticker",
    label: "Navayu File Sticker",
    layout: "uploaded-pdf",
    description: "Patient file sticker",
    fileData: "/templates/60984.pdf",
    mimeType: "application/pdf",
    marginTop: 120,
    marginBottom: 40,
    marginLeft: 20,
    marginRight: 20,
    overlayFields: [
      ...headerOverlayFields(),
      { id: "fs_patient", key: "patientName", label: "Patient", x: 8, y: 22, width: 55, height: 5, fontSize: 12, fontStyle: "bold" },
      { id: "fs_uhid", key: "uhid", label: "UHID", x: 8, y: 28, width: 55, height: 4, fontSize: 10 },
      { id: "fs_ward_bed", key: "wardBed", label: "Ward / Bed", x: 8, y: 33, width: 55, height: 4, fontSize: 10 },
      { id: "fs_admitted", key: "admissionDate", label: "Admitted", x: 8, y: 38, width: 55, height: 4, fontSize: 9 },
    ],
    enabled: true,
    isSystem: true,
  },
  {
    id: "doc_ipd_overview_shared",
    kind: "ipd_overview",
    label: "Navayu IPD Overview",
    layout: "uploaded-pdf",
    description: "IPD patient overview",
    fileData: "/templates/60984.pdf",
    mimeType: "application/pdf",
    marginTop: 150,
    marginBottom: 60,
    marginLeft: 42,
    marginRight: 42,
    overlayFields: [
      ...headerOverlayFields(),
      { id: "io_title", key: "documentTitle", label: "IPD PATIENT OVERVIEW", x: 30, y: 17, width: 40, height: 5, fontSize: 13, fontStyle: "bold", align: "center", color: "#1a1a1a" },
      { id: "io_patient", key: "patientName", label: "Patient", x: 8, y: 22, width: 40, height: 4, fontSize: 9, fontStyle: "bold" },
      { id: "io_uhid", key: "uhid", label: "UHID", x: 50, y: 22, width: 20, height: 4, fontSize: 9 },
      { id: "io_ward_bed", key: "wardBed", label: "Ward / Bed", x: 72, y: 22, width: 20, height: 4, fontSize: 9 },
      { id: "io_doctor", key: "doctorName", label: "Doctor", x: 8, y: 26, width: 40, height: 4, fontSize: 9 },
      { id: "io_admitted", key: "admissionDate", label: "Admitted", x: 50, y: 26, width: 20, height: 4, fontSize: 9 },
      { id: "io_expected", key: "expectedDischarge", label: "Expected discharge", x: 72, y: 26, width: 20, height: 4, fontSize: 9 },
      { id: "io_status", key: "status", label: "Status", x: 8, y: 30, width: 20, height: 4, fontSize: 9 },
      { id: "io_diagnosis", key: "diagnosis", label: "Diagnosis", x: 35, y: 30, width: 60, height: 4, fontSize: 9, wrap: true },
    ],
    enabled: true,
    isSystem: true,
  },
];

export const DOCUMENT_TEMPLATES_KEY = "candela-document-templates";

export function loadDocumentTemplates(): DocumentTemplate[] {
  if (typeof window === "undefined") return DEFAULT_DOCUMENT_TEMPLATES;
  try {
    const raw = localStorage.getItem(DOCUMENT_TEMPLATES_KEY);
    if (!raw) return DEFAULT_DOCUMENT_TEMPLATES;
    const custom = JSON.parse(raw) as DocumentTemplate[];
    const systemIds = new Set(DEFAULT_DOCUMENT_TEMPLATES.map((t) => t.id));
    const merged = DEFAULT_DOCUMENT_TEMPLATES.map((t) => {
      const override = custom.find((c) => c.id === t.id);
      return override ? { ...t, ...override, isSystem: true } : t;
    });
    const userAdded = custom.filter((c) => !systemIds.has(c.id));
    return [...merged, ...userAdded];
  } catch {
    return DEFAULT_DOCUMENT_TEMPLATES;
  }
}

export function saveDocumentTemplate(template: DocumentTemplate) {
  const all = loadDocumentTemplates();
  const idx = all.findIndex((t) => t.id === template.id);
  const next = idx >= 0 ? all.map((t, i) => (i === idx ? template : t)) : [...all, template];
  const toStore = next.filter((t) => !t.isSystem || !DEFAULT_DOCUMENT_TEMPLATES.find((d) => d.id === t.id));
  // Persist all non-default + enabled overrides
  const persist = [
    ...next.filter((t) => !t.isSystem),
    ...next
      .filter((t) => t.isSystem)
      .map((t) => {
        const def = DEFAULT_DOCUMENT_TEMPLATES.find((d) => d.id === t.id)!;
        if (t.enabled !== def.enabled || t.label !== def.label) return t;
        return null;
      })
      .filter(Boolean),
  ] as DocumentTemplate[];
  localStorage.setItem(DOCUMENT_TEMPLATES_KEY, JSON.stringify(persist));
  window.dispatchEvent(new CustomEvent("candela-doc-templates-updated"));
}

export function addDocumentTemplate(
  kind: DocumentTemplateKind,
  label: string,
  description: string,
) {
  const template: DocumentTemplate = {
    id: `doc_custom_${Date.now()}`,
    kind,
    label,
    layout: "navayu-letterhead",
    description,
    enabled: true,
    isSystem: false,
  };
  saveDocumentTemplate(template);
  return template;
}

export function getTemplatesByKind(kind: DocumentTemplateKind) {
  return loadDocumentTemplates().filter((t) => t.kind === kind && t.enabled);
}
