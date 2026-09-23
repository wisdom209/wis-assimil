import { callGemini } from "./_gemini.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { transcript, taskType } = req.body ?? {};
    if (!transcript) return res.status(200).json({ feedback: "" });

    const prompt = `A French language student completed a speaking exercise of type "${taskType || "practice"}".
Here is an automatic (possibly imperfect) transcript of what they said:
"""
${transcript}
"""
Give brief, encouraging feedback in English (3-4 sentences max) on their French: mention 1-2 strengths and 1-2 areas to improve, focusing on grammar and vocabulary. Note that the transcript may contain speech-recognition errors, so be forgiving of odd words.`;

    const feedback = await callGemini(prompt);
    res.status(200).json({ feedback: feedback.trim() });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Server error" });
  }
}
