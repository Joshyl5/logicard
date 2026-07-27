# Logicard — Project Instructions

## Governance — read these first

**Before making any visual, structural, or copy change to logicard.co.uk (any file under `public/` or `views/`, plus email templates in `server.js`), read `BRAND.md` in this repo root.** A designed, human-readable copy of the same content also lives at `brand-book.html` — open it in a browser if you want the visual version.

**Before writing or committing any code touching auth, payments, file uploads, admin routes, or user-supplied data, read `SECURITY.md` in this repo root.**

`BRAND.md` defines the brand's voice, visual identity (colour palette, logo, typography, icon style), and a three-tier "Rules Scale" that governs how much justification a design/copy change needs:

- **🔒 Tier 1 (Locked)** — colour palette, logo lockup, core voice, the £10/year price point, legal/compliance copy. Confirm with the site owner before changing any of these, even if the request seems minor.
- **🟡 Tier 2 (Guided)** — layouts, new icons, nav structure, tone for new features. Can change, but explain what changed and why.
- **🟢 Tier 3 (Flexible)** — card copy, quiz questions, seasonal promo wording, email subject lines. Change freely.

`SECURITY.md` documents the security protocols already built into this codebase (session/auth config, rate limiting per endpoint, parameterized-query-only SQL, file-upload safeguards, secrets handling) using the same three-tier scale, plus a pre-commit checklist for anything touching those areas.

If a task looks like it touches a Tier 1 item in either document, say so and confirm before proceeding rather than deciding alone.

If something in `BRAND.md` or `SECURITY.md` turns out to be stale (a colour, a rule, a protocol, a described behaviour that no longer matches the live code), update it as part of the same piece of work — both should always describe the site as it actually is.

## Stack notes
- Node/Express (`server.js`) + PostgreSQL (`database.js`), deployed on Railway, Cloudflare DNS.
- Public marketing pages live in `public/` as standalone HTML files with inline `<style>` blocks (no shared stylesheet yet — see `BRAND.md` §3 for the icon-colour bug this has already caused once).
- The authenticated member/admin area (`views/`, `public/signup.html`, `public/login.html`, etc.) shares `public/styles.css`.
- Git commits: only commit when the user explicitly says "commit" / "commit and push" — then push without asking again, per established pattern.
