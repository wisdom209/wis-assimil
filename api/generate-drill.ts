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
        temperature: 0.7,
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
  const { errorCategory, example, correctVersion, explanation } = (req.body || {}) as {
    errorCategory?: string;
    example?: string;
    correctVersion?: string;
    explanation?: string;
  };

  if (!example || !correctVersion || !explanation) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const prompt = `You are a French tutor designing a drill sentence. The learner made this error:
Error category: ${errorCategory}
Example with error: "${example}"
Correct form: "${correctVersion}"
Explanation: ${explanation}

Generate a NEW French sentence that contains the SAME type of error (not the same sentence). Provide:
1) A wrong version (intentionally containing a similar mistake)
2) The correct version

Return ONLY valid JSON: { "sentence": string, "correct": string }`;

  try {
    const raw = await callGemini(prompt);
    const cleaned = raw.replace(/^```json?\n?/i, "").replace(/\n?```$/i, "").trim();
    const parsed = JSON.parse(cleaned);
    return res.status(200).json(parsed);
  } catch (err) {
    console.error("generate-drill error", err);
    return res.status(500).json({ error: "Failed to generate drill" });
  }
}
