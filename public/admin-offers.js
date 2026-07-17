let allOffers = [];

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function renderTable(offers) {
  const tbody = document.getElementById('offersBody');
  const count = document.getElementById('tableCount');

  if (!offers.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="table-empty">No offers found.</td></tr>';
    count.textContent = '';
    return;
  }

  tbody.innerHTML = offers.map(o => `
    <tr>
      <td>${escapeHtml(o.merchantName)}</td>
      <td>${escapeHtml(o.title)}</td>
      <td>${escapeHtml(o.category) || '—'}</td>
      <td>${escapeHtml(o.discountText) || '—'}</td>
      <td>${escapeHtml(o.voucherCode) || '—'}</td>
      <td>${o.codesTotal ? `${o.codesAvailable.toLocaleString()} / ${o.codesTotal.toLocaleString()} left` : '—'}</td>
      <td>${o.isActive ? 'Yes' : 'No'}</td>
      <td>${o.clickCount || 0}</td>
      <td>
        <button type="button" class="table-link offer-edit-btn" data-id="${o.id}" style="margin-right:10px;background:none;border:none;cursor:pointer;">Edit</button>
        <button type="button" class="table-link offer-codes-btn" data-id="${o.id}" style="margin-right:10px;background:none;border:none;cursor:pointer;color:#FFB300;">Codes</button>
        <button type="button" class="table-link offer-delete-btn" data-id="${o.id}" style="background:none;border:none;cursor:pointer;color:#f87171;">Delete</button>
      </td>
    </tr>`).join('');

  count.textContent = `Showing ${offers.length} of ${allOffers.length} offer${allOffers.length !== 1 ? 's' : ''}`;

  tbody.querySelectorAll('.offer-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => openModal(Number(btn.dataset.id)));
  });
  tbody.querySelectorAll('.offer-codes-btn').forEach(btn => {
    btn.addEventListener('click', () => openCodesModal(Number(btn.dataset.id)));
  });
  tbody.querySelectorAll('.offer-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteOffer(Number(btn.dataset.id)));
  });
}

function filterOffers(query) {
  if (!query) return allOffers;
  const q = query.toLowerCase();
  return allOffers.filter(o =>
    (o.merchantName || '').toLowerCase().includes(q) ||
    (o.title        || '').toLowerCase().includes(q) ||
    (o.category     || '').toLowerCase().includes(q)
  );
}

// ── Modal ─────────────────────────────────────────────────────
const offerModal      = document.getElementById('offerModal');
const offerModalTitle = document.getElementById('offerModalTitle');
const offerForm       = document.getElementById('offerForm');
const offerFormError  = document.getElementById('offerFormError');
const offerSubmitBtn  = document.getElementById('offerSubmitBtn');

function openModal(id) {
  offerFormError.textContent = '';
  offerForm.reset();
  document.getElementById('offerId').value       = '';
  document.getElementById('offerIsActive').checked = true;
  document.getElementById('offerSortOrder').value  = 0;

  if (id) {
    const offer = allOffers.find(o => o.id === id);
    if (offer) {
      offerModalTitle.textContent = 'Edit Offer';
      document.getElementById('offerId').value            = offer.id;
      document.getElementById('offerMerchant').value       = offer.merchantName || '';
      document.getElementById('offerTitle').value          = offer.title || '';
      document.getElementById('offerDescription').value    = offer.description || '';
      document.getElementById('offerCategory').value       = offer.category || '';
      document.getElementById('offerDiscountText').value   = offer.discountText || '';
      document.getElementById('offerVoucherCode').value    = offer.voucherCode || '';
      document.getElementById('offerAffiliateUrl').value   = offer.affiliateUrl || '';
      document.getElementById('offerImageUrl').value       = offer.imageUrl || '';
      document.getElementById('offerSortOrder').value      = offer.sortOrder || 0;
      document.getElementById('offerIsActive').checked     = !!offer.isActive;
    }
  } else {
    offerModalTitle.textContent = 'Add Offer';
  }

  offerModal.style.display = 'flex';
}

function closeModal() { offerModal.style.display = 'none'; }

document.getElementById('addOfferBtn').addEventListener('click', () => openModal(null));
document.getElementById('offerCancelBtn').addEventListener('click', closeModal);
offerModal.addEventListener('click', e => { if (e.target === offerModal) closeModal(); });

offerForm.addEventListener('submit', async e => {
  e.preventDefault();
  offerFormError.textContent = '';

  const id      = document.getElementById('offerId').value;
  const payload = {
    merchantName: document.getElementById('offerMerchant').value.trim(),
    title:        document.getElementById('offerTitle').value.trim(),
    description:  document.getElementById('offerDescription').value.trim() || null,
    category:     document.getElementById('offerCategory').value.trim() || null,
    discountText: document.getElementById('offerDiscountText').value.trim() || null,
    voucherCode:  document.getElementById('offerVoucherCode').value.trim() || null,
    affiliateUrl: document.getElementById('offerAffiliateUrl').value.trim(),
    imageUrl:     document.getElementById('offerImageUrl').value.trim() || null,
    sortOrder:    Number(document.getElementById('offerSortOrder').value) || 0,
    isActive:     document.getElementById('offerIsActive').checked,
  };

  offerSubmitBtn.disabled    = true;
  offerSubmitBtn.textContent = 'Saving…';

  try {
    const res = await fetch(id ? `/api/admin/offers/${id}` : '/api/admin/offers', {
      method:  id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    const json = await res.json();

    if (!res.ok) {
      offerFormError.textContent = json.error || 'Something went wrong. Please try again.';
      return;
    }

    closeModal();
    await loadOffers();
  } catch {
    offerFormError.textContent = 'Network error — please try again.';
  } finally {
    offerSubmitBtn.disabled    = false;
    offerSubmitBtn.textContent = 'Save Offer';
  }
});

async function deleteOffer(id) {
  const offer = allOffers.find(o => o.id === id);
  if (!offer) return;
  if (!confirm(`Delete "${offer.title}"? This cannot be undone.`)) return;

  try {
    const res = await fetch(`/api/admin/offers/${id}`, { method: 'DELETE' });
    if (!res.ok) { alert('Failed to delete offer.'); return; }
    await loadOffers();
  } catch {
    alert('Network error — please try again.');
  }
}

// ── Unique codes modal ──────────────────────────────────────────
const codesModal        = document.getElementById('codesModal');
const codesModalTitle    = document.getElementById('codesModalTitle');
const codesModalStock    = document.getElementById('codesModalStock');
const codesTextarea      = document.getElementById('codesTextarea');
const codesModalError    = document.getElementById('codesModalError');
const codesModalSuccess  = document.getElementById('codesModalSuccess');
const codesSubmitBtn     = document.getElementById('codesSubmitBtn');
let codesOfferId = null;

function openCodesModal(id) {
  const offer = allOffers.find(o => o.id === id);
  if (!offer) return;

  codesOfferId = id;
  codesTextarea.value = '';
  codesModalError.textContent = '';
  codesModalSuccess.style.display = 'none';
  codesModalTitle.textContent = `Upload Unique Codes — ${offer.merchantName}`;
  codesModalStock.textContent = offer.codesTotal
    ? `Currently ${offer.codesAvailable.toLocaleString()} of ${offer.codesTotal.toLocaleString()} codes available.`
    : 'No codes uploaded yet for this offer.';
  codesModal.style.display = 'flex';
}

function closeCodesModal() { codesModal.style.display = 'none'; codesOfferId = null; }

document.getElementById('codesCancelBtn').addEventListener('click', closeCodesModal);
codesModal.addEventListener('click', e => { if (e.target === codesModal) closeCodesModal(); });

codesSubmitBtn.addEventListener('click', async () => {
  if (!codesOfferId) return;
  codesModalError.textContent = '';
  codesModalSuccess.style.display = 'none';

  const codes = codesTextarea.value.split(/\r?\n/).map(c => c.trim()).filter(Boolean);
  if (!codes.length) { codesModalError.textContent = 'Paste at least one code.'; return; }

  codesSubmitBtn.disabled = true;
  codesSubmitBtn.textContent = 'Uploading…';

  try {
    const res = await fetch(`/api/admin/offers/${codesOfferId}/codes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codes: codesTextarea.value }),
    });
    const json = await res.json();

    if (!res.ok) {
      codesModalError.textContent = json.error || 'Upload failed. Please try again.';
      return;
    }

    codesModalSuccess.textContent = `Added ${json.inserted.toLocaleString()} new code${json.inserted === 1 ? '' : 's'}${json.skipped ? ` (${json.skipped.toLocaleString()} duplicate${json.skipped === 1 ? '' : 's'} skipped)` : ''}.${json.notified ? ` Notified ${json.notified.toLocaleString()} member${json.notified === 1 ? '' : 's'} who were waiting.` : ''}`;
    codesModalSuccess.style.display = 'block';
    codesTextarea.value = '';
    await loadOffers();

    const offer = allOffers.find(o => o.id === codesOfferId);
    if (offer) codesModalStock.textContent = `Currently ${offer.codesAvailable.toLocaleString()} of ${offer.codesTotal.toLocaleString()} codes available.`;
  } catch {
    codesModalError.textContent = 'Network error — please try again.';
  } finally {
    codesSubmitBtn.disabled = false;
    codesSubmitBtn.textContent = 'Upload Codes';
  }
});

// ── Load ──────────────────────────────────────────────────────
async function loadOffers() {
  const res = await fetch('/api/admin/offers');
  if (!res.ok) { window.location.href = '/admin-login.html'; return; }
  allOffers = await res.json();
  renderTable(allOffers);
}

async function init() {
  try {
    await loadOffers();
  } catch {
    window.location.href = '/admin-login.html';
  }

  document.getElementById('searchInput').addEventListener('input', e => {
    renderTable(filterOffers(e.target.value.trim()));
  });

  document.getElementById('adminSignout').addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    window.location.href = '/';
  });
}

document.addEventListener('DOMContentLoaded', init);
