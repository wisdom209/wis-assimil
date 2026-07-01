import { callGemini, extractJson } from "./_gemini.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { errorCategory, example, correctVersion, explanation } = req.body ?? {};

    const prompt = `You are creating a targeted French grammar drill.
The student made this type of error: ${errorCategory || "grammar"}.
Example of the mistake: "${example || ""}" which should be "${correctVersion || ""}".
Explanation: ${explanation || ""}

Write ONE new, different French sentence that contains the SAME type of error (deliberately), similar in structure and difficulty, along with its corrected version.
Respond ONLY with valid JSON, no markdown fences:
{"sentence": "the new sentence containing the error", "correct": "the corrected version of that new sentence"}`;

    const raw = await callGemini(prompt, { json: true });
    const parsed = extractJson(raw);
    res.status(200).json({ sentence: parsed?.sentence || "", correct: parsed?.correct || "" });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Server error" });
  }
}
