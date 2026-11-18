# 30-DAY – Besser sprechen in 30 Tagen (Speaking Studio)

A one-screen speaking studio for the 30-day challenge in "Besser sprechen in 30 Tagen – Training Plan": one topic a day,
two sentence patterns, three spoken rounds without stopping. It is a standalone app with its own repo and Vercel project,
built the same way as MorphoDeutsch: plain HTML/JS, installable on the phone, works offline, small API routes on Vercel.

## What is on the screen (v2, 18 Nov 2026: simplified)
One column, the same on the Mac and the phone, modeled on a "3 steps" study card:
- **Header:** ‹ Tag x / 30 › (tap the middle for all 30 days) and the ⋯ menu.
- **Topic:** the day's question in large type, 🔊 Listen, category chip.
- **Tabs:** 01 Satz A · 02 Satz B · 03 Kombinieren (Day 30: Probe-Interview · Final check). ✓ when recorded.
- **Sentence structure:** the pattern with its fixed words highlighted and gaps to fill, plus the word-order rule.
- **Build your sentences:** the model sentence with the pattern words highlighted (🔊), your own sentences (Satz A tab),
  both examples + Wortverbindung with its Dativ ending and your missing words (Kombinieren tab).
- **Record button:** start beep → records the round time with a countdown ring → end chime. >3 s pause alert.
  Last take below it: ▶ play, pauses, ✓ structures heard (Gemini checks after the take). After a full round the next tab opens.
- **⋯ menu:** warm-up 60 s, diary & AI correction prompt & mark day done, missing words, recordings (speed, download,
  transcript, Day 1 recordings on Day 30), all 30 days, the 6 word-order types, settings (round time, ticks, transcripts,
  room noise, sync password), export & backup.

## Data
- `data.js`: all 30 days copied verbatim from the training plan, the 6 word-order types, the type(s) of every pattern,
  the 10 Wortverbindungen with their Dativ rule, the nine questions in Tolomeo's numbering, week times, the 7 steps.
- Question numbers (18 Nov 2026): 1 Über sich/Werdegang · 2 Arbeitstag · 3 Warum diese Position · 4 Stärken ·
  5 Schwäche · 6 Sprachlich sicher · 7 Warum Sie · 8 Kunde unzufrieden · 9 Arbeitgeber verlassen.
  Question 8 has only the plan's topic wording ("Ein wichtiger Kunde war unzufrieden."); change `QUESTIONS[7].de` if needed.
- Week round time starts at 60 s / 90 s / 2 min / 3 min (weeks 1–4) and remembers what you pick per week.

## Storage and sync
- Browser: `localStorage` key **`thirtyday_v1`** (never rename): per day variations, missing words, diary, done flag, `updatedAt`; settings.
  View state: `thirtyday_ui2`. Sync password: `thirtyday_sync_key`. Room noise: `thirtyday_noise`.
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
| `index.html`, `styles.css` | one-column card layout, light palette, no italics |
| `data.js` | plan content |
| `audio.js` | beeps, microphone, recorder, pause detector, waveform, WAV pieces, IndexedDB |
| `app.js` | state, sync, card rendering, record flow, transcription, menu sheets, Day 30 |
| `api/` | `progress.js`, `transcribe.js`, `tts.js`, `health.js`, shared `_auth.js`, `_gemini.js` |
| `sw.js`, `manifest.webmanifest`, `icons/` | installable, offline |
