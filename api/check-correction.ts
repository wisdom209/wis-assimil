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
        temperature: 0.1,
        maxOutputTokens: 512,
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

export default async function handler( // eslint-disable-line @typescript-eslint/no-explicit-any
  req: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  res: any // eslint-disable-line @typescript-eslint/no-explicit-any
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { original, userCorrection, correctAnswer } = (req.body || {}) as {
    original?: string;
    userCorrection?: string;
    correctAnswer?: string;
  };

  if (!original || !userCorrection || !correctAnswer) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const prompt = `You are a strict French tutor. Compare the user's correction to the expected correct answer.
Original erroneous phrase: "${original}"
Expected correction: "${correctAnswer}"
User wrote: "${userCorrection}"

Return ONLY valid JSON: { "correct": boolean, "feedback": string }.
If the meaning is the same despite minor orthographic variation (e.g., capitalization, extra punctuation), mark correct=true.`;

  try {
    const raw = await callGemini(prompt);
    const cleaned = raw.replace(/^```json?\n?/i, "").replace(/\n?```$/i, "").trim();
    const parsed = JSON.parse(cleaned);
    return res.status(200).json(parsed);
  } catch (err) {
    console.error("check-correction error", err);
    return res.status(500).json({ error: "Failed to check correction" });
  }
}
