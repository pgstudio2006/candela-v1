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

export type DocumentLayoutId = "navayu-letterhead" | "dr-sunil-saini-letterhead" | "uploaded-pdf";

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
};

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
