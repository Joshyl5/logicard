const { renderNav } = require('./nav');

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

// One page per offer at the site root (e.g. /buture). Everyone sees the
// offer itself (image, brand, category, deal, description). The code, the
// Copy button and the "find out more" link to the brand only appear for a
// logged-in, verified member, rendered server-side (see the /:slug route in
// server.js, which also marks member views Cache-Control: private).
//
// viewer.state:
//   'guest'      — not logged in: masked code, Join / Log in buttons
//   'unverified' — logged in, verification pending: masked code, Verify button
//   'member'     — verified: real code (or a claim button for unique-code
//                  pools), Copy button, and the tracked link to the brand
function renderOfferPage({ offer, viewer = { state: 'guest' }, brandLogo = null, related = [] }) {
  const brand       = offer.merchantName || 'this brand';
  const title       = `${offer.title} — ${brand} | Logicard`;
  const description = offer.description
    ? `${offer.description} Exclusive to Logicard members — the UK's discount card for logistics workers.`
    : `${offer.discountText || 'Exclusive member discount'} at ${brand} — only for Logicard members.`;
  const canonical = `https://logicard.co.uk/${escapeHtml(offer.slug)}`;
  const initial   = (brand || '?').trim().charAt(0).toUpperCase();
  const back      = encodeURIComponent('/' + offer.slug);
  const copyIcon  = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
  const arrowIcon = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

  const logoHtml = brandLogo
    ? `<img src="${escapeHtml(brandLogo)}" alt="${escapeHtml(brand)} logo" onerror="this.replaceWith(document.createTextNode('${escapeHtml(initial)}'))" />`
    : escapeHtml(initial);

  // Admin-written steps (one per line) win; otherwise sensible defaults.
  const customSteps = String(offer.howToRedeem || '').split(/\r?\n/).map(t => t.trim()).filter(Boolean);
  const endText = offer.endDate
    ? `Offer ends ${new Date(offer.endDate + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
    : 'No end date — ongoing offer';
  const stepsHtml = (defaults) => `<ol class="op-steps">${(customSteps.length ? customSteps.map(escapeHtml) : defaults).map(t => `<li>${t}</li>`).join('')}</ol>`;

  let redeem;
  if (offer.ended) {
    redeem = `
        <div class="op-code-box"><span class="op-code-note">This offer has now ended.</span></div>
        <a href="/deals.html" class="op-claim-btn">See current deals ${arrowIcon}</a>`;
  } else if (viewer.state === 'member' && viewer.redeemType === 'instore') {
    redeem = `
        <div class="op-code-box"><span class="op-code-note">No code needed — show your digital Logicard in store.</span></div>
        ${stepsHtml(['Open your digital Logicard from your member dashboard.', `Show it at the till in ${escapeHtml(brand)}.`, `Enjoy <strong>${escapeHtml(offer.discountText || offer.title)}</strong>.`])}
        <a href="/member-dashboard" class="op-claim-btn">Open my Logicard ${arrowIcon}</a>
        <a href="/api/offers/${escapeHtml(String(viewer.offerId))}/go" class="op-more" target="_blank" rel="noopener">Click here to find out more about ${escapeHtml(brand)}</a>`;
  } else if (viewer.state === 'member') {
    const codeBox = viewer.code
      ? `<div class="op-code-box op-code-live">
            <span class="op-code" id="opCode">${escapeHtml(viewer.code)}</span>
            <button type="button" class="op-copy" id="opCopy" data-code="${escapeHtml(viewer.code)}">${copyIcon}<span>Copy</span></button>
          </div>`
      : viewer.hasPool
        ? `<div class="op-code-box op-code-live" id="opClaimBox">
            <span class="op-code op-code-muted" id="opCode">Your unique code</span>
            <button type="button" class="op-copy" id="opClaim" data-offer="${escapeHtml(String(viewer.offerId))}">Get my code</button>
          </div>
          <p class="op-msg" id="opMsg" role="status"></p>`
        : `<div class="op-code-box"><span class="op-code-note">No code needed — your member discount applies when you shop through the link below.</span></div>`;
    redeem = `
        ${codeBox}
        ${stepsHtml(viewer.code || viewer.hasPool
          ? ['Copy your code.', `Open ${escapeHtml(brand)} using the button below.`, `Paste the code at checkout to get <strong>${escapeHtml(offer.discountText || offer.title)}</strong>.`]
          : [`Open ${escapeHtml(brand)} using the button below.`, `Your member discount is applied through the Logicard link — <strong>${escapeHtml(offer.discountText || offer.title)}</strong>.`])}
        <a href="/api/offers/${escapeHtml(String(viewer.offerId))}/go" class="op-claim-btn" target="_blank" rel="noopener">Click here to find out more about ${escapeHtml(brand)} ${arrowIcon}</a>`;
  } else if (viewer.state === 'unverified') {
    redeem = `
        <div class="op-code-box"><span class="op-code op-code-masked">&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;</span><span class="op-code-note">Unlocks once your membership is verified</span></div>
        <a href="/verify" class="op-claim-btn">Verify my membership ${arrowIcon}</a>
        <p class="op-small">Most members are verified instantly with a work email.</p>`;
  } else {
    redeem = `
        <div class="op-code-box"><span class="op-code op-code-masked">&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;</span><span class="op-code-note">Join to unlock your code</span></div>
        <a href="/signup.html?src=deal-${escapeHtml(offer.slug)}" class="op-claim-btn" data-get-deal="${escapeHtml(offer.slug)}">Join Logicard to unlock ${arrowIcon}</a>
        <p class="op-small">First year free, then £10/year. Already a member? <a href="/login.html?next=${back}">Log in</a></p>`;
  }

  // "Get deal" on related cards: guests -> sign up, unverified -> verify,
  // members -> straight to that deal's code.
  const getHref = (slug) => viewer.state === 'member' ? `/${slug}#redeem` : viewer.state === 'unverified' ? '/verify' : `/signup.html?src=deal-${slug}`;
  const safeImg = (u) => /^(https:\/\/|\/(?!\/))/i.test(u || '');
  const relatedHtml = related.length ? `
    <section class="op-related">
      <h2>More <span class="gold">Deals Like This</span></h2>
      <div class="op-rel-grid">
        ${related.map(r => `
        <div class="dc">
          <a class="dc-img" href="/${escapeHtml(r.slug)}" aria-label="${escapeHtml(r.merchantName)} page">${safeImg(r.imageUrl) ? `<img src="${escapeHtml(r.imageUrl)}" alt="${escapeHtml(r.merchantName)}" loading="lazy" />` : escapeHtml((r.merchantName || '?').charAt(0))}${safeImg(r.logoUrl) ? `<span class="dc-logo"><img src="${escapeHtml(r.logoUrl)}" alt="${escapeHtml(r.merchantName)} logo" loading="lazy" onerror="this.parentNode.remove()" /></span>` : ''}</a>
          <div class="dc-body">
            <span class="dc-brand">${escapeHtml(r.merchantName)}</span>
            <h3>${escapeHtml(r.discountText || r.title)}</h3>
            ${r.category ? `<span class="dc-cat">${escapeHtml(r.category)}</span>` : ''}
            <div class="dc-btns">
              <a class="dc-visit" href="/${escapeHtml(r.slug)}">Visit ${escapeHtml(r.merchantName)} page</a>
              <a class="dc-get" href="${getHref(escapeHtml(r.slug))}" data-get-deal="${escapeHtml(r.slug)}">Get deal <span aria-hidden="true">&rarr;</span></a>
            </div>
          </div>
        </div>`).join('')}
      </div>
    </section>` : '';

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
  <link rel="stylesheet" href="/theme.css?v=1" />
  <style>
    .op-wrap { max-width: 1120px; margin: 0 auto; padding: 22px 20px 64px; }
    .op-crumb { font-size: 13px; color: rgba(255,255,255,0.8); margin-bottom: 18px; }
    .op-crumb a { text-decoration: none; color: #fff; }
    .op-crumb a:hover { color: var(--gold); }
    .op-crumb span { margin: 0 6px; }
    .op-grid { display: grid; gap: 22px; }

    /* Brand artwork is always shown in full, never cropped */
    .op-image { position: relative; border-radius: 18px; overflow: hidden; background: #111; border: 1px solid var(--line); aspect-ratio: 16 / 9; display: grid; place-items: center; }
    .op-image > img { width: 100%; height: 100%; object-fit: contain; }
    .op-image-fallback { font-family: var(--display); font-size: 72px; color: var(--gold); }
    .op-brand-row { display: flex; align-items: center; gap: 14px; margin: 20px 0 14px; }
    .op-logo { flex: 0 0 auto; min-width: 64px; height: 64px; max-width: 150px; padding: 8px 10px; background: #fff; border-radius: 12px; display: grid; place-items: center; color: #111; font-family: var(--display); font-size: 26px; }
    .op-logo img { max-width: 100%; max-height: 48px; object-fit: contain; }
    .op-brand-name { font-family: var(--display); font-size: 22px; line-height: 1.1; margin-bottom: 6px; }
    .op-cat { display: inline-block; font-size: 13px; font-weight: 600; border: 1px solid rgba(255,255,255,0.35); border-radius: 8px; padding: 4px 10px; }
    .op-title { font-size: clamp(28px, 6vw, 42px); margin-bottom: 12px; }
    .op-tag-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 4px; }
    .op-members { display: inline-flex; align-items: center; gap: 6px; background: var(--gold-soft); border: 1px solid var(--gold-line); color: var(--gold); font-weight: 700; font-size: 13px; padding: 5px 12px; border-radius: 999px; }

    .op-card { background: var(--card); border: 1px solid var(--line); border-radius: 18px; padding: 22px; }
    .op-card h2 { font-size: 22px; margin-bottom: 14px; }
    .op-redeem { border-color: var(--gold-line); scroll-margin-top: 96px; }
    .op-code-box { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; background: #000; border: 2px dashed var(--gold-line); border-radius: 12px; padding: 14px 16px; margin-bottom: 16px; }
    .op-code { font-family: var(--display); font-size: 24px; letter-spacing: .06em; color: var(--gold); word-break: break-all; }
    .op-code-masked { color: rgba(255,255,255,0.75); letter-spacing: .2em; }
    .op-code-muted { font-family: var(--body); font-size: 16px; font-weight: 700; color: #fff; letter-spacing: 0; }
    .op-code-note { font-size: 14px; font-weight: 600; color: #fff; }
    .op-copy { display: inline-flex; align-items: center; gap: 8px; background: var(--gold); color: #111; border: 0; border-radius: 10px; padding: 10px 16px; font: 400 15px var(--display); cursor: pointer; }
    .op-copy:disabled { opacity: .6; cursor: default; }
    .op-steps { padding-left: 20px; margin-bottom: 18px; color: var(--muted); display: grid; gap: 6px; }
    .op-steps strong { color: #fff; }
    .op-claim-btn { display: flex; align-items: center; justify-content: center; gap: 10px; text-align: center; width: 100%; background: var(--gold); color: #111; padding: 16px 18px; border-radius: 12px; font: 400 16px/1.25 var(--display); text-decoration: none; box-shadow: 0 8px 28px rgba(255,179,0,0.3); }
    .op-small { margin-top: 12px; font-size: 14px; color: var(--muted); text-align: center; }
    .op-small a { color: var(--gold); font-weight: 700; }
    .op-msg { font-weight: 600; min-height: 1.3em; margin: -8px 0 12px; color: #ff8a8a; }
    .op-ongoing { display: flex; align-items: center; gap: 8px; margin-top: 16px; font-size: 14px; color: #fff; }
    .op-ongoing svg { color: var(--gold); flex: 0 0 auto; }
    .op-desc { color: var(--muted); font-size: 16px; line-height: 1.7; }
    .op-terms { font-size: 14px; white-space: pre-line; }
    .op-lead { color: #fff; font-size: 17px; line-height: 1.6; margin-top: 14px; }
    .op-more { display: block; text-align: center; margin-top: 12px; color: var(--gold); font-weight: 700; }
    .op-tags { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
    .op-tags span { font-size: 13px; font-weight: 600; border: 1px solid rgba(255,255,255,0.3); border-radius: 8px; padding: 5px 12px; }

    .op-related { margin-top: 40px; }
    .op-related h2 { font-size: clamp(24px, 5vw, 32px); margin-bottom: 16px; }
    .op-rel-grid { display: grid; gap: 14px; }
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

    @media (min-width: 880px) {
      .op-grid { grid-template-columns: 1.5fr 1fr; align-items: start; }
      .op-side { position: sticky; top: 96px; display: grid; gap: 16px; }
      .op-rel-grid { grid-template-columns: repeat(3, 1fr); }
    }
  </style>
</head>
<body>

  <!-- SHARED_NAV -->

  <div class="op-wrap">
    <p class="op-crumb">
      <a href="/deals.html">Deals</a>
      ${offer.category ? `<span>&rsaquo;</span>${escapeHtml(offer.category)}` : ''}
      <span>&rsaquo;</span>${escapeHtml(brand)}
    </p>

    <div class="op-grid">
      <div class="op-main">
        <div class="op-image">
          ${offer.imageUrl
            ? `<img src="${escapeHtml(offer.imageUrl)}" alt="${escapeHtml(brand)} - ${escapeHtml(offer.title)}" />`
            : `<div class="op-image-fallback">${escapeHtml(initial)}</div>`}
        </div>

        <div class="op-brand-row">
          <div class="op-logo">${logoHtml}</div>
          <div>
            <div class="op-brand-name">${escapeHtml(brand)}</div>
            ${offer.category ? `<span class="op-cat">${escapeHtml(offer.category)}</span>` : ''}
          </div>
        </div>

        <h1 class="op-title">${escapeHtml(offer.discountText || offer.title)}</h1>
        <div class="op-tag-row"><span class="op-members">Exclusive to Logicard members</span></div>
        ${offer.description ? `<p class="op-lead">${escapeHtml(offer.description)}</p>` : ''}
      </div>

      <div class="op-side">
        <div class="op-card op-redeem" id="redeem">
          <h2>How To <span class="gold">Redeem</span></h2>
          ${redeem}
          <p class="op-ongoing"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${escapeHtml(endText)}</p>
        </div>

        <div class="op-card">
          <h2>About <span class="gold">${escapeHtml(brand)}</span></h2>
          <p class="op-desc">${escapeHtml(offer.aboutBrand || offer.description || `${offer.title} for Logicard members.`)}</p>
          <div class="op-tags">
            ${offer.category ? `<span>${escapeHtml(offer.category)}</span>` : ''}
            <span>Exclusive to Logicard</span>
          </div>
        </div>
        ${offer.terms ? `
        <div class="op-card">
          <h2>Terms &amp; <span class="gold">Conditions</span></h2>
          <p class="op-desc op-terms">${escapeHtml(offer.terms)}</p>
        </div>` : ''}
      </div>
    </div>
    ${relatedHtml}
  </div>

  <!-- SHARED_FOOTER -->

  <script src="/deal-links.js?v=2"></script>
  <script>
    (function () {
      function wireCopy(btn) {
        if (!btn) return;
        btn.addEventListener('click', function () {
          var code = btn.getAttribute('data-code');
          var label = btn.querySelector('span');
          if (window.LogicardDeal) LogicardDeal.track('copy_code', ${JSON.stringify(String(offer.slug))});
          function done(ok) { if (label) label.textContent = ok ? 'Copied!' : 'Copy failed'; setTimeout(function () { if (label) label.textContent = 'Copy'; }, 2000); }
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(function () { done(true); }, function () { done(false); });
          else { var t = document.createElement('textarea'); t.value = code; document.body.appendChild(t); t.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) {} t.remove(); done(ok); }
        });
      }
      wireCopy(document.getElementById('opCopy'));

      // Unique-code offers: claim this member's code on demand
      var claim = document.getElementById('opClaim');
      if (claim) claim.addEventListener('click', function () {
        var msg = document.getElementById('opMsg');
        claim.disabled = true; msg.textContent = '';
        fetch('/api/offers/' + encodeURIComponent(claim.getAttribute('data-offer')) + '/claim', { method: 'POST', credentials: 'same-origin' })
          .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Could not get a code right now.'); return d; }); })
          .then(function (d) {
            var codeEl = document.getElementById('opCode');
            codeEl.textContent = d.code; codeEl.className = 'op-code';
            claim.id = 'opCopy'; claim.disabled = false; claim.setAttribute('data-code', d.code);
            claim.innerHTML = ${JSON.stringify(copyIcon)} + '<span>Copy</span>';
            claim.replaceWith(claim.cloneNode(true));
            wireCopy(document.getElementById('opCopy'));
          })
          .catch(function (e) { msg.textContent = e.message; claim.disabled = false; });
      });
    })();
  </script>
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
    <h1>We couldn't find that deal</h1>
    <p>It may have expired, been removed, or the link's out of date.</p>
    <a href="/categories.html">Browse all deals</a>
  </div>
</body>
</html>`;
}

module.exports = { renderOfferPage, renderOfferNotFound };
