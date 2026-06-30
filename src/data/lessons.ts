import lessonsData from "./lessons.json";
import audioUrls from "./audioUrls.json";
import type { Lesson } from "../types";

const audioUrlsByLessonId = audioUrls as Record<string, string>;

export const lessons = (lessonsData as Lesson[]).map((lesson) => ({
  ...lesson,
  audio_url: audioUrlsByLessonId[String(lesson.id)] || lesson.audio_url,
}));
