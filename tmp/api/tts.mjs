export default async function handler(req, res) {
  try {
    const text = req.query.text;
    if (!text) {
      return res.status(400).json({ error: "Text query parameter is required" });
    }

    const apiKey = process.env.VOICERSS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "VOICERSS_API_KEY is not configured" });
    }

    const url = `https://api.voicerss.org/?key=${apiKey}&hl=fr-fr&src=${encodeURIComponent(text)}&c=MP3&f=16khz_16bit_stereo`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`VoiceRSS responded with status ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // VoiceRSS API returns errors as text starting with "ERROR:" even with HTTP 200
    const textSample = buffer.toString("utf8", 0, 100);
    if (textSample.startsWith("ERROR:")) {
      throw new Error(textSample);
    }

    res.setHeader("Content-Type", "audio/mpeg");
    res.status(200).send(buffer);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch TTS from VoiceRSS" });
  }
}
