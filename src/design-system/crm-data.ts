/** CRM workspace — Attio / TeleCRM-style lead ops for healthcare revenue */

export type CrmLeadSource =
  | "whatsapp"
  | "google_forms"
  | "meta_ads"
  | "website"
  | "walk_in"
  | "phone"
  | "doctor_referral"
  | "camp";

export type CrmIntegrationId =
  | "whatsapp_business"
  | "google_forms"
  | "meta_lead_ads"
  | "website_widget"
  | "zapier";

export type CrmIntegration = {
  id: CrmIntegrationId;
  label: string;
  description: string;
  icon: "whatsapp" | "form" | "meta" | "globe" | "zap";
  connected: boolean;
  webhookUrl: string;
  lastEventAt?: string;
  leadsToday: number;
};

export type CrmPipelineStage = {
  id: string;
  label: string;
  color: string;
  order: number;
  slaHours?: number;
};

export type CrmAssignmentRule = {
  id: string;
  label: string;
  active: boolean;
  strategy: "round_robin" | "by_source" | "by_specialty" | "manual" | "percentage";
  source?: CrmLeadSource;
  specialty?: string;
  assignToAgentIds: string[];
  /** agentId → % share (must sum to 100 when strategy is percentage) */
  agentWeights?: Record<string, number>;
};

export type CrmAgent = {
  id: string;
  name: string;
  email: string;
  role: "manager" | "counsellor" | "caller";
  active: boolean;
  specialtyTags: string[];
  maxOpenLeads: number;
  /** When set, agent is excluded from auto-assignment until this time */
  unavailableUntil?: string;
  unavailableReason?: string;
  /** Receives open leads when this agent is marked absent */
  backupAgentId?: string;
  /** Default routing weight when no rule weights apply */
  leadWeightPercent?: number;
};

export type CrmLeadGender = "male" | "female" | "other" | "prefer_not";

export type CrmLeadStatus =
  | "fresh"
  | "call_picked"
  | "call_not_picked"
  | "lead_form_filled"
  | "wants_visit"
  | "appointment_booked"
  | "visit_done"
  | "converted"
  | "patient"
  | "lost";

export type CrmCallOutcome = "picked" | "not_picked" | "callback" | "wrong_number";

export type CrmCommission = {
  id: string;
  leadId?: string;
  counsellorId: string;
  counsellorName: string;
  patientId?: string;
  patientName?: string;
  visitId?: string;
  billAmount: number;
  commissionPercent: number;
  commissionAmount: number;
  status: "pending" | "approved" | "paid";
  paidAt?: string;
  createdAt: string;
};

export type CrmLead = {
  id: string;
  fullName: string;
  phone: string;
  alternatePhone?: string;
  email?: string;
  age?: number;
  gender?: CrmLeadGender;
  city?: string;
  district?: string;
  state?: string;
  country?: string;
  doctorName?: string;
  appointmentDate?: string;
  appointmentTime?: string;
  appointmentCentre?: string;
  source: CrmLeadSource;
  sourceDetail?: string;
  integrationId?: CrmIntegrationId;
  stageId: string;
  assigneeId?: string;
  specialty?: string;
  valueEstimate: number;
  priority: "low" | "medium" | "high";
  tags: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
  lastContactAt?: string;
  nextFollowUpAt?: string;
  convertedVisitId?: string;
  /** Linked registered patient (Front Desk UHID record) */
  patientId?: string;
  uhid?: string;
  lostReason?: string;
  leadStatus?: CrmLeadStatus;
  callOutcome?: CrmCallOutcome;
  formData?: Record<string, string | number | boolean>;
};

/** Fields required when a team member manually captures a lead */
export type CrmLeadFormValues = {
  fullName: string;
  phone: string;
  alternatePhone: string;
  email: string;
  age: string;
  gender: CrmLeadGender | "";
  city: string;
  district: string;
  state: string;
  country: string;
  doctorName: string;
  appointmentDate: string;
  appointmentTime: string;
  appointmentCentre: string;
  source: CrmLeadSource;
  stageId: string;
  assigneeId: string;
  specialty: string;
  valueEstimate: string;
  priority: CrmLead["priority"];
  notes: string;
  lostReason: string;
};

export const CRM_APPOINTMENT_CENTRES = [
  "Navayu Spine — Gurgaon",
  "Navayu Spine — Ahmedabad",
  "Navayu Spine — Mumbai",
  "Navayu Wellness — Delhi NCR",
];

export const CRM_INDIAN_STATES = [
  "Andhra Pradesh",
  "Delhi",
  "Gujarat",
  "Haryana",
  "Karnataka",
  "Maharashtra",
  "Rajasthan",
  "Tamil Nadu",
  "Telangana",
  "Uttar Pradesh",
  "West Bengal",
];

export const EMPTY_LEAD_FORM: CrmLeadFormValues = {
  fullName: "",
  phone: "",
  alternatePhone: "",
  email: "",
  age: "",
  gender: "",
  city: "",
  district: "",
  state: "",
  country: "India",
  doctorName: "",
  appointmentDate: "",
  appointmentTime: "",
  appointmentCentre: "",
  source: "phone",
  stageId: "new",
  assigneeId: "",
  specialty: "",
  valueEstimate: "",
  priority: "medium",
  notes: "",
  lostReason: "",
};

export type CrmFollowUp = {
  id: string;
  leadId: string;
  assigneeId: string;
  scheduledAt: string;
  channel: "call" | "whatsapp" | "email";
  status: "pending" | "done" | "missed";
  outcome?: string;
  notes?: string;
};

export type CrmActivity = {
  id: string;
  leadId: string;
  at: string;
  actor: string;
  type: string;
  summary: string;
};

export const DEFAULT_CRM_STAGES: CrmPipelineStage[] = [
  { id: "new", label: "New", color: "#6366f1", order: 0, slaHours: 2 },
  { id: "contacted", label: "Contacted", color: "#2563eb", order: 1, slaHours: 24 },
  { id: "qualified", label: "Qualified", color: "#0891b2", order: 2 },
  { id: "appointment", label: "Appointment", color: "#059669", order: 3 },
  { id: "consult_done", label: "Consult done", color: "#65a30d", order: 4 },
  { id: "counselling", label: "Counselling", color: "#ca8a04", order: 5 },
  { id: "quoted", label: "Quoted", color: "#ea580c", order: 6 },
  { id: "won", label: "Won", color: "#16a34a", order: 7 },
  { id: "lost", label: "Lost", color: "#71717a", order: 8 },
];

export const SEED_CRM_AGENTS: CrmAgent[] = [
  { id: "crm_mgr", name: "CRM Manager", email: "crm@navayu.in", role: "manager", active: true, specialtyTags: [], maxOpenLeads: 999 },
  { id: "ag_priya", name: "Priya Sharma", email: "priya@navayu.in", role: "counsellor", active: true, specialtyTags: ["spine", "knee"], maxOpenLeads: 25, leadWeightPercent: 40, backupAgentId: "ag_anita" },
  { id: "ag_anita", name: "Anita Desai", email: "anita@navayu.in", role: "counsellor", active: true, specialtyTags: ["shoulder", "wellness"], maxOpenLeads: 25, leadWeightPercent: 35, backupAgentId: "ag_priya" },
  { id: "ag_rahul", name: "Rahul Verma", email: "rahul@navayu.in", role: "caller", active: true, specialtyTags: [], maxOpenLeads: 40, leadWeightPercent: 25, backupAgentId: "ag_priya" },
];

export const SEED_CRM_INTEGRATIONS: CrmIntegration[] = [
  {
    id: "whatsapp_business",
    label: "WhatsApp Business",
    description: "Inbound messages & click-to-chat ads → leads inbox",
    icon: "whatsapp",
    connected: true,
    webhookUrl: "https://api.candela.local/hooks/whatsapp/navayu-gurgaon",
    lastEventAt: "2026-06-17T09:12:00",
    leadsToday: 14,
  },
  {
    id: "google_forms",
    label: "Google Forms",
    description: "Camp registration & website inquiry forms",
    icon: "form",
    connected: true,
    webhookUrl: "https://api.candela.local/hooks/forms/spine-camp-2026",
    lastEventAt: "2026-06-17T08:45:00",
    leadsToday: 8,
  },
  {
    id: "meta_lead_ads",
    label: "Meta Lead Ads",
    description: "Facebook & Instagram lead forms",
    icon: "meta",
    connected: false,
    webhookUrl: "https://api.candela.local/hooks/meta/navayu",
    leadsToday: 0,
  },
  {
    id: "website_widget",
    label: "Website widget",
    description: "Navayu.in chat & book-consult embed",
    icon: "globe",
    connected: true,
    webhookUrl: "https://api.candela.local/hooks/web/navayu",
    lastEventAt: "2026-06-17T07:30:00",
    leadsToday: 5,
  },
  {
    id: "zapier",
    label: "Zapier / Make",
    description: "Connect 5000+ apps via automation bridge",
    icon: "zap",
    connected: false,
    webhookUrl: "https://api.candela.local/hooks/zapier/navayu",
    leadsToday: 0,
  },
];

export const SEED_ASSIGNMENT_RULES: CrmAssignmentRule[] = [
  {
    id: "rule_pct",
    label: "Percentage pool — all inbound leads",
    active: true,
    strategy: "percentage",
    assignToAgentIds: ["ag_priya", "ag_anita", "ag_rahul"],
    agentWeights: { ag_priya: 40, ag_anita: 35, ag_rahul: 25 },
  },
  { id: "rule_google", label: "Google Forms → Rahul (caller first touch)", active: true, strategy: "by_source", source: "google_forms", assignToAgentIds: ["ag_rahul"] },
  { id: "rule_spine", label: "Spine specialty → Priya", active: true, strategy: "by_specialty", specialty: "spine", assignToAgentIds: ["ag_priya"] },
  { id: "rule_rr", label: "Round robin fallback", active: false, strategy: "round_robin", assignToAgentIds: ["ag_priya", "ag_anita", "ag_rahul"] },
];

export const SEED_CRM_LEADS: CrmLead[] = [
  {
    id: "ld_1",
    fullName: "Amit Kumar",
    phone: "+91 98765 11001",
    email: "amit.k@email.com",
    source: "whatsapp",
    sourceDetail: "WhatsApp — knee pain ad",
    integrationId: "whatsapp_business",
    stageId: "qualified",
    assigneeId: "ag_priya",
    specialty: "knee",
    city: "Ahmedabad",
    district: "Ahmedabad",
    state: "Gujarat",
    country: "India",
    age: 42,
    gender: "male",
    alternatePhone: "+91 98765 11002",
    doctorName: "Dr. Mehta",
    appointmentDate: "2026-06-21",
    appointmentTime: "10:30",
    appointmentCentre: "Navayu Spine — Ahmedabad",
    valueEstimate: 85000,
    priority: "high",
    tags: ["hot", "camp-follow"],
    notes: "Wants Saturday slot",
    createdAt: "2026-06-16T14:00:00",
    updatedAt: "2026-06-17T08:00:00",
    lastContactAt: "2026-06-17T08:00:00",
    nextFollowUpAt: "2026-06-17T18:00:00",
  },
  {
    id: "ld_2",
    fullName: "Meena Devi",
    phone: "+91 98123 45678",
    patientId: "p2",
    uhid: "NV-2026-0043",
    source: "google_forms",
    sourceDetail: "Spine health camp — Gurgaon",
    integrationId: "google_forms",
    stageId: "new",
    assigneeId: "ag_rahul",
    specialty: "spine",
    city: "Gurgaon",
    district: "Gurugram",
    state: "Haryana",
    country: "India",
    age: 38,
    gender: "female",
    valueEstimate: 120000,
    priority: "medium",
    tags: ["camp-2026"],
    notes: "Corporate employee — TCS",
    createdAt: "2026-06-17T09:00:00",
    updatedAt: "2026-06-17T09:00:00",
  },
  {
    id: "ld_5",
    fullName: "Suresh Patel",
    phone: "+91 98765 43210",
    email: "suresh.p@email.com",
    patientId: "p1",
    uhid: "NV-2026-0042",
    source: "doctor_referral",
    sourceDetail: "Referred by Dr. Sharma — spine follow-up",
    stageId: "consult_done",
    assigneeId: "ag_priya",
    specialty: "spine",
    city: "Ahmedabad",
    state: "Gujarat",
    country: "India",
    age: 52,
    gender: "male",
    doctorName: "Dr. Rajesh Mehta",
    valueEstimate: 32000,
    priority: "high",
    tags: ["opd", "package-candidate"],
    notes: "Completed consult — counselling & nursing package quoted",
    createdAt: "2026-06-10T09:00:00",
    updatedAt: "2026-06-17T11:30:00",
    lastContactAt: "2026-06-17T11:00:00",
    convertedVisitId: "v7",
  },
  {
    id: "ld_3",
    fullName: "Ravi Shah",
    phone: "+91 98765 33003",
    source: "website",
    integrationId: "website_widget",
    stageId: "appointment",
    assigneeId: "ag_anita",
    specialty: "shoulder",
    valueEstimate: 65000,
    priority: "medium",
    tags: [],
    notes: "Booked via website — Tue 4pm",
    createdAt: "2026-06-15T10:00:00",
    updatedAt: "2026-06-16T16:00:00",
    lastContactAt: "2026-06-16T16:00:00",
  },
  {
    id: "ld_4",
    fullName: "Corporate — Batch TCS",
    phone: "+91 98765 44004",
    source: "google_forms",
    integrationId: "google_forms",
    stageId: "contacted",
    assigneeId: "ag_priya",
    specialty: "wellness",
    valueEstimate: 450000,
    priority: "high",
    tags: ["corporate", "bulk"],
    notes: "12 employees screened",
    createdAt: "2026-06-14T11:00:00",
    updatedAt: "2026-06-17T07:00:00",
  },
];

export const SEED_CRM_FOLLOWUPS: CrmFollowUp[] = [
  { id: "fu_1", leadId: "ld_1", assigneeId: "ag_priya", scheduledAt: "2026-06-17T18:00:00", channel: "whatsapp", status: "pending", notes: "Send package brochure" },
  { id: "fu_2", leadId: "ld_2", assigneeId: "ag_rahul", scheduledAt: "2026-06-17T11:00:00", channel: "call", status: "pending" },
  { id: "fu_3", leadId: "ld_5", assigneeId: "ag_priya", scheduledAt: "2026-06-18T10:00:00", channel: "whatsapp", status: "pending", notes: "Confirm nursing package start date" },
];

export const SEED_CRM_ACTIVITIES: CrmActivity[] = [
  { id: "act_1", leadId: "ld_2", at: "2026-06-17T09:00:00", actor: "System", type: "inbound", summary: "Lead captured from Google Forms — Spine health camp" },
  { id: "act_2", leadId: "ld_2", at: "2026-06-17T09:15:00", actor: "Rahul Verma", type: "call", summary: "First call — patient registered at front desk same day" },
  { id: "act_3", leadId: "ld_5", at: "2026-06-10T09:30:00", actor: "Front Desk", type: "visit", summary: "OPD visit registered — Token #12" },
  { id: "act_4", leadId: "ld_5", at: "2026-06-17T11:05:00", actor: "Dr. Mehta", type: "consult", summary: "Consult completed — routed to counsellor" },
  { id: "act_5", leadId: "ld_5", at: "2026-06-17T11:30:00", actor: "Priya Sharma", type: "billing", summary: "Package sold — Basic MSK Care ₹32,000 paid" },
  { id: "act_6", leadId: "ld_1", at: "2026-06-16T14:00:00", actor: "System", type: "inbound", summary: "WhatsApp inbound — knee pain campaign" },
  { id: "act_7", leadId: "ld_1", at: "2026-06-17T08:00:00", actor: "Priya Sharma", type: "whatsapp", summary: "Shared knee package brochure — awaiting reply" },
];

export const SOURCE_LABELS: Record<CrmLeadSource, string> = {
  whatsapp: "WhatsApp",
  google_forms: "Google Forms",
  meta_ads: "Meta Ads",
  website: "Website",
  walk_in: "Walk-in",
  phone: "Phone",
  doctor_referral: "Doctor referral",
  camp: "Health camp",
};
