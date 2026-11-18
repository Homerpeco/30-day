// /api/progress — the 30-DAY cloud copy (Vercel Blob), one JSON document.
// GET → {days, settings, updatedAt}   PUT/POST → save (the app merges before it writes, so a PUT is the union of both devices).
// Synced: per day the variations, missing words, diary and completion (newer updatedAt wins), plus settings.
// Not synced: audio recordings and their transcripts (they stay in the browser's IndexedDB on each device).
import { put, list } from '@vercel/blob';
import { requireKey, jsonBody } from './_auth.js';

const BLOB_PATH = 'thirtyday/progress.json';
const MAX_BYTES = 2 * 1024 * 1024;

export function mergeDocs(a, b) {
  const out = { days: {}, settings: {}, updatedAt: null };
  const da = (a && a.days) || {}, db = (b && b.days) || {};
  for (const k of new Set([...Object.keys(da), ...Object.keys(db)])) {
    const x = da[k], y = db[k];
    out.days[k] = !x ? y : !y ? x : ((y.updatedAt || 0) > (x.updatedAt || 0) ? y : x);
  }
  const sa = (a && a.settings) || {}, sb = (b && b.settings) || {};
  out.settings = (sb.updatedAt || 0) > (sa.updatedAt || 0) ? sb : sa;
  return out;
}

async function readDoc() {
  const { blobs } = await list({ prefix: 'thirtyday/' });
  const doc = blobs.find(b => b.pathname === BLOB_PATH);
  if (!doc) return null;
  const r = await fetch(doc.url + '?t=' + Date.now(), { cache: 'no-store' });
  return r.ok ? r.json() : null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!requireKey(req, res)) return;
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(503).json({ error: 'storage not configured', hint: 'Connect a Blob store to this Vercel project.' });
  try {
    if (req.method === 'GET') {
      return res.status(200).json((await readDoc()) || { days: {}, settings: {}, updatedAt: null });
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      const body = jsonBody(req);
      if (!body || typeof body.days !== 'object') return res.status(400).json({ error: 'days object required' });
      // Merge with what is stored once more, so two devices writing at the same moment never lose a day.
      let stored = null; try { stored = await readDoc(); } catch { /* nothing yet */ }
      const doc = mergeDocs(stored, body);
      doc.updatedAt = new Date().toISOString();
      const text = JSON.stringify(doc);
      if (text.length > MAX_BYTES) return res.status(413).json({ error: 'document too large' });
      await put(BLOB_PATH, text, { access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', cacheControlMaxAge: 60 });
      return res.status(200).json(doc);
    }
    res.setHeader('Allow', 'GET, PUT, POST');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: 'storage error', detail: String((err && err.message) || err) });
  }
}
