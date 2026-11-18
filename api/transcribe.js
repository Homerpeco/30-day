// POST /api/transcribe
//   {mode: "audio", audio: "<base64 WAV, ≤ 60 s, 16 kHz mono>"}            → {transcript}
//   {mode: "check", transcript: "...", targets: [{id, kind, p}]}             → {checks: {id: {used, quote, count, note}}}
// The app cuts longer takes into 60-second WAV pieces, transcribes each, then runs one "check" on the joined text.
// Header: x-sync-key. On quota limits: 429 + retryAfter seconds.
import { requireKey, jsonBody } from './_auth.js';
import { transcribe, checkPatterns } from './_gemini.js';

export const maxDuration = 60;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'method not allowed' }); }
  if (!requireKey(req, res)) return;
  const body = jsonBody(req);
  try {
    if (body.mode === 'audio') {
      const audio = String(body.audio || '');
      if (audio.length < 100) return res.status(400).json({ error: 'audio required' });
      const r = await transcribe(audio, 'audio/wav');
      return res.status(200).json(r);
    }
    if (body.mode === 'check') {
      const transcript = String(body.transcript || '').slice(0, 20000);
      const targets = Array.isArray(body.targets) ? body.targets.slice(0, 6).map(t => ({ id: String(t.id), kind: String(t.kind || ''), p: String(t.p || '').slice(0, 200) })) : [];
      if (!targets.length) return res.status(400).json({ error: 'targets required' });
      if (!transcript.trim()) return res.status(200).json({ checks: Object.fromEntries(targets.map(t => [t.id, { used: false, quote: '', count: 0, note: '' }])) });
      return res.status(200).json(await checkPatterns(transcript, targets));
    }
    return res.status(400).json({ error: 'mode must be "audio" or "check"' });
  } catch (err) {
    const status = err.status === 429 ? 429 : err.status === 503 ? 503 : 502;
    if (err.retryAfter) res.setHeader('Retry-After', String(err.retryAfter));
    return res.status(status).json({ error: status === 429 ? 'quota' : 'gemini-failed', detail: String(err.message || err), retryAfter: err.retryAfter || 0 });
  }
}
