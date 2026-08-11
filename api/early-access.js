// =========================================================
// VAYUPORT — Early Access lead handler (OPTIONAL hidden-key proxy)
// =========================================================
// The live site currently calls Web3Forms directly from the browser
// (see assets/js/main.js), which is how Web3Forms is designed to be used —
// its access key is a public "site key", not a secret.
//
// This file is an OPTIONAL alternative for anyone who wants the access
// key to never appear in the page source at all. It's a reference
// serverless function (Vercel-style `api/*.js` routing) that reads the
// key from a server-side environment variable and forwards the request
// to Web3Forms on the visitor's behalf. It is NOT wired up by default —
// the frontend calls Web3Forms directly unless you deploy this and swap
// the fetch URL in assets/js/main.js back to '/api/early-access'.
//
// Environment variable to set on your hosting platform (never in code):
//   WEB3FORMS_ACCESS_KEY   — your Web3Forms access key

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 5; // max submissions per IP per window
const rateLimitStore = new Map(); // NOTE: in-memory only — swap for
// Redis/Upstash/KV in a real multi-instance deployment.

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

function isValidEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidPhone(value) {
  return typeof value === 'string' && /^(\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}$/.test(value.trim());
}

function sanitize(str, maxLen = 2000) {
  return String(str || '')
    .trim()
    .slice(0, maxLen)
    .replace(/[\u0000-\u001F\u007F]/g, ''); // strip control characters
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const ip =
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  if (isRateLimited(ip)) {
    res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  // Honeypot: if this hidden field is filled, silently accept without emailing.
  if (body.botcheck && String(body.botcheck).trim() !== '') {
    res.status(200).json({ success: true });
    return;
  }

  const name = sanitize(body.name, 200);
  const email = sanitize(body.email, 200);
  const phone = sanitize(body.phone, 40);
  const message = sanitize(body.message, 2000);
  const consent = body.consent === 'Yes' || body.consent === true;
  const terms = body.terms === 'Yes' || body.terms === true;

  if (!name || name.length < 2) {
    res.status(400).json({ error: 'Invalid name' });
    return;
  }
  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'Invalid email' });
    return;
  }
  if (!isValidPhone(phone)) {
    res.status(400).json({ error: 'Invalid phone number' });
    return;
  }
  if (!message || message.length < 5) {
    res.status(400).json({ error: 'Invalid message' });
    return;
  }
  if (!consent || !terms) {
    res.status(400).json({ error: 'Consent required' });
    return;
  }

  const accessKey = process.env.WEB3FORMS_ACCESS_KEY;
  if (!accessKey) {
    console.error('Missing WEB3FORMS_ACCESS_KEY environment variable.');
    res.status(500).json({ error: 'Server not configured' });
    return;
  }

  const timestamp = new Date().toISOString();

  try {
    const w3fRes = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        access_key: accessKey,
        subject: `VAYUPORT Early Access — ${name}`,
        from_name: 'VAYUPORT Website',
        name,
        email,
        phone,
        message,
        'Consent to be contacted': 'Yes',
        'Agreed to Terms & Conditions': 'Yes',
        Submitted: timestamp,
      }),
    });

    const data = await w3fRes.json();
    if (!w3fRes.ok || !data.success) {
      console.error('Web3Forms error:', data);
      res.status(502).json({ error: 'Email delivery failed' });
      return;
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Unexpected error sending lead email:', err);
    res.status(500).json({ error: 'Unexpected server error' });
  }
};

