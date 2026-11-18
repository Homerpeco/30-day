// POST /api/tts {"text": "..."} → audio/wav (Gemini voice). The app caches every clip in IndexedDB,
// so each sentence is generated once per device. Header: x-sync-key.
import { requireKey, jsonBody } from './_auth.js';
import { speak } from './_gemini.js';

const VOICES = new Set(['Kore', 'Puck', 'Charon', 'Aoede', 'Fenrir', 'Leda', 'Orus', 'Zephyr']);
export const maxDuration = 60;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'method not allowed' }); }
  if (!requireKey(req, res)) return;
  const body = jsonBody(req);
  const text = String(body.text || '').replace(/\s+/g, ' ').trim();
  if (!text) return res.status(400).json({ error: 'text required' });
  if (text.length > 600) return res.status(400).json({ error: 'text too long (max 600 characters)' });
  try {
    const { wav, model } = await speak(text, { voice: VOICES.has(body.voice) ? body.voice : 'Kore' });
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('X-Tts-Model', model);
    return res.status(200).send(wav);
  } catch (err) {
    const status = err.status === 429 ? 429 : err.status === 503 ? 503 : 502;
    if (err.retryAfter) res.setHeader('Retry-After', String(err.retryAfter));
    return res.status(status).json({ error: status === 429 ? 'quota' : 'tts-failed', detail: String(err.message || err), retryAfter: err.retryAfter || 0 });
  }
}
