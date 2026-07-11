import { openRouterChat } from "@/lib/ai/openrouter-client";
import type { IpdRoundScribeDraft, ScribeDraft } from "@/lib/ai/scribe-types";

const SCRIBE_SYSTEM = `You are a clinical documentation assistant for an Indian MSK/spine hospital.
Convert doctor-patient conversation transcripts into structured OPD consult fields.
Return ONLY valid JSON matching this schema:
{
  "summary": "2-3 sentence clinical summary",
  "examination": {
    "chiefComplaint": "string",
    "historyPresent": "string",
    "pastHistory": "string optional",
    "allergies": "string optional",
    "generalExam": "string optional",
    "mskExam": "string",
    "neuroExam": "string optional",
    "specialTests": "string optional",
    "vitalsBp": "string optional",
    "vitalsPulse": "number optional",
    "vitalsSpo2": "number optional"
  },
  "diagnosis": {
    "primaryDiagnosis": "string",
    "secondaryDiagnosis": "string optional",
    "icdTag": "M51.1|M47.8|M25.5|E88.81 or best ICD",
    "severity": "mild|moderate|severe",
    "clinicalImpression": "string"
  },
  "treatment": {
    "plan": "string",
    "procedures": "string optional",
    "physioProtocol": "string optional",
    "followUp": "string",
    "lifestyleAdvice": "string optional",
    "referrals": "string optional"
  },
  "prescription": [
    { "drug": "full drug with strength", "dose": "e.g. 1 tab", "frequency": "OD|BD|TDS|SOS", "duration": "e.g. 7 days", "instructions": "optional" }
  ]
}
Use Indian brand/generic medicine names when mentioned. If no medicines discussed, return empty prescription array.
Do not invent critical findings not supported by the transcript.`;

export async function analyzeScribeTranscript(input: {
  transcript: string;
  language: string;
  patientContext?: string;
}): Promise<ScribeDraft> {
  const user = [
    `Language: ${input.language}`,
    input.patientContext ? `Patient context: ${input.patientContext}` : "",
    "Transcript:",
    input.transcript.trim(),
  ]
    .filter(Boolean)
    .join("\n\n");

  const { content } = await openRouterChat({
    messages: [
      { role: "system", content: SCRIBE_SYSTEM },
      { role: "user", content: user },
    ],
    jsonMode: true,
    temperature: 0.1,
  });

  let parsed: ScribeDraft;
  try {
    parsed = JSON.parse(content) as ScribeDraft;
  } catch {
    throw new Error("AI returned invalid structured consult JSON.");
  }

  return {
    summary: parsed.summary ?? "",
    examination: parsed.examination ?? {},
    diagnosis: parsed.diagnosis ?? {},
    treatment: parsed.treatment ?? {},
    prescription: Array.isArray(parsed.prescription) ? parsed.prescription : [],
  };
}

const IPD_ROUND_SYSTEM = `You are a clinical documentation assistant for an Indian hospital.
Convert an IPD ward-round conversation or dictated note into structured round fields.
Use the patient's previous round notes as context so the new note is consistent and reflects progress since the last review.
Return ONLY valid JSON matching this schema:
{
  "summary": "1-2 sentence round summary",
  "subjective": "patient's complaints and subjective status",
  "objective": "vitals, physical exam, observable findings",
  "assessment": "clinical assessment/diagnosis",
  "plan": "immediate management plan",
  "medicines": "medicines ordered or changed, with dose/frequency if mentioned",
  "labReports": "relevant lab reports or orders",
  "radiologyReports": "relevant imaging reports or orders",
  "progress": "overall progress since admission/last round",
  "complications": "any complications or concerns",
  "nextProcedure": "next planned procedure or intervention",
  "observation": "monitoring/observation instructions",
  "advice": "advice to patient/relative and diet/activity counsel"
}
Use empty strings for fields not mentioned. Do not invent critical findings not supported by the transcript.`;

export async function analyzeIpdRoundTranscript(input: {
  transcript: string;
  language: string;
  patientContext?: string;
  previousRounds?: string[];
}): Promise<IpdRoundScribeDraft> {
  const historyText = (input.previousRounds ?? [])
    .filter(Boolean)
    .map((note, i) => `Round ${i + 1}:\n${note}`)
    .join("\n\n---\n\n");
  const user = [
    `Language: ${input.language}`,
    input.patientContext ? `Patient context: ${input.patientContext}` : "",
    historyText ? `Previous round notes for context:\n\n${historyText}` : "",
    "Transcript:",
    input.transcript.trim(),
  ]
    .filter(Boolean)
    .join("\n\n");

  const { content } = await openRouterChat({
    messages: [
      { role: "system", content: IPD_ROUND_SYSTEM },
      { role: "user", content: user },
    ],
    jsonMode: true,
    temperature: 0.1,
  });

  let parsed: IpdRoundScribeDraft;
  try {
    parsed = JSON.parse(content) as IpdRoundScribeDraft;
  } catch {
    throw new Error("AI returned invalid structured IPD round JSON.");
  }

  return {
    summary: parsed.summary ?? "",
    subjective: parsed.subjective ?? "",
    objective: parsed.objective ?? "",
    assessment: parsed.assessment ?? "",
    plan: parsed.plan ?? "",
    medicines: parsed.medicines ?? "",
    labReports: parsed.labReports ?? "",
    radiologyReports: parsed.radiologyReports ?? "",
    progress: parsed.progress ?? "",
    complications: parsed.complications ?? "",
    nextProcedure: parsed.nextProcedure ?? "",
    observation: parsed.observation ?? "",
    advice: parsed.advice ?? "",
  };
}
