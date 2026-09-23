import { openDB } from "idb";

const AUDIO_DB_NAME = "AudioStorage";
const AUDIO_STORE_NAME = "audio_blobs";

export async function getAudioDB() {
  return openDB(AUDIO_DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(AUDIO_STORE_NAME)) {
        db.createObjectStore(AUDIO_STORE_NAME);
      }
    },
  });
}

export async function storeAudioBlob(key: string, blob: Blob): Promise<void> {
  const db = await getAudioDB();
  await db.put(AUDIO_STORE_NAME, blob, key);
}

export async function getAudioBlob(key: string): Promise<Blob | undefined> {
  const db = await getAudioDB();
  return db.get(AUDIO_STORE_NAME, key);
}

export async function deleteAudioBlob(key: string): Promise<void> {
  const db = await getAudioDB();
  await db.delete(AUDIO_STORE_NAME, key);
}
