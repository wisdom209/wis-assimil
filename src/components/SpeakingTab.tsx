import { useState, useEffect, useRef, useMemo } from "react";
import type { SpeakingSubmission } from "../types";
import { getSpeakingTaskForLesson } from "../data/speaking";
import { setTaskComplete, isTaskComplete } from "../services/progress";

const DRAFT_PREFIX = "speaking:draft:";

interface SpeakingTabProps {
  lessonId: number;
}

type RecordingStatus = "idle" | "recording" | "review" | "submitted";

export function SpeakingTab({ lessonId }: SpeakingTabProps) {
  const task = getSpeakingTaskForLesson(lessonId);
  const [status, setStatus] = useState<RecordingStatus>("idle");
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  const [submission, setSubmission] = useState<SpeakingSubmission | null>(null);
  const [duration, setDuration] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [timerActive, setTimerActive] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(() => isTaskComplete(lessonId, "speaking"));

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<number | null>(null);

  const maxDuration = useMemo(() => task?.speaking_task.duration_minutes ?? 5, [task]);

  useEffect(() => {
    return () => {
      if (audioBlobUrl) URL.revokeObjectURL(audioBlobUrl);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [audioBlobUrl]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType =
        MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
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

      // Optional live transcription
      if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
        try {
          const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
          const recognition = new SpeechRecognition();
          recognition.lang = "fr-FR";
          recognition.interimResults = true;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          recognition.onresult = (event: any) => {
            let text = "";
            for (let i = 0; i < event.resultIndex; i++) {
              text += event.results[i][0].transcript;
            }
            setTranscript(text + (event.results[event.resultIndex]?.[0]?.transcript || ""));
          };
          recognition.onerror = () => {};
          recognition.start();
          recognitionRef.current = recognition;
        } catch {
          // ignore
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

  const handleSubmit = async () => {
    if (!audioBlobUrl || !task) return;
    setLoading(true);
    setError(null);
    try {
      const blob = await fetch(audioBlobUrl).then((r) => r.blob());
      const form = new FormData();
      form.append("audio", blob, `speaking-${lessonId}.webm`);
      form.append("lessonId", String(lessonId));

      const res = await fetch("/api/upload-audio", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Upload failed");
      }
      const data = (await res.json()) as { url: string; publicId?: string };
      const sub: SpeakingSubmission = {
        audioUrl: data.url,
        publicId: data.publicId,
        timestamp: Date.now(),
        durationSeconds: duration,
        transcript,
      };
      setSubmission(sub);
      setStatus("submitted");

      // Optional AI analysis
      if (transcript) {
        try {
          const analysis = await fetch("/api/analyze-speaking", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transcript, lessonId, taskType: task.speaking_task.type }),
          });
          if (analysis.ok) {
            const aData = (await analysis.json()) as { feedback?: string };
            if (aData.feedback) {
              sub.aiFeedback = aData.feedback;
              setAiFeedback(aData.feedback);
            }
          }
        } catch {
          // non-blocking
        }
      }

      const p = setTaskComplete(lessonId, "speaking");
      saveProgress(p);
      setCompleted(true);

      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(`${DRAFT_PREFIX}${lessonId}`);
      }
    } catch {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
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
          <span className="rounded-md bg-stone-200 px-2 py-1 text-xs font-semibold text-slate-700">{t.duration_minutes} min</span>
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
            <span className={`font-mono text-lg font-bold ${timeLeft !== null && timeLeft < 60 ? "text-rose-700" : "text-slate-900"}`}>
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
            {audioBlobUrl && (
              <audio controls src={audioBlobUrl} className="mt-3 w-full" />
            )}
          </div>

          {transcript && (
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Transcript</p>
              <p className="mt-1 text-sm leading-6 text-slate-800">{transcript}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button onClick={handleReRecord} className="button-secondary" type="button">
              Re-record
            </button>
            <button onClick={handleSubmit} disabled={loading} className="button-primary">
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
              {submission.publicId && (
                <p className="mt-1 truncate text-xs text-slate-500">ID: {submission.publicId}</p>
              )}
            </div>
          )}

          {submission.transcript && (
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Transcript</p>
              <p className="mt-1 text-sm leading-6 text-slate-800">{submission.transcript}</p>
            </div>
          )}

          {submission.aiFeedback && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">AI Feedback</p>
              <p className="mt-1 text-sm leading-6 text-indigo-900">{submission.aiFeedback}</p>
            </div>
          )}

          {!completed && (
            <button
              onClick={() => {
                const p = setTaskComplete(lessonId, "speaking");
                saveProgress(p);
                setCompleted(true);
              }}
              className="button-primary"
            >
              Mark speaking as complete
            </button>
          )}
        </div>
      )}

      {error && <p className="text-sm font-semibold text-rose-700">{error}</p>}
    </div>
  );
}
