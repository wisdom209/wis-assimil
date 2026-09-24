/* ==========================================================================
   Boucle — Bimodal Story Loop
   Vanilla JS. No build step. Everything lives in this one file:
     - data loading (lessons.json + audioUrls.json)
     - lesson index / lesson view / audio player
     - browser Speech Synthesis (shadowing)
     - a localStorage-backed SRS deck with an SM-2-flavoured scheduler
   ========================================================================== */

(() => {
  "use strict";

  /* ------------------------------------------------------------------ *
   *  Constants & state
   * ------------------------------------------------------------------ */

  const SRS_KEY = "boucle_srs_deck_v1";
  const EDITS_KEY = "boucle_text_edits_v1"; // per-lesson typo fixes, kept separate from the SRS deck
  const AGAIN_DELAY_MS = 10 * 60 * 1000;       // "Again" resurfaces in 10 minutes
  const DAY_MS = 24 * 60 * 60 * 1000;

  const state = {
    lessons: [],          // array from lessons.json
    audioUrls: {},         // { "1": "https://..." }
    currentLessonId: null,
    view: "lesson",        // "lesson" | "review"
    speed: 1,
    frenchVoice: null,
    reviewQueue: [],        // snapshot of due cards for this session
    reviewIndex: 0,
    reviewAnswerShown: false,
    editMode: false,        // obscure "fix a typo" mode, off by default
  };

  /* ------------------------------------------------------------------ *
   *  DOM refs
   * ------------------------------------------------------------------ */

  const el = (id) => document.getElementById(id);

  const dom = {
    menuToggle: el("menuToggle"),
    sidebar: el("sidebar"),
    scrim: el("scrim"),
    lessonSearch: el("lessonSearch"),
    lessonIndex: el("lessonIndex"),
    viewTabs: document.querySelectorAll(".view-tab"),
    duePill: el("duePill"),

    lessonView: el("lessonView"),
    lessonEmpty: el("lessonEmpty"),
    lessonArticle: el("lessonArticle"),
    lessonEyebrow: el("lessonEyebrow"),
    lessonTitle: el("lessonTitle"),
    editToggle: el("editToggle"),
    editBar: el("editBar"),
    editReset: el("editReset"),
    dialogue: el("dialogue"),
    newWordsSection: el("newWordsSection"),
    newWordsList: el("newWordsList"),

    audioEl: el("audioEl"),
    playPause: el("playPause"),
    scrubber: el("scrubber"),
    timeCurrent: el("timeCurrent"),
    timeTotal: el("timeTotal"),
    speedBtns: document.querySelectorAll(".speed-btn"),
    playerStatus: el("playerStatus"),

    reviewView: el("reviewView"),
    reviewEmpty: el("reviewEmpty"),
    reviewEmptyCount: el("reviewEmptyCount"),
    reviewNoDeck: el("reviewNoDeck"),
    reviewSession: el("reviewSession"),
    reviewCount: el("reviewCount"),
    reviewBarFill: el("reviewBarFill"),
    srsSource: el("srsSource"),
    srsPrompt: el("srsPrompt"),
    srsAnswer: el("srsAnswer"),
    srsFrench: el("srsFrench"),
    srsPron: el("srsPron"),
    srsPlayTts: el("srsPlayTts"),
    showAnswerBtn: el("showAnswerBtn"),
    gradeRow: el("gradeRow"),

    toast: el("toast"),

    schedulerView: el("schedulerView"),
    schedulerDuePill: el("schedulerDuePill"),
    schToday: el("schToday"),
    schCurrent: el("schCurrent"),
    schPerDay: el("schPerDay"),
    schTotal: el("schTotal"),
    schIntervals: el("schIntervals"),
    schGenerate: el("schGenerate"),
    schReset: el("schReset"),
    schedulerToday: el("schedulerToday"),
    schedulerTodayBody: el("schedulerTodayBody"),
    schedulerControls: el("schedulerControls"),
    schFutureOnly: el("schFutureOnly"),
    schPrint: el("schPrint"),
    schedulerCalendar: el("schedulerCalendar"),
    schedulerEmpty: el("schedulerEmpty"),
  };

  /* ------------------------------------------------------------------ *
   *  Utilities
   * ------------------------------------------------------------------ */

  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  let toastTimer = null;
  function showToast(message) {
    dom.toast.textContent = message;
    dom.toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => dom.toast.classList.remove("is-visible"), 1800);
  }

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  /* ------------------------------------------------------------------ *
   *  Data loading
   * ------------------------------------------------------------------ */

  async function loadData() {
    const [lessonsRes, audioRes] = await Promise.all([
      fetch("data/lessons.json"),
      fetch("data/audioUrls.json"),
    ]);
    if (!lessonsRes.ok) throw new Error(`Could not load data/lessons.json (${lessonsRes.status})`);
    if (!audioRes.ok) throw new Error(`Could not load data/audioUrls.json (${audioRes.status})`);

    state.lessons = await lessonsRes.json();
    state.audioUrls = await audioRes.json();
    state.lessons.sort((a, b) => a.id - b.id);
  }

  /* ------------------------------------------------------------------ *
   *  SRS deck — storage
   * ------------------------------------------------------------------ */

  function loadDeck() {
    try {
      const raw = localStorage.getItem(SRS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      console.error("Boucle: could not read SRS deck from localStorage", err);
      return [];
    }
  }

  function saveDeck(deck) {
    try {
      localStorage.setItem(SRS_KEY, JSON.stringify(deck));
    } catch (err) {
      console.error("Boucle: could not save SRS deck to localStorage", err);
      showToast("Couldn't save — storage may be full.");
    }
  }

  function makeCardId(lessonId, french) {
    return `${lessonId}::${french.trim().toLowerCase()}`;
  }

  function addToDeck({ lessonId, lessonTitle, french, english, pronunciation }) {
    if (!french || !french.trim()) return { ok: false, reason: "empty" };
    const deck = loadDeck();
    const id = makeCardId(lessonId, french);
    if (deck.some((c) => c.id === id)) {
      return { ok: false, reason: "duplicate" };
    }
    const now = Date.now();
    deck.push({
      id,
      lessonId,
      lessonTitle,
      french: french.trim(),
      english: (english || "").trim(),
      pronunciation: (pronunciation || "").trim(),
      ease: 2.5,
      interval: 0,
      reps: 0,
      dueAt: now,
      createdAt: now,
      lastReviewed: null,
    });
    saveDeck(deck);
    return { ok: true };
  }

  function dueCount(deck = loadDeck()) {
    const now = Date.now();
    return deck.filter((c) => c.dueAt <= now).length;
  }

  function refreshDuePill() {
    const n = dueCount();
    dom.duePill.hidden = n === 0;
    dom.duePill.textContent = n > 99 ? "99+" : String(n);
  }

  /* ------------------------------------------------------------------ *
   *  Typo fixes — a quiet, separate override layer
   *  (never touches lessons.json; lives entirely in localStorage, keyed
   *  by lesson id, so it can be wiped per-lesson without affecting the
   *  SRS deck or any other lesson)
   * ------------------------------------------------------------------ */

  function loadAllEdits() {
    try {
      const raw = localStorage.getItem(EDITS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (err) {
      console.error("Boucle: could not read text edits from localStorage", err);
      return {};
    }
  }

  function saveAllEdits(all) {
    try {
      localStorage.setItem(EDITS_KEY, JSON.stringify(all));
    } catch (err) {
      console.error("Boucle: could not save text edits to localStorage", err);
      showToast("Couldn't save that edit — storage may be full.");
    }
  }

  function getLessonEdits(lessonId) {
    const all = loadAllEdits();
    return all[lessonId] || { dialogue: {}, new_words: {} };
  }

  function setDialogueEdit(lessonId, idx, field, value) {
    const all = loadAllEdits();
    if (!all[lessonId]) all[lessonId] = { dialogue: {}, new_words: {} };
    if (!all[lessonId].dialogue) all[lessonId].dialogue = {};
    if (!all[lessonId].dialogue[idx]) all[lessonId].dialogue[idx] = {};
    all[lessonId].dialogue[idx][field] = value;
    saveAllEdits(all);
  }

  function setWordEdit(lessonId, idx, field, value) {
    const all = loadAllEdits();
    if (!all[lessonId]) all[lessonId] = { dialogue: {}, new_words: {} };
    if (!all[lessonId].new_words) all[lessonId].new_words = {};
    if (!all[lessonId].new_words[idx]) all[lessonId].new_words[idx] = {};
    all[lessonId].new_words[idx][field] = value;
    saveAllEdits(all);
  }

  function resetLessonEdits(lessonId) {
    const all = loadAllEdits();
    delete all[lessonId];
    saveAllEdits(all);
  }

  function lessonHasEdits(lessonId) {
    const e = getLessonEdits(lessonId);
    return Object.keys(e.dialogue || {}).length > 0 || Object.keys(e.new_words || {}).length > 0;
  }

  /** Original dialogue lines merged with any saved typo fixes for this lesson. */
  function getEffectiveDialogue(lesson) {
    const edits = getLessonEdits(lesson.id).dialogue || {};
    return (lesson.dialogue || []).map((line, idx) => {
      const fix = edits[idx];
      return fix ? { ...line, ...fix, _edited: true } : { ...line, _edited: false };
    });
  }

  /** Original new-word entries merged with any saved typo fixes for this lesson. */
  function getEffectiveNewWords(lesson) {
    const edits = getLessonEdits(lesson.id).new_words || {};
    return (lesson.new_words || []).map((w, idx) => {
      const fix = edits[idx];
      return fix ? { ...w, ...fix, _edited: true } : { ...w, _edited: false };
    });
  }

  /* ------------------------------------------------------------------ *
   *  SRS deck — scheduler (SM-2 flavoured Leitner hybrid)
   * ------------------------------------------------------------------ */

  function scheduleCard(card, grade) {
    const now = Date.now();
    switch (grade) {
      case "again":
        card.reps = 0;
        card.interval = 0;
        card.ease = Math.max(1.3, card.ease - 0.2);
        card.dueAt = now + AGAIN_DELAY_MS;
        break;
      case "hard":
        card.ease = Math.max(1.3, card.ease - 0.15);
        card.interval = card.interval > 0 ? Math.max(1, Math.round(card.interval * 1.2)) : 1;
        card.reps += 1;
        card.dueAt = now + card.interval * DAY_MS;
        break;
      case "good":
        if (card.reps === 0) card.interval = 1;
        else if (card.reps === 1) card.interval = 3;
        else card.interval = Math.max(1, Math.round(card.interval * card.ease));
        card.reps += 1;
        card.dueAt = now + card.interval * DAY_MS;
        break;
      case "easy":
        card.interval = card.interval > 0 ? Math.round(card.interval * card.ease * 1.3) + 1 : 4;
        card.ease = card.ease + 0.15;
        card.reps += 1;
        card.dueAt = now + card.interval * DAY_MS;
        break;
      default:
        throw new Error(`Unknown grade: ${grade}`);
    }
    card.lastReviewed = now;
    return card;
  }

  function gradeCard(cardId, grade) {
    const deck = loadDeck();
    const idx = deck.findIndex((c) => c.id === cardId);
    if (idx === -1) return;
    scheduleCard(deck[idx], grade);
    saveDeck(deck);
    refreshDuePill();
  }

  /* ------------------------------------------------------------------ *
   *  Text-to-speech (shadowing)
   * ------------------------------------------------------------------ */

  function refreshVoices() {
    if (!("speechSynthesis" in window)) return;
    const voices = window.speechSynthesis.getVoices();
    state.frenchVoice =
      voices.find((v) => v.lang === "fr-FR") ||
      voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("fr")) ||
      null;
  }

  if ("speechSynthesis" in window) {
    refreshVoices();
    window.speechSynthesis.onvoiceschanged = refreshVoices;
  }

  /**
   * Speak `text` in French, optionally repeating `loops` times.
   * `onStart`/`onEnd` toggle a "speaking" UI state on the triggering button.
   */
  function speakFrench(text, { loops = 1, onStart, onEnd } = {}) {
    if (!("speechSynthesis" in window)) {
      showToast("Speech synthesis isn't supported in this browser.");
      return;
    }
    window.speechSynthesis.cancel(); // clear any queued/stuck utterances first

    let remaining = Math.max(1, loops);
    onStart && onStart();

    const speakOnce = () => {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "fr-FR";
      if (state.frenchVoice) utter.voice = state.frenchVoice;
      utter.rate = 0.95;

      utter.onend = () => {
        remaining -= 1;
        if (remaining > 0) {
          setTimeout(speakOnce, 350);
        } else {
          onEnd && onEnd();
        }
      };
      utter.onerror = () => {
        onEnd && onEnd();
      };
      window.speechSynthesis.speak(utter);
    };

    speakOnce();
  }

  /* ------------------------------------------------------------------ *
   *  Audio player (lesson recordings)
   * ------------------------------------------------------------------ */

  function resetPlayerUI() {
    dom.scrubber.value = 0;
    dom.timeCurrent.textContent = "0:00";
    dom.timeTotal.textContent = "0:00";
    setPlayingIcon(false);
    dom.playerStatus.hidden = true;
  }

  function setPlayingIcon(isPlaying) {
    dom.playPause.querySelector(".icon-play").hidden = isPlaying;
    dom.playPause.querySelector(".icon-pause").hidden = !isPlaying;
    dom.playPause.setAttribute("aria-label", isPlaying ? "Pause audio" : "Play audio");
  }

  function loadLessonAudio(lessonId) {
    const url = state.audioUrls[String(lessonId)];
    resetPlayerUI();
    if (!url) {
      dom.playerStatus.hidden = false;
      dom.playerStatus.textContent = "No audio found for this lesson.";
      dom.audioEl.removeAttribute("src");
      dom.playPause.disabled = true;
      dom.scrubber.disabled = true;
      return;
    }
    dom.playPause.disabled = false;
    dom.scrubber.disabled = false;
    dom.audioEl.src = url;
    dom.audioEl.playbackRate = state.speed;
    dom.audioEl.load();
  }

  dom.playPause.addEventListener("click", () => {
    if (!dom.audioEl.src) return;
    if (dom.audioEl.paused) {
      const p = dom.audioEl.play();
      if (p && p.catch) {
        p.catch(() => {
          dom.playerStatus.hidden = false;
          dom.playerStatus.textContent = "Couldn't play this file — check the audio URL.";
        });
      }
    } else {
      dom.audioEl.pause();
    }
  });

  dom.audioEl.addEventListener("play", () => setPlayingIcon(true));
  dom.audioEl.addEventListener("pause", () => setPlayingIcon(false));
  dom.audioEl.addEventListener("ended", () => setPlayingIcon(false));

  dom.audioEl.addEventListener("loadedmetadata", () => {
    dom.scrubber.max = dom.audioEl.duration || 0;
    dom.timeTotal.textContent = formatTime(dom.audioEl.duration);
  });

  dom.audioEl.addEventListener("timeupdate", () => {
    dom.scrubber.value = dom.audioEl.currentTime;
    dom.timeCurrent.textContent = formatTime(dom.audioEl.currentTime);
  });

  dom.audioEl.addEventListener("error", () => {
    if (!dom.audioEl.src) return;
    dom.playerStatus.hidden = false;
    dom.playerStatus.textContent = "This lesson's audio couldn't be loaded.";
  });

  dom.scrubber.addEventListener("input", () => {
    dom.audioEl.currentTime = Number(dom.scrubber.value);
  });

  dom.speedBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      state.speed = Number(btn.dataset.speed);
      dom.audioEl.playbackRate = state.speed;
      dom.speedBtns.forEach((b) => b.classList.toggle("is-active", b === btn));
    });
  });

  /* ------------------------------------------------------------------ *
   *  Rendering — sidebar (lesson index)
   * ------------------------------------------------------------------ */

  function renderSidebar(filterText = "") {
    const q = filterText.trim().toLowerCase();
    dom.lessonIndex.innerHTML = "";

    const frag = document.createDocumentFragment();
    state.lessons.forEach((lesson) => {
      const hay = `${lesson.id} ${lesson.title}`.toLowerCase();
      if (q && !hay.includes(q)) return;

      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.className = "lesson-btn" + (lesson.id === state.currentLessonId ? " is-active" : "");
      btn.dataset.lessonId = lesson.id;

      const isRevision = lesson.type === "revision";
      btn.innerHTML = `
        <span class="lesson-num">${lesson.id}</span>
        <span class="lesson-name">${escapeHtml(lesson.title)}</span>
        ${isRevision ? '<span class="lesson-tag">Révision</span>' : ""}
      `;
      btn.addEventListener("click", () => selectLesson(lesson.id));
      li.appendChild(btn);
      frag.appendChild(li);
    });
    dom.lessonIndex.appendChild(frag);
  }

  dom.lessonSearch.addEventListener("input", () => renderSidebar(dom.lessonSearch.value));

  /* ------------------------------------------------------------------ *
   *  Rendering — lesson view
   * ------------------------------------------------------------------ */

  function renderLesson(lesson) {
    dom.lessonEmpty.hidden = true;
    dom.lessonArticle.hidden = false;

    dom.lessonEyebrow.textContent =
      `Lesson ${lesson.id}${lesson.type === "revision" ? " · Révision" : ""}`;
    dom.lessonTitle.textContent = lesson.title;

    loadLessonAudio(lesson.id);
    renderDialogue(lesson);
    renderNewWords(lesson);
  }

  function renderDialogue(lesson) {
    const deck = loadDeck();
    const lines = getEffectiveDialogue(lesson);
    dom.dialogue.innerHTML = "";
    const frag = document.createDocumentFragment();
    const editable = state.editMode;

    lines.forEach((line, idx) => {
      const cardId = makeCardId(lesson.id, line.french || "");
      const isSaved = deck.some((c) => c.id === cardId);

      const row = document.createElement("div");
      row.className = "line" + (line._edited ? " is-edited" : "");
      row.dataset.idx = idx;
      row.innerHTML = `
        <span class="line-speaker">${escapeHtml(line.speaker ?? idx + 1)}</span>
        <div class="line-text">
          <p class="line-french" ${editable ? 'contenteditable="true" spellcheck="false"' : ""}>${escapeHtml(line.french)}</p>
          <p class="line-english" ${editable ? 'contenteditable="true" spellcheck="false"' : ""}>${escapeHtml(line.english)}</p>
        </div>
        <div class="line-actions">
          ${line._edited ? '<span class="edited-badge">✎ edited</span>' : ""}
          <button class="chip-btn tts-line-btn" type="button" data-french="${escapeHtml(line.french)}">🔊 Play</button>
          <label class="loop-toggle">
            <input type="checkbox" class="loop-check"> Loop 3×
          </label>
          <button class="chip-btn srs-add-btn ${isSaved ? "is-saved" : ""}" type="button"
            data-french="${escapeHtml(line.french)}"
            data-english="${escapeHtml(line.english)}"
            data-pron="${escapeHtml(line.pronunciation || "")}">
            ${isSaved ? "✓ In deck" : "➕ Add to SRS"}
          </button>
        </div>
      `;
      frag.appendChild(row);
    });

    dom.dialogue.appendChild(frag);
  }

  function renderNewWords(lesson) {
    const words = getEffectiveNewWords(lesson);
    if (!words.length) {
      dom.newWordsSection.hidden = true;
      return;
    }
    dom.newWordsSection.hidden = false;
    const deck = loadDeck();
    const editable = state.editMode;
    dom.newWordsList.innerHTML = "";
    const frag = document.createDocumentFragment();

    words.forEach((w, idx) => {
      const cardId = makeCardId(lesson.id, w.french || "");
      const isSaved = deck.some((c) => c.id === cardId);
      const li = document.createElement("li");
      li.className = "word-item" + (w._edited ? " is-edited" : "");
      li.dataset.idx = idx;
      li.innerHTML = `
        <span class="word-fr" ${editable ? 'contenteditable="true" spellcheck="false"' : ""}>${escapeHtml(w.french)}</span>
        <span class="word-en" ${editable ? 'contenteditable="true" spellcheck="false"' : ""}>${escapeHtml(w.english)}</span>
        <button class="chip-btn srs-add-btn ${isSaved ? "is-saved" : ""}" type="button"
          data-french="${escapeHtml(w.french)}"
          data-english="${escapeHtml(w.english)}"
          data-pron="">
          ${isSaved ? "✓" : "➕"}
        </button>
      `;
      frag.appendChild(li);
    });
    dom.newWordsList.appendChild(frag);
  }

  // Event delegation for TTS + Add-to-SRS buttons inside the lesson article
  dom.lessonArticle.addEventListener("click", (e) => {
    const ttsBtn = e.target.closest(".tts-line-btn");
    if (ttsBtn) {
      const french = ttsBtn.dataset.french;
      const row = ttsBtn.closest(".line-actions");
      const loopChecked = row.querySelector(".loop-check")?.checked;
      const loops = loopChecked ? 3 : 1;
      speakFrench(french, {
        loops,
        onStart: () => ttsBtn.classList.add("is-speaking"),
        onEnd: () => ttsBtn.classList.remove("is-speaking"),
      });
      return;
    }

    const addBtn = e.target.closest(".srs-add-btn");
    if (addBtn) {
      if (addBtn.classList.contains("is-saved")) {
        showToast("Already in your deck.");
        return;
      }
      const lesson = state.lessons.find((l) => l.id === state.currentLessonId);
      const result = addToDeck({
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        french: addBtn.dataset.french,
        english: addBtn.dataset.english,
        pronunciation: addBtn.dataset.pron,
      });
      if (result.ok) {
        addBtn.classList.add("is-saved");
        addBtn.textContent = addBtn.closest(".word-item") ? "✓" : "✓ In deck";
        showToast("Added to your SRS deck.");
        refreshDuePill();
      } else if (result.reason === "duplicate") {
        addBtn.classList.add("is-saved");
        showToast("Already in your deck.");
      }
      return;
    }
  });

  /* ------------------------------------------------------------------ *
   *  Typo-fix edit mode (obscure, per-lesson, resettable)
   * ------------------------------------------------------------------ */

  function currentLesson() {
    return state.lessons.find((l) => l.id === state.currentLessonId);
  }

  dom.editToggle.addEventListener("click", () => {
    state.editMode = !state.editMode;
    dom.editToggle.classList.toggle("is-active", state.editMode);
    dom.editToggle.setAttribute("aria-pressed", String(state.editMode));
    dom.editBar.hidden = !state.editMode;
    const lesson = currentLesson();
    if (lesson) {
      renderDialogue(lesson);
      renderNewWords(lesson);
    }
  });

  dom.editReset.addEventListener("click", () => {
    const lesson = currentLesson();
    if (!lesson) return;
    if (!lessonHasEdits(lesson.id)) {
      showToast("Nothing to reset — this lesson is already original.");
      return;
    }
    const ok = window.confirm(
      `Reset lesson ${lesson.id} to its original text? This only undoes typo fixes for this lesson — your SRS deck is untouched.`
    );
    if (!ok) return;
    resetLessonEdits(lesson.id);
    renderDialogue(lesson);
    renderNewWords(lesson);
    showToast("Lesson text reset to original.");
  });

  // Save a typo fix whenever an editable field loses focus, then re-render
  // (cheap, and guarantees the TTS/SRS buttons next to it never go stale).
  dom.lessonArticle.addEventListener("focusout", (e) => {
    const target = e.target;
    const lesson = currentLesson();
    if (!lesson) return;

    if (target.matches(".line-french, .line-english")) {
      const idx = Number(target.closest(".line").dataset.idx);
      const field = target.classList.contains("line-french") ? "french" : "english";
      setDialogueEdit(lesson.id, idx, field, target.textContent.trim());
      renderDialogue(lesson);
    } else if (target.matches(".word-fr, .word-en")) {
      const idx = Number(target.closest(".word-item").dataset.idx);
      const field = target.classList.contains("word-fr") ? "french" : "english";
      setWordEdit(lesson.id, idx, field, target.textContent.trim());
      renderNewWords(lesson);
    }
  });

  // In an editable field, Enter confirms the fix instead of adding a line break.
  dom.lessonArticle.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    if (e.target.matches(".line-french, .line-english, .word-fr, .word-en")) {
      e.preventDefault();
      e.target.blur();
    }
  });

  /* ------------------------------------------------------------------ *
   *  Lesson selection
   * ------------------------------------------------------------------ */

  function selectLesson(id) {
    const lesson = state.lessons.find((l) => l.id === Number(id));
    if (!lesson) return;
    state.currentLessonId = lesson.id;
    renderLesson(lesson);
    renderSidebar(dom.lessonSearch.value); // refresh active state
    closeSidebarOnMobile();
    if (typeof dom.lessonView.scrollTo === "function") {
      dom.lessonView.scrollTo({ top: 0 });
    } else {
      dom.lessonView.scrollTop = 0;
    }
  }

  /* ------------------------------------------------------------------ *
   *  Mobile sidebar drawer
   * ------------------------------------------------------------------ */

  function openSidebar() {
    dom.sidebar.classList.add("is-open");
    dom.scrim.classList.add("is-open");
    dom.menuToggle.setAttribute("aria-expanded", "true");
  }
  function closeSidebar() {
    dom.sidebar.classList.remove("is-open");
    dom.scrim.classList.remove("is-open");
    dom.menuToggle.setAttribute("aria-expanded", "false");
  }
  function closeSidebarOnMobile() {
    if (window.matchMedia("(max-width: 900px)").matches) closeSidebar();
  }
  dom.menuToggle.addEventListener("click", () => {
    dom.sidebar.classList.contains("is-open") ? closeSidebar() : openSidebar();
  });
  dom.scrim.addEventListener("click", closeSidebar);

  /* ------------------------------------------------------------------ *
   *  View switching (Lessons / Review)
   * ------------------------------------------------------------------ */

  function setView(view) {
    state.view = view;
    dom.lessonView.hidden = view !== "lesson";
    dom.reviewView.hidden = view !== "review";
    dom.schedulerView.hidden = view !== "scheduler";
    dom.viewTabs.forEach((tab) => {
      const active = tab.dataset.view === view;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    if (view === "review") startReviewSession();
  }

  dom.viewTabs.forEach((tab) => tab.addEventListener("click", () => setView(tab.dataset.view)));

  /* ------------------------------------------------------------------ *
   *  Review (SRS) session
   * ------------------------------------------------------------------ */

  function startReviewSession() {
    window.speechSynthesis && window.speechSynthesis.cancel();
    const deck = loadDeck();
    const now = Date.now();
    const due = deck.filter((c) => c.dueAt <= now).sort((a, b) => a.dueAt - b.dueAt);

    if (deck.length === 0) {
      dom.reviewNoDeck.hidden = false;
      dom.reviewEmpty.hidden = true;
      dom.reviewSession.hidden = true;
      return;
    }
    if (due.length === 0) {
      dom.reviewNoDeck.hidden = true;
      dom.reviewEmpty.hidden = false;
      dom.reviewSession.hidden = true;
      dom.reviewEmptyCount.textContent = deck.length;
      return;
    }

    state.reviewQueue = due;
    state.reviewIndex = 0;
    dom.reviewNoDeck.hidden = true;
    dom.reviewEmpty.hidden = true;
    dom.reviewSession.hidden = false;
    showReviewCard();
  }

  function showReviewCard() {
    const card = state.reviewQueue[state.reviewIndex];
    if (!card) {
      startReviewSession(); // re-check: session finished
      return;
    }
    state.reviewAnswerShown = false;

    dom.reviewCount.textContent =
      `Card ${state.reviewIndex + 1} of ${state.reviewQueue.length}`;
    dom.reviewBarFill.style.width =
      `${Math.round((state.reviewIndex / state.reviewQueue.length) * 100)}%`;

    dom.srsSource.textContent = `Lesson ${card.lessonId} · ${card.lessonTitle}`;
    dom.srsPrompt.textContent = card.english || "(no translation saved)";
    dom.srsFrench.textContent = card.french;
    dom.srsPron.textContent = card.pronunciation || "";
    dom.srsPron.hidden = !card.pronunciation;

    dom.srsAnswer.hidden = true;
    dom.showAnswerBtn.hidden = false;
    dom.gradeRow.hidden = true;
  }

  dom.showAnswerBtn.addEventListener("click", () => {
    dom.srsAnswer.hidden = false;
    dom.showAnswerBtn.hidden = true;
    dom.gradeRow.hidden = false;
    state.reviewAnswerShown = true;
  });

  dom.srsPlayTts.addEventListener("click", () => {
    const card = state.reviewQueue[state.reviewIndex];
    if (!card) return;
    speakFrench(card.french, {
      onStart: () => dom.srsPlayTts.classList.add("is-speaking"),
      onEnd: () => dom.srsPlayTts.classList.remove("is-speaking"),
    });
  });

  dom.gradeRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".grade-btn");
    if (!btn) return;
    const card = state.reviewQueue[state.reviewIndex];
    if (!card) return;
    gradeCard(card.id, btn.dataset.grade);
    state.reviewIndex += 1;
    if (state.reviewIndex >= state.reviewQueue.length) {
      dom.reviewBarFill.style.width = "100%";
      // brief pause so the bar can visually complete, then re-check due cards
      setTimeout(startReviewSession, 200);
    } else {
      showReviewCard();
    }
  });

  /* ==================================================================== *
   *  Scheduler — standalone spaced-repetition planner
   *  Entirely independent of the story loop / SRS deck above: its own
   *  localStorage key, its own state, no shared data.
   * ==================================================================== */

  const SCHEDULER_KEY = "parler_scheduler_v1";
  const SCHEDULER_DEFAULTS = {
    currentLesson: 1,
    lessonsPerDay: 1,
    totalLessons: 80,
    intervals: "1,3,7,14,30,60",
  };

  state.schedulerEvents = null;   // Map<dateKey, {lesson, interval}[]>, last generated
  state.schedulerTodayKey = null; // the "today" the last generation was computed against

  /* ---- storage ---- */

  function loadSchedulerSettings() {
    try {
      const raw = localStorage.getItem(SCHEDULER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.error("Boucle: could not read scheduler settings", err);
      return null;
    }
  }

  function saveSchedulerSettings(settings) {
    try {
      localStorage.setItem(SCHEDULER_KEY, JSON.stringify(settings));
    } catch (err) {
      console.error("Boucle: could not save scheduler settings", err);
    }
  }

  /* ---- date helpers (local calendar dates, no UTC/timezone surprises) ---- */

  function ymd(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function parseDateInputValue(value) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function addDays(date, days) {
    const d = new Date(date.getTime());
    d.setDate(d.getDate() + days);
    return d;
  }

  function formatDayHeading(date) {
    const weekday = date.toLocaleDateString(undefined, { weekday: "short" });
    const full = date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    return { full, weekday };
  }

  function parseIntervals(str) {
    const seen = new Set();
    return String(str || "")
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0)
      .filter((n) => (seen.has(n) ? false : (seen.add(n), true)))
      .sort((a, b) => a - b);
  }

  /* ---- the scheduling algorithm ----
   * Lessons from `currentLesson` onward are treated as being introduced at a
   * steady pace of `lessonsPerDay`, starting TODAY. Lessons before
   * `currentLesson` (already studied outside this tool, so their real study
   * date is unknown) have their review clock reset instead: they're spread
   * out one per day — at the same pace — starting TOMORROW. Every lesson
   * then resurfaces at `anchorDate + each interval`.
   */
  function generateScheduleEvents({ today, currentLesson, lessonsPerDay, totalLessons, intervals }) {
    const perDay = Math.max(1, lessonsPerDay);
    const anchors = new Map();

    for (let n = 1; n < currentLesson; n++) {
      const offset = 1 + Math.floor((n - 1) / perDay); // spread from tomorrow
      anchors.set(n, addDays(today, offset));
    }
    for (let n = currentLesson; n <= totalLessons; n++) {
      const offset = Math.floor((n - currentLesson) / perDay); // paced from today
      anchors.set(n, addDays(today, offset));
    }

    const events = new Map(); // dateKey -> [{lesson, interval}]
    anchors.forEach((anchor, lesson) => {
      intervals.forEach((iv) => {
        const key = ymd(addDays(anchor, iv));
        if (!events.has(key)) events.set(key, []);
        events.get(key).push({ lesson, interval: iv });
      });
    });
    events.forEach((list) => list.sort((a, b) => (b.interval - a.interval) || (a.lesson - b.lesson)));
    return events;
  }

  /* ---- rendering ---- */

  function renderSchedulerToday(events, todayKey) {
    const todays = events.get(todayKey) || [];
    dom.schedulerTodayBody.innerHTML = "";
    if (todays.length === 0) {
      dom.schedulerTodayBody.innerHTML = `<p class="today-done">✅ Nothing due today!</p>`;
      return;
    }
    const frag = document.createDocumentFragment();
    todays.forEach(({ lesson, interval }) => {
      const chip = document.createElement("span");
      chip.className = "today-chip";
      chip.textContent = `Lesson ${lesson} (+${interval}d)`;
      frag.appendChild(chip);
    });
    dom.schedulerTodayBody.appendChild(frag);
  }

  function renderSchedulerCalendar(events, todayKey, futureOnly) {
    const realTodayKey = ymd(new Date());
    const keys = [...events.keys()]
      .filter((k) => k !== todayKey)
      .filter((k) => (futureOnly ? k >= realTodayKey : true))
      .sort();

    dom.schedulerCalendar.innerHTML = "";
    const frag = document.createDocumentFragment();

    keys.forEach((key) => {
      const date = parseDateInputValue(key);
      const { full, weekday } = formatDayHeading(date);
      const card = document.createElement("div");
      card.className = "day-card";
      card.innerHTML = `
        <div class="day-date">${full}<span class="day-date-sub">${weekday}</span></div>
        <div class="day-chips">
          ${events.get(key).map(({ lesson, interval }) =>
            `<span class="day-chip">Lesson ${lesson} <span class="iv">+${interval}d</span></span>`
          ).join("")}
        </div>
      `;
      frag.appendChild(card);
    });

    dom.schedulerCalendar.appendChild(frag);
  }

  function updateSchedulerDuePill(events, todayKey) {
    const n = (events.get(todayKey) || []).length;
    dom.schedulerDuePill.hidden = n === 0;
    dom.schedulerDuePill.textContent = n > 99 ? "99+" : String(n);
  }

  /* ---- form → schedule ---- */

  function readSchedulerForm() {
    const todayVal = dom.schToday.value || ymd(new Date());
    const currentLesson = Math.max(1, parseInt(dom.schCurrent.value, 10) || 1);
    const lessonsPerDay = Math.max(1, parseInt(dom.schPerDay.value, 10) || 1);
    const totalLessons = Math.max(currentLesson, parseInt(dom.schTotal.value, 10) || currentLesson);
    const intervals = parseIntervals(dom.schIntervals.value);
    return { today: parseDateInputValue(todayVal), currentLesson, lessonsPerDay, totalLessons, intervals };
  }

  function generateAndRenderSchedule({ persist = true } = {}) {
    const form = readSchedulerForm();
    if (form.intervals.length === 0) {
      showToast("Add at least one interval, e.g. 1,3,7,14,30,60");
      return;
    }

    const events = generateScheduleEvents(form);
    const todayKey = ymd(form.today);
    state.schedulerEvents = events;
    state.schedulerTodayKey = todayKey;

    if (persist) {
      saveSchedulerSettings({
        currentLesson: form.currentLesson,
        lessonsPerDay: form.lessonsPerDay,
        totalLessons: form.totalLessons,
        intervals: dom.schIntervals.value,
      });
    }

    dom.schedulerToday.hidden = false;
    dom.schedulerControls.hidden = false;
    dom.schedulerEmpty.hidden = true;

    renderSchedulerToday(events, todayKey);
    renderSchedulerCalendar(events, todayKey, dom.schFutureOnly.checked);
    updateSchedulerDuePill(events, todayKey);
  }

  function resetSchedulerToDefaults() {
    dom.schToday.value = ymd(new Date());
    dom.schCurrent.value = SCHEDULER_DEFAULTS.currentLesson;
    dom.schPerDay.value = SCHEDULER_DEFAULTS.lessonsPerDay;
    dom.schTotal.value = SCHEDULER_DEFAULTS.totalLessons;
    dom.schIntervals.value = SCHEDULER_DEFAULTS.intervals;
  }

  dom.schGenerate.addEventListener("click", () => generateAndRenderSchedule());

  dom.schReset.addEventListener("click", () => {
    const ok = window.confirm(
      "Reset the scheduler? This clears your saved pace (current lesson, lessons/day, total, intervals) and starts over. It has no effect on your SRS deck or lesson edits."
    );
    if (!ok) return;
    localStorage.removeItem(SCHEDULER_KEY);
    resetSchedulerToDefaults();
    state.schedulerEvents = null;
    state.schedulerTodayKey = null;
    dom.schedulerToday.hidden = true;
    dom.schedulerControls.hidden = true;
    dom.schedulerCalendar.innerHTML = "";
    dom.schedulerEmpty.hidden = false;
    dom.schedulerDuePill.hidden = true;
    showToast("Scheduler reset.");
  });

  dom.schFutureOnly.addEventListener("change", () => {
    if (!state.schedulerEvents) return;
    renderSchedulerCalendar(state.schedulerEvents, state.schedulerTodayKey, dom.schFutureOnly.checked);
  });

  dom.schPrint.addEventListener("click", () => window.print());

  function initScheduler() {
    dom.schToday.value = ymd(new Date());
    const saved = loadSchedulerSettings();
    if (saved) {
      dom.schCurrent.value = saved.currentLesson ?? SCHEDULER_DEFAULTS.currentLesson;
      dom.schPerDay.value = saved.lessonsPerDay ?? SCHEDULER_DEFAULTS.lessonsPerDay;
      dom.schTotal.value = saved.totalLessons ?? SCHEDULER_DEFAULTS.totalLessons;
      dom.schIntervals.value = saved.intervals ?? SCHEDULER_DEFAULTS.intervals;
      generateAndRenderSchedule({ persist: false });
    }
  }

  /* ------------------------------------------------------------------ *
   *  Init
   * ------------------------------------------------------------------ */

  async function init() {
    // The scheduler is a standalone tool — set it up regardless of whether
    // the lesson data below loads successfully.
    initScheduler();

    try {
      await loadData();
    } catch (err) {
      console.error(err);
      dom.lessonEmpty.innerHTML = `
        <p><strong>Couldn't load lesson data.</strong></p>
        <p style="font-family: var(--sans); font-size: 0.9rem;">
          Make sure <code>data/lessons.json</code> and <code>data/audioUrls.json</code>
          are present next to <code>index.html</code>.<br>
          (${escapeHtml(err.message)})
        </p>`;
      return;
    }

    renderSidebar();
    refreshDuePill();

    if (state.lessons.length) {
      selectLesson(state.lessons[0].id);
    }
  }

  init();
})();
