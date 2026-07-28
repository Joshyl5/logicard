# Logicard Brand Book

**Status: governing document. Read this before any visual, structural, or copy change to logicard.co.uk.**

This file exists so that Logicard stays recognisably itself as the site grows — across new category pages, the weekly quiz, brand partnerships, and whoever picks up this codebase next (including a future Claude Code session). It is not a formality: several inconsistencies fixed during development this year (a header colour drifting page-by-page, icons rendered invisible by an untracked theme change) happened specifically because there was no single place rules were written down. This is that place.

---

## 1. Who this is for

**Primary audience:** the UK's ~2.8 million logistics workers — HGV drivers, warehouse and fulfilment staff, transport planners, fleet management, freight and ports, plus retired members of the industry. Often reading mid-shift, tired, on a phone, with no patience for fluff.

**Secondary audience:** brands and advertisers who want to reach that audience through Logicard — sponsorship, partner offers, workforce recognition partnerships.

**Product surface:** discount membership (£10/year, FREE promo code for year 1), workforce wellbeing content, employer workforce-recognition partnerships, and a weekly 10-question quiz paying cashback to members who answer all 10 correctly.

Design and copy decisions should be checked against this list first: does it respect a tired reader's time? Does it hold up if a brand partner sees it? Does it fit a fun weekly quiz as easily as a legal document?

---

## 2. Voice and tone

**Three traits, one voice:** direct, warm, and allergic to corporate speak. Write like a colleague who happens to know where the good deals are — not a marketing department.

- **Direct.** Lead with the number, the saving, the deadline. Personality comes after clarity, not instead of it.
- **Warm, not saccharine.** Acknowledge the graft without being patronising. "For the people who keep Britain moving" is the reference point — respectful, not gushing.
- **No corporate jargon.** No "synergy," "leverage," "solutions," "passionate community of road warriors." If a sentence would fit in a corporate all-hands deck, rewrite it.

**One voice, not two registers.** The brand-facing copy (pitching partners, employers, advertisers) trades warmth for *credibility* — real numbers, real reach ("2.8 million UK logistics workers," not vague enthusiasm) — but it is not a different personality. If the B2B copy and the member-facing copy start to read like two different companies, that's the signal something has drifted.

**The quiz is the one deliberate exception.** It's a lighter, competitive, watercooler feature, so it can carry more energy than a discount page: *"Reckon you know your stuff? Nail all 10, walk away with cash."* Still no fluff — just more cheek.

**The failure mode to actively avoid:** a "geezer" / white-van-man caricature. The workforce is far broader than that stereotype — warehouse staff, ops, admin, retired members, women in logistics — and a caricatured voice reads as patronising to most of the 2.8 million rather than authentic to any of it. Plain-spoken and warm covers the same ground without the risk.

**Quick check before publishing copy:** would you say this out loud to a driver on their break? If it sounds like a press release, rewrite it. If it sounds like it's doing an impression of "blokey," rewrite it.

---

## 3. Visual identity

### Colour palette
The palette is navy-and-gold, full stop. As of 2026-07, the homepage was swept to remove every near-black/deep-navy background and the blue secondary accent — every section is either flat navy or flat/gradient gold, no exceptions.

| Token | Hex | Use |
|---|---|---|
| `--navy` | `#071d40` | Section backgrounds, cards, buttons that sit on a gold section |
| `--navy-deep` | `#071d40` (alias of `--navy`) | Kept for backwards compatibility only — no longer a distinct near-black value. Do not reintroduce a near-black background anywhere. |
| `--navy-mid` | `#0d3b80` | Hover state / secondary panels, always paired with navy, never used as a section background on its own |
| `--orange` / `--gold` | `#FFB300` | Primary accent — CTAs, highlights, the word "card" in the logo, gold section backgrounds |
| `--orange-dark` | `#E09A00` | Hover/active state for gold elements |
| `--blue-accent` | `#1a6cc8` | **Retired.** Previously used sparingly in the founders section (badge + icons); that section is now gold-accented like the rest of the site. The variable is kept defined but unused — do not reintroduce it as a section accent. |
| `--white` | `#ffffff` | Text on navy, card backgrounds |

**Homepage section colour rule:** every `<section>` background is either flat `var(--navy)` or the gold gradient `linear-gradient(135deg, #FF8C00 0%, #FFB800 55%, #FF9200 100%)`. No section uses a multi-stop navy gradient, a radial glow, a dot-grid texture, or a starfield canvas — those decorative effects were removed sitewide in favour of flat, consistent colour blocks.

**Sections strictly alternate navy → gold → navy → gold, starting navy at the Hero, all the way to Contact.** Current order: Hero (navy) → Photo Wall (gold) → Everything you need (navy) → How it works (gold) → Who Qualifies (navy) → Built by logistics workers (gold) → Our Partners (navy) → Member benefits/pricing (gold) → Driver Support (navy) → About Us (gold) → FAQs (navy) → CTA banner (gold) → Contact (navy). The header and footer sit outside this rhythm and are always navy, bookending the page. When adding, removing, or reordering a homepage section, re-derive this alternation rather than guessing a colour — inserting or deleting a section shifts every colour below it.

Section vertical padding is normalised to ~88px top/bottom on desktop so no section reads as conspicuously shorter or taller than its neighbours (Photo Wall is the one deliberate exception — its height is driven by the tile grid, not padding).

**Button contrast rule:** a button's fill always contrasts with the section it sits in — gold-filled buttons on a navy section, navy-filled buttons on a gold section (see `.cat-btn` and `.cta-section .btn-primary` for navy-on-gold examples). Never place a gold button on a gold section or a navy button on a navy section. This also applies to badges/icon chips that sit directly on a section background (see founders-badge), though accent chips *inside* an already-flipped card (e.g. the gold icon inside a navy `.founder-point` card) follow the card's contrast, not the section's.

**Rule:** gold is the *only* accent colour used for calls to action. If a page needs a second accent, it borrows `--blue-accent` deliberately and sparingly — it never competes with gold for attention in the same view.

### Logo
- Wordmark: "Logi" in white, "card" in gold, set in a bordered pill on a navy background with a soft gold glow border (`rgba(255,179,0,0.55)` border, subtle box-shadow glow). This is the header/UI lockup — used everywhere the header appears.
- Illustrated mark: the cloud-and-truck logo (with the percentage badge and price tag) is the marketing/social asset — hero banners, email headers, social previews. It is not a replacement for the wordmark in the site header.
- Never recolour either version. Never place the wordmark on a light/white background without inverting it properly first — it's designed for navy.

### Typography
- **Raleway** — brand/display headlines (`--font-brand`).
- **Inter** — everything else: body copy, UI, forms, buttons (`--font`).
- Don't introduce a third typeface. If a new page needs a "different feel," that's a layout or colour decision, not a font decision.

### Iconography
- Line icons only: 24×24 viewbox, `stroke-width` 1.8–2, `stroke-linecap`/`stroke-linejoin` round, `fill: none`.
- **Never rely on unstyled `stroke="currentColor"` inside a white or light-background card without explicitly setting a colour.** This exact bug (icons inheriting white text colour and turning invisible on a white card) shipped once already — see `.deal-card-icon svg` / `.support-card svg` in `public/index.html` for the fix and the comment explaining it.
- New icons should match the existing set's weight and rounding, not be dropped in from a different icon library.

---

## 4. The Rules Scale

Not every rule carries the same weight. Use this scale to judge how much justification a change needs before it ships — and to know when to stop and ask the site owner first, rather than deciding alone.

### 🔒 Tier 1 — Locked
**Requires explicit sign-off from the site owner before changing. Do not change these as a side effect of an unrelated task.**
- The colour palette hex values above.
- The logo lockup (colours, "Logi"/"card" split, pill treatment).
- The core voice traits in Section 2 (direct, warm, no corporate jargon, no caricature).
- The £10/year price point and the FREE promo mechanic, wherever stated.
- Legal and compliance copy — Privacy Policy, Terms & Conditions, the complaints process, consent checkbox wording. These were written deliberately to match actual system behaviour (e.g. the 20-day document purge window) — a copy edit here can silently create a compliance gap.

### 🟡 Tier 2 — Guided
**Can change, but the change should be deliberate and explainable — flag the reasoning when you make it, don't change it quietly.**
- Page layouts and new page structures.
- New icons (must match the existing line-icon style in Section 3).
- Navigation structure (adding/removing nav items, dropdowns).
- Tone register for a genuinely new feature (e.g. establishing the quiz's voice for the first time) — reference Section 2, then document the decision here or in the relevant page.
- New category pages and what they link to.

### 🟢 Tier 3 — Flexible
**Encouraged to iterate freely, no sign-off needed.**
- Individual card copy/descriptions within an established template.
- Weekly quiz question content.
- Seasonal promotional copy (e.g. the monthly giveaway prize).
- Marketing email subject lines.
- Minor spacing/padding adjustments within an existing component.

**When in doubt about which tier something falls into, treat it as the higher tier.**

---

## 5. Using this document

Before making a visual, structural, or copy change to logicard.co.uk:
1. Check whether the change touches a Tier 1 item. If so, confirm with the site owner before proceeding, even if the request seems small.
2. If it's Tier 2, make the change but say what you changed and why, so it's easy to review.
3. If it's Tier 3, proceed freely.
4. If a change reveals that this document is wrong or out of date, update it in the same piece of work — this file should always describe the site as it actually is, not as it was when first written.
