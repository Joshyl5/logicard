const { renderNav } = require('./nav');

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

// One auto-generated public page per offer's merchant, reached at the site
// root (e.g. /gousto) — no admin setup needed, unlike partner_brands'
// /deals/:slug. Public/pre-login: shows the same teaser shape as the
// homepage's Featured Deals (no real voucher code or affiliate URL —
// those stay gated behind signing up and verifying, same as everywhere
// else). The "code" shown here is a generic masked placeholder, not a
// partial reveal of the real one.
function renderOfferPage({ offer }) {
  const title       = `${offer.title} — ${offer.merchantName} | Logicard`;
  const description = offer.description
    ? `${offer.description} Exclusive to Logicard members — the UK's discount card for logistics workers.`
    : `${offer.discountText || 'Exclusive member discount'} at ${offer.merchantName} — only for Logicard members.`;
  const canonical = `https://logicard.co.uk/${escapeHtml(offer.slug)}`;
  const initial   = (offer.merchantName || '?').trim().charAt(0).toUpperCase();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${canonical}" />
  <link rel="icon" href="/favicon.svg?v=3" type="image/svg+xml" />
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "${escapeHtml(title)}",
    "url": "${canonical}",
    "description": "${escapeHtml(description)}",
    "isPartOf": { "@id": "https://logicard.co.uk/#website" }
  }
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/nav.css?v=7" />
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --navy: #0a0a0a; --navy-mid: #1f1f1f; --orange: #FFB300; --orange-dark: #E09A00;
      --white: #ffffff; --text-muted: #5b6577;
    }
    body { font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; background: var(--navy); color: var(--white); -webkit-font-smoothing: antialiased; }
    a { color: inherit; }

    .op-wrap { max-width: 1080px; margin: 0 auto; padding: 24px 24px 80px; }
    .op-crumb { font-size: 13px; color: rgba(255,255,255,0.75); margin-bottom: 24px; }
    .op-crumb a { text-decoration: none; color: rgba(255,255,255,0.9); }
    .op-crumb a:hover { color: var(--orange); }
    .op-crumb span { margin: 0 6px; }

    .op-grid { display: grid; grid-template-columns: 1.7fr 1fr; gap: 28px; align-items: start; }

    .op-main { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 18px; padding: 32px; }
    .op-brand-row { display: flex; align-items: center; gap: 14px; margin-bottom: 22px; }
    .op-logo {
      width: 56px; height: 56px; flex-shrink: 0; background: var(--white); color: var(--navy);
      border-radius: 12px; display: flex; align-items: center; justify-content: center;
      font-size: 22px; font-weight: 900;
    }
    .op-brand-name { font-size: 15px; font-weight: 800; margin-bottom: 6px; }
    .op-badge {
      display: inline-block; font-size: 11.5px; font-weight: 700; letter-spacing: 0.2px;
      background: rgba(255,179,0,0.15); color: var(--orange);
      padding: 4px 10px; border-radius: 100px;
    }
    .op-title { font-size: clamp(24px, 3vw, 34px); font-weight: 900; letter-spacing: -0.5px; margin-bottom: 14px; }
    .op-members-row { display: flex; align-items: center; gap: 10px; margin-bottom: 22px; font-size: 14px; }
    .op-members-tag { display: inline-flex; align-items: center; gap: 6px; color: var(--orange); font-weight: 800; }
    .op-members-row .op-join { color: rgba(255,255,255,0.75); }
    .op-image { width: 100%; border-radius: 14px; overflow: hidden; margin-bottom: 22px; aspect-ratio: 16 / 8; background: rgba(255,255,255,0.05); }
    .op-image img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .op-image-fallback { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 44px; font-weight: 900; color: rgba(255,179,0,0.35); }
    .op-desc { font-size: 15px; color: rgba(255,255,255,0.9); line-height: 1.7; margin-bottom: 20px; }
    .op-tags { display: flex; flex-wrap: wrap; gap: 8px; }
    .op-tag { font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.9); background: rgba(255,255,255,0.06); padding: 6px 12px; border-radius: 100px; }

    .op-side { position: sticky; top: 20px; display: flex; flex-direction: column; gap: 16px; }
    .op-redeem { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 24px; }
    .op-redeem-head { display: flex; align-items: center; gap: 8px; color: var(--orange); font-weight: 800; font-size: 13px; letter-spacing: 0.3px; text-transform: uppercase; margin-bottom: 16px; }
    .op-code-box { background: rgba(5,5,5,0.6); border: 1px dashed rgba(255,179,0,0.4); border-radius: 10px; padding: 14px 16px; margin-bottom: 14px; }
    .op-code-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 4px; }
    .op-code-masked { font-family: monospace; font-size: 15px; font-weight: 700; letter-spacing: 2px; color: rgba(255,255,255,0.9); }
    .op-code-discount { font-size: 13px; font-weight: 800; color: var(--orange); }
    .op-code-unlock { font-size: 12.5px; color: rgba(255,255,255,0.75); }
    .op-redeem-note { font-size: 13.5px; color: rgba(255,255,255,0.9); line-height: 1.6; margin-bottom: 18px; }
    .op-claim-btn {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      width: 100%; background: var(--orange); color: var(--navy);
      padding: 15px; font-weight: 900; font-size: 15px; border-radius: 100px;
      text-decoration: none; border: none; cursor: pointer;
      transition: background 0.15s, transform 0.1s;
    }
    .op-claim-btn:hover { background: var(--orange-dark); transform: translateY(-1px); }
    .op-join-note { display: block; text-align: center; font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.9); margin-top: 12px; }
    .op-ongoing { display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 16px 18px; font-size: 13.5px; color: rgba(255,255,255,0.9); }

    @media (max-width: 820px) {
      .op-grid { grid-template-columns: 1fr; }
      .op-side { position: static; }
    }

    .op-back { display: block; text-align: center; padding: 0 24px 56px; color: rgba(255,255,255,0.75); text-decoration: none; font-size: 14px; font-weight: 600; }
    .op-back:hover { color: var(--white); }
  </style>
</head>
<body>

  <!-- SHARED_NAV -->

  <div class="op-wrap">
    <p class="op-crumb">
      <a href="/categories.html">Deals</a>
      ${offer.category ? `<span>&rsaquo;</span><a href="/categories.html">${escapeHtml(offer.category)}</a>` : ''}
      <span>&rsaquo;</span>${escapeHtml(offer.title)}
    </p>

    <div class="op-grid">
      <div class="op-main">
        <div class="op-brand-row">
          <div class="op-logo">${escapeHtml(initial)}</div>
          <div>
            <div class="op-brand-name">${escapeHtml(offer.merchantName)}</div>
            ${offer.category ? `<span class="op-badge">${escapeHtml(offer.category)}</span>` : ''}
          </div>
        </div>

        <h1 class="op-title">${escapeHtml(offer.title)}</h1>

        <div class="op-members-row">
          <span class="op-members-tag">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41L11 3.83A2 2 0 009.6 3.24H4a1 1 0 00-1 1v5.6a2 2 0 00.59 1.41l9.58 9.58a2 2 0 002.82 0l4.6-4.6a2 2 0 000-2.82z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>
            Members Only
          </span>
          <a href="/signup.html" class="op-join">Join to unlock &rarr;</a>
        </div>

        <div class="op-image">
          ${offer.imageUrl
            ? `<img src="${escapeHtml(offer.imageUrl)}" alt="${escapeHtml(offer.merchantName)}" loading="lazy" />`
            : `<div class="op-image-fallback">${escapeHtml(initial)}</div>`}
        </div>

        ${offer.description ? `<p class="op-desc">${escapeHtml(offer.description)}</p>` : ''}

        <div class="op-tags">
          ${offer.category ? `<span class="op-tag">${escapeHtml(offer.category)}</span>` : ''}
          <span class="op-tag">Exclusive to Logicard</span>
        </div>
      </div>

      <div class="op-side">
        <div class="op-redeem">
          <div class="op-redeem-head">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            How to redeem
          </div>

          <div class="op-code-box">
            <div class="op-code-row">
              <span class="op-code-masked">&bull;&bull;&bull;&bull;&bull;&bull;</span>
              ${offer.discountText ? `<span class="op-code-discount">${escapeHtml(offer.discountText)}</span>` : ''}
            </div>
            <span class="op-code-unlock">Join to unlock full code</span>
          </div>

          <p class="op-redeem-note">Sign up free, verify you work in logistics, then reveal your code and get deal on ${escapeHtml(offer.merchantName)}'s site.</p>

          <a href="/signup.html" class="op-claim-btn">
            Get Deal
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </a>
          <span class="op-join-note">Join Logicard to unlock</span>
        </div>

        <div class="op-ongoing">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          No end date — ongoing offer
        </div>
      </div>
    </div>
  </div>

  <a href="/categories.html" class="op-back">&larr; Back to all deals</a>

</body>
</html>`;
}

function renderOfferNotFound() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Offer Not Found — Logicard</title>
  <meta name="robots" content="noindex" />
  <link rel="icon" href="/favicon.svg?v=3" type="image/svg+xml" />
  <link rel="stylesheet" href="/nav.css?v=7" />
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; background: #0a0a0a; color: #fff; }
    .nf { text-align: center; padding: 120px 24px; }
    .nf h1 { font-size: 32px; font-weight: 900; margin-bottom: 14px; }
    .nf p { color: rgba(255,255,255,0.9); margin-bottom: 28px; }
    .nf a { display: inline-flex; background: #FFB300; color: #0a0a0a; padding: 14px 30px; border-radius: 4px; font-weight: 800; text-decoration: none; }
  </style>
</head>
<body>
  <!-- SHARED_NAV -->
  <div class="nf">
    <h1>We couldn't find that deal</h1>
    <p>It may have expired, been removed, or the link's out of date.</p>
    <a href="/categories.html">Browse all deals</a>
  </div>
</body>
</html>`;
}

module.exports = { renderOfferPage, renderOfferNotFound };
