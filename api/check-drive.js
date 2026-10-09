// =========================================================
// VAYUPORT — Google Drive public-link check
// =========================================================
// POST { url } → { status: 'public' | 'private' | 'not_found' | 'invalid' | 'unknown' }
// Used by the careers form (assets/js/main.js) before submitting.
// The browser can't check this itself (Google blocks cross-site requests),
// so this function fetches the link as a logged-out visitor.

const { parseDriveLink, checkDriveAccess } = require('./_drive');

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20; // checks per IP per minute
const rateLimitStore = new Map(); // in-memory; fine for this use

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitStore.get(ip) || { count: 0, windowStart: now };
  if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    entry.count = 0;
    entry.windowStart = now;
  }
  entry.count += 1;
  rateLimitStore.set(ip, entry);
  return entry.count > RATE_LIMIT_MAX;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const ip =
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown';
  if (isRateLimited(ip)) {
    res.status(429).json({ error: 'Too many requests' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const raw = String((body && body.url) || '').slice(0, 500);

  const parsed = parseDriveLink(raw);
  if (!parsed) {
    res.status(200).json({ status: 'invalid' });
    return;
  }

  const status = await checkDriveAccess(parsed);
  res.status(200).json({ status });
};