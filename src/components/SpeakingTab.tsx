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

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<number | null>(null);

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
        stream.getTracks().forEach((t) => t.stop());
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
      const sigRes = await fetch("/api/cloudinary-signature", { method: "POST" });
      if (!sigRes.ok) throw new Error("Could not prepare upload. Check Cloudinary configuration.");
      const { signature, timestamp, apiKey, cloudName, folder } = (await sigRes.json()) as {
        signature: string;
        timestamp: number;
        apiKey: string;
        cloudName: string;
        folder: string;
      };

      const form = new FormData();
      form.append("file", blob, `speaking-${lessonId}.webm`);
      form.append("api_key", apiKey);
      form.append("timestamp", String(timestamp));
      form.append("signature", signature);
      form.append("folder", folder);

      const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/video/upload`, {
        method: "POST",
        body: form,
      });
      if (!uploadRes.ok) {
        const txt = await uploadRes.text();
        throw new Error(txt || "Upload failed");
      }
      const data = (await uploadRes.json()) as { secure_url: string; public_id: string };

      const sub: SpeakingSubmission = {
        audioUrl: data.secure_url,
        publicId: data.public_id,
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
    } catch (err) {
      // Save locally – replace any existing pending
      try {
        const pending: PendingSpeakingSubmission = {
          id: `speaking-${lessonId}-${Date.now()}`,
          lessonId,
          type: "speaking",
          audioBlob: blob,
          transcript: transcriptText,
          durationSeconds: durationSec,
          status: "pending",
          createdAt: Date.now(),
        };
        await upsertPendingSubmission(pending);
        setPendingItem(pending);
        setError("Upload failed. Recording saved locally. You can retry or submit again.");
        // Keep the blob URL for preview
        const url = URL.createObjectURL(blob);
        setAudioBlobUrl(url);
        setStatus("review");
      } catch (queueErr) {
        setError("Upload failed and could not be saved locally. Please try again.");
      }
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

          {submission.audioUrl && (
            <div className="rounded-lg border border-stone-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recording</p>
              <audio controls src={submission.audioUrl} className="mt-2 w-full" />
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
    </div>
  );
}
