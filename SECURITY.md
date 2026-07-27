# Logicard Security Guidelines

**Status: governing document. Read this before writing or committing any code that touches auth, payments, file uploads, admin routes, member data, or anything user-supplied.**

This documents the security protocols already built into this codebase — found by audit, not invented — so they get *maintained* going forward rather than quietly eroded one commit at a time. Every rule below points at real code already in `server.js`, `database.js`, or `storage.js`. If you're adding something new, match the existing pattern; don't invent a parallel one.

---

## 1. What's already in place

**Authentication & sessions**
- Sessions are Postgres-backed (`connect-pg-simple`), not in-memory — survive restarts, can't be forged client-side.
- Cookies: `httpOnly`, `secure` in production, `sameSite: 'lax'`, 8-hour `maxAge`.
- Passwords hashed with `bcryptjs` (`hashSync`, cost 10) — never stored or logged in plain text.
- Admin login is real two-factor: correct password unlocks a `crypto.randomInt` one-time code emailed to `ADMIN_EMAIL`, expiring in 10 minutes.

**Rate limiting**
Every sensitive endpoint has its own tuned limiter — not one generic limiter reused everywhere:

| Endpoint | Window | Max |
|---|---|---|
| Login | 15 min | 5 |
| Admin login | 15 min | 2 |
| Admin OTP verify | 15 min | 3 |
| Signup | 1 hr | 5 |
| Password reset request | 1 hr | 3 |
| Contact form | 1 hr | 5 |
| Verification document upload | 1 hr | 10 |
| Work-email confirmation | 1 hr | 5 |
| CSV export OTP | 15 min | 3 |

**Injection safety**
- Every database query in `database.js` uses parameterized placeholders (`$1, $2…`) — zero string-concatenated SQL anywhere in the codebase.
- User-supplied values interpolated into HTML emails go through `escapeHtml()` first — emails render in a human inbox that still executes HTML/links, so this is a real XSS/phishing surface, not a theoretical one.
- Form fields are checked against character-allowlist regexes (`NAME_PATTERN`, `PLACE_PATTERN`, `COMPANY_PATTERN`, `PHONE_PATTERN`, `ADDRESS_PATTERN`) server-side, deliberately permissive of real-world punctuation (O'Brien, Smith & Sons) but excluding characters with no legitimate use in those fields. This is defense-in-depth alongside output escaping, not a replacement for it.

**Data exposure**
- Any endpoint returning member data explicitly strips `passwordHash`, `resetToken`, `resetTokenExpiry`, `workEmailToken`, `workEmailTokenExpiry` before the response leaves the server — never a raw DB row spread directly into JSON.

**File uploads**
- MIME-type allowlist (JPEG/PNG/WEBP/PDF only), 8MB size cap, enforced by `multer`.
- Uploaded images are downscaled/recompressed before storage.
- Storage keys are validated against path traversal (`localPathFor` in `storage.js`) before ever touching the filesystem — a key like `../../../etc/passwd` cannot resolve outside the uploads root.
- Verification documents live in a private bucket; nothing is ever exposed via a public URL — access is via short-lived signed URLs (300s default), generated only for an authenticated admin session.
- Proof-of-employment documents are auto-deleted 20 days after review (`VERIFICATION_PURGE_DAYS`) — a GDPR storage-limitation control, not just a cleanup job.

**Payments**
- Stripe PaymentIntents are created server-side; the server re-verifies `status === 'succeeded'` directly against Stripe's API before creating a member — client-reported success is never trusted on its own.

**Secrets**
- `.env` is gitignored and has never been committed.
- All credentials (`SESSION_SECRET`, `ADMIN_PASSWORD`, `RESEND_API_KEY`, `R2_*`, `STRIPE_SECRET_KEY`, `DATABASE_URL`) are Railway environment variables, never hardcoded.
- `x-powered-by` header is disabled; `trust proxy` is set correctly for Railway's reverse proxy so rate limiters see real client IPs, not the proxy's.

**Known, accepted trade-offs** — documented here so they're tracked decisions, not silently reintroduced or "fixed" as a side effect of unrelated work:
- Content-Security-Policy is currently **disabled** in `helmet()` because the site relies on inline `<script>`/`<style>` throughout. Enabling it properly requires a nonce-based rollout across every page — a deliberate project of its own, not a quick toggle.
- No Stripe **webhook** — payment confirmation relies on the client-confirm + server-verify pattern above. This is safe for a simple one-off charge but won't automatically reconcile refunds/disputes.
- Admin password/OTP comparison uses plain `!==` rather than `crypto.timingSafeEqual` — a theoretical timing-attack surface, mitigated in practice by the 2-attempts-per-15-minutes rate limit.
- `SESSION_SECRET` falls back to an insecure dev default with only a console warning if unset in production, rather than a hard startup failure.

---

## 2. Rules for every future change

**🔒 Locked — never change without explicit sign-off, even as a side effect of unrelated work**
- Session/cookie configuration (`httpOnly`, `secure`, `sameSite`, store backend).
- Password hashing approach (bcrypt, cost factor).
- The admin 2FA flow (password + emailed OTP).
- The parameterized-query-only rule for all SQL.
- The known accepted trade-offs listed above — if one of these is going to be addressed (e.g. enabling CSP), that's its own reviewed project, not a drive-by fix.

**🟡 Guided — must follow the existing pattern, explain if you deviate**
- **New endpoint that accepts user input?** Give it its own rate limiter, sized to its risk — don't skip this, and don't reuse an unrelated limiter just because one already exists.
- **New form field?** Add a character-allowlist check consistent with the existing `*_PATTERN` regexes. Never trust client-side validation alone — the server must re-check everything the client claims to have validated.
- **New data going into an HTML email or admin view?** Run it through `escapeHtml()` (or equivalent) before interpolation.
- **New endpoint returning member/user objects?** Explicitly allowlist or strip fields — never spread a raw database row into a JSON response.
- **New file upload feature?** Reuse the `storage.js` pattern (MIME allowlist, size cap, path-traversal-safe key resolution, private bucket + signed URLs). Don't write a second, parallel upload path.
- **New admin or authenticated route?** Wrap it in the existing `requireAdmin` / `requireAuth` / `requireVerified` middleware. A route is never "protected" just because its URL isn't linked anywhere.
- **New secret or API key?** Railway environment variable only. Confirm `.env` stays out of git before committing.

**🟢 Flexible — routine, no special review needed**
- Adding a new rate-limited endpoint that follows the table above (pick a window/max proportional to the existing entries).
- Adding a new validated form field using the existing pattern conventions.
- Anything that is purely additive and follows an existing, already-reviewed pattern exactly.

**When in doubt about which tier something falls into, treat it as the higher tier.**

---

## 3. Before committing

Quick self-check for any commit touching auth, payments, uploads, admin routes, or user input:
1. Does every new SQL query use parameterized placeholders — no string concatenation, ever?
2. Does every new endpoint that could be abused have a rate limiter sized to its risk?
3. Is every new piece of user input either output-escaped, character-allowlisted, or both, before it reaches an email, a page, or the database?
4. Does every new response strip secrets (hashes, tokens) before it leaves the server?
5. Is every new protected route actually wrapped in `requireAuth`/`requireAdmin`/`requireVerified`, not just unlinked?
6. If this touches one of the "known accepted trade-offs" above — is that intentional, and does it need a heads-up to the site owner rather than a silent fix?

If a change reveals that this document is out of date — a new pattern was introduced, an old one was removed — update it as part of the same piece of work. This file should always describe the codebase as it actually is.
