import { useState, useEffect, useMemo } from "react";
import type { WritingError, WritingSubmission, CorrectionItem } from "../types";
import { getWritingTaskForLesson } from "../data/writing";
import {
  loadProgress,
  saveProgress,
  hasPendingCorrections,
  loadCorrections,
  saveCorrections,
  isTaskComplete,
  setTaskComplete,
} from "../services/progress";

const DRAFT_PREFIX = "writing:draft:";

function parseWordCountTarget(target: string): [number, number] {
  const parts = target.split("-").map((n) => parseInt(n, 10));
  return [parts[0] || 0, parts[1] || parts[0] || 0];
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

interface WritingTabProps {
  lessonId: number;
}

export function WritingTab({ lessonId }: WritingTabProps) {
  const task = getWritingTaskForLesson(lessonId);
  const [draft, setDraft] = useState(() => {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem(`${DRAFT_PREFIX}${lessonId}`) || "";
    }
    return "";
  });
  const [submission, setSubmission] = useState<WritingSubmission | null>(null);
  const [errors, setErrors] = useState<WritingError[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wordCount, setWordCount] = useState(() => countWords(draft));
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [timerActive, setTimerActive] = useState(false);
  const [showCorrections, setShowCorrections] = useState(false);
  const [completed, setCompleted] = useState(() => isTaskComplete(lessonId, "writing"));

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {

  const [minWords, maxWords] = useMemo(() => {
    if (!task) return [0, Infinity];
    return parseWordCountTarget(task.word_count_target);
  }, [task]);

  const hasPrevPending = useMemo(() => hasPendingCorrections(lessonId - 1), [lessonId]);
  const prevCorrections = useMemo(() => loadCorrections(lessonId - 1), [lessonId]);
  const isFirstLesson = lessonId === 1;

  useEffect(() => {
    if (!task || task.time_allocation_minutes == null) {
      setTimeLeft(null);
      return;
    }
    const totalSeconds = task.time_allocation_minutes * 60;
    if (timeLeft === null && !submission) {
      setTimeLeft(totalSeconds);
    }
  }, [task, submission]);

  useEffect(() => {
    if (!timerActive || timeLeft === null) return;
    if (timeLeft <= 0) {
      setTimerActive(false);
      return;
    }
    const tick = setInterval(() => {
      setTimeLeft((t) => (t !== null ? t - 1 : null));
    }, 1000);
    return () => clearInterval(tick);
  }, [timerActive, timeLeft]);

  useEffect(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(`${DRAFT_PREFIX}${lessonId}`, draft);
    }
  }, [draft, lessonId]);

  const handleDraftChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setDraft(val);
    setWordCount(countWords(val));
  };

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const handleSubmit = async () => {
    if (loading) return;
    if (wordCount < minWords) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/correct-writing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: draft, lessonId }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Failed to get corrections");
      }
      const data = (await res.json()) as { corrected_text?: string; errors?: WritingError[] };
      const writingErrors = data.errors ?? [];
      setErrors(writingErrors);
      const sub: WritingSubmission = {
        text: draft,
        wordCount,
        timestamp: Date.now(),
        corrections: writingErrors,
      };
      setSubmission(sub);
      setShowCorrections(true);
      setTimerActive(false);

      const correctionItems: CorrectionItem[] = writingErrors.map((e) => ({
        id: generateId(),
        original: e.original,
        corrected: e.corrected,
        explanation: e.explanation,
        status: "pending",
      }));
      saveCorrections(lessonId, correctionItems);
      const newProgress = loadProgress();
      newProgress.writing = newProgress.writing ?? {};
      newProgress.writing[lessonId] = true;
      saveProgress(newProgress);
      setCompleted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleDraftSubmit = async () => {
    if (wordCount >= minWords) {
      await handleSubmit();
    }
  };

  if (!task) {
    return <p className="text-slate-500">No writing task for this lesson.</p>;
  }

  const canSubmit = wordCount >= minWords && !loading && (!task.time_allocation_minutes || timeLeft === null || timeLeft > 0);
  const timeExpired = task.time_allocation_minutes != null && timeLeft !== null && timeLeft <= 0;

  const buildHighlightedText = (text: string, errs: WritingError[]): React.ReactNode[] => {
    const segments: { type: "text" | "error"; content: string; error?: WritingError }[] = [];
    let searchFrom = 0;
    for (const err of errs) {
      const idx = text.indexOf(err.original, searchFrom);
      if (idx === -1) continue;
      if (idx > searchFrom) {
        segments.push({ type: "text", content: text.slice(searchFrom, idx) });
      }
      segments.push({ type: "error", content: err.original, error: err });
      searchFrom = idx + err.original.length;
    }
    if (searchFrom < text.length) {
      segments.push({ type: "text", content: text.slice(searchFrom) });
    }
    if (segments.length === 0) return [text];
    return segments.map((seg, i) => {
      if (seg.type === "error") {
        return (
          <span key={i} className="rounded bg-rose-100 px-0.5 text-rose-800 line-through" title={seg.error?.explanation}>
            {seg.content}
          </span>
        );
      }
      return <span key={i}>{seg.content}</span>;
    });
  };

  // ---------- Correction gate (must fix yesterday before today) ----------
  if (!isFirstLesson && hasPrevPending && !submission) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h3 className="text-base font-semibold text-amber-900">Complete yesterday's corrections first</h3>
          <p className="mt-1 text-sm leading-6 text-amber-800">
            You have {prevCorrections.filter((c) => c.status !== "mastered").length} pending correction(s) from lesson {lessonId - 1}.
            Master them before starting today's writing task.
          </p>
        </div>
        <CorrectionDrill lessonId={lessonId - 1} corrections={prevCorrections} onAllMastered={() => {}} />
      </div>
    );
  }

  // ---------- Corrections from today's submission ----------
  if (submission && showCorrections) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
          <h3 className="section-title">Corrections — Read only</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Your text has been corrected. <strong>Do not edit this lesson.</strong> Tomorrow (Lesson {lessonId + 1}) you will practice fixing these errors.
          </p>
        </div>

        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Your original text with errors highlighted</h4>
          <p className="mt-3 whitespace-pre-wrap text-base leading-7 text-slate-900">
            {buildHighlightedText(submission.text, errors)}
          </p>
        </div>

        {errors.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Error breakdown</h4>
            {errors.map((err, idx) => (
              <div key={idx} className="rounded-lg border border-rose-100 bg-rose-50 p-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-sm font-semibold text-rose-700 line-through">{err.original}</span>
                  <span className="text-rose-400">→</span>
                  <span className="font-mono text-sm font-semibold text-emerald-700">{err.corrected}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-700">{err.explanation}</p>
                <span className="mt-2 inline-block rounded-full bg-stone-200 px-2 py-0.5 text-xs font-semibold text-slate-600">{err.category}</span>
              </div>
            ))}
          </div>
        )}

        {errors.length === 0 && (
          <p className="text-sm font-semibold text-emerald-700">No errors detected. Great job.</p>
        )}

        {!completed && (
          <button
            onClick={() => {
              const p = setTaskComplete(lessonId, "writing");
              saveProgress(p);
              setCompleted(true);
            }}
            className="button-primary"
          >
            Mark writing as complete
          </button>
        )}
      </div>
    );
  }

  // ---------- Writing task screen ----------
  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-800">{task.phase}</span>
          <span className="rounded-md bg-stone-200 px-2 py-1 text-xs font-semibold text-slate-700">{task.writing_task_type}</span>
          <span className="rounded-md bg-indigo-100 px-2 py-1 text-xs font-semibold text-indigo-800">{task.word_count_target} words</span>
          {task.time_allocation_minutes != null && (
            <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
              {task.time_allocation_minutes} min
            </span>
          )}
        </div>
        <h3 className="mt-3 text-base font-semibold text-slate-900">{task.title}</h3>
        <p className="mt-1 text-sm leading-6 text-slate-600">{task.task_description}</p>
        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Grammar focus: {task.grammar_focus}</p>
      </div>

      {task.time_allocation_minutes != null && timeLeft !== null && (
        <div className="flex items-center justify-between rounded-lg border border-stone-200 bg-white p-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-slate-700">Time left</span>
            <span className={`font-mono text-lg font-bold ${timeLeft < 60 ? "text-rose-700" : "text-slate-900"}`}>
              {formatTime(timeLeft)}
            </span>
          </div>
          {!timerActive && timeLeft > 0 && !submission && (
            <button onClick={() => setTimerActive(true)} className="button-secondary text-xs">Start timer</button>
          )}
          {timerActive && (
            <button onClick={() => setTimerActive(false)} className="button-secondary text-xs">Pause</button>
          )}
        </div>
      )}

      <div className="space-y-2">
        <textarea
          value={draft}
          onChange={handleDraftChange}
          disabled={!!submission || timeExpired}
          className="field min-h-[220px] w-full resize-y rounded-lg border border-stone-300 p-3 text-base leading-6 text-slate-900 placeholder:text-slate-400 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-200 disabled:bg-stone-50"
          placeholder="Write your French text here..."
        />
        <div className="flex items-center justify-between">
          <span className={`text-sm font-semibold ${wordCount < minWords ? "text-rose-700" : "text-emerald-700"}`}>
            {wordCount} / {minWords}{maxWords !== Infinity ? `-${maxWords}` : ""} words
          </span>
          {timeExpired && <span className="text-sm font-semibold text-rose-700">Time expired</span>}
        </div>
      </div>

      {error && <p className="text-sm font-semibold text-rose-700">{error}</p>}

      <div className="flex flex-wrap gap-3">
        {!submission && (
          <button
            onClick={handleDraftSubmit}
            disabled={!canSubmit}
            className="button-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Correcting..." : "Submit for correction"}
          </button>
        )}
        {submission && !showCorrections && (
          <button onClick={() => setShowCorrections(true)} className="button-primary">
            Show corrections
          </button>
        )}
        {submission && showCorrections && (
          <button onClick={() => setShowCorrections(false)} className="button-secondary">
            Back to my text
          </button>
        )}
      </div>
    </div>
  );
}
