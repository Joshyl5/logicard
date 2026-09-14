const { renderNav } = require('./nav');

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

// Reached by clicking a logo on the Partnerships page's "Our Partners"
// grid. Shows whatever live offers exist for that brand (matched by
// merchant name — same public-teaser shape as the homepage's Featured
// Deals, no voucher code or affiliate URL); if there aren't any yet, a
// "coming soon" state instead of a dead end. Flat navy/gold throughout,
// per BRAND.md.
function renderBrandPage({ brand, offers }) {
  const title       = `${brand.brandName} — Logicard Member Deals`;
  const description = offers.length
    ? `Exclusive ${brand.brandName} discounts for Logicard members — the UK's discount card for logistics workers.`
    : `${brand.brandName} is a confirmed Logicard partner — their member discount is coming soon.`;
  const canonical = `https://logicard.co.uk/deals/${brand.slug}`;

  const offerCards = offers.map(o => `
        <div class="bp-offer-card">
          <div class="bp-offer-badges">
            ${o.category ? `<span class="bp-badge">${escapeHtml(o.category)}</span>` : ''}
            <span class="bp-badge bp-badge--exclusive">Exclusive to Logicard</span>
          </div>
          <p class="bp-offer-title">${escapeHtml(o.title)}</p>
          ${o.discountText ? `<p class="bp-offer-discount">${escapeHtml(o.discountText)}</p>` : ''}
          <a href="/signup.html" class="btn-primary">Join to Claim<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></a>
        </div>`).join('');

  const body = offers.length
    ? `<div class="bp-offers">${offerCards}</div>`
    : `
      <div class="bp-soon-card">
        <h2>Deal coming soon</h2>
        <p>${escapeHtml(brand.brandName)} is a confirmed Logicard partner — their member discount isn't live yet. Join free today and we'll have it ready for you the moment it lands.</p>
        <a href="/signup.html" class="btn-primary">Join Logicard Free<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></a>
      </div>`;

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
  <link rel="stylesheet" href="/nav.css?v=3" />
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --navy: #071d40; --navy-mid: #0d3b80; --orange: #FFB300; --orange-dark: #E09A00;
      --white: #ffffff; --text-muted: #5b6577;
    }
    body { font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; background: var(--navy); color: var(--white); -webkit-font-smoothing: antialiased; }
    .bp-inner { max-width: 720px; margin: 0 auto; padding: 0 24px; }
    .btn-primary {
      display: inline-flex; align-items: center; gap: 8px;
      background: var(--orange); color: var(--navy);
      padding: 16px 34px; font-weight: 900; font-size: 15px; letter-spacing: 0.3px;
      text-decoration: none; border-radius: 4px;
      transition: background 0.15s, transform 0.1s;
    }
    .btn-primary:hover { background: var(--orange-dark); transform: translateY(-1px); }

    .bp-hero { padding: 72px 24px 56px; text-align: center; }
    .bp-logo-card {
      width: 220px; height: 130px; margin: 0 auto 28px; background: var(--white);
      border-radius: 16px; display: flex; align-items: center; justify-content: center;
      padding: 20px; box-shadow: 0 12px 40px rgba(0,0,0,0.25);
    }
    .bp-logo-card img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .bp-hero h1 { font-size: clamp(28px, 4vw, 42px); font-weight: 900; letter-spacing: -0.8px; margin-bottom: 10px; }
    .bp-hero p { font-size: 16px; color: rgba(255,255,255,0.6); }

    .bp-offers { padding: 0 24px 88px; max-width: 720px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }
    .bp-offer-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 28px; }
    .bp-offer-badges { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
    .bp-badge { font-size: 11.5px; font-weight: 700; letter-spacing: 0.2px; background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.75); padding: 5px 10px; border-radius: 100px; }
    .bp-badge--exclusive { background: rgba(255,179,0,0.15); color: var(--orange); }
    .bp-offer-title { font-size: 16px; color: rgba(255,255,255,0.85); line-height: 1.5; margin-bottom: 10px; }
    .bp-offer-discount { font-size: 18px; font-weight: 800; color: var(--orange); margin-bottom: 20px; }

    .bp-soon-card {
      max-width: 560px; margin: 0 auto 88px; padding: 0 24px; text-align: center;
    }
    .bp-soon-card h2 { font-size: 24px; font-weight: 900; margin-bottom: 14px; letter-spacing: -0.3px; }
    .bp-soon-card p { font-size: 15.5px; color: rgba(255,255,255,0.6); line-height: 1.7; margin-bottom: 28px; }

    .bp-back { display: block; text-align: center; padding: 0 24px 56px; color: rgba(255,255,255,0.4); text-decoration: none; font-size: 14px; font-weight: 600; }
    .bp-back:hover { color: var(--white); }
  </style>
</head>
<body>

  <!-- SHARED_NAV -->

  <div class="bp-hero">
    <div class="bp-logo-card"><img src="${escapeHtml(brand.logoUrl)}" alt="${escapeHtml(brand.brandName)}" /></div>
    <h1>${escapeHtml(brand.brandName)}</h1>
    <p>${offers.length ? 'Exclusive member deals, only for Logicard members.' : 'Confirmed Logicard partner — deal coming soon.'}</p>
  </div>

  ${body}

  <a href="/partnerships.html" class="bp-back">&larr; Back to Partnerships</a>

</body>
</html>`;
}

function renderBrandNotFound() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Brand Not Found — Logicard</title>
  <link rel="icon" href="/favicon.svg?v=3" type="image/svg+xml" />
  <link rel="stylesheet" href="/nav.css?v=3" />
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; background: #071d40; color: #fff; }
    .nf { text-align: center; padding: 120px 24px; }
    .nf h1 { font-size: 32px; font-weight: 900; margin-bottom: 14px; }
    .nf p { color: rgba(255,255,255,0.6); margin-bottom: 28px; }
    .nf a { display: inline-flex; background: #FFB300; color: #071d40; padding: 14px 30px; border-radius: 4px; font-weight: 800; text-decoration: none; }
  </style>
</head>
<body>
  <!-- SHARED_NAV -->
  <div class="nf">
    <h1>We couldn't find that brand</h1>
    <p>It may have been removed, or the link's out of date.</p>
    <a href="/partnerships.html">See all partners</a>
  </div>
</body>
</html>`;
}

module.exports = { renderBrandPage, renderBrandNotFound };
