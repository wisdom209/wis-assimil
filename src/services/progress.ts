const STORAGE_KEY = "assimil_progress";

export interface Progress {
  [lessonId: number]: boolean;
}

export function loadProgress(): Progress {
  if (typeof localStorage === "undefined") {
    return {};
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      return typeof parsed === "object" && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

export function saveProgress(progress: Progress): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

export function toggleLessonComplete(lessonId: number): Progress {
  const progress = loadProgress();
  progress[lessonId] = !progress[lessonId];
  saveProgress(progress);
  return progress;
}
