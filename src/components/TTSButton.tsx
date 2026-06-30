import { useState } from "react";

interface TTSButtonProps {
  text: string;
  label?: string;
}

export function TTSButton({ text, label = "Listen" }: TTSButtonProps) {
  const [speaking, setSpeaking] = useState(false);

  const speak = () => {
    if (!window.speechSynthesis) return;
    if (speaking) {
      window.speechSynthesis.cancel();
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
