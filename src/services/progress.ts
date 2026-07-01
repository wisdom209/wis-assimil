import type { CorrectionItem } from "../types";

const STORAGE_KEY = "assimil_progress";
const TASK_COMPLETION_KEY = "assimil_task_completion";
const CORRECTIONS_KEY = "assimil_corrections";

export interface Progress {
  [lessonId: number]: boolean;
}

export function loadProgress(): Progress {
  if (typeof localStorage === "undefined") return {};
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
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

export function toggleLessonComplete(lessonId: number): Progress {
  const progress = loadProgress();
  progress[lessonId] = !progress[lessonId];
  saveProgress(progress);
  return progress;
}

// ---------------- Writing / Speaking task completion ----------------

type TaskType = "writing" | "speaking";

interface TaskCompletionMap {
  writing?: Record<number, boolean>;
  speaking?: Record<number, boolean>;
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function loadTaskCompletion(): TaskCompletionMap {
  if (typeof localStorage === "undefined") return {};
  return safeParse<TaskCompletionMap>(localStorage.getItem(TASK_COMPLETION_KEY), {});
}

export function saveTaskCompletion(data: TaskCompletionMap): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(TASK_COMPLETION_KEY, JSON.stringify(data));
}

export function isTaskComplete(lessonId: number, type: TaskType): boolean {
  const data = loadTaskCompletion();
  return !!data[type]?.[lessonId];
}

export function setTaskComplete(lessonId: number, type: TaskType): TaskCompletionMap {
  const data = loadTaskCompletion();
  data[type] = { ...(data[type] ?? {}), [lessonId]: true };
  saveTaskCompletion(data);
  return data;
}

// ---------------- Writing corrections (drilled the following lesson) ----------------

interface CorrectionsStore {
  [lessonId: number]: CorrectionItem[];
}

function loadCorrectionsStore(): CorrectionsStore {
  if (typeof localStorage === "undefined") return {};
  return safeParse<CorrectionsStore>(localStorage.getItem(CORRECTIONS_KEY), {});
}

function saveCorrectionsStore(store: CorrectionsStore): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(CORRECTIONS_KEY, JSON.stringify(store));
}

export function loadCorrections(lessonId: number): CorrectionItem[] {
  return loadCorrectionsStore()[lessonId] ?? [];
}

export function saveCorrections(lessonId: number, items: CorrectionItem[]): void {
  const store = loadCorrectionsStore();
  store[lessonId] = items;
  saveCorrectionsStore(store);
}

export function hasPendingCorrections(lessonId: number): boolean {
  if (lessonId < 1) return false;
  return loadCorrections(lessonId).some((c) => c.status !== "mastered");
}

export function updateCorrectionItem(
  lessonId: number,
  itemId: string,
  updates: Partial<CorrectionItem>
): { corrections: CorrectionsStore } {
  const store = loadCorrectionsStore();
  const items = store[lessonId] ?? [];
  store[lessonId] = items.map((it) => (it.id === itemId ? { ...it, ...updates } : it));
  saveCorrectionsStore(store);
  return { corrections: store };
}

export function clearTaskComplete(lessonId: number, type: TaskType): TaskCompletionMap {
  const data = loadTaskCompletion();
  if (data[type]) {
    delete data[type][lessonId];
    // If the object is empty, keep it (or delete it – optional)
  }
  saveTaskCompletion(data);
  return data;
}
