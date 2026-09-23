import speakingData from "./speaking.json";
import type { SpeakingTaskData } from "../types";

export const speakingTasks = speakingData as SpeakingTaskData[];

export function getSpeakingTaskForLesson(lessonId: number): SpeakingTaskData | undefined {
  return speakingTasks.find((s) => s.lesson_id === lessonId);
}
