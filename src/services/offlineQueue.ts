// src/services/offlineQueue.ts
import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';

export interface PendingWritingSubmission {
  id: string;
  lessonId: number;
  type: 'writing';
  text: string;
  status: 'pending' | 'retrying' | 'failed';
  createdAt: number;
}

export interface PendingSpeakingSubmission {
  id: string;
  lessonId: number;
  type: 'speaking';
  audioBlob: Blob;
  transcript: string;
  durationSeconds: number;
  status: 'pending' | 'retrying' | 'failed';
  createdAt: number;
}

export type PendingSubmission = PendingWritingSubmission | PendingSpeakingSubmission;

const DB_NAME = 'SubmissionQueue';
const STORE_NAME = 'pending';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('lessonId', 'lessonId');
          store.createIndex('type', 'type');
        }
      },
    });
  }
  return dbPromise;
}

// Replace any existing pending submission for the same lessonId and type
export async function upsertPendingSubmission(submission: PendingSubmission): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.store;
  // Find existing items with same lessonId and type
  const index = store.index('lessonId');
  const existing = await index.getAll(submission.lessonId);
  const sameType = existing.filter((item) => item.type === submission.type);
  // Delete them
  for (const item of sameType) {
    await store.delete(item.id);
  }
  // Add the new one
  await store.put(submission);
  await tx.done;
}

export async function getPendingSubmissions(): Promise<PendingSubmission[]> {
  const db = await getDB();
  return db.getAll(STORE_NAME);
}

export async function getPendingByLesson(lessonId: number): Promise<PendingSubmission[]> {
  const db = await getDB();
  const index = db.transaction(STORE_NAME).store.index('lessonId');
  return index.getAll(lessonId);
}

export async function removePendingSubmission(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NAME, id);
}

export async function updatePendingStatus(id: string, status: 'pending' | 'retrying' | 'failed'): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.store;
  const item = await store.get(id);
  if (item) {
    item.status = status;
    await store.put(item);
  }
  await tx.done;
}
