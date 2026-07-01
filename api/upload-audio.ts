// @ts-expect-error Vercel serverless type definitions not installed
export const config = {
  runtime: "nodejs20.x",
};

export default async function handler( // eslint-disable-line @typescript-eslint/no-explicit-any
  req: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  res: any // eslint-disable-line @typescript-eslint/no-explicit-any
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const form = await req.formData();
    const audio = form.get("audio");
    const lessonId = form.get("lessonId")?.toString();

    if (!audio) {
      return res.status(400).json({ error: "Missing audio file" });
    }

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      return res.status(500).json({ error: "Cloudinary not configured" });
    }

    const cloudinaryForm = new FormData();
    cloudinaryForm.append("file", audio);
    cloudinaryForm.append("upload_preset", "assimil_audio_upload");
    cloudinaryForm.append("resource_type", "auto");
    cloudinaryForm.append("public_id", `assimil-speaking-${lessonId}-${Date.now()}`);

    const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`;

    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Authorization": "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64"),
      },
      body: cloudinaryForm,
    });

    if (!uploadRes.ok) {
      const txt = await uploadRes.text();
      return res.status(500).json({ error: `Cloudinary upload failed: ${txt}` });
    }

    const data = (await uploadRes.json()) as { secure_url: string; public_id?: string };
    return res.status(200).json({ url: data.secure_url, publicId: data.public_id });
  } catch (err) {
    console.error("upload-audio error", err);
    return res.status(500).json({ error: (err as Error)?.message || "Upload failed" });
  }
}
