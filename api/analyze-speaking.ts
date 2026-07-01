// @ts-expect-error Vercel serverless type definitions not installed
export const config = {
  runtime: "nodejs20.x",
};

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

async function callGemini(prompt: string): Promise<string> {
  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1024,
      },
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Gemini error ${res.status}: ${txt}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty response from Gemini");
  return text;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { transcript, _lessonId, taskType } = (req.body || {}) as {
    transcript?: string;
    lessonId?: number;
    taskType?: string;
  };

  if (!transcript) {
    return res.status(200).json({ feedback: null });
  }

  const prompt = `You are a French pronunciation and fluency coach. A learner just completed a speaking task (type: ${taskType}).
Transcript: "${transcript}"

Give concise, actionable feedback in English (max 4 bullet points) covering:
1) Pronunciation clarity (liaisons, nasal sounds, final consonants)
2) Grammar / word choice errors
3) Fluidity (hesitations, rhythm)
4) Overall score 1-5 with one-sentence summary`;

  try {
    const raw = await callGemini(prompt);
    return res.status(200).json({ feedback: raw.trim() });
  } catch (err) {
    console.error("analyze-speaking error", err);
    return res.status(200).json({ feedback: null });
  }
}
