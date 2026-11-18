// Shared Gemini helpers (files starting with _ are not endpoints on Vercel).
// Text/audio understanding: gemini-flash-latest, then gemini-flash-lite-latest (the -latest aliases work on
// Tolomeo's key, same as MorphoDeutsch). Speech: the TTS models RecallDeutsch uses.

const API = 'https://generativelanguage.googleapis.com/v1beta';
const sleep = ms => new Promise(r => setTimeout(r, ms));

export class GeminiError extends Error {
  constructor(message, { status = 502, retryAfter = 0 } = {}) { super(message); this.status = status; this.retryAfter = retryAfter; }
}

const list = (env, def) => { const v = (process.env[env] || '').split(',').map(s => s.trim()).filter(Boolean); return v.length ? v : def; };
export const textModels = () => list('TEXT_MODELS', ['gemini-flash-latest', 'gemini-flash-lite-latest']);
export const ttsModels = () => list('TTS_MODELS', ['gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts']);
export const geminiKey = () => process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';

function retryDelay(json, headers) {
  const h = headers && headers.get && headers.get('retry-after');
  if (h && !isNaN(Number(h))) return Number(h);
  const det = json && json.error && json.error.details;
  if (Array.isArray(det)) for (const d of det) { const m = /([\d.]+)s/.exec((d && d.retryDelay) || ''); if (m) return Math.ceil(Number(m[1])); }
  return 30;
}

async function post(model, body, key, fetchImpl, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetchImpl(`${API}/models/${model}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body), signal: ctl.signal,
    });
    let json = null; try { json = await res.json(); } catch { /* not JSON */ }
    return { res, json };
  } finally { clearTimeout(t); }
}

// Run one request over the model list. Quota on one model → try the next (each model has its own bucket).
async function run(models, body, { key = geminiKey(), fetchImpl = fetch, ms = 50000, pick } = {}) {
  if (!key) throw new GeminiError('GEMINI_API_KEY is not set in the Vercel project.', { status: 503 });
  let last = null, quota = null;
  for (const model of models) {
    for (let round = 0; round < 2; round++) {
      let res, json;
      try { ({ res, json } = await post(model, body, key, fetchImpl, ms)); }
      catch (e) { last = new GeminiError('Gemini request failed: ' + ((e && e.message) || e), { status: 504 }); break; }
      if (res.ok) {
        const out = pick(json);
        if (out) return { ...out, model };
        last = new GeminiError('Gemini returned an empty answer'); if (round === 0) { await sleep(700); continue; } break;
      }
      const msg = (json && json.error && json.error.message) || ('HTTP ' + res.status);
      if (res.status === 401 || res.status === 403) throw new GeminiError('Gemini rejected the API key: ' + msg);
      if (res.status === 429) { quota = new GeminiError('Gemini quota reached: ' + msg, { status: 429, retryAfter: retryDelay(json, res.headers) }); break; }
      last = new GeminiError(`Gemini ${res.status}: ${msg}`);
      if (res.status >= 500 && round === 0) { await sleep(1000); continue; }
      break;
    }
  }
  throw quota || last || new GeminiError('Gemini failed');
}

const textOf = json => {
  const parts = (((json || {}).candidates || [])[0] || {}).content?.parts || [];
  const t = parts.map(p => p.text || '').join('').trim();
  return t ? { text: t } : null;
};

export function parseJson(text) {
  const s = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(s); } catch { /* fall through */ }
  const m = s.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* fall through */ } }
  return null;
}

// Audio (WAV, base64) → plain German transcript.
export async function transcribe(b64, mime, opts = {}) {
  const body = {
    contents: [{ parts: [
      { inline_data: { mime_type: mime, data: b64 } },
      { text: 'Transcribe this German speech exactly as spoken, word for word, with normal German spelling, capitalisation and punctuation. Do not correct grammar or word order, do not add or drop words, do not translate. Mark unintelligible parts as […]. If there is no speech, return an empty string. Return only the transcript.' },
    ] }],
    generationConfig: { temperature: 0 },
  };
  const r = await run(textModels(), body, { ...opts, pick: j => textOf(j) || { text: '' } });
  return { transcript: r.text.replace(/^"|"$/g, '').trim(), model: r.model };
}

// Transcript + the day's targets → which targets were used, with the sentence that shows it.
export async function checkPatterns(transcript, targets, opts = {}) {
  const items = targets.map(t => `- "${t.id}": ${t.kind === 'wv' ? 'the word combination' : 'the sentence pattern'} „${t.p}“`).join('\n');
  const prompt = `A German learner practised speaking. Here is the transcript of the take:\n"""${transcript}"""\n\nFor each target below, decide whether the learner actually used it at least once. "…" stands for any words the learner chose. A sentence counts when the fixed words of the pattern are there and the sentence follows the pattern's structure; small grammar mistakes inside still count as used. For a word combination the phrase must appear (an adjective ending mistake still counts as used, but say so in "note").\n${items}\n\nReturn only JSON: {"checks": {"<id>": {"used": true|false, "quote": "<the learner's sentence that uses it, copied from the transcript, or ''>", "count": <how many times>, "note": "<short English note on a mistake in that sentence, or ''>"}}}`;
  const body = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } };
  const r = await run(textModels(), body, { ...opts, pick: textOf });
  const j = parseJson(r.text);
  if (!j || typeof j.checks !== 'object') throw new GeminiError('Gemini answered in an unexpected format');
  const checks = {};
  for (const t of targets) {
    const c = j.checks[t.id] || {};
    checks[t.id] = { used: c.used === true, quote: String(c.quote || ''), count: Number(c.count) || (c.used ? 1 : 0), note: String(c.note || '') };
  }
  return { checks, model: r.model };
}

// Text → WAV (Gemini returns 24 kHz 16-bit mono PCM).
export async function speak(text, { voice = 'Kore', ...opts } = {}) {
  const body = {
    contents: [{ parts: [{ text: `Read this German text aloud clearly, at a natural, slightly slow pace: ${text}` }] }],
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
  };
  const r = await run(ttsModels(), body, { ...opts, pick: j => {
    const parts = (((j || {}).candidates || [])[0] || {}).content?.parts || [];
    const p = parts.find(x => x.inlineData || x.inline_data);
    const d = p && (p.inlineData || p.inline_data);
    return d && d.data ? { b64: d.data, mime: d.mimeType || d.mime_type || 'audio/L16;rate=24000' } : null;
  } });
  const buf = Buffer.from(r.b64, 'base64');
  if (buf.slice(0, 4).toString('ascii') === 'RIFF') return { wav: buf, model: r.model };
  const rate = Number((/rate=(\d+)/i.exec(r.mime) || [])[1]) || 24000;
  return { wav: wavFromPcm(trimSilence(buf, rate), rate), model: r.model };
}

export function trimSilence(buf, rate, threshold = 600, marginMs = 80) {
  const s = new Int16Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 2));
  const win = Math.max(1, Math.round(rate * 0.01));
  const loud = i => { for (let k = i; k < Math.min(s.length, i + win); k++) if (Math.abs(s[k]) >= threshold) return true; return false; };
  let a = 0, b = s.length;
  while (a < s.length && !loud(a)) a += win;
  while (b > a && !loud(Math.max(a, b - win))) b -= win;
  if (b <= a) return buf;
  const m = Math.round(rate * marginMs / 1000);
  a = Math.max(0, a - m); b = Math.min(s.length, b + m);
  return Buffer.from(buf.buffer, buf.byteOffset + a * 2, (b - a) * 2);
}

export function wavFromPcm(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
