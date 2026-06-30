import { useState } from "react";
import { TTSButton } from "./TTSButton";

interface FillExerciseProps {
  exercise: { question: string; blanks: { position: number; correct: string }[]; full_answer: string };
  index: number;
}

export function FillExercise({ exercise, index }: FillExerciseProps) {
  const inputCount = Math.max(exercise.blanks.length, 1);
  const [userInputs, setUserInputs] = useState<string[]>(() =>
    Array.from({ length: inputCount }, () => "")
  );
  const [feedback, setFeedback] = useState<("idle" | "correct" | "incorrect")[]>(
    Array.from({ length: inputCount }, () => "idle")
  );

  const normalize = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[.!?]+$/g, "")
      .replace(/\s+/g, " ");

  const handleChange = (idx: number, value: string) => {
    const newInputs = [...userInputs];
    newInputs[idx] = value;
    setUserInputs(newInputs);
  };

  const checkAll = () => {
    if (exercise.blanks.length === 0) {
      setFeedback([
        normalize(userInputs[0]) === normalize(exercise.full_answer) ? "correct" : "incorrect",
      ]);
      return;
    }

    const newFeedback = exercise.blanks.map((blank, idx) => {
      const normalized = normalize(userInputs[idx]);
      const isCorrect = normalized === normalize(blank.correct);
      return isCorrect ? "correct" : "incorrect";
    });
    setFeedback(newFeedback);
  };

  return (
    <div className="mb-4 rounded-lg border border-stone-200 bg-white p-4 shadow-sm last:mb-0">
      <div className="flex items-start gap-2">
        <span className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-stone-100 font-mono text-xs font-bold text-slate-500">
          {index + 1}
        </span>
        <div className="flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-base font-semibold leading-7 text-slate-950">{exercise.question}</p>
            <TTSButton text={exercise.full_answer} />
          </div>

          <div className="mt-3 grid gap-3">
            {exercise.blanks.length === 0 ? (
              <label className="grid gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Full sentence
                </span>
                <input
                  type="text"
                  value={userInputs[0] || ""}
                  onChange={(e) => handleChange(0, e.target.value)}
                  className={`field ${
                    feedback[0] === "correct"
                      ? "border-emerald-400 bg-emerald-50"
                      : feedback[0] === "incorrect"
                        ? "border-rose-400 bg-rose-50"
                        : ""
                  }`}
                  placeholder="Type the whole French sentence..."
                />
              </label>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {exercise.blanks.map((blank, idx) => (
                  <label key={`${blank.position}-${idx}`} className="grid gap-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Blank {idx + 1}
                    </span>
                    <input
                      type="text"
                      value={userInputs[idx] || ""}
                      onChange={(e) => handleChange(idx, e.target.value)}
                      className={`field ${
                        feedback[idx] === "correct"
                          ? "border-emerald-400 bg-emerald-50"
                          : feedback[idx] === "incorrect"
                            ? "border-rose-400 bg-rose-50"
                            : ""
                      }`}
                      placeholder="French word..."
                    />
                  </label>
                ))}
              </div>
            )}
            <div>
              <button
                onClick={checkAll}
                className="button-primary"
                type="button"
              >
                Check
              </button>
            </div>
          </div>

          <div className="mt-3">
            {feedback.every((f) => f === "correct") && (
              <p className="text-sm font-semibold text-emerald-700">Correct.</p>
            )}
            {feedback.some((f) => f === "incorrect") && (
              <p className="text-sm leading-6 text-rose-700">
                Try again. Answer: {exercise.full_answer}
              </p>
            )}
          </div>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-500 hover:text-slate-800">
              Show answer
            </summary>
            <p className="mt-2 rounded-md bg-stone-50 p-3 text-sm text-slate-700">
              {exercise.full_answer}
            </p>
          </details>
        </div>
      </div>
    </div>
  );
}
