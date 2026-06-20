/* ── Icons (SVG strings per category) ─────────────────────────── */
const ICONS = {
  fuel: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="6" width="12" height="16" rx="1"/>
    <path d="M3 12h12M9 3v3M6 3v3"/>
    <path d="M15 8l3 2v8a1 1 0 01-2 0v-3h-1"/>
  </svg>`,
  hotels: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M2 22v-7a2 2 0 012-2h16a2 2 0 012 2v7"/>
    <path d="M2 19h20"/>
    <path d="M5 13V8a1 1 0 011-1h4a1 1 0 011 1v5"/>
    <circle cx="17.5" cy="9.5" r="2.5"/>
  </svg>`,
  dining: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 2v6a3 3 0 006 0V2"/>
    <path d="M6 2v20"/>
    <path d="M21 2c-4 2.5-5.5 5-5.5 9s2 7 5.5 11V2z"/>
  </svg>`,
  technology: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="4" width="20" height="14" rx="2"/>
    <path d="M2 18h20M9 22l1.5-4h3L15 22"/>
  </svg>`,
  maintenance: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
  </svg>`,
  shopping: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
    <line x1="3" y1="6" x2="21" y2="6"/>
    <path d="M16 10a4 4 0 01-8 0"/>
  </svg>`,
  travel: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17.8 19.2L16 11l3.5-3.5C21 6 21 4 19 2c-2-2-4-2-5.5-.5L10 5 1.8 6.2c-.5.1-.8.5-.8 1l.5 5c.1.5.4.9.9 1L9 14l-2 3 2 2 3-2 1.5 6.5c.1.5.5.8 1 .9l5 .5c.5 0 .9-.3.8-.7z"/>
  </svg>`,
  finance: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    <path d="M9 12l2 2 4-4"/>
  </svg>`,
};

function formatPrice(p) {
  return '£' + Number(p).toFixed(2);
}

function formatExpiry(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ── Render featured offer ─────────────────────────────────────── */
function renderFeatured(offer) {
  const c1 = offer.colors[0], c2 = offer.colors[1];
  return `
    <div class="offer-featured" data-cat="${offer.categoryKey}">
      <div class="of-visual" style="background:linear-gradient(135deg,${c1},${c2})">
        <div class="of-icon">${ICONS[offer.categoryKey] || ''}</div>
        <div class="of-big-saving">${offer.saving}</div>
      </div>
      <div class="of-content">
        ${offer.tag ? `<span class="offer-tag" style="background:${c1}">${offer.tag}</span>` : ''}
        <span class="offer-cat-label">${offer.category}</span>
        <h2 class="of-title">${offer.title}</h2>
        <p class="of-desc">${offer.description}</p>
        <div class="of-meta">
          <span class="of-price-label">${offer.priceLabel}</span>
        </div>
        <button class="offer-cta-btn" style="background:linear-gradient(135deg,${c1},${c2})">
          Claim This Offer
        </button>
        <p class="of-expires">Expires ${formatExpiry(offer.expires)}</p>
      </div>
    </div>`;
}

/* ── Render regular offer card ─────────────────────────────────── */
function renderCard(offer) {
  const c1 = offer.colors[0], c2 = offer.colors[1];

  let priceHtml = '';
  if (offer.originalPrice !== null && offer.price === 0) {
    priceHtml = `<span class="price-original">${formatPrice(offer.originalPrice)}</span>
                 <span class="price-current">FREE</span>`;
  } else if (offer.originalPrice !== null && offer.price !== null) {
    priceHtml = `<span class="price-original">${formatPrice(offer.originalPrice)}</span>
                 <span class="price-current">${formatPrice(offer.price)}</span>`;
  } else {
    priceHtml = `<span class="price-current">${offer.saving}</span>`;
  }

  return `
    <div class="offer-card" data-cat="${offer.categoryKey}">
      <div class="oc-header" style="background:linear-gradient(135deg,${c1},${c2})">
        <div class="oc-icon">${ICONS[offer.categoryKey] || ''}</div>
        ${offer.tag ? `<span class="offer-tag">${offer.tag}</span>` : ''}
        <span class="oc-cat">${offer.category}</span>
      </div>
      <div class="oc-body">
        <h3 class="oc-title">${offer.title}</h3>
        <p class="oc-desc">${offer.description}</p>
        <div class="oc-pricing">
          ${priceHtml}
          <span class="price-badge">${offer.saving}</span>
        </div>
        <button class="oc-btn" style="background:linear-gradient(135deg,${c1},${c2})">Claim Offer</button>
        <p class="oc-expires">Expires ${formatExpiry(offer.expires)}</p>
      </div>
    </div>`;
}

/* ── Init ──────────────────────────────────────────────────────── */
let allOffers = [];
let activeCategory = 'all';

async function init() {
  // Check auth
  let me;
  try {
    const meRes  = await fetch('/api/me');
    if (!meRes.ok) { window.location.href = '/login.html'; return; }
    me = await meRes.json();
    document.getElementById('userName').textContent    = me.firstName;
    document.getElementById('memberBadge').textContent = '#' + me.membershipNumber;
  } catch {
    window.location.href = '/login.html';
    return;
  }

  // Referral banner
  const referralLink = `${window.location.origin}/signup.html?ref=${me.membershipNumber}`;
  document.getElementById('referralLinkInput').value = referralLink;
  document.getElementById('totalReferrals').textContent  = me.totalReferrals  || 0;
  document.getElementById('monthlyEntries').textContent  = me.monthlyEntries  || 0;

  document.getElementById('referralCopyBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(referralLink).then(() => {
      const btn = document.getElementById('referralCopyBtn');
      btn.textContent = '✓ Copied!';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'Copy link'; btn.classList.remove('copied'); }, 2000);
    });
  });

  // Fetch offers
  try {
    const res = await fetch('/api/offers');
    if (!res.ok) throw new Error();
    allOffers = await res.json();
    renderOffers('all');
  } catch {
    document.getElementById('offersGrid').innerHTML = '<p style="color:#7ba3d4;padding:20px">Could not load offers. Please refresh.</p>';
  }

  // Category filter
  document.getElementById('catNav').addEventListener('click', e => {
    const btn = e.target.closest('.cat-btn');
    if (!btn) return;
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderOffers(btn.dataset.cat);
  });

  // Sign out
  document.getElementById('signoutBtn').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/';
  });
}

function renderOffers(cat) {
  activeCategory = cat;
  const featured    = allOffers.find(o => o.featured);
  const nonFeatured = allOffers.filter(o => !o.featured);

  const featuredSlot = document.getElementById('featuredSlot');
  const grid         = document.getElementById('offersGrid');
  const noResults    = document.getElementById('noResults');

  // Featured card (only shown when "All" or matching category)
  if (featured && (cat === 'all' || cat === featured.categoryKey)) {
    featuredSlot.innerHTML = renderFeatured(featured);
    featuredSlot.style.display = '';
  } else {
    featuredSlot.style.display = 'none';
  }

  // Filter regular cards
  const visible = cat === 'all'
    ? nonFeatured
    : nonFeatured.filter(o => o.categoryKey === cat);

  grid.innerHTML = visible.map(renderCard).join('');

  const anyVisible = visible.length > 0 || (featured && (cat === 'all' || cat === featured.categoryKey));
  noResults.style.display = anyVisible ? 'none' : '';
}

document.addEventListener('DOMContentLoaded', init);
