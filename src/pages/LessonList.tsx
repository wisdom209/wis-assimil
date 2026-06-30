import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import type { Lesson } from "../types";
import { lessons } from "../data/lessons";
import { loadProgress } from "../services/progress";
import type { Progress } from "../services/progress";

export function LessonList() {
  const [progress, setProgress] = useState<Progress>({});

  useEffect(() => {
    setProgress(loadProgress());
  }, []);

  const total = lessons.length;
  const completed = Object.keys(progress).filter((id) => progress[Number(id)]).length;
  const percentComplete = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <main className="page-frame">
      <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-rose-700">
            Assimil Method
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950 sm:text-4xl">
            Assimil French
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Listen, read, repeat, and mark each lesson complete as you build the habit.
          </p>
        </div>
        <div className="panel min-w-44 px-4 py-3">
          <p className="text-sm text-slate-500">Progress</p>
          <p className="mt-1 text-2xl font-bold text-slate-950">
            {completed}/{total}
          </p>
          <div className="mt-3 h-2 rounded-full bg-stone-200">
            <div
              className="h-2 rounded-full bg-rose-700 transition-all"
              style={{ width: `${percentComplete}%` }}
            />
          </div>
        </div>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {lessons.map((lesson: Lesson) => {
          const isDone = progress[lesson.id] || false;
          return (
            <li key={lesson.id} className="min-w-0">
              <Link
                to={`/lesson/${lesson.id}`}
                className="panel flex min-h-28 flex-col justify-between p-4 transition hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-rose-300"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="rounded-md bg-stone-100 px-2 py-1 font-mono text-xs font-semibold text-slate-500">
                    {String(lesson.id).padStart(2, "0")}
                  </span>
                  {isDone && (
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                      Done
                    </span>
                  )}
                </span>
                <span className="mt-4 block">
                  <span className={`block text-base font-semibold ${isDone ? "text-slate-500 line-through" : "text-slate-950"}`}>
                    {lesson.title}
                  </span>
                  {lesson.type === "revision" && (
                    <span className="mt-2 inline-flex rounded-full bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700">
                      Revision
                    </span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
