# Boucle — French Bimodal Story Loop

A single-page app for the **Read → Listen → Shadow → Harvest** loop over 100
Assimil-style French lessons. Vanilla HTML/CSS/JS, no build step, no backend.

## Project structure

```
assimil-loop/
├── index.html
├── styles.css
├── app.js
├── vercel.json
└── data/
    ├── lessons.json      ← your 100-lesson dataset (already included)
    └── audioUrls.json    ← lessonId → Cloudinary MP3 URL (already included)
```

Your two JSON files are already placed at `data/lessons.json` and
`data/audioUrls.json`. If you regenerate them later, just overwrite those two
files in place — the app fetches them by that exact path (`fetch("data/lessons.json")`),
so no code changes are needed as long as the shape stays the same:

- `lessons.json`: an array of lesson objects with at least
  `id`, `title`, `type` ("normal" | "revision"), `dialogue` (array of
  `{ speaker, french, english, pronunciation }`), and optionally `new_words`
  (array of `{ french, english }`). `notes` and `exercises` are loaded but
  intentionally not rendered.
- `audioUrls.json`: an object mapping the lesson id **as a string** to an MP3
  URL, e.g. `{ "1": "https://res.cloudinary.com/.../L001-LESSON.mp3" }`.

## Run it locally

Because the app `fetch()`s the JSON files, opening `index.html` directly
(`file://…`) won't work in most browsers. Serve the folder instead:

```bash
cd assimil-loop
python3 -m http.server 8000
# then open http://localhost:8000
```

or `npx serve .`.

## Deploy to Vercel

**Option A — Vercel CLI**

```bash
cd assimil-loop
npx vercel        # first deploy, follow the prompts
npx vercel --prod # promote to production
```

**Option B — Git + Vercel dashboard**

1. Push this folder to a GitHub/GitLab/Bitbucket repo.
2. In the Vercel dashboard: **Add New… → Project**, import the repo.
3. Framework preset: **Other** (it's static — no build command, no output
   directory override needed). Leave "Build Command" and "Install Command"
   empty/default; Vercel will serve the files as-is.
4. Deploy.

`vercel.json` is included mainly to set a cache header on `/data/*`; it isn't
strictly required for a static site to work on Vercel, but it's there for a
smoother production deploy.

## How the pieces fit together

- **Lesson view** — sidebar lists all 100 lessons (searchable by number or
  title). Selecting one loads its audio into the player at the top
  (play/pause, scrubber, 0.75×/1× speed) and renders the dialogue: speaker
  number, French, English, a **🔊 Play** (browser TTS, `fr-FR`) button with an
  optional **Loop 3×** checkbox for shadowing, and an **➕ Add to SRS** button.
  A compact **New words** strip at the bottom offers the same harvesting
  button for vocabulary. Notes and Exercises are intentionally left out so the
  view stays focused on the dialogue.
- **Harvesting** — "Add to SRS" saves `{ french, english, pronunciation }` to
  a deck in `localStorage` (`boucle_srs_deck_v1`), deduped by lesson + French
  text, so re-clicking never creates duplicates.
- **Review view** — pulls every card whose due date has passed, shows the
  English prompt first, reveals the French + pronunciation + a TTS button on
  "Show answer," and grades with **Again / Hard / Good / Easy**. Grading runs
  a small SM-2-flavoured scheduler (ease factor + growing interval; "Again"
  resurfaces the card in 10 minutes, the others push it 1 day → 3 days → an
  ease-scaled interval onward). The tab badge shows how many cards are due.

Everything persists across refreshes via `localStorage`; there's no server
component beyond the two static JSON files and the MP3s already hosted on
Cloudinary.
