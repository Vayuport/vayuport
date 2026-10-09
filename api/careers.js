// =========================================================
// VAYUPORT — Careers application handler (hidden-key proxy)
// =========================================================
// The browser sends the careers form here (endpoint: '/api/careers' in
// assets/js/main.js). This function adds the Web3Forms key on the server,
// so the key never appears in the page source or the Network tab.
//
// Environment variable (set in .env locally and in Vercel → Settings →
// Environment Variables):
//   WEB3FORMS_CAREERS_ACCESS_KEY  — your "Careers API" Web3Forms key

const { parseDriveLink, checkDriveAccess } = require('./_drive');

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 3; // max applications per IP per window
const rateLimitStore = new Map(); // in-memory only (resets per instance)

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

function fail(res, status, message) {
  // main.js reads `success` and `message`
  res.status(status).json({ success: false, message });
}

function istTimestamp() {
  return new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');

  const ip =
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  if (isRateLimited(ip)) return fail(res, 429, 'Too many requests. Please try again shortly.');

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  // Honeypot: if this hidden field is filled, silently accept without emailing.
  if (body.botcheck && String(body.botcheck).trim() !== '') {
    return res.status(200).json({ success: true });
  }

  const name = sanitize(body.name, 200);
  const email = sanitize(body.email, 200);
  const phone = sanitize(body.phone, 40);
  const message = sanitize(body.message, 2000);
  const resumeLink = sanitize(body['Resume link'], 500);
  const hCaptchaToken = sanitize(body['h-captcha-response'], 10_000);
  const consent = body['Consent to be contacted'] === 'Yes';
  const terms = body['Agreed to Terms & Conditions'] === 'Yes';

  if (name.length < 2) return fail(res, 400, 'Invalid name');
  if (!isValidEmail(email)) return fail(res, 400, 'Invalid email');
  if (!isValidPhone(phone)) return fail(res, 400, 'Invalid phone number');
  if (message.length < 5) return fail(res, 400, 'Invalid message');
  const drive = parseDriveLink(resumeLink);
  if (!drive) return fail(res, 400, 'Resume must be a Google Drive link');
  if (!consent || !terms) return fail(res, 400, 'Consent required');
  if (!hCaptchaToken) return fail(res, 400, 'Captcha required');

  // Re-check on the server: the link must be publicly viewable
  const access = await checkDriveAccess(drive);
  if (access === 'private') return fail(res, 400, 'Resume link is not public');
  if (access === 'not_found') return fail(res, 400, 'Resume link not found');

  const accessKey = process.env.WEB3FORMS_CAREERS_KEY;
  if (!accessKey) {
    console.error('Missing WEB3FORMS_CAREERS_KEY environment variable.');
    return fail(res, 500, 'Server not configured');
  }

  try {
    const w3fRes = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
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
        Submitted: istTimestamp(),
        'h-captcha-response': hCaptchaToken,
      }),
    });

    const data = await w3fRes.json().catch(() => ({}));
    if (!w3fRes.ok || !data.success) {
      console.error('Web3Forms error:', w3fRes.status, data);
      if (/captcha/i.test(data.message || '')) return fail(res, 400, 'Captcha verification failed');
      return fail(res, 502, 'Email delivery failed');
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Unexpected error sending application email:', err);
    return fail(res, 500, 'Unexpected server error');
  }
};