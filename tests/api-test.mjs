// node tests/api-test.mjs — server code against a mocked Gemini and mocked requests (no network).
import { transcribe, checkPatterns, speak, parseJson } from '../api/_gemini.js';
import transcribeHandler from '../api/transcribe.js';
import { mergeDocs } from '../api/progress.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.error('FAIL', m); } else console.log('ok  ', m); };
const resp = (status, json, headers = {}) => ({ ok: status < 300, status, headers: { get: k => headers[k.toLowerCase()] || null }, json: async () => json });
const textAnswer = t => resp(200, { candidates: [{ content: { parts: [{ text: t }] } }] });

// transcription
{
  let seen = null;
  const r = await transcribe('AAAA', 'audio/wav', { key: 'k', fetchImpl: async (url, init) => { seen = { url, body: JSON.parse(init.body) }; return textAnswer('Normalerweise beginne ich den Tag mit einer Planung.'); } });
  ok(r.transcript.startsWith('Normalerweise'), 'transcribe returns the text');
  ok(seen.url.includes('gemini-flash-latest'), 'first model is gemini-flash-latest');
  ok(seen.body.contents[0].parts[0].inline_data.mime_type === 'audio/wav', 'audio sent as inline WAV');
}
// quota on the first model → second model
{
  const calls = [];
  const r = await transcribe('AAAA', 'audio/wav', { key: 'k', fetchImpl: async url => { calls.push(url); return calls.length === 1 ? resp(429, { error: { message: 'quota' } }, { 'retry-after': '12' }) : textAnswer('Hallo'); } });
  ok(r.transcript === 'Hallo' && /flash-lite/.test(calls[1]), 'quota on model 1 falls back to model 2');
}
// both quota → 429 with retryAfter
{
  let err = null;
  try { await transcribe('AAAA', 'audio/wav', { key: 'k', fetchImpl: async () => resp(429, { error: { message: 'quota' } }, { 'retry-after': '20' }) }); } catch (e) { err = e; }
  ok(err && err.status === 429 && err.retryAfter === 20, 'quota on all models → 429 + retryAfter');
}
// pattern check
{
  const targets = [{ id: 'a', kind: 'pattern', p: 'Normalerweise mache ich …' }, { id: 'wv', kind: 'wv', p: 'am frühen Morgen' }];
  const r = await checkPatterns('Normalerweise mache ich Sport. Am frühe Morgen …', targets, { key: 'k', fetchImpl: async () => textAnswer('```json\n{"checks":{"a":{"used":true,"quote":"Normalerweise mache ich Sport.","count":1,"note":""},"wv":{"used":true,"quote":"Am frühe Morgen","count":1,"note":"Ending: am frühen Morgen"}}}\n```') });
  ok(r.checks.a.used && r.checks.wv.note.includes('frühen'), 'pattern check parsed, fenced JSON accepted');
}
ok(parseJson('noise {"x":1} tail').x === 1, 'parseJson finds the object');
// voice
{
  const pcm = Buffer.alloc(24000 * 2); for (let i = 4000; i < 20000; i++) pcm.writeInt16LE(i % 2 ? 4000 : -4000, i * 2);
  const r = await speak('Hallo', { key: 'k', fetchImpl: async () => resp(200, { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: pcm.toString('base64') } }] } }] }) });
  ok(r.wav.slice(0, 4).toString() === 'RIFF' && r.wav.readUInt32LE(24) === 24000, 'TTS returns a 24 kHz WAV');
  ok(r.wav.length < pcm.length, 'silence trimmed');
}
// handler auth
{
  const mkRes = () => { const o = { code: 0, body: null, headers: {} }; o.setHeader = (k, v) => { o.headers[k] = v; }; o.status = c => { o.code = c; return o; }; o.json = b => { o.body = b; return o; }; return o; };
  delete process.env.SYNC_KEY; delete process.env.VERB_SYNC_SECRET;
  let res = mkRes(); await transcribeHandler({ method: 'POST', headers: {}, body: {} }, res);
  ok(res.code === 503, 'no SYNC_KEY on the server → 503');
  process.env.SYNC_KEY = 'secret';
  res = mkRes(); await transcribeHandler({ method: 'POST', headers: { 'x-sync-key': 'nope' }, body: {} }, res);
  ok(res.code === 401, 'wrong key → 401');
  res = mkRes(); await transcribeHandler({ method: 'POST', headers: { 'x-sync-key': 'secret' }, body: { mode: 'check', transcript: '', targets: [{ id: 'a', p: 'x' }] } }, res);
  ok(res.code === 200 && res.body.checks.a.used === false, 'empty transcript → nothing used, no Gemini call');
}
// sync merge
{
  const local = { days: { 1: { done: true, updatedAt: 200 }, 2: { done: false, updatedAt: 50 } }, settings: { lock60: true, updatedAt: 10 } };
  const cloud = { days: { 2: { done: true, updatedAt: 100 }, 3: { done: true, updatedAt: 5 } }, settings: { lock60: false, updatedAt: 20 } };
  const m = mergeDocs(local, cloud);
  ok(m.days[1].done && m.days[2].done && m.days[3].done, 'merge keeps the newer copy of each day and the union of days');
  ok(m.settings.lock60 === false, 'merge keeps the newer settings');
}
console.log(fails ? `${fails} failure(s)` : 'api: all checks passed');
process.exit(fails ? 1 : 0);
