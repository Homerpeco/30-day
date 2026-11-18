// GET /api/health → which server features are configured (no secrets returned). No key needed.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    ok: true,
    syncKey: !!(process.env.SYNC_KEY || process.env.VERB_SYNC_SECRET),
    blob: !!process.env.BLOB_READ_WRITE_TOKEN,
    gemini: !!(process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY),
  });
}
