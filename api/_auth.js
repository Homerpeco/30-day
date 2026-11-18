// Every endpoint needs the SYNC_KEY password in the x-sync-key header: it protects the Blob store and the Gemini key.
export const syncKey = () => process.env.SYNC_KEY || process.env.VERB_SYNC_SECRET || '';

export function requireKey(req, res) {
  const secret = syncKey();
  if (!secret) { res.status(503).json({ error: 'sync key not configured', hint: 'Add the SYNC_KEY environment variable in Vercel and redeploy.' }); return false; }
  if (req.headers['x-sync-key'] !== secret) { res.status(401).json({ error: 'unauthorized' }); return false; }
  return true;
}

export function jsonBody(req) {
  const b = req.body;
  if (b && typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  try { return JSON.parse(Buffer.isBuffer(b) ? b.toString('utf8') : String(b || '{}')); } catch { return {}; }
}
