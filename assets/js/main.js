// =========================================================
// VAYUPORT — shared behaviour
// =========================================================

/* ---- Lead form configuration (one entry per form on the site) ----
   Web3Forms access keys are public "site keys", not secrets — they are
   designed to be exposed client-side (similar to a reCAPTCHA site key).
   See README / api/*.js for the optional hidden-key proxy setup.        */
const WEB3FORMS_ENDPOINT = 'https://api.web3forms.com/submit';

const LEAD_FORMS = {
  'early-access-form': {
    endpoint: WEB3FORMS_ENDPOINT,
    accessKey: 'b53eff0d-3878-4f49-91af-e72dfce5311f', // Early Access key
    subjectPrefix: 'VAYUPORT Early Access',
    fromName: 'VAYUPORT Website',
    buttonHtml: 'Request Early Access <span class="btn-arrow">→</span>',
    resumeLink: false,
    captcha: false,
  },
  'careers-form': {
    endpoint: WEB3FORMS_ENDPOINT,
    // "Careers API" key from your Web3Forms dashboard — paste it here.
    // If you deploy api/careers.js instead, set endpoint to '/api/careers'
    // and accessKey to null (the server adds the key).
    accessKey: 'bff89d72-4cc2-4283-911c-4b0eeed8e7a1',
    subjectPrefix: 'VAYUPORT Careers Application',
    fromName: 'VAYUPORT Careers',
    buttonHtml: 'Submit Application <span class="btn-arrow">→</span>',
    resumeLink: true, // careers page asks for a Google Drive resume link
    // Server route that checks the Drive link is public (api/check-drive.js).
    // Set to null to skip the public-access check.
    driveCheckEndpoint: '/api/check-drive',
    captcha: true, // hCaptcha via Web3Forms (enable it in the dashboard too)
  },
};

/* ---- Google Drive resume links ----
   Accepts: drive.google.com/file/d/ID/…, drive.google.com/open?id=ID,
            drive.google.com/drive/folders/ID,
            docs.google.com/document|spreadsheets|presentation/d/ID/…   */
const RESUME_MSG = {
  invalid: 'Please paste a Google Drive link to your resume.',
  private: 'This link isn’t public. In Google Drive, open Share and set General access to “Anyone with the link”, then paste the link again.',
  not_found: 'We couldn’t find a file at this link. Please check it and paste it again.',
};

function parseDriveLink(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch (e) { return null; }
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
  if ((path === '/open' || path === '/uc') && qid && /^[-\w]{20,}$/.test(qid)) return { kind: 'file', id: qid };
  return null;
}

// Asks our server whether the Drive link is public.
// Returns 'public' | 'private' | 'not_found' | 'unknown'.
// 'unknown' (Google didn't answer, or the route isn't deployed) lets the
// application through, flagged in the email, so real applicants aren't blocked.
const driveCheckCache = new Map();
async function checkDriveAccess(endpoint, link) {
  if (driveCheckCache.has(link)) return driveCheckCache.get(link);
  let status = 'unknown';
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ url: link }),
    });
    if (res.ok) {
      const data = await res.json();
      if (['public', 'private', 'not_found', 'invalid'].includes(data.status)) status = data.status;
    }
  } catch (e) { /* network error → unknown */ }
  if (status !== 'unknown') driveCheckCache.set(link, status);
  return status;
}

/* ---- hCaptcha helpers (widget is loaded by web3forms.com/client/script.js) ---- */
function getCaptchaToken(form) {
  const el = form.querySelector('textarea[name="h-captcha-response"]');
  return el ? el.value.trim() : '';
}

function setCaptchaError(hasError) {
  const wrap = document.getElementById('captcha-field');
  if (!wrap) return;
  wrap.classList.toggle('has-error', hasError);
  const errorEl = wrap.querySelector('.field-error');
  if (errorEl) errorEl.setAttribute('aria-hidden', hasError ? 'false' : 'true');
}

function resetCaptcha() {
  // Tokens are single-use, so the widget must be reset after any failed send
  try { if (window.hcaptcha) window.hcaptcha.reset(); } catch (e) { /* not loaded yet */ }
}

// Called by hCaptcha (data-callback / data-expired-callback / data-error-callback)
window.onCaptchaSolved = () => setCaptchaError(false);
window.onCaptchaExpired = () => setCaptchaError(true);
window.onCaptchaError = () => setCaptchaError(true);

document.addEventListener('DOMContentLoaded', () => {

  /* ---- Nav: background on scroll ---- */
  const nav = document.querySelector('.site-nav');
  if (nav) {
    const onScroll = () => {
      nav.classList.toggle('is-scrolled', window.scrollY > 12);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---- Nav: mobile toggle ---- */
  const navToggle = document.querySelector('.nav-toggle');
  const navLinks = document.querySelector('.nav-links');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('is-open');
      document.body.classList.toggle('nav-open', isOpen);
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('is-open');
        document.body.classList.remove('nav-open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ---- Scroll reveal ---- */
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revealEls.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.16, rootMargin: '0px 0px -60px 0px' });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('is-visible'));
  }

  /* ---- Video section: only load/play when in view (perf) ---- */
  const heroVideo = document.querySelector('[data-lazy-video]');

  if (heroVideo) {
    const source = heroVideo.querySelector('source');

    // Set video properties before loading
    heroVideo.addEventListener('loadedmetadata', () => {
      heroVideo.currentTime = 0;
      heroVideo.playbackRate = 0.8;
      heroVideo.play().catch(() => {});
    });

    // Loop video around 7 seconds
    heroVideo.addEventListener('timeupdate', () => {
      // Jump back slightly before 7s to avoid a visible pause
      if (heroVideo.currentTime >= 6.95) {
        heroVideo.currentTime = 0;
      }
    });

    const loadVideo = () => {
      if (source && !source.getAttribute('src')) {
        source.setAttribute('src', source.getAttribute('data-src'));
        heroVideo.load();
        heroVideo.play().catch(() => {});
      }
    };

    // Lazy-load video when it enters the viewport
    if ('IntersectionObserver' in window) {
      const vio = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            loadVideo();
            vio.unobserve(entry.target);
          }
        });
      }, { threshold: 0.15 });

      vio.observe(heroVideo);
    } else {
      loadVideo();
    }
  }

  /* ---- Typing animation ---- */
  const typingText = document.getElementById('typing-text');

  if (typingText) {
    const text = 'Launching Soon...';
    let index = 0;

    function typeText() {
      if (index < text.length) {
        typingText.textContent += text.charAt(index);
        index++;
        setTimeout(typeText, 250);
      }
    }

    typeText();
  }

  /* ---- Lead forms (Early Access + Careers) ---- */
  Object.keys(LEAD_FORMS).forEach(id => {
    const form = document.getElementById(id);
    if (form) initLeadForm(form, LEAD_FORMS[id]);
  });
});

function initLeadForm(form, config) {
  const submitBtn = form.querySelector('[type="submit"]');
  const statusEl = form.querySelector('.form-status');
  const successPanel = document.getElementById('ea-success');
  const formPanel = document.getElementById('ea-form-panel');

  const fields = {
    name: form.querySelector('#name'),
    email: form.querySelector('#email'),
    phone: form.querySelector('#phone'),
    message: form.querySelector('#message'),
    resume: form.querySelector('#resume'), // Google Drive link — only on careers page
    consent: form.querySelector('#consent'),
    terms: form.querySelector('#terms'),
  };

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // Accepts Indian numbers with optional +91, spaces/dashes, 10-digit local numbers
  const phoneRe = /^(\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}$/;

  function setError(fieldWrap, errorEl, hasError) {
    if (!fieldWrap) return;
    fieldWrap.classList.toggle('has-error', hasError);
    if (errorEl) errorEl.setAttribute('aria-hidden', hasError ? 'false' : 'true');
  }

  function validateField(key) {
    const el = fields[key];
    if (!el) return true;
    const wrap = el.closest('.field') || el.closest('.field-check-wrap');
    const errorEl = wrap ? wrap.querySelector('.field-error') : null;
    let valid = true;

    if (key === 'name') {
      valid = el.value.trim().length >= 2;
    } else if (key === 'email') {
      valid = emailRe.test(el.value.trim());
    } else if (key === 'phone') {
      valid = phoneRe.test(el.value.trim());
    } else if (key === 'message') {
      valid = el.value.trim().length >= 5;
    } else if (key === 'resume') {
      valid = !!parseDriveLink(el.value);
      if (errorEl) errorEl.textContent = RESUME_MSG.invalid;
    } else if (key === 'consent' || key === 'terms') {
      valid = el.checked;
    }

    setError(wrap, errorEl, !valid);
    return valid;
  }

  Object.keys(fields).forEach(key => {
    const el = fields[key];
    if (!el) return;
    const evt = (el.type === 'checkbox') ? 'change' : 'blur';
    el.addEventListener(evt, () => validateField(key));
    el.addEventListener('input', () => {
      const wrap = el.closest('.field') || el.closest('.field-check-wrap');
      if (wrap && wrap.classList.contains('has-error')) validateField(key);
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    statusEl.textContent = '';
    statusEl.classList.remove('is-ok');

    // Honeypot spam check
    const honeypot = form.querySelector('#company');
    if (honeypot && honeypot.value.trim() !== '') {
      // Silently drop — behave as if successful to not tip off bots
      showSuccess();
      return;
    }

    const results = Object.keys(fields).map(validateField);
    let captchaToken = '';
    if (config.captcha) {
      captchaToken = getCaptchaToken(form);
      const captchaOk = captchaToken !== '';
      setCaptchaError(!captchaOk);
      results.push(captchaOk);
    }
    const allValid = results.every(Boolean);
    if (!allValid) {
      statusEl.textContent = 'Please complete the highlighted fields above.';
      const firstError = form.querySelector('.has-error input:not([type="hidden"]), .has-error textarea:not([name="h-captcha-response"])');
      if (firstError) {
        firstError.focus();
      } else {
        const captchaWrap = document.getElementById('captcha-field');
        if (captchaWrap) captchaWrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    // Check the Drive link is publicly viewable (server-side, see api/check-drive.js)
    let resumeAccess = '';
    if (config.resumeLink && config.driveCheckEndpoint && fields.resume) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Checking link…';
      resumeAccess = await checkDriveAccess(config.driveCheckEndpoint, fields.resume.value.trim());

      if (resumeAccess === 'private' || resumeAccess === 'not_found' || resumeAccess === 'invalid') {
        const wrap = fields.resume.closest('.field');
        const errorEl = wrap.querySelector('.field-error');
        errorEl.textContent = RESUME_MSG[resumeAccess] || RESUME_MSG.invalid;
        setError(wrap, errorEl, true);
        statusEl.textContent = 'Please fix your resume link.';
        submitBtn.disabled = false;
        submitBtn.innerHTML = config.buttonHtml;
        fields.resume.focus();
        return;
      }
    }

    const name = fields.name.value.trim();
    const email = fields.email.value.trim();
    const phone = fields.phone.value.trim();
    const message = fields.message.value.trim();
    const consent = fields.consent.checked ? 'Yes' : 'No';
    const terms = fields.terms.checked ? 'Yes' : 'No';
    const timestamp = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

    const payload = {
      subject: `${config.subjectPrefix} — ${name}`,
      from_name: config.fromName,
      name,
      email,
      phone,
      message,
      'Consent to be contacted': consent,
      'Agreed to Terms & Conditions': terms,
      'Submitted': timestamp,
      botcheck: honeypot ? honeypot.value : '', // honeypot, sent as-is
    };
    if (config.accessKey) payload.access_key = config.accessKey;
    if (config.resumeLink && fields.resume) {
      payload['Resume link'] = fields.resume.value.trim();
      if (config.driveCheckEndpoint) {
        payload['Resume access'] = resumeAccess === 'public'
          ? 'Public (verified)'
          : 'Not verified — open the link to confirm access';
      }
    }
    if (config.captcha) payload['h-captcha-response'] = captchaToken;

    const request = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';

    try {
      const res = await fetch(config.endpoint, request);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || data.error || 'Request failed');
      showSuccess();
    } catch (err) {
      const isCaptchaErr = /captcha/i.test(err.message || '');
      statusEl.textContent = isCaptchaErr
        ? 'Captcha verification failed. Please complete the captcha again.'
        : 'Something went wrong. Please try again.';
      if (config.captcha) {
        resetCaptcha();
        if (isCaptchaErr) setCaptchaError(true);
      }
      submitBtn.disabled = false;
      submitBtn.innerHTML = config.buttonHtml;
    }
  });

  function showSuccess() {
    if (formPanel) formPanel.style.display = 'none';
    if (successPanel) {
      successPanel.classList.add('is-visible');
      successPanel.setAttribute('tabindex', '-1');
      successPanel.focus();
    }
  }
}