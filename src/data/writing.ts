import writingData from "./writing.json";
import type { WritingTaskData } from "../types";

export const writingTasks = writingData as WritingTaskData[];

export function getWritingTaskForLesson(lessonId: number): WritingTaskData | undefined {
  return writingTasks.find((w) => w.lesson_id === lessonId);
}
