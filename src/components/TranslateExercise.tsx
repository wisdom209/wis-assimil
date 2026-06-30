import { useState } from "react";
import { TTSButton } from "./TTSButton";

interface TranslateExerciseProps {
  exercise: { question: string; answers: string[] };
  index: number;
}

export function TranslateExercise({ exercise, index }: TranslateExerciseProps) {
  const [userAnswer, setUserAnswer] = useState("");
  const [feedback, setFeedback] = useState<"idle" | "correct" | "incorrect">("idle");

  const normalize = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/[’']/g, "'")
      .replace(/[.!?]+$/g, "")
      .replace(/\s+/g, " ");

  const checkAnswer = () => {
    const normalized = normalize(userAnswer);
    const isCorrect = exercise.answers.some(
      (ans) => normalize(ans) === normalized
    );
    setFeedback(isCorrect ? "correct" : "incorrect");
  };

  return (
    <div className="mb-4 rounded-lg border border-stone-200 bg-white p-4 shadow-sm last:mb-0">
      <div className="flex items-start gap-2">
        <span className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-stone-100 font-mono text-xs font-bold text-slate-500">
          {index + 1}
        </span>
        <div className="flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className="text-lg font-semibold leading-7 text-slate-950">{exercise.question}</span>
            <TTSButton text={exercise.question} />
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <input
              type="text"
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              className="field"
              placeholder="Type your translation..."
            />
            <button
              onClick={checkAnswer}
              className="button-primary"
              type="button"
            >
              Check
            </button>
          </div>
          {feedback === "correct" && (
            <p className="mt-2 text-sm font-semibold text-emerald-700">Correct.</p>
          )}
          {feedback === "incorrect" && (
            <p className="mt-2 text-sm leading-6 text-rose-700">
              Try again. Accepted answer: {exercise.answers.join(" / ")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
