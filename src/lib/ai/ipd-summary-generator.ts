import { openRouterChat } from "@/lib/ai/openrouter-client";

type IpdRoundNote = {
  at: string;
  actorName: string;
  actorRole: string;
  kind: string;
  content: string;
};

type AdmissionContext = {
  patientName: string;
  uhid?: string;
  age?: number;
  gender?: string;
  ward: string;
  bed: string;
  doctorName: string;
  diagnosis: string;
  admittedAt: string;
};

const DISCHARGE_SYSTEM = `You are a clinical documentation assistant for an Indian hospital.
Write a structured discharge summary from the provided IPD admission context and ward round notes.
Return ONLY valid JSON matching this schema:
{
  "diagnosis": "final diagnosis",
  "procedures": "procedures / surgeries / interventions performed",
  "medications": "discharge medications with dose and duration",
  "followUp": "follow-up plan / when to return",
  "notes": "hospital course summary and advice"
}
Be concise, medically accurate, and do not invent facts not supported by the notes.`;

export async function generateDischargeSummaryFromRounds(
  admission: AdmissionContext,
  rounds: IpdRoundNote[],
): Promise<{ diagnosis: string; procedures: string; medications: string; followUp: string; notes: string }> {
  const roundText = rounds
    .map((r) => `[${new Date(r.at).toLocaleString("en-IN")} - ${r.actorName} (${r.actorRole})]\n${r.content}`)
    .join("\n\n");

  const user = [
    `Patient: ${admission.patientName} (${admission.uhid ?? "N/A"}), ${admission.age ?? "-"}y ${admission.gender ?? ""}`,
    `Admitted under Dr. ${admission.doctorName} in ${admission.ward} bed ${admission.bed} on ${admission.admittedAt}.`,
    `Admission diagnosis: ${admission.diagnosis || "Not recorded"}.`,
    "Round notes:",
    roundText || "No round notes recorded.",
  ].join("\n\n");

  const { content } = await openRouterChat({
    messages: [
      { role: "system", content: DISCHARGE_SYSTEM },
      { role: "user", content: user },
    ],
    jsonMode: true,
    temperature: 0.2,
  });

  try {
    const parsed = JSON.parse(content) as {
      diagnosis?: string;
      procedures?: string;
      medications?: string;
      followUp?: string;
      notes?: string;
    };
    return {
      diagnosis: parsed.diagnosis ?? admission.diagnosis ?? "",
      procedures: parsed.procedures ?? "",
      medications: parsed.medications ?? "",
      followUp: parsed.followUp ?? "",
      notes: parsed.notes ?? "",
    };
  } catch {
    throw new Error("AI returned invalid discharge summary JSON.");
  }
}

const DEATH_SYSTEM = `You are a clinical documentation assistant for an Indian hospital.
Write a structured death summary from the provided IPD admission context and ward round notes.
Return ONLY valid JSON matching this schema:
{
  "diagnosis": "final diagnosis",
  "causeOfDeath": "immediate cause of death",
  "contributingConditions": "contributory / comorbid conditions",
  "procedures": "procedures / interventions performed",
  "medications": "notable medications during stay",
  "notes": "brief hospital course and circumstances"
}
Be concise, medically accurate, and do not invent facts not supported by the notes.`;

export async function generateDeathSummaryFromRounds(
  admission: AdmissionContext,
  rounds: IpdRoundNote[],
): Promise<{ diagnosis: string; causeOfDeath: string; contributingConditions: string; procedures: string; medications: string; notes: string }> {
  const roundText = rounds
    .map((r) => `[${new Date(r.at).toLocaleString("en-IN")} - ${r.actorName} (${r.actorRole})]\n${r.content}`)
    .join("\n\n");

  const user = [
    `Patient: ${admission.patientName} (${admission.uhid ?? "N/A"}), ${admission.age ?? "-"}y ${admission.gender ?? ""}`,
    `Admitted under Dr. ${admission.doctorName} in ${admission.ward} bed ${admission.bed} on ${admission.admittedAt}.`,
    `Admission diagnosis: ${admission.diagnosis || "Not recorded"}.`,
    "Round notes:",
    roundText || "No round notes recorded.",
  ].join("\n\n");

  const { content } = await openRouterChat({
    messages: [
      { role: "system", content: DEATH_SYSTEM },
      { role: "user", content: user },
    ],
    jsonMode: true,
    temperature: 0.2,
  });

  try {
    const parsed = JSON.parse(content) as {
      diagnosis?: string;
      causeOfDeath?: string;
      contributingConditions?: string;
      procedures?: string;
      medications?: string;
      notes?: string;
    };
    return {
      diagnosis: parsed.diagnosis ?? admission.diagnosis ?? "",
      causeOfDeath: parsed.causeOfDeath ?? "",
      contributingConditions: parsed.contributingConditions ?? "",
      procedures: parsed.procedures ?? "",
      medications: parsed.medications ?? "",
      notes: parsed.notes ?? "",
    };
  } catch {
    throw new Error("AI returned invalid death summary JSON.");
  }
}
