import { callGemini, extractJson } from "./_gemini.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { dialogue } = req.body ?? {};
    if (!dialogue || !Array.isArray(dialogue)) {
      return res.status(400).json({ error: "Dialogue array is required" });
    }

    const linesToCorrect = dialogue.map(line => line.french);

    const prompt = `You are an expert French proofreader and editor. Below is a transcription of a French dialogue for a language learning lesson.
The transcript may contain spelling errors, typos, weird characters, or numbers (like stray line numbers or timing markers) accidentally mixed into or between words.
Your task is to fix these transcription, spelling, and formatting errors.

CRITICAL RULES:
1. Do NOT change the conversation, words, vocabulary, grammar (even if colloquial, like "t'as" instead of "tu as"), tone, or speaker assignments.
2. Only correct actual spelling errors, typos, and remove stray numbers/characters that do not belong.
3. Preserve the exact number of lines and the order of the lines.
4. Output the result as a JSON array of strings, where each element corresponds to the corrected French text for that line.

Here is the dialogue:
${JSON.stringify(linesToCorrect, null, 2)}

Respond ONLY with a JSON array of strings, like:
[
  "Line 1 corrected",
  "Line 2 corrected",
  ...
]`;

    const rawResponse = await callGemini(prompt, { json: true });
    const corrected = extractJson(rawResponse);

    if (!corrected || !Array.isArray(corrected)) {
      throw new Error("Failed to parse Gemini response as a JSON array");
    }

    res.status(200).json({ corrected });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Server error" });
  }
}
