// Guides: /guides (list) and /guides/<slug> (article). Articles are written
// in the admin panel using a simple format (see renderGuideBody). Every
// article carries a commission disclosure because guides link out through
// tracked /go/<slug> links that may be affiliate links.

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

// Only same-site paths or https links are ever turned into <a> tags.
function safeHref(raw) {
  const url = raw.replace(/&amp;/g, '&');
  if (/^\/(?!\/)[^\s"'<>]*$/.test(url) || /^https:\/\/[^\s"'<>]+$/i.test(url)) return escapeHtml(url);
  return null;
}

// Inline formatting on already-escaped text: **bold** and [text](link).
// [button: text](link) renders as a gold button.
function inline(escaped) {
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[(button:\s*)?([^\]]+)\]\(([^)\s]+)\)/g, (m, btn, text, url) => {
      const href = safeHref(url);
      if (!href) return text;
      const tracked = href.startsWith('/go/');
      const external = tracked || href.startsWith('https://');
      const rel = tracked ? ' rel="sponsored nofollow"' : href.startsWith('https://') ? ' rel="noopener nofollow"' : '';
      const target = external ? ' target="_blank"' : '';
      return btn
        ? `<a class="t-btn t-btn-gold g-btn" href="${href}"${target}${rel}>${text}</a>`
        : `<a class="t-link" href="${href}"${target}${rel}>${text}</a>`;
    });
}

// Writing format (one blank line between blocks):
//   ## Heading        ### Smaller heading
//   - bullet point    (consecutive lines)
//   **bold**   [link text](/go/santander-switch)   [button: Open account](/go/x)
function renderGuideBody(body) {
  const blocks = String(body || '').replace(/\r\n?/g, '\n').split(/\n{2,}/);
  return blocks.map(block => {
    const lines = block.split('\n').map(l => l.trimEnd()).filter(l => l.trim());
    if (!lines.length) return '';
    if (lines.length === 1 && /^###\s+/.test(lines[0])) return `<h3>${inline(escapeHtml(lines[0].replace(/^###\s+/, '')))}</h3>`;
    if (lines.length === 1 && /^##\s+/.test(lines[0])) return `<h2>${inline(escapeHtml(lines[0].replace(/^##\s+/, '')))}</h2>`;
    if (lines.every(l => /^\s*[-*]\s+/.test(l))) {
      return `<ul class="t-list">${lines.map(l => `<li>${inline(escapeHtml(l.replace(/^\s*[-*]\s+/, '')))}</li>`).join('')}</ul>`;
    }
    return `<p>${lines.map(l => inline(escapeHtml(l))).join('<br />')}</p>`;
  }).join('\n');
}

function head({ title, description, canonical }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${canonical}" />
  <link rel="icon" href="/favicon.svg?v=3" type="image/svg+xml" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Montserrat:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/nav.css?v=9" />
  <link rel="stylesheet" href="/footer.css?v=2" />
  <link rel="stylesheet" href="/theme.css?v=1" />
  <style>
    .g-cards { display: grid; gap: 18px; }
    .g-card { display: flex; flex-direction: column; background: var(--card); border: 1px solid var(--line); border-radius: 18px; overflow: hidden; text-decoration: none; color: #fff; transition: border-color .2s; }
    .g-card:hover { border-color: var(--gold-line); }
    .g-card-img { aspect-ratio: 16 / 9; background: #111; display: grid; place-items: center; overflow: hidden; font-family: var(--display); font-size: 48px; color: var(--gold); }
    .g-card-img img { width: 100%; height: 100%; object-fit: contain; }
    .g-card-body { padding: 18px; display: flex; flex-direction: column; gap: 8px; flex: 1; }
    .g-cat { align-self: flex-start; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--gold); }
    .g-card h2 { font-size: 21px; }
    .g-card p { color: var(--muted); font-size: 15px; flex: 1; }
    .g-read { color: var(--gold); font-weight: 700; }
    .g-article { max-width: 760px; }
    .g-disclose { background: var(--gold-soft); border: 1px solid var(--gold-line); border-radius: 12px; padding: 12px 16px; font-size: 14px; color: #fff; margin-bottom: 26px; }
    .g-hero-img { border-radius: 18px; overflow: hidden; background: #111; border: 1px solid var(--line); margin-bottom: 26px; }
    .g-hero-img img { width: 100%; max-height: 460px; object-fit: contain; }
    .g-body h2 { font-size: clamp(24px, 5vw, 32px); margin: 34px 0 12px; }
    .g-body h3 { font-size: 20px; margin: 24px 0 10px; }
    .g-body p { color: var(--muted); font-size: 17px; line-height: 1.75; margin-bottom: 16px; }
    .g-body .t-list { margin: 0 0 18px; }
    .g-body .t-list li { color: var(--muted); font-size: 17px; }
    .g-body strong { color: #fff; }
    .g-btn { margin: 4px 0 18px; }
    .g-meta { color: rgba(255,255,255,0.8); font-size: 14px; margin-bottom: 18px; }
    .g-crumb { font-size: 14px; margin-bottom: 14px; }
    .g-crumb a { color: #fff; text-decoration: none; }
    .g-crumb a:hover { color: var(--gold); }
    @media (min-width: 760px) { .g-cards { grid-template-columns: repeat(3, 1fr); } }
  </style>
</head>`;
}

const DISCLOSURE = 'Logicard may earn a commission if you open an account or buy through links in this guide. This never changes the price you pay. Guides are general information, not personal financial advice - check the provider\'s latest terms before you apply.';

function renderGuideList(guides) {
  const cards = guides.length ? guides.map(g => `
        <a class="g-card" href="/guides/${escapeHtml(g.slug)}">
          <div class="g-card-img">${g.heroImageUrl ? `<img src="${escapeHtml(g.heroImageUrl)}" alt="" loading="lazy" />` : 'L'}</div>
          <div class="g-card-body">
            ${g.category ? `<span class="g-cat">${escapeHtml(g.category)}</span>` : ''}
            <h2>${escapeHtml(g.title)}</h2>
            ${g.summary ? `<p>${escapeHtml(g.summary)}</p>` : ''}
            <span class="g-read">Read the guide &rarr;</span>
          </div>
        </a>`).join('') : '<p class="t-lead">New guides are on their way - check back soon.</p>';
  return head({
    title: 'Guides — Money, Savings & More | Logicard',
    description: 'Practical guides for logistics workers from Logicard: money, savings, cashback and more.',
    canonical: 'https://logicard.co.uk/guides',
  }) + `
<body>
  <!-- SHARED_NAV -->
  <section class="t-section">
    <div class="wrap">
      <span class="t-eyebrow">Guides</span>
      <h1 class="t-h2">Guides To Help You <span class="gold">Save More</span></h1>
      <p class="t-lead">Plain-English guides for logistics workers — money, savings, cashback and more.</p>
      <div class="g-cards">${cards}
      </div>
    </div>
  </section>
  <!-- SHARED_FOOTER -->
</body>
</html>`;
}

function renderGuidePage(guide) {
  const date = guide.updatedAt || guide.publishedAt;
  const dateText = date ? new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  return head({
    title: `${guide.title} | Logicard Guides`,
    description: guide.summary || guide.title,
    canonical: `https://logicard.co.uk/guides/${escapeHtml(guide.slug)}`,
  }) + `
<body>
  <!-- SHARED_NAV -->
  <section class="t-section">
    <div class="wrap">
      <article class="g-article">
        <p class="g-crumb"><a href="/guides">Guides</a>${guide.category ? ` &rsaquo; ${escapeHtml(guide.category)}` : ''}</p>
        <h1 class="t-h2">${escapeHtml(guide.title)}</h1>
        ${dateText ? `<p class="g-meta">Last updated ${escapeHtml(dateText)}</p>` : ''}
        <p class="g-disclose">${escapeHtml(DISCLOSURE)}</p>
        ${guide.heroImageUrl ? `<div class="g-hero-img"><img src="${escapeHtml(guide.heroImageUrl)}" alt="" /></div>` : ''}
        <div class="g-body">
          ${renderGuideBody(guide.body)}
        </div>
        <div class="g-disclose" style="margin-top:30px"><strong>Not a member yet?</strong> Logicard gives UK logistics workers exclusive discounts - first year free, then £10/year.<br /><a class="t-btn t-btn-gold g-btn" style="margin:12px 0 0" href="/signup.html?src=guide-${escapeHtml(guide.slug)}">Join Logicard</a></div>
        <p style="margin-top:24px"><a class="t-link" href="/guides">&larr; All guides</a></p>
      </article>
    </div>
  </section>
  <!-- SHARED_FOOTER -->
</body>
</html>`;
}

module.exports = { renderGuideList, renderGuidePage, renderGuideBody };
