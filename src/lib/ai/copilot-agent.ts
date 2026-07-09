import { openRouterChat, type ChatMessage } from "@/lib/ai/openrouter-client";
import { copilotRouteCatalogForPrompt, normalizeCopilotHref } from "@/lib/ai/copilot-routes";
import type { CopilotAction, CopilotContext, CopilotMessage } from "@/lib/ai/scribe-types";

function asString(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

const COPILOT_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "fill_consult_section",
      description: "Fill examination, diagnosis, or treatment fields on the active doctor consult.",
      parameters: {
        type: "object",
        properties: {
          visitId: { type: "string" },
          section: { type: "string", enum: ["examination", "diagnosis", "treatment"] },
          data: { type: "object", additionalProperties: true },
        },
        required: ["visitId", "section", "data"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_prescription",
      description: "Set or replace prescription lines on the active consult.",
      parameters: {
        type: "object",
        properties: {
          visitId: { type: "string" },
          lines: {
            type: "array",
            items: {
              type: "object",
              properties: {
                drug: { type: "string" },
                dose: { type: "string" },
                frequency: { type: "string" },
                duration: { type: "string" },
                instructions: { type: "string" },
              },
              required: ["drug", "dose", "frequency", "duration"],
            },
          },
        },
        required: ["visitId", "lines"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "register_patient",
      description:
        "Register a new patient at front desk when the user provides name, phone, and demographics. Use when asked to register/add a patient — not navigate alone.",
      parameters: {
        type: "object",
        properties: {
          firstName: { type: "string", description: "Patient first name (required)" },
          lastName: { type: "string" },
          fullName: { type: "string", description: "Use if first/last not split; firstName will be derived from it" },
          phone: { type: "string", description: "10-digit mobile" },
          gender: { type: "string", enum: ["M", "F", "O", "male", "female", "other"] },
          department: { type: "string", description: "Department id e.g. dept_spine" },
          dob: { type: "string" },
          age: { type: "number" },
          email: { type: "string" },
        },
        required: ["phone", "firstName"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "navigate",
      description: "Navigate the user to a workspace page to complete a task. Use only hrefs from the route catalog.",
      parameters: {
        type: "object",
        properties: {
          href: { type: "string" },
          label: { type: "string" },
        },
        required: ["href"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "check_in",
      description: "Check in an existing patient for a visit. Use UHID, phone, or name to identify the patient.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "UHID, phone, or patient name to search" },
          doctor: { type: "string", description: "Doctor name or ID" },
          department: { type: "string", description: "Department id or label e.g. dept_spine" },
          visitId: { type: "string", description: "Optional existing visit id" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "process_billing",
      description: "Process billing/payment for a visit. Use when user asks to bill, take payment, or finalize billing.",
      parameters: {
        type: "object",
        properties: {
          visitId: { type: "string" },
          paymentScope: { type: "string", enum: ["full", "partial", "defer"], description: "full, partial, or defer" },
          amount: { type: "number" },
          collectedAmount: { type: "number" },
          mode: { type: "string", description: "Payment mode e.g. cash, card, upi" },
          customLine: { type: "string" },
          discount: { type: "number" },
        },
        required: ["visitId", "paymentScope", "amount", "mode"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "book_appointment",
      description: "Book an appointment for a patient. Identify patient by UHID/phone/name.",
      parameters: {
        type: "object",
        properties: {
          patient: { type: "string", description: "UHID, phone, or patient name" },
          doctor: { type: "string" },
          department: { type: "string" },
          date: { type: "string", description: "YYYY-MM-DD" },
          time: { type: "string", description: "HH:MM" },
          duration: { type: "number" },
          notes: { type: "string" },
        },
        required: ["patient"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "complete_junior_exam",
      description: "Complete the junior exam for a visit. Include any red flags if reported.",
      parameters: {
        type: "object",
        properties: {
          visitId: { type: "string" },
          redFlags: { type: "boolean" },
          redFlagNotes: { type: "string" },
          notes: { type: "string" },
        },
        required: ["visitId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "save_submission",
      description: "Save a dynamic form (registration, junior-exam, etc.) for a visit.",
      parameters: {
        type: "object",
        properties: {
          formId: { type: "string" },
          visitId: { type: "string" },
          data: { type: "object", additionalProperties: true },
        },
        required: ["formId", "visitId", "data"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_patient",
      description: "Update an existing patient's details.",
      parameters: {
        type: "object",
        properties: {
          patientId: { type: "string" },
          uhid: { type: "string" },
          data: { type: "object", additionalProperties: true },
        },
        required: ["patientId", "data"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "cancel_appointment",
      description: "Cancel an appointment by its appointment id.",
      parameters: {
        type: "object",
        properties: {
          appointmentId: { type: "string" },
        },
        required: ["appointmentId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "reschedule_appointment",
      description: "Reschedule an appointment to a new date/time.",
      parameters: {
        type: "object",
        properties: {
          appointmentId: { type: "string" },
          date: { type: "string" },
          time: { type: "string" },
          doctor: { type: "string" },
          department: { type: "string" },
        },
        required: ["appointmentId", "date", "time"],
      },
    },
  },
];

function contextBlock(ctx: CopilotContext): string {
  return JSON.stringify(ctx, null, 2);
}

function parseToolActions(name: string, argsRaw: string, ctx: CopilotContext): CopilotAction[] {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(argsRaw) as Record<string, unknown>;
  } catch {
    return [];
  }

  if (name === "fill_consult_section") {
    const visitId = String(args.visitId ?? ctx.visitId ?? "");
    const section = args.section as "examination" | "diagnosis" | "treatment";
    const data = args.data as Record<string, string | number | boolean>;
    if (!visitId || !section || !data) return [];
    return [{ type: "fill_section", visitId, section, data }];
  }

  if (name === "set_prescription") {
    const visitId = String(args.visitId ?? ctx.visitId ?? "");
    if (!visitId || !Array.isArray(args.lines)) return [];
    return [
      {
        type: "set_prescription",
        visitId,
        lines: args.lines as Array<{
          drug: string;
          dose: string;
          frequency: string;
          days: number;
          duration?: string;
          instructions?: string;
        }>,
      },
    ];
  }

  if (name === "navigate") {
    const href = normalizeCopilotHref(String(args.href ?? ""));
    if (!href) return [];
    return [{ type: "navigate", href, label: args.label ? String(args.label) : undefined }];
  }

  if (name === "register_patient") {
    const data = args as Record<string, string | number | boolean>;
    const phone = asString(data.phone ?? data.mobile);
    const firstName = asString(data.firstName ?? data.first_name);
    const lastName = asString(data.lastName ?? data.last_name);
    const fullName = asString(data.fullName ?? data.name);
    if (!phone || (!firstName && !fullName)) return [];
    return [{ type: "register_patient", data: { ...data, phone, firstName, lastName, fullName } }];
  }

  if (name === "check_in") {
    const query = asString(args.query ?? args.uhid ?? args.phone ?? args.patient);
    const doctor = asString(args.doctor);
    const department = asString(args.department);
    const visitId = asString(args.visitId ?? ctx.visitId);
    if (!query) return [];
    return [{ type: "check_in", query, doctor, department, visitId }];
  }

  if (name === "process_billing") {
    const visitId = asString(args.visitId ?? ctx.visitId ?? "");
    const data = args as Record<string, string | number | boolean>;
    if (!visitId) return [];
    return [
      {
        type: "process_billing",
        visitId,
        data: {
          paymentScope: asString(data.paymentScope ?? "full"),
          amount: Number(data.amount ?? 0),
          collectedAmount: Number(data.collectedAmount ?? data.amount ?? 0),
          mode: asString(data.mode ?? "cash"),
          customLine: asString(data.customLine),
          discount: Number(data.discount ?? 0),
        },
      },
    ];
  }

  if (name === "book_appointment") {
    const patientQuery = asString(args.patient ?? args.query);
    const doctor = asString(args.doctor);
    const department = asString(args.department);
    const date = asString(args.date);
    const time = asString(args.time);
    const duration = Number(args.duration ?? 20);
    const notes = asString(args.notes);
    if (!patientQuery) return [];
    return [{ type: "book_appointment", patientQuery, doctor, department, date, time, duration, notes }];
  }

  if (name === "complete_junior_exam") {
    const visitId = asString(args.visitId ?? ctx.visitId ?? "");
    const data = args as Record<string, string | number | boolean>;
    if (!visitId) return [];
    return [
      {
        type: "complete_junior_exam",
        visitId,
        data: {
          redFlags: Boolean(data.redFlags ?? data.red_flags),
          redFlagNotes: asString(data.redFlagNotes ?? data.redFlag_notes ?? data.redFlagNotes),
          notes: asString(data.notes),
        },
      },
    ];
  }

  if (name === "save_submission") {
    const formId = asString(args.formId ?? args.form_id ?? args.form);
    const visitId = asString(args.visitId ?? ctx.visitId ?? "");
    const data = (args.data ?? {}) as Record<string, string | number | boolean>;
    if (!formId || !visitId) return [];
    return [{ type: "save_submission", formId, visitId, data }];
  }

  if (name === "update_patient") {
    const patientId = asString(args.patientId ?? args.uhid ?? args.id);
    const data = args as Record<string, string | number | boolean>;
    if (!patientId) return [];
    return [{ type: "update_patient", patientId, data }];
  }

  if (name === "cancel_appointment") {
    const appointmentId = asString(args.appointmentId ?? args.appointment_id);
    if (!appointmentId) return [];
    return [{ type: "cancel_appointment", appointmentId }];
  }

  if (name === "reschedule_appointment") {
    const appointmentId = asString(args.appointmentId ?? args.appointment_id);
    const date = asString(args.date);
    const time = asString(args.time);
    const doctor = asString(args.doctor);
    const department = asString(args.department);
    if (!appointmentId || !date || !time) return [];
    return [{ type: "reschedule_appointment", appointmentId, date, time, doctor, department }];
  }

  return [];
}

export async function runCopilotAgent(input: {
  messages: CopilotMessage[];
  context: CopilotContext;
}): Promise<{ reply: string; actions: CopilotAction[] }> {
  const system = `You are Candela Copilot — an operational clinical agent inside a hospital SaaS.
You help staff complete real work: fill consult fields, draft prescriptions, and navigate to the right screen.
When the user asks you to do something you CAN do with tools, call the tool instead of only describing steps.
When the user asks to register or add a new patient, call register_patient with the details they gave (phone required). Do NOT navigate to /register — that path does not exist.
When registration needs more fields, navigate to /app/frontdesk/registration only after explaining missing info.
When the user asks to check in an existing patient, call check_in with query (UHID/phone/name) and optionally doctor/department.
When the user asks to process billing/take payment, call process_billing with visitId, amount, paymentScope, and mode.
When the user asks to book an appointment, call book_appointment with patient identifier and optional doctor/date/time.
When the user asks to complete a junior exam or initial triage, call complete_junior_exam with visitId.
When the user asks to save a form (registration, junior-exam, etc.), call save_submission with formId, visitId, and data.
When the user asks to update a patient, call update_patient with patientId and fields.
When on a doctor consult (visitId present), prefer fill_consult_section and set_prescription for documentation tasks.
For navigate tool, ONLY use these exact paths:
${copilotRouteCatalogForPrompt()}
Be concise, clinical, and action-oriented. Never fabricate patient data not in context.
Format replies with short headings (###), bullet lists (- item), and **bold** labels. Do not use markdown tables or pipe characters.
Keep responses under 12 lines unless the user asks for detail.

Workspace context:
${contextBlock(input.context)}`;

  const chatMessages: ChatMessage[] = [
    { role: "system", content: system },
    ...input.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  const actions: CopilotAction[] = [];
  let reply = "";

  for (let step = 0; step < 4; step += 1) {
    const result = await openRouterChat({
      messages: chatMessages,
      tools: COPILOT_TOOLS,
      temperature: 0.3,
    });

    if (result.toolCalls.length === 0) {
      reply = result.content || "Done.";
      break;
    }

    chatMessages.push({
      role: "assistant",
      content: result.content || null,
      tool_calls: result.toolCalls,
    });

    for (const call of result.toolCalls) {
      actions.push(...parseToolActions(call.function.name, call.function.arguments, input.context));
      chatMessages.push({
        role: "tool",
        tool_call_id: call.id,
        name: call.function.name,
        content: JSON.stringify({ ok: true }),
      });
    }

    if (step === 3) {
      reply = result.content || "Actions queued.";
    }
  }

  if (!reply) {
    reply =
      actions.length > 0
        ? `Completed ${actions.length} action${actions.length === 1 ? "" : "s"} for you.`
        : "How can I help with this workspace?";
  }

  return { reply, actions };
}
