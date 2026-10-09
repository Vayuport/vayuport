// =========================================================
// VAYUPORT — Google Drive link helpers (shared, not a route)
// =========================================================
// Files in /api that start with "_" are NOT deployed as endpoints by
// Vercel, so this is only used by api/check-drive.js and api/careers.js.

const ALLOWED_HOSTS = new Set(['drive.google.com', 'docs.google.com']);
const ID_RE = /^[-\w]{20,}$/;

// Returns { kind, id } for a Google Drive / Docs link, or null.
function parseDriveLink(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase();
  const path = u.pathname;
  let m;

  if (host === 'docs.google.com') {
    m = path.match(/^\/(document|spreadsheets|presentation)\/d\/([-\w]{20,})/);
    return m ? { kind: m[1], id: m[2] } : null;
  }
  if (host !== 'drive.google.com') return null;

  if ((m = path.match(/\/file\/d\/([-\w]{20,})/))) return { kind: 'file', id: m[1] };
  if ((m = path.match(/\/folders\/([-\w]{20,})/))) return { kind: 'folder', id: m[1] };
  const qid = u.searchParams.get('id');
  if ((path === '/open' || path === '/uc') && qid && ID_RE.test(qid)) return { kind: 'file', id: qid };
  return null;
}

// We only ever request URLs we build ourselves from a validated ID.
function canonicalUrl({ kind, id }) {
  if (kind === 'file') return `https://drive.google.com/file/d/${id}/view`;
  if (kind === 'folder') return `https://drive.google.com/drive/folders/${id}`;
  return `https://docs.google.com/${kind}/d/${id}/edit`;
}

// Checks the link as a logged-out visitor would see it:
//   200                         → 'public'
//   redirect to accounts.google → 'private' (sign-in / request access)
//   404                         → 'not_found'
//   anything else / timeout     → 'unknown'
async function checkDriveAccess(parsed, { timeoutMs = 6000 } = {}) {
  let url = canonicalUrl(parsed);

  for (let hop = 0; hop < 4; hop++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let r;
    try {
      r = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        signal: ctrl.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
          Accept: 'text/html',
        },
      });
    } catch {
      return 'unknown';
    } finally {
      clearTimeout(timer);
    }
    try { await r.body?.cancel(); } catch { /* ignore */ }

    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get('location');
      if (!loc) return 'unknown';
      let next;
      try { next = new URL(loc, url); } catch { return 'unknown'; }
      const host = next.hostname.toLowerCase();
      if (host === 'accounts.google.com') return 'private';
      if (!ALLOWED_HOSTS.has(host)) return 'unknown'; // never follow elsewhere
      url = next.toString();
      continue;
    }
    if (r.status === 200) return 'public';
    if (r.status === 404) return 'not_found';
    if (r.status === 401 || r.status === 403) return 'private';
    return 'unknown';
  }
  return 'unknown';
}

module.exports = { parseDriveLink, checkDriveAccess };