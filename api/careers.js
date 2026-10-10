// =========================================================
// VAYUPORT — Careers application handler (OPTIONAL hidden-key proxy)
// =========================================================
// The live site calls Web3Forms directly from the browser (see the
// 'careers-form' entry in assets/js/main.js). This file is an OPTIONAL
// alternative that keeps the Careers access key out of the page source.
//
// To use it, set the careers-form config in assets/js/main.js to:
//   endpoint: '/api/careers',  accessKey: null
//
// Environment variable (never in code):
//   WEB3FORMS_CAREERS_ACCESS_KEY  — your "Careers API" Web3Forms key

const { parseDriveLink, checkDriveAccess } = require('./_drive');

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 3; // max applications per IP per window
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
  const resumeLink = sanitize(body['Resume link'], 500);
  const hCaptchaToken = sanitize(body['h-captcha-response'], 10_000);
  const consent = body['Consent to be contacted'] === 'Yes';
  const terms = body['Agreed to Terms & Conditions'] === 'Yes';

  if (!name || name.length < 2) { res.status(400).json({ error: 'Invalid name' }); return; }
  if (!isValidEmail(email)) { res.status(400).json({ error: 'Invalid email' }); return; }
  if (!isValidPhone(phone)) { res.status(400).json({ error: 'Invalid phone number' }); return; }
  if (!message || message.length < 5) { res.status(400).json({ error: 'Invalid message' }); return; }
  const drive = parseDriveLink(resumeLink);
  if (!drive) { res.status(400).json({ error: 'Resume must be a Google Drive link' }); return; }
  if (!consent || !terms) { res.status(400).json({ error: 'Consent required' }); return; }
  if (!hCaptchaToken) { res.status(400).json({ error: 'Captcha required' }); return; }

  // Re-check on the server: the link must be publicly viewable
  const access = await checkDriveAccess(drive);
  if (access === 'private') { res.status(400).json({ error: 'Resume link is not public' }); return; }
  if (access === 'not_found') { res.status(400).json({ error: 'Resume link not found' }); return; }

  const accessKey = process.env.WEB3FORMS_CAREERS_ACCESS_KEY;
  if (!accessKey) {
    console.error('Missing WEB3FORMS_CAREERS_ACCESS_KEY environment variable.');
    res.status(500).json({ error: 'Server not configured' });
    return;
  }

  try {
    const w3fRes = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        access_key: accessKey,
        subject: `VAYUPORT Careers Application — ${name}`,
        from_name: 'VAYUPORT Careers',
        name,
        email,
        phone,
        message,
        'Resume link': resumeLink,
        'Resume access': access === 'public'
          ? 'Public (verified)'
          : 'Not verified — open the link to confirm access',
        'Consent to be contacted': 'Yes',
        'Agreed to Terms & Conditions': 'Yes',
        Submitted: new Date().toISOString(),
        'h-captcha-response': hCaptchaToken,
      }),
    });

    const data = await w3fRes.json();
    if (!w3fRes.ok || !data.success) {
      console.error('Web3Forms error:', data);
      if (/captcha/i.test(data.message || '')) {
        res.status(400).json({ error: 'Captcha verification failed' });
        return;
      }
      res.status(502).json({ error: 'Email delivery failed' });
      return;
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Unexpected error sending application email:', err);
    res.status(500).json({ error: 'Unexpected server error' });
  }
};