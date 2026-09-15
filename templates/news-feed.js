// ── Logistics News feed — server-rendered cards + discount linking ──
// Powers /logistics-news.html. Two things this file exists to fix:
//
// 1. SEO: the page used to fetch /api/public/logistics-news client-side
//    and build every card in JS, so the HTML a crawler (or anything that
//    doesn't run JS) saw on first load was just an empty <div>. Rendering
//    the cards server-side means the page has real, indexable content on
//    every request — no redeploy needed, since it reads the DB live.
//
// 2. Every story now links back to Logicard as well as the source: a
//    lightweight keyword match against the headline/summary picks the
//    most relevant real Logicard page (falling back to the main deals
//    hub), rather than every card carrying no internal link at all.
function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function isSafeExternalUrl(u) {
  return typeof u === 'string' && /^https:\/\//i.test(u);
}

// Order matters — first matching rule wins. Keywords are matched against
// the lowercased title + summary. Every href is a real, existing Logicard
// page; nothing here is a placeholder.
const NEWS_DISCOUNT_RULES = [
  { keywords: ['fuel', 'diesel', 'petrol', 'forecourt', 'ev charging', 'electric vehicle', 'van tax', 'vehicle excise'], label: 'See fuel & motoring discounts', href: '/vehicles-motoring.html' },
  { keywords: ['driver shortage', 'recruit', 'licence', 'license', 'apprentice', 'training', 'hgv test', 'cpc'], label: 'See who qualifies for Logicard', href: '/qualify.html' },
  { keywords: ['warehouse', 'depot', 'automation', 'robot', 'technology', 'software', 'digital', 'ai '], label: 'See technology & office discounts', href: '/technology-office.html' },
  { keywords: ['wellbeing', 'mental health', 'stress', 'fatigue', 'burnout', 'welfare'], label: 'See mental wellbeing support', href: '/mental-wellbeing.html' },
  { keywords: ['pay rise', 'wage', 'cost of living', 'pension', 'tax', 'inflation', 'salary', 'finance'], label: 'See financial wellbeing discounts', href: '/financial-wellbeing.html' },
  { keywords: ['food', 'restaurant', 'cafe', 'canteen', 'meal'], label: 'See food & drink discounts', href: '/food-drink.html' },
];
const DEFAULT_NEWS_DISCOUNT = { label: 'See Logicard discounts', href: '/categories.html' };

function newsItemDiscountLink(title, summary) {
  const haystack = `${title || ''} ${summary || ''}`.toLowerCase();
  const rule = NEWS_DISCOUNT_RULES.find(r => r.keywords.some(k => haystack.includes(k)));
  return rule ? { label: rule.label, href: rule.href } : DEFAULT_NEWS_DISCOUNT;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

const discountIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12V8H6a2 2 0 01-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/><path d="M18 12a2 2 0 000 4h4v-4h-4z"/></svg>';

function renderNewsCards(items) {
  const safeItems = (items || []).filter(n => isSafeExternalUrl(n.link));
  if (safeItems.length === 0) {
    return '<div class="news-empty"><h2>No headlines yet</h2><p>We pull in fresh logistics news automatically every few hours — check back soon.</p></div>';
  }
  return safeItems.map(n => {
    const date = formatDate(n.publishedAt);
    const discount = newsItemDiscountLink(n.title, n.summary);
    return (
      '<article class="news-card">' +
        `<a class="news-card-title-link" href="${escapeHtml(n.link)}" target="_blank" rel="noopener noreferrer">` +
          `<div class="news-card-meta">${escapeHtml(n.source)}${date ? `<span class="dot">&bull;</span>${escapeHtml(date)}` : ''}</div>` +
          `<h2>${escapeHtml(n.title)}</h2>` +
          (n.summary ? `<p>${escapeHtml(n.summary)}</p>` : '') +
        '</a>' +
        `<div class="news-card-foot">` +
          `<a class="news-card-discount" href="${escapeHtml(discount.href)}">${discountIcon}${escapeHtml(discount.label)}</a>` +
        `</div>` +
      '</article>'
    );
  }).join('');
}

// Safe, honest structured data: this marks the page up as a curated list
// linking out to each source (ItemList), not as Logicard-authored
// NewsArticle content — we don't own the article text, only a headline
// and a short excerpt of it.
function renderNewsItemListJsonLd(items) {
  const safeItems = (items || []).filter(n => isSafeExternalUrl(n.link)).slice(0, 30);
  const data = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Logistics News — Logicard',
    description: 'Curated UK logistics, freight and warehousing headlines, linked to their original sources.',
    itemListElement: safeItems.map((n, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: n.link,
      name: n.title,
    })),
  };
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

module.exports = { renderNewsCards, renderNewsItemListJsonLd, newsItemDiscountLink };
