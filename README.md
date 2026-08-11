# VAYUPORT — Pre-Launch Website

A static, responsive pre-launch site for VAYUPORT: hero, continuous air-taxi
video showcase, an Early Access lead-capture page, and a Terms & Conditions
page.

## Structure

```
index.html                  Home (hero, video, statement, CTA, footer)
early-access.html           Early Access lead form + success state
terms-and-conditions.html   Placeholder legal copy
assets/css/style.css        All styling (design tokens at the top)
assets/js/main.js           Nav, scroll reveal, lazy video, form logic
assets/img/                 Logo, hero background, video poster
assets/video/                Compressed looping air-taxi clip
api/early-access.js         REFERENCE serverless function (see below)
```

Open `index.html` directly in a browser to preview the design. The Early
Access form will validate correctly, but sending won't complete until you
deploy the backend piece described below — that's intentional, since a
frontend-only site should never hold email credentials.

## Wiring up the Early Access form

**This works out of the box — no deployment needed.** The form posts
directly to [Web3Forms](https://web3forms.com) from the browser, using the
access key already in `assets/js/main.js`. Web3Forms access keys are
designed to be public — like a reCAPTCHA site key — so having it visible
in the frontend code is expected and not a security issue. Submissions
arrive at the inbox tied to that access key with the visitor's name,
email, phone, message, consent answers, and a timestamp.

### If you'd rather the key never appear in the page source

`api/early-access.js` is an optional reference serverless function that
keeps the key entirely server-side. To use it:

1. Deploy this project to a platform that runs serverless functions
   (Vercel, Netlify, AWS Lambda, etc.).
2. Set `WEB3FORMS_ACCESS_KEY` as an environment variable on that
   platform's dashboard (see `.env.example` — never commit a real `.env`
   file).
3. In `assets/js/main.js`, change the `fetch()` URL from
   `https://api.web3forms.com/submit` to `/api/early-access`, and drop the
   `access_key` field from the payload (the server adds it instead).

The function validates and sanitizes every field server-side, includes a
honeypot check and simple in-memory rate limiting (swap for Redis/Upstash
in a real multi-instance deployment), and never logs or returns secrets.

## Before publishing

- Replace the `#` placeholders in the footer social links with VAYUPORT's
  real Instagram, X and LinkedIn profile URLs.
- Have the Terms & Conditions content reviewed by legal counsel — it's
  clearly labeled as placeholder copy and does not include fabricated
  registration details, addresses, or governing law.
- Swap the Google Fonts CDN links for self-hosted fonts if you want to
  remove the third-party request entirely.
