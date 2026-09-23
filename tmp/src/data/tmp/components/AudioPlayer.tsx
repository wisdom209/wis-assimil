import { useRef, useState } from "react";
import { AUDIO_BASE_URL } from "../config";

interface AudioPlayerProps {
  audioFile: string;
  audioUrl?: string;
  textForTTS: string;
}

export function AudioPlayer({ audioFile, audioUrl, textForTTS }: AudioPlayerProps) {
  const [useTTS, setUseTTS] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const voiceRssAudioRef = useRef<HTMLAudioElement | null>(null);
  const streamingUrl = audioUrl || (AUDIO_BASE_URL ? new URL(audioFile, AUDIO_BASE_URL).toString() : "");

  const playTTS = () => {
    if (voiceRssAudioRef.current) {
      voiceRssAudioRef.current.pause();
      voiceRssAudioRef.current = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    const fallbackToWebTTS = () => {
      if (!window.speechSynthesis) {
        setIsPlaying(false);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(textForTTS);
      utterance.lang = "fr-FR";
      utterance.rate = 0.9;
      utterance.onstart = () => setIsPlaying(true);
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = () => setIsPlaying(false);
      window.speechSynthesis.speak(utterance);
      utteranceRef.current = utterance;
    };

    // Try VoiceRSS first
    const audio = new Audio(`/api/tts?text=${encodeURIComponent(textForTTS)}`);
    voiceRssAudioRef.current = audio;
    audio.onended = () => {
      setIsPlaying(false);
      voiceRssAudioRef.current = null;
    };
    audio.onerror = () => {
      console.warn("VoiceRSS failed, falling back to Web TTS");
      voiceRssAudioRef.current = null;
      fallbackToWebTTS();
    };
    audio.play().catch((err) => {
      console.warn("VoiceRSS play failed, falling back to Web TTS", err);
      voiceRssAudioRef.current = null;
      fallbackToWebTTS();
    });
  };

  const playAudio = () => {
    if (useTTS || !streamingUrl) {
      playTTS();
      return;
    }

    const audio = audioRef.current;
    if (audio) {
      audio.src = streamingUrl;
      audio.onplay = () => setIsPlaying(true);
      audio.onerror = () => {
        setUseTTS(true);
        setIsPlaying(false);
        playTTS();
      };
      void audio.play().catch(() => {
        setUseTTS(true);
        setIsPlaying(false);
        playTTS();
      });
    }
  };

  const stopAudio = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    if (voiceRssAudioRef.current) {
      voiceRssAudioRef.current.pause();
      voiceRssAudioRef.current = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
  };

  const handleModeToggle = () => {
    stopAudio();
    setUseTTS((current) => !current);
  };

  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          onClick={isPlaying ? stopAudio : playAudio}
          className="button-primary"
        >
          {isPlaying ? "Stop" : "Play dialogue"}
        </button>
        {streamingUrl && (
          <button
            onClick={handleModeToggle}
            className="button-secondary"
          >
            {useTTS ? "Use MP3" : "Use text to speech"}
          </button>
        )}
        <span className="text-sm text-slate-500">
          {useTTS || !streamingUrl ? "Text to speech mode" : "Streaming MP3 mode"}
        </span>
      </div>
      <audio ref={audioRef} onEnded={() => setIsPlaying(false)} preload="none" />
    </div>
  );
}
