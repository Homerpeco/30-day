# 30-DAY – Besser sprechen in 30 Tagen (Speaking Studio)

A one-screen speaking studio for the 30-day challenge in "Besser sprechen in 30 Tagen – Training Plan": one topic a day,
two sentence patterns, three spoken rounds without stopping. It is a standalone app with its own repo and Vercel project,
built the same way as MorphoDeutsch: plain HTML/JS, installable on the phone, works offline, small API routes on Vercel.

## What is on the screen
| Zone | Content |
|---|---|
| A · left (drawer on the phone) | progress x/30, week tabs, 30-day grid (✓ = done; orange line = PDF topic, blue = asking back, violet = mock), the week's time rule, the 7 daily steps (✓ when done), drawers for the 6 word-order types, the Challenge-Tagebuch and export |
| B · top | TAG / WOCHE, category (Interview question #1–#9, PDF topic, Asking back, Mock interview), round time, the topic in large type, 🔊 read aloud. Cards: Satz A (emerald), Satz B (sky), Wortverbindung (amber) with model sentence, 🔊, word-order type(s) and verb rule, Dativ ending rule. Step 2: three variation slots (type or 🎙 dictate). Step 6: missing words pinned on screen |
| C · middle | beep timer (start 660→880 Hz, ticks 520 Hz in the last 5 s, end chord D5–G5–C6), strict 60 s lock, presets 1–5 min + slider; voice studio with waveform, >3 s pause alert and counter, room-noise measurement, takes with 0.85×/1×/1.25×, download, transcript and pattern check |
| D · bottom | Step 6 Wortlücken (concept → German, 🔁 run repeat round); Step 7 diary (time reached with "Use longest round", 2–3 unsure sentences, ✨ copy AI correction prompt, the three diary questions, mark day complete) |
| Day 30 | most-repeated patterns from "Was möchte ich wiederholen?", mock interview (9 questions, random order, 2 min each), 3-minute final check, Day 1 vs Day 30 players and diary figures |

Clicking a step loads its time (warm-up always 60 s, steps 2 and 7 two minutes, rounds = the week's round time) and
highlights the cards it uses. Recording starts 350 ms after the start beep and stops 50 ms before the end chime.
After steps 1–4 the next step is selected automatically.

## Data
- `data.js`: all 30 days copied verbatim from the training plan, the 6 word-order types, the type(s) of every pattern,
  the 10 Wortverbindungen with their Dativ rule, the nine questions in Tolomeo's numbering, week times, the 7 steps.
- Question numbers (18 Nov 2026): 1 Über sich/Werdegang · 2 Arbeitstag · 3 Warum diese Position · 4 Stärken ·
  5 Schwäche · 6 Sprachlich sicher · 7 Warum Sie · 8 Kunde unzufrieden · 9 Arbeitgeber verlassen.
  Question 8 has only the plan's topic wording ("Ein wichtiger Kunde war unzufrieden."); change `QUESTIONS[7].de` if needed.
- Week round time starts at 60 s / 90 s / 2 min / 3 min (weeks 1–4) and remembers what you pick per week.

## Storage and sync
- Browser: `localStorage` key **`thirtyday_v1`** (never rename): per day variations, missing words, diary, done flag, `updatedAt`; settings.
  View state: `thirtyday_ui`. Sync password: `thirtyday_sync_key`. Room noise: `thirtyday_noise`.
- Recordings, their transcripts and cached voice clips: IndexedDB database `thirtyday` (stores `takes`, `tts`), per device.
  They are **not** synced; download a take with ⬇ to keep it. The app asks the browser for persistent storage.
- Cloud: `GET/PUT /api/progress`, one JSON document at `thirtyday/progress.json` in Vercel Blob. Merge per day, newer `updatedAt` wins.

## API (all need the `x-sync-key` header = SYNC_KEY)
| Route | Purpose |
|---|---|
| `GET /api/health` | which server features are configured (no key needed, no secrets) |
| `GET/PUT /api/progress` | sync document (Vercel Blob) |
| `POST /api/transcribe` | `{mode:"audio", audio}` → transcript of a ≤ 60 s 16 kHz WAV piece; `{mode:"check", transcript, targets}` → which of Satz A / Satz B / Wortverbindung were used, with the sentence |
| `POST /api/tts` | German voice (Gemini) as WAV for questions and model sentences; cached in IndexedDB. Without it the browser voice is used |

Transcription runs **after** each take (not live): the app decodes the recording, cuts it into 60-second 16 kHz WAV pieces,
transcribes each with Gemini, then checks the patterns: Round 1 → Satz A, Round 2 → Satz B, Round 3 and the repeat round →
all three. This works on the Mac and on Android Chrome (live browser speech recognition and recording cannot share the
microphone on Android).

## Vercel settings
| Setting | Value |
|---|---|
| Framework preset | Other (no build command) |
| Storage | connect a Blob store (adds `BLOB_READ_WRITE_TOKEN`) |
| `SYNC_KEY` | any password; the app asks for it once per device. Sync, transcripts and the Gemini voice stay off until it is set |
| `GEMINI_API_KEY` | Google AI Studio key (`VITE_GEMINI_API_KEY` also accepted). Optional: `TEXT_MODELS`, `TTS_MODELS` override the model lists |

Without the server (file opened locally) the app still works fully: timer, beeps, recording, pause detector, diary.

## Deploy (same pattern as the other apps)
```bash
cd "~/Documents/Claude/Projects/replicate Langey/30-day"
git init -b main && git add . && git commit -m "30-DAY speaking studio"
git remote add origin https://github.com/Homerpeco/30-day.git   # create the empty repo on GitHub first
git push -u origin main
```
Then on vercel.com: Add New → Project → import `Homerpeco/30-day` → Framework "Other" → Deploy. Afterwards Storage →
connect a Blob store, Settings → Environment Variables → `SYNC_KEY` and `GEMINI_API_KEY`, then Redeploy.

## Tests
- `node tests/data-test.mjs`: 30 days, 24 interview / 4 PDF / 2 asking-back days, each question 2–4 times, the customer story on
  days 8, 11, 19, 25, 30 distinct new patterns, a type for every pattern, every review pattern introduced earlier, each
  Wortverbindung introduced once and repeated later, model sentences match their pattern.
- `node tests/api-test.mjs`: Gemini transcription, model fallback on quota, pattern check parsing, WAV voice, key checks, sync merge.
  (`tests/` is not deployed: `.vercelignore`.)

## Files
| File | Role |
|---|---|
| `index.html`, `styles.css` | layout (4 zones, phone layout below 900 px), white palette, no italics |
| `data.js` | plan content |
| `audio.js` | beeps, microphone, recorder, pause detector, waveform, WAV pieces, IndexedDB |
| `app.js` | state, sync, rendering, timer, transcription, diary, Day 30 |
| `api/` | `progress.js`, `transcribe.js`, `tts.js`, `health.js`, shared `_auth.js`, `_gemini.js` |
| `sw.js`, `manifest.webmanifest`, `icons/` | installable, offline |
