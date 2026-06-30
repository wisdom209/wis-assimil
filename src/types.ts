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
