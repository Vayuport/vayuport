// =========================================================
// VAYUPORT — shared behaviour
// =========================================================
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
    const loadVideo = () => {
      if (source && !source.getAttribute('src')) {
        source.setAttribute('src', source.getAttribute('data-src'));
        heroVideo.load();
        heroVideo.play().catch(() => {});
      }
    };
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

  /* ---- Early Access form ---- */
  const form = document.getElementById('early-access-form');
  if (form) initEarlyAccessForm(form);
});

function initEarlyAccessForm(form) {
  const submitBtn = form.querySelector('[type="submit"]');
  const statusEl = form.querySelector('.form-status');
  const successPanel = document.getElementById('ea-success');
  const formPanel = document.getElementById('ea-form-panel');

  const fields = {
    name: form.querySelector('#name'),
    email: form.querySelector('#email'),
    phone: form.querySelector('#phone'),
    message: form.querySelector('#message'),
    consent: form.querySelector('#consent'),
    terms: form.querySelector('#terms'),
  };

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // Accepts Indian numbers with optional +91, spaces/dashes, 10-digit local numbers
  const phoneRe = /^(\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}$/;

  function setError(fieldWrap, errorEl, hasError) {
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
    const allValid = results.every(Boolean);
    if (!allValid) {
      statusEl.textContent = 'Please complete the highlighted fields above.';
      const firstError = form.querySelector('.has-error input, .has-error textarea');
      if (firstError) firstError.focus();
      return;
    }

    const name = fields.name.value.trim();
    const email = fields.email.value.trim();
    const phone = fields.phone.value.trim();
    const message = fields.message.value.trim();
    const consent = fields.consent.checked ? 'Yes' : 'No';
    const terms = fields.terms.checked ? 'Yes' : 'No';
    const timestamp = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

    const payload = {
      // Web3Forms access key — this is a public "site key", not a secret
      // (Web3Forms is designed to have it exposed client-side, similar to
      // a reCAPTCHA site key). See README for the optional hidden-proxy
      // setup if you'd rather keep it out of the page source entirely.
      access_key: process.env.WEB3FORMS_ACCESS_KEY,
      subject: `VAYUPORT Early Access — ${name}`,
      from_name: 'VAYUPORT Website',
      name,
      email,
      phone,
      message,
      'Consent to be contacted': consent,
      'Agreed to Terms & Conditions': terms,
      'Submitted': timestamp,
      botcheck: form.querySelector('#company').value, // honeypot, sent as-is
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';

    try {
      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Request failed');
      showSuccess();
    } catch (err) {
      statusEl.textContent = 'Something went wrong. Please try again.';
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Request Early Access <span class="btn-arrow">→</span>';
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
