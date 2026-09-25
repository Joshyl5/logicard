const { renderNav } = require('./nav');

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

// Partner brand page (/deals/<slug>), reached from the partner logos on the
// Partnerships page and homepage banner. Shows the brand (logo, banner,
// category, "About") and its live offers as the standard deal cards, each
// with "Visit <brand> page" (the offer's own Logicard page) and "Get deal"
// (guests -> sign up, unverified -> verify, members -> straight to the code).
// If the brand has no live offer it shows a "No offer at present" panel.
function renderBrandPage({ brand, offers, viewerState = 'guest' }) {
  const name = brand.brandName;
  const title = `${name} — Logicard Member Deals`;
  const description = brand.aboutBrand
    ? `${brand.aboutBrand.slice(0, 150)} Exclusive discounts for Logicard members.`
    : offers.length
      ? `Exclusive ${name} discounts for Logicard members — the UK's discount card for logistics workers.`
      : `${name} is a confirmed Logicard partner. No offer at present.`;
  const canonical = `https://logicard.co.uk/deals/${escapeHtml(brand.slug)}`;
  const safeImg = (u) => /^(https:\/\/|\/(?!\/))/i.test(u || '');
  const getHref = (slug) => viewerState === 'member' ? `/${slug}#redeem` : viewerState === 'unverified' ? '/verify' : `/signup.html?src=deal-${slug}`;

  const cards = offers.filter(o => /^[a-z0-9-]+$/i.test(o.slug || '')).map(o => `
        <div class="dc">
          <a class="dc-img" href="/${escapeHtml(o.slug)}" aria-label="${escapeHtml(o.merchantName)} deal page">${safeImg(o.imageUrl) ? `<img src="${escapeHtml(o.imageUrl)}" alt="${escapeHtml(o.merchantName)}" loading="lazy" />` : escapeHtml((name || '?').charAt(0))}${safeImg(o.logoUrl) ? `<span class="dc-logo"><img src="${escapeHtml(o.logoUrl)}" alt="${escapeHtml(name)} logo" loading="lazy" onerror="this.parentNode.remove()" /></span>` : ''}</a>
          <div class="dc-body">
            <span class="dc-brand">${escapeHtml(o.merchantName || name)}</span>
            <h3>${escapeHtml(o.discountText || o.title)}</h3>
            ${o.category ? `<span class="dc-cat">${escapeHtml(o.category)}</span>` : ''}
            <div class="dc-btns">
              <a class="dc-visit" href="/${escapeHtml(o.slug)}">Visit ${escapeHtml(o.merchantName || name)} page</a>
              <a class="dc-get" href="${getHref(escapeHtml(o.slug))}" data-get-deal="${escapeHtml(o.slug)}">Get deal <span aria-hidden="true">&rarr;</span></a>
            </div>
          </div>
        </div>`).join('');

  const offersHtml = cards
    ? `<h2 class="t-h2">${escapeHtml(name)} <span class="gold">Member Deals</span></h2>
      <div class="bp-grid">${cards}
      </div>`
    : `<div class="t-card t-card-gold bp-soon">
        <h2>No Offer <span class="gold">At Present</span></h2>
        <p>${escapeHtml(name)} is a confirmed Logicard partner, but there's no member discount right now. Join today (first year free, then £10/year) and you'll be ready the moment one lands.</p>
        <div class="t-btns"><a href="/signup.html" class="t-btn t-btn-gold">Join Logicard</a></div>
      </div>`;

  const website = viewerState === 'member' && /^https:\/\//i.test(brand.websiteUrl || '')
    ? `<p class="bp-web"><a class="t-link" href="${escapeHtml(brand.websiteUrl)}" target="_blank" rel="noopener nofollow">Visit the ${escapeHtml(name)} website</a></p>` : '';

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
  <link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Montserrat:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/nav.css?v=10" />
  <link rel="stylesheet" href="/footer.css?v=2" />
  <link rel="stylesheet" href="/theme.css?v=1" />
  <style>
    .bp-banner { border-radius: 18px; overflow: hidden; background: #111; border: 1px solid var(--line); margin-bottom: 22px; aspect-ratio: 16 / 6; display: grid; place-items: center; }
    .bp-banner img { width: 100%; height: 100%; object-fit: contain; } /* never crop brand artwork */
    .bp-head { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
    .bp-logo { background: #fff; border-radius: 14px; padding: 10px 14px; height: 76px; min-width: 76px; max-width: 200px; display: grid; place-items: center; }
    .bp-logo img { max-height: 56px; max-width: 100%; object-fit: contain; }
    .bp-head h1 { font-size: clamp(30px, 7vw, 52px); }
    .bp-cat { display: inline-block; margin-top: 6px; font-size: 13px; font-weight: 600; border: 1px solid rgba(255,255,255,0.35); border-radius: 8px; padding: 4px 12px; }
    .bp-about { color: var(--muted); font-size: 17px; line-height: 1.7; max-width: 760px; margin-bottom: 8px; white-space: pre-line; }
    .bp-web { margin-top: 10px; }
    .bp-grid { display: grid; gap: 18px; }
    .bp-soon { max-width: 640px; }
    .bp-soon h2 { font-size: 24px; margin-bottom: 8px; }
    .bp-soon p { margin-bottom: 16px; }
    .dc { background: #161616; border: 1px solid rgba(255,255,255,0.12); border-radius: 18px; overflow: hidden; display: flex; flex-direction: column; color: #fff; }
    .dc-img { position: relative; display: grid; place-items: center; aspect-ratio: 16 / 9; background: #111; overflow: hidden; font: 400 60px var(--display); color: var(--gold); text-decoration: none; }
    .dc-img > img { width: 100%; height: 100%; object-fit: contain; }
    .dc-logo { position: absolute; top: 12px; right: 12px; background: #fff; border-radius: 8px; padding: 6px 10px; height: 46px; max-width: 45%; display: flex; align-items: center; box-shadow: 0 4px 14px rgba(0,0,0,.35); }
    .dc-logo img { max-height: 34px; max-width: 100%; object-fit: contain; }
    .dc-body { padding: 16px 18px 18px; display: flex; flex-direction: column; gap: 8px; flex: 1; }
    .dc-brand { font: 700 13px var(--body); letter-spacing: .08em; text-transform: uppercase; color: var(--gold); }
    .dc-body h3 { font-size: 21px; margin: 0; }
    .dc-cat { align-self: flex-start; font: 600 13px var(--body); border: 1px solid rgba(255,255,255,0.35); border-radius: 8px; padding: 4px 12px; }
    .dc-btns { display: grid; gap: 8px; margin-top: auto; padding-top: 8px; }
    .dc-btns a { display: flex; align-items: center; justify-content: center; gap: 8px; text-align: center; border-radius: 10px; padding: 12px 14px; font: 400 15px/1.2 var(--display); text-decoration: none; }
    .dc-visit { background: var(--gold-soft); color: var(--gold); border: 1px solid var(--gold-line); }
    .dc-get { background: var(--gold); color: #111; }
    @media (min-width: 760px) { .bp-grid { grid-template-columns: repeat(3, 1fr); } }
  </style>
</head>
<body>

  <!-- SHARED_NAV -->

  <section class="t-section">
    <div class="wrap">
      ${safeImg(brand.bannerUrl) ? `<div class="bp-banner"><img src="${escapeHtml(brand.bannerUrl)}" alt="${escapeHtml(name)}" /></div>` : ''}
      <div class="bp-head">
        <div class="bp-logo"><img src="${escapeHtml(brand.logoUrl)}" alt="${escapeHtml(name)} logo" onerror="this.replaceWith(document.createTextNode(${escapeHtml(JSON.stringify(name))}))" /></div>
        <div>
          <h1>${escapeHtml(name)}</h1>
          ${brand.category ? `<span class="bp-cat">${escapeHtml(brand.category)}</span>` : ''}
        </div>
      </div>
      ${brand.aboutBrand ? `<p class="bp-about">${escapeHtml(brand.aboutBrand)}</p>` : `<p class="bp-about">${offers.length ? 'Exclusive member deals, only for Logicard members.' : 'Confirmed Logicard partner — deal coming soon.'}</p>`}
      ${website}
    </div>
  </section>

  <section class="t-section" style="padding-top:0">
    <div class="wrap">
      ${offersHtml}
      <p style="margin-top:28px"><a class="t-link" href="/partnerships.html">&larr; All partners</a></p>
    </div>
  </section>

  <!-- SHARED_FOOTER -->
  <script src="/deal-links.js?v=2"></script>
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
  <link rel="stylesheet" href="/nav.css?v=10" />
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Montserrat', 'Helvetica Neue', Arial, sans-serif; background: #000000; color: #fff; }
    .nf { text-align: center; padding: 120px 24px; }
    .nf h1 { font-size: 32px; font-weight: 900; margin-bottom: 14px; }
    .nf p { color: rgba(255,255,255,0.9); margin-bottom: 28px; }
    .nf a { display: inline-flex; background: #FFB300; color: #0a0a0a; padding: 14px 30px; border-radius: 4px; font-weight: 800; text-decoration: none; }
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
