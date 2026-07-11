import { analyzeIpdRoundTranscript, analyzeScribeTranscript } from "@/lib/ai/scribe-analyze";
import { requireApiAuth } from "@/server/ai/api-auth";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const auth = await requireApiAuth(["doctor", "nurse"]);
  if ("error" in auth) return auth.error;

  const body = (await req.json()) as {
    transcript?: string;
    language?: string;
    patientContext?: string;
    previousRounds?: string[];
    mode?: "opd" | "ipd-round";
  };

  const transcript = body.transcript?.trim();
  if (!transcript || transcript.length < 10) {
    return NextResponse.json({ error: "Transcript too short to analyze." }, { status: 400 });
  }

  try {
    const mode = body.mode ?? "opd";
    if (mode === "ipd-round") {
      const draft = await analyzeIpdRoundTranscript({
        transcript,
        language: body.language ?? "en",
        patientContext: body.patientContext,
        previousRounds: body.previousRounds,
      });
      return NextResponse.json({ draft });
    }

    const draft = await analyzeScribeTranscript({
      transcript,
      language: body.language ?? "en",
      patientContext: body.patientContext,
    });
    return NextResponse.json({ draft });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scribe analysis failed" },
      { status: 502 },
    );
  }
}
