export type LessonType = "normal" | "revision";

export interface DialogueLine {
  speaker: string;
  french: string;
  english: string;
  pronunciation?: string;
}

export interface Note {
  type: "pronunciation" | "grammar" | "vocabulary" | "culture";
  content: string;
}

export interface NewWord {
  french: string;
  english: string;
}

export interface TranslateExercise {
  question: string;
  answers: string[];
}

export interface FillBlank {
  position: number;
  correct: string;
}

export interface FillExercise {
  question: string;
  blanks: FillBlank[];
  full_answer: string;
}

export interface Exercises {
  translate: TranslateExercise[];
  fill: FillExercise[];
}

export type ExtraType = "culture" | "smile" | "numbers" | "proverb" | "pronunciation_tip" | "review_dialogue";

export interface Extra {
  type: ExtraType;
  title: string;
  content: string;
}

export interface Lesson {
  id: number;
  title: string;
  type: LessonType;
  audio_file: string;
  audio_url?: string;
  dialogue: DialogueLine[];
  notes: Note[];
  new_words: NewWord[];
  exercises: Exercises;
  extras: Extra[];
}

export interface WritingTaskData {
  lesson_id: number;
  title: string;
  phase: string;
  writing_task_type: string;
  grammar_focus: string;
  word_count_target: string;
  task_description: string;
  time_allocation_minutes: number | null;
}

export interface SpeakingTaskDetail {
  type: string;
  description: string;
  duration_minutes: number;
  recording_required: boolean;
  instructions: string;
  focus_points: string[];
  questions?: string[];
  prompt?: string;
  topic?: string;
}

export interface SpeakingTaskData {
  lesson_id: number;
  title: string;
  speaking_task: SpeakingTaskDetail;
}

export interface WritingError {
  original: string;
  corrected: string;
  explanation: string;
  category: string;
}

export interface WritingSubmission {
  text: string;
  wordCount: number;
  timestamp: number;
  corrections: WritingError[];
}

export interface CorrectionItem {
  id: string;
  original: string;
  corrected: string;
  explanation: string;
  status: "pending" | "drilling" | "mastered";
  drillSentence?: string;
  drillCorrect?: string;
}

export interface SpeakingSubmission {
  audioUrl: string;
  publicId?: string;
  timestamp: number;
  durationSeconds: number;
  transcript?: string;
  aiFeedback?: string;
}
