import { callGemini, extractJson } from "./_gemini.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { text } = req.body ?? {};
    if (!text || typeof text !== "string") return res.status(400).json({ error: "Missing text" });

    const prompt = `You are a strict but encouraging French teacher correcting a student's writing.
Analyze the following French text and identify grammar, spelling, conjugation, and word-choice errors.
Respond ONLY with valid JSON (no markdown fences, no preamble) in this exact shape:
{"errors": [{"original": "exact phrase from the student's text", "corrected": "the corrected version of that phrase", "explanation": "brief explanation in English of the error", "category": "one short category like Verb Tense, Agreement, Spelling, Vocabulary, Preposition"}]}
If there are no errors, return {"errors": []}.
Each "original" value must be an exact, verbatim substring of the student's text so it can be located.

Student's text:
"""
${text}
"""`;

    const raw = await callGemini(prompt, { json: true });
    const parsed = extractJson(raw);
    res.status(200).json({ errors: Array.isArray(parsed?.errors) ? parsed.errors : [] });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Server error" });
  }
}
