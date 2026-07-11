"use client";

import { AttioButton, Panel } from "@/components/frontdesk/ui";
import { SCRIBE_LANGUAGES } from "@/lib/ai/deepgram-languages";
import type { IpdRoundScribeDraft } from "@/lib/ai/scribe-types";
import { isSpeechRecognitionSupported } from "@/lib/speech-recognition";
import { useSpeechScribe } from "@/hooks/use-speech-scribe";
import { cn } from "@/lib/utils";
import { Loader2, Mic, Sparkles, Square } from "lucide-react";
import { useMemo, useState } from "react";

type IpdRoundAiScribeProps = {
  language?: string;
  patientContext?: string;
  onDraftAccepted: (draft: IpdRoundScribeDraft) => void;
};

export function IpdRoundAiScribe({ language = "en", patientContext, onDraftAccepted }: IpdRoundAiScribeProps) {
  const [lang, setLang] = useState(language);
  const [transcript, setTranscript] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const speechSupported = useMemo(() => isSpeechRecognitionSupported(), []);

  const { recording, interim, start, stop } = useSpeechScribe({
    language: lang,
    seedTranscript: transcript,
    onTranscriptUpdate: setTranscript,
    onError: setError,
  });

  const analyze = async () => {
    if (!transcript.trim() || transcript.trim().length < 10) {
      setError("Please dictate or type a longer round note.");
      return;
    }
    setError("");
    setAnalyzing(true);
    try {
      const res = await fetch("/api/scribe/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          language: lang,
          patientContext,
          mode: "ipd-round",
        }),
      });
      const data = (await res.json()) as { draft?: IpdRoundScribeDraft; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");
      if (data.draft) onDraftAccepted(data.draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not analyze transcript.");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <Panel
      title="AI Scribe — IPD round"
      action={
        <span className="flex items-center gap-1 text-[11px] text-[var(--attio-text-tertiary)]">
          <Sparkles className="size-3" />
          IPD round
        </span>
      }
    >
      <p className="mb-3 text-[12px] text-[var(--attio-text-secondary)]">
        Dictate the ward round in any language. AI will fill Subjective, Objective, Assessment, Plan, medicines, labs,
        radiology, progress, complications, next procedure, observation and advice.
      </p>

      {!speechSupported && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          Live transcription requires Chrome or Edge. You can still paste a dictated note below.
        </p>
      )}

      <div className="mb-3 flex flex-wrap gap-1.5">
        {SCRIBE_LANGUAGES.map((l) => (
          <button
            key={l.id}
            type="button"
            disabled={recording}
            onClick={() => setLang(l.id)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
              lang === l.id
                ? "border-[var(--attio-accent)] bg-[var(--attio-accent)]/10 text-[var(--attio-accent)]"
                : "border-[var(--attio-border)] text-[var(--attio-text-secondary)] hover:bg-[var(--attio-hover)]",
            )}
          >
            {l.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={!speechSupported}
          onClick={() => {
            setError("");
            if (!recording) void start();
            else void stop();
          }}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors",
            recording
              ? "bg-red-100 text-red-700 hover:bg-red-200"
              : "bg-[var(--attio-surface)] text-[var(--attio-text)] hover:bg-[var(--attio-hover)]",
          )}
        >
          {recording ? <Square className="size-3.5" /> : <Mic className="size-3.5" />}
          {recording ? "Stop" : "Record"}
        </button>
        <AttioButton variant="primary" onClick={() => void analyze()} disabled={analyzing}>
          {analyzing ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Sparkles className="mr-1 size-3.5" />}
          {analyzing ? "Analyzing…" : "Fill round with AI"}
        </AttioButton>
      </div>

      <div className="mt-3 space-y-2">
        <textarea
          value={transcript + (interim ? ` ${interim}` : "")}
          onChange={(e) => setTranscript(e.target.value)}
          rows={5}
          placeholder="Paste dictated round note here or press Record…"
          className="w-full rounded-lg border border-[var(--attio-border)] bg-white px-3 py-2 text-[13px] outline-none focus:border-[var(--attio-text)]"
        />
        {error && <p className="text-[12px] text-red-600">{error}</p>}
      </div>
    </Panel>
  );
}
