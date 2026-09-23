import { callGemini, extractJson } from "./_gemini.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { original, userCorrection, correctAnswer } = req.body ?? {};
    if (!userCorrection || !correctAnswer) return res.status(400).json({ error: "Missing fields" });

    const prompt = `A French language student was asked to correct this erroneous sentence: "${original || "(not provided)"}"
The expected correct sentence is: "${correctAnswer}"
The student answered: "${userCorrection}"

Judge whether the student's answer is an acceptable correction (minor differences in accents, capitalisation, or punctuation are fine; the grammar point being tested must be fixed correctly).
Respond ONLY with valid JSON, no markdown fences:
{"correct": true or false, "feedback": "one short encouraging sentence in English explaining why, especially if incorrect"}`;

    const raw = await callGemini(prompt, { json: true });
    const parsed = extractJson(raw);
    res.status(200).json({ correct: !!parsed?.correct, feedback: parsed?.feedback || undefined });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Server error" });
  }
}
