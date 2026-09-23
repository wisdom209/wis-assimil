import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const audioDir = path.join(rootDir, "public", "Assimil_French", "Assimil_audio");
const manifestPath = path.join(rootDir, "src", "data", "audioUrls.json");

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;
const folder = process.env.CLOUDINARY_AUDIO_FOLDER || "assimil-french/audio";
const dryRun = process.argv.includes("--dry-run");

if (!dryRun && (!cloudName || !apiKey || !apiSecret)) {
  throw new Error(
    "Missing Cloudinary credentials. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.",
  );
}

const lessonIdFromFilename = (filename) => {
  const match = filename.match(/^L(\d{3})-LESSON\.mp3$/i);
  return match ? String(Number(match[1])) : null;
};

const signUploadParams = (params) => {
  if (!apiSecret) {
    throw new Error("Missing CLOUDINARY_API_SECRET.");
  }

  const payload = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return createHash("sha1")
    .update(`${payload}${apiSecret}`)
    .digest("hex");
};

const uploadFile = async (filename) => {
  const lessonId = lessonIdFromFilename(filename);
  if (!lessonId) {
    return null;
  }

  const publicId = path.basename(filename, ".mp3");

  if (dryRun) {
    return {
      lessonId,
      url: `dry-run:${folder}/${publicId}`,
    };
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    folder,
    overwrite: "true",
    public_id: publicId,
    timestamp,
  };
  const signature = signUploadParams(params);

  const bytes = await readFile(path.join(audioDir, filename));
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "audio/mpeg" }), filename);
  form.append("api_key", apiKey);
  form.append("signature", signature);
  Object.entries(params).forEach(([key, value]) => form.append(key, String(value)));

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`,
    {
      method: "POST",
      body: form,
    },
  );

  const result = await response.json();
  if (!response.ok) {
    throw new Error(
      `Cloudinary upload failed for ${filename}: ${result.error?.message || response.statusText}`,
    );
  }

  return {
    lessonId,
    url: result.secure_url,
  };
};

const existingManifest = async () => {
  try {
    return JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    return {};
  }
};

const files = (await readdir(audioDir))
  .filter((filename) => lessonIdFromFilename(filename))
  .sort();

if (files.length === 0) {
  throw new Error(`No Assimil lesson MP3s found in ${audioDir}`);
}

const manifest = await existingManifest();

for (const filename of files) {
  const uploaded = await uploadFile(filename);
  if (!uploaded) {
    continue;
  }

  manifest[uploaded.lessonId] = uploaded.url;
  console.log(`Lesson ${uploaded.lessonId.padStart(3, "0")}: ${uploaded.url}`);
}

if (dryRun) {
  console.log(`Dry run complete. Matched ${files.length} audio files.`);
  process.exit(0);
}

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Wrote ${Object.keys(manifest).length} audio URLs to ${manifestPath}`);
