import { useState, useEffect } from "react";
import type { CorrectionItem } from "../types";
import { updateCorrectionItem } from "../services/progress";

interface CorrectionDrillProps {
  lessonId: number;
  corrections: CorrectionItem[];
  onAllMastered: () => void;
}

export function CorrectionDrill({ lessonId, corrections, onAllMastered }: CorrectionDrillProps) {
  const [items, setItems] = useState<CorrectionItem[]>(corrections);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [userInput, setUserInput] = useState("");
  const [feedback, setFeedback] = useState<"idle" | "correct" | "incorrect" | "drilling">("idle");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const pendingItems = items.filter((c) => c.status !== "mastered");
  const current = pendingItems[currentIdx] ?? null;

  useEffect(() => {
    if (pendingItems.length === 0 && items.length > 0) {
      onAllMastered();
    }
  }, [pendingItems.length, items.length, onAllMastered]);

  const advance = () => {
    setUserInput("");
    setFeedback("idle");
    setMessage(null);
    if (currentIdx + 1 < pendingItems.length) {
      setCurrentIdx((i) => i + 1);
    } else if (pendingItems.length === 0) {
      onAllMastered();
    }
  };

  const checkAnswer = async () => {
    if (!current || !userInput.trim()) return;
    setLoading(true);
    setFeedback("idle");
    setMessage(null);
    try {
      const res = await fetch("/api/check-correction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          original: current.original,
          userCorrection: userInput.trim(),
          correctAnswer: current.corrected,
        }),
      });
      if (!res.ok) throw new Error("Failed to check correction");
      const data = (await res.json()) as { correct: boolean; feedback?: string };
      if (data.correct) {
        setFeedback("correct");
        const updated = updateCorrectionItem(lessonId, current.id, { status: "mastered" });
        setItems(updated.corrections?.[lessonId] ?? items);
        setMessage("Correct. Moving to next...");
        setTimeout(advance, 1200);
      } else {
        setFeedback("incorrect");
        setMessage(data.feedback || "Not quite. Try again or we will generate a drill.");
      }
    } catch {
      setFeedback("incorrect");
      setMessage("Could not verify. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const generateDrill = async () => {
    if (!current) return;
    setLoading(true);
    setFeedback("idle");
    setMessage(null);
    try {
      const res = await fetch("/api/generate-drill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          errorCategory: "grammar",
          example: current.original,
          correctVersion: current.corrected,
          explanation: current.explanation,
        }),
      });
      if (!res.ok) throw new Error("Failed to generate drill");
      const data = (await res.json()) as { sentence: string; correct: string };
      const updated = updateCorrectionItem(lessonId, current.id, {
        status: "drilling",
        drillSentence: data.sentence,
        drillCorrect: data.correct,
      });
      setItems(updated.corrections?.[lessonId] ?? items);
      setFeedback("drilling");
      setMessage("Practice this similar sentence, then type the correction.");
    } catch {
      setMessage("Could not generate drill.");
    } finally {
      setLoading(false);
    }
  };

  const submitDrill = async () => {
    if (!current || !current.drillCorrect) return;
    setLoading(true);
    setFeedback("idle");
    setMessage(null);
    try {
      const res = await fetch("/api/check-correction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          original: current.drillSentence,
          userCorrection: userInput.trim(),
          correctAnswer: current.drillCorrect,
        }),
      });
      if (!res.ok) throw new Error("Failed to check drill");
      const data = (await res.json()) as { correct: boolean; feedback?: string };
      if (data.correct) {
        setFeedback("correct");
        const updated = updateCorrectionItem(lessonId, current.id, { status: "mastered" });
        setItems(updated.corrections?.[lessonId] ?? items);
        setMessage("Drill completed. Mastered!");
        setTimeout(advance, 1200);
      } else {
        setFeedback("incorrect");
        setMessage(data.feedback || "Not quite. Try again.");
      }
    } catch {
      setMessage("Could not verify drill.");
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0) {
    return <p className="text-sm text-slate-500">No corrections pending.</p>;
  }

  if (!current) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-sm font-semibold text-emerald-800">All corrections mastered for lesson {lessonId}.</p>
      </div>
    );
  }

  const isDrilling = current.status === "drilling" || feedback === "drilling";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-900">Correction Drill</h3>
        <span className="text-sm font-semibold text-slate-500">
          {pendingItems.filter((c) => c.status === "mastered").length}/{items.length} mastered
        </span>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-4">
        {!isDrilling ? (
          <>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Fix this error</p>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-base font-semibold text-rose-700 line-through">{current.original}</span>
              <span className="text-rose-400">→</span>
              <span className="font-mono text-base font-semibold text-emerald-700">{current.corrected}</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">{current.explanation}</p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Practice sentence</p>
            <p className="mt-2 text-base leading-7 text-slate-900">{current.drillSentence}</p>
            <p className="mt-1 text-xs text-slate-500">Type the corrected version below</p>
          </>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <input
          type="text"
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          className="field"
          placeholder={isDrilling ? "Type the corrected sentence" : "Type the correct form..."}
          disabled={loading}
        />
        {!isDrilling ? (
          <button onClick={checkAnswer} disabled={loading || !userInput.trim()} className="button-primary" type="button">
            Check
          </button>
        ) : (
          <button onClick={submitDrill} disabled={loading || !userInput.trim()} className="button-primary" type="button">
            Submit drill
          </button>
        )}
      </div>

      {feedback === "incorrect" && !isDrilling && (
        <div className="flex flex-wrap gap-2">
          <button onClick={generateDrill} disabled={loading} className="button-secondary text-xs" type="button">
            Generate similar drill
          </button>
        </div>
      )}

      {message && (
        <p className={`text-sm font-semibold ${feedback === "correct" ? "text-emerald-700" : "text-rose-700"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
