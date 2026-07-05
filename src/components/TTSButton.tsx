import { useState, useRef, useEffect } from "react";

interface TTSButtonProps {
  text: string;
  label?: string;
}

export function TTSButton({ text, label = "Listen" }: TTSButtonProps) {
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Stop audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const speak = () => {
    if (speaking) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      setSpeaking(false);
      return;
    }

    setSpeaking(true);

    const fallbackToWebTTS = () => {
      if (!window.speechSynthesis) {
        setSpeaking(false);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "fr-FR";
      utterance.rate = 0.9;
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utterance);
    };

    // Try VoiceRSS first
    const audio = new Audio(`/api/tts?text=${encodeURIComponent(text)}`);
    audioRef.current = audio;
    audio.onended = () => {
      setSpeaking(false);
      audioRef.current = null;
    };
    audio.onerror = () => {
      console.warn("VoiceRSS failed, falling back to Web TTS");
      audioRef.current = null;
      fallbackToWebTTS();
    };
    audio.play().catch((err) => {
      console.warn("VoiceRSS play failed, falling back to Web TTS", err);
      audioRef.current = null;
      fallbackToWebTTS();
    });
  };

  return (
    <button
      onClick={speak}
      className="shrink-0 rounded-md border border-stone-300 bg-white px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-stone-50 hover:text-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-200"
      title="Listen to French"
      type="button"
    >
      {speaking ? "Stop" : label}
    </button>
  );
}
