// src/components/SpeakingTab.tsx
import { useState, useEffect, useRef, useMemo } from "react";
import type { SpeakingSubmission } from "../types";
import { getSpeakingTaskForLesson } from "../data/speaking";
import { setTaskComplete, isTaskComplete, clearTaskComplete } from "../services/progress";
import {
  upsertPendingSubmission,
  getPendingByLesson,
  removePendingSubmission,
} from "../services/offlineQueue";
import type { PendingSpeakingSubmission } from "../services/offlineQueue";
import { lessons } from "../data/lessons";
import { storeAudioBlob, getAudioBlob, deleteAudioBlob } from "../services/audioStorage";
import { TTSButton } from "./TTSButton";

const DRAFT_PREFIX = "speaking:draft:";
const SUBMISSION_PREFIX = "speaking:submission:";

interface SpeakingTabProps {
  lessonId: number;
}

type RecordingStatus = "idle" | "recording" | "review" | "submitted";

export function SpeakingTab({ lessonId }: SpeakingTabProps) {
  const task = getSpeakingTaskForLesson(lessonId);
  const [status, setStatus] = useState<RecordingStatus>("idle");
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  const [submission, setSubmission] = useState<SpeakingSubmission | null>(() => {
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem(`${SUBMISSION_PREFIX}${lessonId}`);
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch {
          return null;
        }
      }
    }
    return null;
  });
  const [submittedAudioUrl, setSubmittedAudioUrl] = useState<string | null>(null);
  const [isDialogueModalOpen, setIsDialogueModalOpen] = useState(false);
  const [showModalEnglish, setShowModalEnglish] = useState(false);

  const lesson = useMemo(() => lessons.find((l) => l.id === lessonId), [lessonId]);
  const dialogue = useMemo(() => lesson?.dialogue || [], [lesson]);

  const [duration, setDuration] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [timerActive, setTimerActive] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(() => isTaskComplete(lessonId, "speaking"));
  const [pendingItem, setPendingItem] = useState<PendingSpeakingSubmission | null>(null);
  const [retrying, setRetrying] = useState(false);

  // Resolve indexeddb: URLs for the submission audio
  useEffect(() => {
    let active = true;
    let url: string | null = null;

    if (submission?.audioUrl) {
      if (submission.audioUrl.startsWith("indexeddb:")) {
        const key = submission.audioUrl.replace("indexeddb:", "");
        getAudioBlob(key).then((blob) => {
          if (active && blob) {
            url = URL.createObjectURL(blob);
            setSubmittedAudioUrl(url);
          }
        });
      } else {
        setSubmittedAudioUrl(submission.audioUrl);
      }
    } else {
      setSubmittedAudioUrl(null);
    }

    return () => {
      active = false;
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [submission]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const maxDuration = useMemo(() => task?.speaking_task.duration_minutes ?? 5, [task]);

  // Load pending submission for this lesson
  useEffect(() => {
    const loadPending = async () => {
      const pendings = await getPendingByLesson(lessonId);
      const speakingPending = pendings.find(
        (p) => p.type === "speaking"
      ) as PendingSpeakingSubmission | undefined;
      if (speakingPending) {
        setPendingItem(speakingPending);
        const url = URL.createObjectURL(speakingPending.audioBlob);
        setAudioBlobUrl(url);
        setTranscript(speakingPending.transcript);
        setDuration(speakingPending.durationSeconds);
        setStatus("review");
        setError("You have a pending submission. You can retry, delete, or submit a new one (will replace).");
      }
    };
    loadPending();

    return () => {
      if (audioBlobUrl && !pendingItem) URL.revokeObjectURL(audioBlobUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  // Restore submission from localStorage on mount
  useEffect(() => {
    if (submission) {
      setStatus("submitted");
    }
  }, [submission]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.onstop = null;
        if (mediaRecorderRef.current.state !== "inactive") {
          try {
            mediaRecorderRef.current.stop();
          } catch {
            // Safe ignore if already stopped or failed
          }
        }
      }
      if (streamRef.current) {
        try {
          streamRef.current.getTracks().forEach((t) => t.stop());
        } catch {
          // Safe ignore if track stopping fails
        }
        streamRef.current = null;
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // Safe ignore if speech recognition stopping fails
        }
      }
    };
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setAudioBlobUrl(url);
        setStatus("review");
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (timerRef.current) clearInterval(timerRef.current);
      };

      recorder.start();
      setStatus("recording");
      setDuration(0);
      setTimeLeft(maxDuration * 60);
      setTimerActive(true);
      setError(null);
      setTranscript("");
      setAiFeedback(null);

      // Speech recognition
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      const SpeechRecognitionCtor = w.SpeechRecognition || w.webkitSpeechRecognition;
      if (SpeechRecognitionCtor) {
        try {
          const recognition = new SpeechRecognitionCtor();
          recognition.lang = "fr-FR";
          recognition.continuous = true;
          recognition.interimResults = true;
          let finalTranscript = "";
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          recognition.onresult = (event: any) => {
            let interim = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const chunk = event.results[i][0].transcript;
              if (event.results[i].isFinal) {
                finalTranscript += chunk + " ";
              } else {
                interim += chunk;
              }
            }
            setTranscript((finalTranscript + interim).trim());
          };
          recognition.onerror = () => {};
          recognition.start();
          recognitionRef.current = recognition;
        } catch {
          // ignore - speech recognition is optional
        }
      }
    } catch {
      setError("Could not access microphone. Please allow mic permission.");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    recognitionRef.current?.stop?.();
    setTimerActive(false);
  };

  useEffect(() => {
    if (!timerActive || timeLeft === null) return;
    if (timeLeft <= 0) {
      setTimerActive(false);
      mediaRecorderRef.current?.stop();
      recognitionRef.current?.stop?.();
      return;
    }
    timerRef.current = window.setInterval(() => {
      setTimeLeft((t) => (t !== null ? t - 1 : null));
      setDuration((d) => d + 1);
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timerActive, timeLeft]);

  const handleSubmit = async (blob: Blob, transcriptText: string, durationSec: number) => {
    if (!task) return;
    setLoading(true);
    setError(null);
    try {
      const audioKey = `speaking-audio-${lessonId}`;
      await storeAudioBlob(audioKey, blob);

      const sub: SpeakingSubmission = {
        audioUrl: `indexeddb:${audioKey}`,
        timestamp: Date.now(),
        durationSeconds: durationSec,
        transcript: transcriptText,
      };
      setSubmission(sub);
      localStorage.setItem(`${SUBMISSION_PREFIX}${lessonId}`, JSON.stringify(sub));
      setStatus("submitted");

      if (transcriptText) {
        try {
          const analysis = await fetch("/api/analyze-speaking", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transcript: transcriptText, lessonId, taskType: task.speaking_task.type }),
          });
          if (analysis.ok) {
            const aData = (await analysis.json()) as { feedback?: string };
            if (aData.feedback) setAiFeedback(aData.feedback);
          }
        } catch {
          // non-blocking
        }
      }

      setTaskComplete(lessonId, "speaking");
      setCompleted(true);

      // Remove pending if any
      if (pendingItem) {
        await removePendingSubmission(pendingItem.id);
        setPendingItem(null);
      }

      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(`${DRAFT_PREFIX}${lessonId}`);
      }
    } catch (err: any) {
      setError(`Failed to save recording locally: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = async () => {
    if (!pendingItem) return;
    setRetrying(true);
    setError(null);
    await handleSubmit(pendingItem.audioBlob, pendingItem.transcript, pendingItem.durationSeconds);
    setRetrying(false);
  };

  const handleDeletePending = async () => {
    if (!pendingItem) return;
    await removePendingSubmission(pendingItem.id);
    setPendingItem(null);
    if (audioBlobUrl) {
      URL.revokeObjectURL(audioBlobUrl);
      setAudioBlobUrl(null);
    }
    setStatus("idle");
    setError(null);
  };

  const handleReRecord = () => {
    if (audioBlobUrl) URL.revokeObjectURL(audioBlobUrl);
    setAudioBlobUrl(null);
    setStatus("idle");
    setDuration(0);
    setTimeLeft(null);
    setTranscript("");
    setAiFeedback(null);
    setError(null);
    // If there was a pending, remove it (user chose to re-record)
    if (pendingItem) {
      removePendingSubmission(pendingItem.id).then(() => setPendingItem(null));
    }
  };

  // ----- NEW: Redo the whole task (clear completion & submission) -----
  const handleRedoRecording = async () => {
    // Clear the task completion flag
    clearTaskComplete(lessonId, "speaking");
    setCompleted(false);

    // Remove the stored submission from localStorage
    localStorage.removeItem(`${SUBMISSION_PREFIX}${lessonId}`);
    setSubmission(null);

    // If there is a pending item, remove it as well
    if (pendingItem) {
      await removePendingSubmission(pendingItem.id);
      setPendingItem(null);
    }

    // Delete IndexedDB audio file
    await deleteAudioBlob(`speaking-audio-${lessonId}`);

    // Reset UI to idle
    if (audioBlobUrl) {
      URL.revokeObjectURL(audioBlobUrl);
      setAudioBlobUrl(null);
    }
    setStatus("idle");
    setDuration(0);
    setTimeLeft(null);
    setTranscript("");
    setAiFeedback(null);
    setError(null);
  };

  if (!task) {
    return <p className="text-slate-500">No speaking task for this lesson.</p>;
  }

  const t = task.speaking_task;

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-800">{t.type}</span>
          <span className="rounded-md bg-stone-200 px-2 py-1 text-xs font-semibold text-slate-700">
            {t.duration_minutes} min
          </span>
        </div>
        <h3 className="mt-3 text-base font-semibold text-slate-900">{task.title}</h3>
        <p className="mt-1 text-sm leading-6 text-slate-600">{t.description}</p>
        <p className="mt-2 text-sm leading-6 text-slate-700">{t.instructions}</p>
        {t.focus_points.length > 0 && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {t.focus_points.map((fp, i) => (
              <li key={i}>{fp}</li>
            ))}
          </ul>
        )}
        {t.questions && t.questions.length > 0 && (
          <div className="mt-3">
            <p className="text-sm font-semibold text-slate-700">Questions to answer:</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-600">
              {t.questions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </div>
        )}
        {t.prompt && (
          <div className="mt-3 rounded-md bg-indigo-50 p-3 text-sm leading-6 text-indigo-800">
            <strong>Prompt:</strong> {t.prompt}
          </div>
        )}
        {t.topic && (
          <div className="mt-3 rounded-md bg-indigo-50 p-3 text-sm leading-6 text-indigo-800">
            <strong>Topic:</strong> {t.topic}
          </div>
        )}
        {dialogue.length > 0 && (
          <div className="mt-4 pt-3 border-t border-stone-200 flex justify-end">
            <button
              onClick={() => setIsDialogueModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
              type="button"
            >
              📖 Read Aloud / View Dialogue
            </button>
          </div>
        )}
      </div>

      {status === "idle" && (
        <div className="flex flex-col items-center gap-4 py-6">
          <button onClick={startRecording} className="button-primary text-base" type="button">
            Start Recording
          </button>
          {t.recording_required && <p className="text-xs text-slate-500">Recording is required for this task</p>}
        </div>
      )}

      {status === "recording" && (
        <div className="space-y-4 rounded-lg border border-rose-200 bg-rose-50 p-4">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 animate-pulse rounded-full bg-rose-600" />
              <span className="text-sm font-semibold text-rose-900">Recording</span>
            </span>
            <span
              className={`font-mono text-lg font-bold ${
                timeLeft !== null && timeLeft < 60 ? "text-rose-700" : "text-slate-900"
              }`}
            >
              {formatTime(timeLeft ?? 0)}
            </span>
          </div>

          {transcript && (
            <div className="rounded-md bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Live transcript</p>
              <p className="mt-1 text-sm leading-6 text-slate-800">{transcript}</p>
            </div>
          )}

          <button onClick={stopRecording} className="button-secondary" type="button">
            Stop recording
          </button>
        </div>
      )}

      {status === "review" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-stone-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-700">Review recording</p>
            <p className="mt-1 text-sm text-slate-500">Duration: {formatTime(duration)}</p>
            {audioBlobUrl && <audio controls src={audioBlobUrl} className="mt-3 w-full" />}
          </div>

          {transcript && (
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Transcript</p>
              <p className="mt-1 text-sm leading-6 text-slate-800">{transcript}</p>
            </div>
          )}

          {error && <p className="text-sm font-semibold text-rose-700">{error}</p>}

          {pendingItem && !submission && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-800">Pending submission (will be replaced on new submit)</p>
                  <p className="mt-1 text-xs text-amber-600">
                    Duration: {formatTime(pendingItem.durationSeconds)} — Saved: {new Date(pendingItem.createdAt).toLocaleString()}
                  </p>
                  {pendingItem.transcript && (
                    <p className="mt-1 text-sm text-amber-700 line-clamp-2">{pendingItem.transcript}</p>
                  )}
                </div>
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={handleRetry}
                    disabled={retrying || loading}
                    className="button-primary text-xs disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {retrying ? "Retrying..." : "Retry"}
                  </button>
                  <button
                    onClick={handleDeletePending}
                    className="border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 rounded-md"
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button onClick={handleReRecord} className="button-secondary" type="button">
              Re-record
            </button>
            <button
              onClick={() => {
                if (audioBlobUrl) {
                  fetch(audioBlobUrl)
                    .then((r) => r.blob())
                    .then((blob) => handleSubmit(blob, transcript, duration));
                }
              }}
              disabled={loading || retrying}
              className="button-primary"
            >
              {loading ? "Uploading..." : "Submit"}
            </button>
          </div>
        </div>
      )}

      {status === "submitted" && submission && (
        <div className="space-y-4">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <h3 className="text-base font-semibold text-emerald-900">Submitted</h3>
            <p className="mt-1 text-sm leading-6 text-emerald-800">
              Recording saved ({formatTime(submission.durationSeconds)}).
            </p>
          </div>

          {submittedAudioUrl && (
            <div className="rounded-lg border border-stone-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recording</p>
              <audio controls src={submittedAudioUrl} className="mt-2 w-full" />
              {submission.publicId && <p className="mt-1 truncate text-xs text-slate-500">ID: {submission.publicId}</p>}
            </div>
          )}

          {submission.transcript && (
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Transcript</p>
              <p className="mt-1 text-sm leading-6 text-slate-800">{submission.transcript}</p>
            </div>
          )}

          {aiFeedback && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">AI Feedback</p>
              <p className="mt-1 text-sm leading-6 text-indigo-900">{aiFeedback}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {!completed && (
              <button
                onClick={() => {
                  setTaskComplete(lessonId, "speaking");
                  setCompleted(true);
                }}
                className="button-primary"
              >
                Mark speaking as complete
              </button>
            )}
            {/* NEW: Redo Recording button */}
            <button
              onClick={handleRedoRecording}
              className="border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100 rounded-md"
              type="button"
            >
              Redo Recording
            </button>
          </div>
        </div>
      )}

      {/* Dialogue Modal */}
      {isDialogueModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="flex h-full max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-stone-200 bg-white shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-stone-100 px-6 py-4">
              <h3 className="text-lg font-bold text-slate-950">Dialogue - Lesson {lessonId}</h3>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowModalEnglish(!showModalEnglish)}
                  className="rounded-md border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-stone-100"
                >
                  {showModalEnglish ? "Hide English" : "Show English"}
                </button>
                <button
                  onClick={() => setIsDialogueModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 font-semibold text-lg"
                  aria-label="Close dialogue modal"
                >
                  ✕
                </button>
              </div>
            </div>
            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {dialogue.map((line, idx) => (
                <div key={idx} className="border-b border-stone-50 pb-3 last:border-0 last:pb-0">
                  <div className="flex items-start gap-2">
                    <span className="mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded bg-stone-100 font-mono text-xs font-bold text-rose-700">
                      {line.speaker}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-base font-semibold leading-6 text-slate-950">{line.french}</span>
                        <TTSButton text={line.french} />
                      </div>
                      {line.pronunciation && (
                        <p className="mt-0.5 text-xs italic text-slate-500">[{line.pronunciation}]</p>
                      )}
                      {showModalEnglish && (
                        <p className="mt-0.5 text-xs leading-5 text-slate-600">{line.english}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {/* Modal Footer */}
            <div className="border-t border-stone-100 px-6 py-3 flex justify-end">
              <button
                onClick={() => setIsDialogueModalOpen(false)}
                className="button-secondary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
