const CATEGORIES = [
  'Home & Garden', 'Fashion', 'Food & Drink', 'Business', 'Benefits',
  'Travel', 'Health & Beauty', 'Gifting', 'Motoring', 'E-learning',
  'Tech & Electronic', 'Days Out & Entertainment', 'Finance & Insurance', 'Sport & Fitness', 'Advice',
];

const CATEGORY_ICONS = {
  'Home & Garden': '<svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/></svg>',
  'Fashion': '<svg viewBox="0 0 24 24"><path d="M20.38 3.46L16 2a4 4 0 01-8 0L3.62 3.46a2 2 0 00-1.34 2.23l.58 3.47a1 1 0 001 .84H6v10a2 2 0 002 2h8a2 2 0 002-2V10h2.14a1 1 0 001-.84l.58-3.47a2 2 0 00-1.34-2.23z"/></svg>',
  'Food & Drink': '<svg viewBox="0 0 24 24"><path d="M4 8h13a3 3 0 010 6h-1M4 8v9a3 3 0 003 3h6a3 3 0 003-3V8M4 8V5h13v3"/></svg>',
  'Business': '<svg viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>',
  'Benefits': '<svg viewBox="0 0 24 24"><path d="M20.59 13.41L11 3.83A2 2 0 009.59 3.24H4a1 1 0 00-1 1v5.59a2 2 0 00.59 1.41l9.58 9.58a2 2 0 002.83 0l5.59-5.59a2 2 0 000-2.83z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>',
  'Travel': '<svg viewBox="0 0 24 24"><path d="M22 2L2 9l7 3 3 7 10-17z"/></svg>',
  'Health & Beauty': '<svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z"/></svg>',
  'Gifting': '<svg viewBox="0 0 24 24"><rect x="3" y="8" width="18" height="4"/><path d="M12 8v13M19 8v13H5V8"/><path d="M12 8c-1.5-4-6-4-6 0M12 8c1.5-4 6-4 6 0"/></svg>',
  'Motoring': '<svg viewBox="0 0 24 24"><path d="M3 13l1.5-5A2 2 0 016.4 6.5h11.2a2 2 0 011.9 1.5L21 13"/><rect x="2" y="13" width="20" height="6" rx="1"/><circle cx="7" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/></svg>',
  'E-learning': '<svg viewBox="0 0 24 24"><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/></svg>',
  'Tech & Electronic': '<svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="13" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
  'Days Out & Entertainment': '<svg viewBox="0 0 24 24"><path d="M12 22s7-6.5 7-12a7 7 0 00-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  'Finance & Insurance': '<svg viewBox="0 0 24 24"><path d="M12 3c4 4 8 5 8 5v6c0 5-3.5 7.5-8 8-4.5-.5-8-3-8-8V8s4-1 8-5z"/></svg>',
  'Sport & Fitness': '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20"/></svg>',
  'Advice': '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9.5 9a2.5 2.5 0 015 0c0 1.5-2.5 2-2.5 4"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
};

let allOffers = [];
let activeCategory = 'All';
let searchQuery = '';

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

async function init() {
  // Auth check
  let me;
  try {
    const res = await fetch('/api/me');
    if (!res.ok) { window.location.href = '/login.html'; return; }
    me = await res.json();
  } catch {
    window.location.href = '/login.html';
    return;
  }

  // Populate header
  document.getElementById('userName').textContent    = me.firstName;
  document.getElementById('memberBadge').textContent = '#' + me.membershipNumber;

  // Sign out
  document.getElementById('signoutBtn').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/';
  });

  if (!me.verified) {
    showPendingPanel(me.verificationStatus, me.rejectionReason);
    return;
  }

  // Referral banner
  const referralLink = `${window.location.origin}/signup.html?ref=${me.membershipNumber}`;
  document.getElementById('referralLinkInput').value      = referralLink;
  document.getElementById('totalReferrals').textContent   = me.totalReferrals  || 0;
  document.getElementById('monthlyEntries').textContent   = me.monthlyEntries  || 0;

  document.getElementById('referralCopyBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(referralLink).then(() => {
      const btn = document.getElementById('referralCopyBtn');
      btn.textContent = '✓ Copied!';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'Copy link'; btn.classList.remove('copied'); }, 2000);
    });
  });

  renderMegaMenu();
  initMegaMenuToggle();
  initSearch();
  loadNotifications();
  loadOffers();
}

async function loadNotifications() {
  try {
    const res = await fetch('/api/notifications');
    if (!res.ok) return;
    renderNotifications(await res.json());
  } catch { /* non-critical */ }
}

function renderNotifications(notifications) {
  const wrap = document.getElementById('notifBannerWrap');
  if (!notifications.length) { wrap.innerHTML = ''; return; }

  wrap.innerHTML = notifications.map(n => `
    <div class="notif-banner" data-id="${n.id}">
      <span class="notif-banner-text"><strong>${escapeHtml(n.title)}</strong>${n.body ? ' — ' + escapeHtml(n.body) : ''}</span>
      <button type="button" class="notif-banner-dismiss" data-id="${n.id}">Got it</button>
    </div>
  `).join('');

  wrap.querySelectorAll('.notif-banner-dismiss').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      try { await fetch(`/api/notifications/${id}/read`, { method: 'POST' }); } catch { /* non-critical */ }
      btn.closest('.notif-banner').remove();
    });
  });
}

function showPendingPanel(status, rejectionReason) {
  document.getElementById('offersGrid').style.display = 'none';
  document.getElementById('referralBanner').style.display = 'none';

  const panel = document.getElementById('pendingPanel');
  const rejected = status === 'rejected';

  panel.innerHTML = `
    <span class="verify-badge verify-badge--${rejected ? 'rejected' : 'pending'}">${rejected ? 'Needs Another Look' : 'Pending Verification'}</span>
    <h2>${rejected ? "We couldn't verify your last submission" : "Your offers are almost ready"}</h2>
    <p>${rejected
      ? (rejectionReason ? escapeHtml(rejectionReason) + ' — please submit a new document or your work email.' : "We weren't able to approve your last submission — please try again.")
      : "Logicard is a closed group for verified logistics workers. Confirm your employment and we'll unlock your deals — usually within 24-48 hours."}</p>
    <a href="/verify" class="verify-method-btn" style="display:inline-block;text-decoration:none;">${rejected ? 'Resubmit Proof →' : 'Verify My Account →'}</a>
  `;
  panel.style.display = 'block';
}

function renderMegaMenu() {
  const menu = document.getElementById('megaMenu');
  if (!menu) return;

  menu.innerHTML = CATEGORIES.map(c => `
    <button type="button" class="mega-item" data-cat="${escapeHtml(c)}">
      <span class="mega-item-icon">${CATEGORY_ICONS[c] || ''}</span>
      <span class="mega-item-label">${escapeHtml(c)}</span>
    </button>
  `).join('');

  menu.querySelectorAll('.mega-item').forEach(btn => {
    btn.addEventListener('click', () => {
      activeCategory = btn.dataset.cat;
      updateActiveNavState();
      closeMegaMenu();
      renderOffers(applyFilters(allOffers));
    });
  });
}

function updateActiveNavState() {
  const allOffersLink = document.getElementById('allOffersLink');
  const categoriesToggle = document.getElementById('categoriesToggle');
  if (allOffersLink) allOffersLink.classList.toggle('active', activeCategory === 'All');
  if (categoriesToggle) categoriesToggle.classList.toggle('active', activeCategory !== 'All');
}

function closeMegaMenu() {
  document.getElementById('megaMenuWrap')?.classList.remove('open');
}

function initMegaMenuToggle() {
  const toggle = document.getElementById('categoriesToggle');
  const wrap = document.getElementById('megaMenuWrap');
  if (!toggle || !wrap) return;

  toggle.addEventListener('click', (e) => {
    e.preventDefault();
    wrap.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target) && e.target !== toggle) wrap.classList.remove('open');
  });

  document.getElementById('allOffersLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    activeCategory = 'All';
    updateActiveNavState();
    renderOffers(applyFilters(allOffers));
  });
}

function initSearch() {
  const input = document.getElementById('offerSearchInput');
  if (!input) return;
  input.addEventListener('input', () => {
    searchQuery = input.value.trim().toLowerCase();
    renderOffers(applyFilters(allOffers));
  });
}

function applyFilters(offers) {
  let result = offers;
  if (activeCategory !== 'All') result = result.filter(o => o.category === activeCategory);
  if (searchQuery) {
    result = result.filter(o =>
      o.merchantName.toLowerCase().includes(searchQuery) ||
      o.title.toLowerCase().includes(searchQuery) ||
      (o.category || '').toLowerCase().includes(searchQuery)
    );
  }
  return result;
}

async function loadOffers() {
  const grid = document.getElementById('offersGrid');
  try {
    const res = await fetch('/api/offers');
    if (!res.ok) { grid.innerHTML = '<p class="no-results">Unable to load offers right now.</p>'; return; }
    allOffers = await res.json();
    renderOffers(applyFilters(allOffers));
  } catch {
    grid.innerHTML = '<p class="no-results">Unable to load offers right now.</p>';
  }
}

function renderCodeSection(o) {
  if (o.hasCodePool) {
    if (o.myCode) {
      return `
        <div class="oc-code-wrap">
          <div class="oc-code-box">
            <span class="oc-code-value">${escapeHtml(o.myCode)}</span>
            <button type="button" class="oc-code-copy-btn" data-code="${escapeHtml(o.myCode)}">Copy</button>
          </div>
        </div>`;
    }
    if (o.codesAvailable > 0) {
      return `
        <div class="oc-code-wrap">
          <button type="button" class="oc-reveal-btn" data-id="${o.id}">Reveal My Unique Code</button>
        </div>`;
    }
    if (o.onWaitlist) {
      return `
        <div class="oc-code-wrap">
          <p class="oc-code-empty">All codes claimed</p>
          <button type="button" class="oc-waitlist-btn" disabled>✓ We'll email you when more are added</button>
        </div>`;
    }
    return `
      <div class="oc-code-wrap">
        <p class="oc-code-empty">All codes claimed</p>
        <button type="button" class="oc-waitlist-btn" data-id="${o.id}">Notify Me When More Are Added</button>
      </div>`;
  }

  if (o.voucherCode) {
    return `<button type="button" class="oc-copy-btn" data-code="${escapeHtml(o.voucherCode)}">Code: ${escapeHtml(o.voucherCode)} — Copy</button>`;
  }

  return '';
}

function renderOffers(offers) {
  const grid = document.getElementById('offersGrid');

  if (!offers.length) {
    grid.innerHTML = '<p class="no-results">No offers in this category yet — check back soon.</p>';
    return;
  }

  grid.innerHTML = offers.map(o => `
    <div class="offer-card">
      ${o.imageUrl ? `<img class="oc-image" src="${escapeHtml(o.imageUrl)}" alt="${escapeHtml(o.merchantName)}" loading="lazy" />` : ''}
      <div class="oc-header">
        ${o.category ? `<span class="oc-cat">${escapeHtml(o.category)}</span>` : ''}
      </div>
      <div class="oc-body">
        <h3 class="oc-title">${escapeHtml(o.merchantName)} — ${escapeHtml(o.title)}</h3>
        ${o.description ? `<p class="oc-desc">${escapeHtml(o.description)}</p>` : ''}
        <div class="oc-pricing">
          ${o.discountText ? `<span class="price-badge">${escapeHtml(o.discountText)}</span>` : ''}
        </div>
        ${renderCodeSection(o)}
        <a class="oc-btn" href="/api/offers/${o.id}/go" target="_blank" rel="noopener noreferrer">Get This Deal</a>
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('.oc-copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.code).then(() => {
        const original = btn.textContent;
        btn.textContent = '✓ Copied!';
        setTimeout(() => { btn.textContent = original; }, 2000);
      });
    });
  });

  grid.querySelectorAll('.oc-code-copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.code).then(() => {
        const original = btn.textContent;
        btn.textContent = '✓ Copied!';
        setTimeout(() => { btn.textContent = original; }, 2000);
      });
    });
  });

  grid.querySelectorAll('.oc-reveal-btn').forEach(btn => {
    btn.addEventListener('click', () => revealCode(Number(btn.dataset.id), btn));
  });

  grid.querySelectorAll('.oc-waitlist-btn:not(:disabled)').forEach(btn => {
    btn.addEventListener('click', () => joinWaitlist(Number(btn.dataset.id), btn));
  });
}

async function joinWaitlist(offerId, btn) {
  btn.disabled = true;
  btn.textContent = 'Registering…';
  try {
    const res = await fetch(`/api/offers/${offerId}/waitlist`, { method: 'POST' });
    if (!res.ok) { btn.disabled = false; btn.textContent = 'Notify Me When More Are Added'; return; }
    btn.textContent = "✓ We'll email you when more are added";
  } catch {
    btn.disabled = false;
    btn.textContent = 'Notify Me When More Are Added';
  }
}

async function revealCode(offerId, btn) {
  btn.disabled = true;
  btn.textContent = 'Revealing…';

  try {
    const res = await fetch(`/api/offers/${offerId}/claim`, { method: 'POST' });
    const json = await res.json();

    if (!res.ok) {
      const wrap = btn.closest('.oc-code-wrap');
      wrap.innerHTML = `<p class="oc-code-empty">${escapeHtml(json.error || 'This code could not be revealed.')}</p>`;
      return;
    }

    const wrap = btn.closest('.oc-code-wrap');
    wrap.innerHTML = `
      <div class="oc-code-box">
        <span class="oc-code-value">${escapeHtml(json.code)}</span>
        <button type="button" class="oc-code-copy-btn" data-code="${escapeHtml(json.code)}">Copy</button>
      </div>`;
    wrap.querySelector('.oc-code-copy-btn').addEventListener('click', e => {
      navigator.clipboard.writeText(e.target.dataset.code).then(() => {
        e.target.textContent = '✓ Copied!';
        setTimeout(() => { e.target.textContent = 'Copy'; }, 2000);
      });
    });
  } catch {
    btn.disabled = false;
    btn.textContent = 'Reveal My Unique Code';
  }
}

document.addEventListener('DOMContentLoaded', init);
