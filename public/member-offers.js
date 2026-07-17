const CATEGORIES = [
  'Beauty & Wellness', 'Children & Baby', 'Food & Drink', 'Fashion', 'Gifts & Flowers',
  'Holiday & Travel', 'Home & Garden', 'Pets', 'Sports & Fitness', 'Tech & Mobile',
];

let allOffers = [];
let activeCategory = 'All';

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

  renderCategoryNav();
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

function renderCategoryNav() {
  const nav = document.getElementById('catNav');
  const cats = ['All', ...CATEGORIES];
  nav.innerHTML = cats.map(c =>
    `<button type="button" class="cat-btn${c === activeCategory ? ' active' : ''}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`
  ).join('');
  nav.style.display = 'flex';

  nav.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeCategory = btn.dataset.cat;
      nav.querySelectorAll('.cat-btn').forEach(b => b.classList.toggle('active', b === btn));
      renderOffers(filterByCategory(allOffers));
    });
  });
}

function filterByCategory(offers) {
  if (activeCategory === 'All') return offers;
  return offers.filter(o => o.category === activeCategory);
}

async function loadOffers() {
  const grid = document.getElementById('offersGrid');
  try {
    const res = await fetch('/api/offers');
    if (!res.ok) { grid.innerHTML = '<p class="no-results">Unable to load offers right now.</p>'; return; }
    allOffers = await res.json();
    renderOffers(filterByCategory(allOffers));
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
