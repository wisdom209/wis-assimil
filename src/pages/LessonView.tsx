import { useState, useEffect } from "react"; // Added useEffect
import { useParams, useNavigate } from "react-router-dom";
import type { Lesson, DialogueLine, Note, NewWord, TranslateExercise as TranslateExerciseType, FillExercise as FillExerciseType } from "../types";
import { lessons } from "../data/lessons";
import { AudioPlayer } from "../components/AudioPlayer";
import { TTSButton } from "../components/TTSButton";
import { TranslateExercise } from "../components/TranslateExercise";
import { FillExercise } from "../components/FillExercise";
import { Extras } from "../components/Extras";
import { loadProgress, toggleLessonComplete } from "../services/progress";

type Tab = "listen" | "study" | "words" | "translate" | "complete" | "extras";

export function LessonView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const lessonId = Number(id);
  const lesson = lessons.find((l: Lesson) => l.id === lessonId);
  const [activeTab, setActiveTab] = useState<Tab>("listen");
  const [progress, setProgress] = useState(loadProgress());
  
  // 1. Add state for the English toggle
  const [showEnglish, setShowEnglish] = useState(false); 
  
  const currentIndex = lessons.findIndex((l: Lesson) => l.id === lessonId);

  // 2. Reset the toggle when navigating to a different lesson
  useEffect(() => {
    setShowEnglish(false);
  }, [lessonId]);

  if (!lesson) {
    return (
      <main className="page-frame">
        <div className="panel p-5">
          <h1 className="text-xl font-semibold text-slate-950">Lesson not found</h1>
          <button onClick={() => navigate("/")} className="button-secondary mt-4">
            Back to lessons
          </button>
        </div>
      </main>
    );
  }

  const isCompleted = progress[lessonId] || false;
  const isRevision = lesson.type === "revision";

  const handleCompleteToggle = () => {
    const newProgress = toggleLessonComplete(lessonId);
    setProgress(newProgress);
  };

  const navigateLesson = (delta: number) => {
    const nextLesson = lessons[currentIndex + delta];
    if (nextLesson) {
      navigate(`/lesson/${nextLesson.id}`);
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case "listen": {
        const fullDialogueText = lesson.dialogue.map((d: DialogueLine) => d.french).join(". ");
        return (
          <div className="space-y-4">
            <AudioPlayer
              audioFile={lesson.audio_file}
              audioUrl={lesson.audio_url}
              textForTTS={fullDialogueText}
            />
            <p className="text-sm leading-6 text-slate-500">
              Listen to the full dialogue first, then study each line slowly.
            </p>
          </div>
        );
      }
      case "study":
        return (
          <div className="space-y-4">
            {lesson.type === "revision" ? (
              <div>
                <h3 className="section-title">Grammar Review</h3>
                {lesson.notes.map((note: Note, idx: number) => (
                  <div key={idx} className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-4">
                    <p className="text-sm leading-6 text-slate-700">{note.content}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div>
                {/* 3. Add the Toggle Button */}
                <div className="mb-4 flex items-center justify-end">
                  <button
                    onClick={() => setShowEnglish(!showEnglish)}
                    className="inline-flex items-center gap-2 rounded-md border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-stone-100"
                  >
                    <span className={`h-2 w-2 rounded-full transition-colors ${showEnglish ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                    {showEnglish ? "Hide English" : "Show English"}
                  </button>
                </div>

                {lesson.dialogue.map((line: DialogueLine, idx: number) => (
                  <div key={idx} className="border-b border-stone-100 py-4 last:border-0">
                    <div className="flex items-start gap-2">
                      <span className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-stone-100 font-mono text-xs font-bold text-rose-700">
                        {line.speaker}
                      </span>
                      <div className="flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-lg font-semibold leading-7 text-slate-950">{line.french}</span>
                          <TTSButton text={line.french} />
                        </div>
                        {line.pronunciation && (
                          <p className="mt-1 text-sm italic text-slate-500">[{line.pronunciation}]</p>
                        )}
                        
                        {/* 4. Conditionally render the English translation */}
                        {showEnglish && (
                          <p className="mt-1 text-sm leading-6 text-slate-700">{line.english}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div className="mt-5">
                  <h3 className="section-title">Notes</h3>
                  {lesson.notes.map((note: Note, idx: number) => (
                    <div key={idx} className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-rose-700">
                        {note.type}
                      </p>
                      <p className="text-sm leading-6 text-slate-700">{note.content}</p>
                    </div>
                  ))}
                </div>
                {lessonId >= 50 && (
                  <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-sm leading-6 text-indigo-800">
                    <strong>Productive Phase:</strong> Try to translate the French dialogue back into French without looking!
                  </div>
                )}
              </div>
            )}
          </div>
        );
      case "words":
        return (
          <div>
            <h3 className="section-title">New Words</h3>
            <ul className="mt-3 divide-y divide-stone-100 rounded-lg border border-stone-200">
              {lesson.new_words.map((word: NewWord, idx: number) => (
                <li key={idx} className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] sm:gap-4">
                  <span className="font-semibold text-slate-950">{word.french}</span>
                  <span className="text-sm leading-6 text-slate-600">{word.english}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      case "translate":
        if (isRevision || lesson.exercises.translate.length === 0) {
          return <p className="text-slate-500">No translation exercises for this lesson.</p>;
        }
        return (
          <div>
            <h3 className="section-title mb-4">Translate into English</h3>
            {lesson.exercises.translate.map((ex: TranslateExerciseType, idx: number) => (
              <TranslateExercise key={idx} exercise={ex} index={idx} />
            ))}
          </div>
        );
      case "complete":
        if (isRevision || lesson.exercises.fill.length === 0) {
          return <p className="text-slate-500">No fill-in-the-blank exercises for this lesson.</p>;
        }
        return (
          <div>
            <h3 className="section-title mb-4">Complete the French</h3>
            {lesson.exercises.fill.map((ex: FillExerciseType, idx: number) => (
              <FillExercise key={idx} exercise={ex} index={idx} />
            ))}
          </div>
        );
      case "extras":
        return <Extras extras={lesson.extras} />;
      default:
        return null;
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "listen", label: "Listen" },
    { key: "study", label: "Study" },
    { key: "words", label: "New Words" },
    { key: "translate", label: "Translations" },
    { key: "complete", label: "Complete" },
    { key: "extras", label: "Extras" },
  ];

  const visibleTabs = isRevision
    ? tabs.filter((t) => t.key !== "translate" && t.key !== "complete")
    : tabs;

  return (
    <main className="page-frame max-w-4xl">
      <button onClick={() => navigate("/")} className="mb-4 text-sm font-semibold text-slate-600 hover:text-rose-700">
        Back to lessons
      </button>

      <header className="mb-4 flex items-center justify-between gap-3">
        <button
          onClick={() => navigateLesson(-1)}
          className="button-secondary h-10 w-10 px-0"
          disabled={currentIndex <= 0}
          aria-label="Previous lesson"
        >
          ‹
        </button>
        <div className="min-w-0 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-rose-700">
            Lesson {lesson.id}
          </p>
          <h1 className="truncate text-2xl font-bold text-slate-950 sm:text-3xl">
            {lesson.title}
          </h1>
        </div>
        <button
          onClick={() => navigateLesson(1)}
          className="button-secondary h-10 w-10 px-0"
          disabled={currentIndex >= lessons.length - 1}
          aria-label="Next lesson"
        >
          ›
        </button>
      </header>

      <div className="mb-4 flex gap-2 overflow-x-auto border-b border-stone-200 pb-2">
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`shrink-0 rounded-md px-3 py-2 text-sm font-semibold transition ${
              activeTab === tab.key
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-stone-100 hover:text-slate-950"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <section className="panel p-4 sm:p-5">{renderTabContent()}</section>

      <div className="mt-4 flex flex-col gap-3 border-t border-stone-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          onClick={handleCompleteToggle}
          className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold transition ${
            isCompleted
              ? "border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              : "border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"
          }`}
        >
          {isCompleted ? "Mark as not completed" : "Mark as completed"}
        </button>
        <span className="text-sm text-slate-500">
          {isCompleted ? "Completed" : "Not completed"}
        </span>
      </div>
    </main>
  );
}
