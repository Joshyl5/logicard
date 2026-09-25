let allOffers = [];

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function slugify(str) {
  return String(str || '').trim().toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ── Slug: auto-fills from the merchant name, but stops once the admin has
// typed in the slug field themselves, so it never silently overwrites a
// deliberate edit (same pattern as the partner-brands admin page). ──
let offerSlugTouched = false;
const offerMerchantInput = document.getElementById('offerMerchant');
const offerSlugInput = document.getElementById('offerSlug');
const offerSlugPreview = document.getElementById('offerSlugPreview');

function updateOfferSlugPreview() {
  offerSlugPreview.textContent = offerSlugInput.value.trim() || '…';
}

offerMerchantInput.addEventListener('input', () => {
  if (!offerSlugTouched) {
    offerSlugInput.value = slugify(offerMerchantInput.value);
    updateOfferSlugPreview();
  }
});
offerSlugInput.addEventListener('input', () => {
  offerSlugTouched = true;
  offerSlugInput.value = slugify(offerSlugInput.value);
  updateOfferSlugPreview();
});

function renderTable(offers) {
  const tbody = document.getElementById('offersBody');
  const count = document.getElementById('tableCount');

  if (!offers.length) {
    tbody.innerHTML = '<tr><td colspan="12" class="table-empty">No offers found.</td></tr>';
    count.textContent = '';
    return;
  }

  const GENDER_LABELS = { M: 'Male only', F: 'Female only', Other: 'Other only' };
  const featuredLabel = (o) => {
    if (o.featuredDashboard && o.featuredPublic) return 'Dashboard + Public';
    if (o.featuredDashboard) return 'Dashboard only';
    if (o.featuredPublic) return 'Public only';
    return '—';
  };

  tbody.innerHTML = offers.map(o => `
    <tr>
      <td>${escapeHtml(o.merchantName)}</td>
      <td>${escapeHtml(o.title)}</td>
      <td>${escapeHtml(o.category) || '—'}</td>
      <td>${escapeHtml(o.platform) || '—'}</td>
      <td>${escapeHtml(o.discountText) || '—'}</td>
      <td>${escapeHtml(o.voucherCode) || '—'}</td>
      <td>${o.codesTotal ? `${o.codesAvailable.toLocaleString()} / ${o.codesTotal.toLocaleString()} left` : '—'}</td>
      <td>${o.isActive ? 'Yes' : 'No'}</td>
      <td>${featuredLabel(o)}</td>
      <td>${o.targetGender ? (GENDER_LABELS[o.targetGender] || o.targetGender) : 'Everyone'}</td>
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

// Sorts a copy — never mutates the array passed in, since that's usually
// either allOffers itself or the live result of filterOffers().
function sortOffers(offers, sortKey) {
  const sorted = [...offers];
  switch (sortKey) {
    case 'oldest':
      return sorted.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    case 'az':
      return sorted.sort((a, b) => (a.merchantName || '').localeCompare(b.merchantName || ''));
    case 'platform':
      return sorted.sort((a, b) =>
        (a.platform || '').localeCompare(b.platform || '') || (a.merchantName || '').localeCompare(b.merchantName || '')
      );
    case 'newest':
    default:
      return sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
}

function currentSortKey() {
  return document.getElementById('sortSelect').value;
}

function refreshTable() {
  const query    = document.getElementById('searchInput').value.trim();
  const filtered = filterOffers(query);
  renderTable(sortOffers(filtered, currentSortKey()));
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
  showOfferLogoPreview(null);
  if (typeof syncRedeemType === 'function') setTimeout(syncRedeemType, 0);
  document.getElementById('offerId').value       = '';
  document.getElementById('offerIsActive').checked = true;
  document.getElementById('offerFeaturedDashboard').checked = false;
  document.getElementById('offerFeaturedPublic').checked = false;
  document.getElementById('offerTargetGender').value = '';
  document.getElementById('offerPlatform').value = 'AWIN';
  document.getElementById('offerSortOrder').value  = 0;
  offerSlugTouched = false;

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
      document.getElementById('offerLogoUrl').value        = offer.logoUrl || '';
      document.getElementById('offerAboutBrand').value     = offer.aboutBrand || '';
      document.getElementById('offerHowToRedeem').value    = offer.howToRedeem || '';
      document.getElementById('offerTerms').value          = offer.terms || '';
      document.getElementById('offerEndDate').value        = offer.endDate || '';
      // Older offers: infer the redemption type from what they already have
      document.getElementById('offerRedeemType').value     = offer.redeemType || (offer.codesTotal != null ? 'unique' : offer.voucherCode ? 'code' : '');
      showOfferLogoPreview(offer.logoUrl);
      document.getElementById('offerHasDiscount').value    = offer.hasDiscount === false ? 'no' : 'yes';
      document.getElementById('offerSortOrder').value      = offer.sortOrder || 0;
      document.getElementById('offerIsActive').checked     = !!offer.isActive;
      document.getElementById('offerFeaturedDashboard').checked = !!offer.featuredDashboard;
      document.getElementById('offerFeaturedPublic').checked    = !!offer.featuredPublic;
      document.getElementById('offerTargetGender').value   = offer.targetGender || '';
      document.getElementById('offerPlatform').value       = offer.platform || 'AWIN';
      offerSlugInput.value = offer.slug || '';
      offerSlugTouched = !!offer.slug; // don't clobber an existing slug on a merchant-name edit
    }
  } else {
    offerModalTitle.textContent = 'Add Offer';
  }

  updateOfferSlugPreview();
  syncHasDiscount();
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
  const hasDiscountVal = document.getElementById('offerHasDiscount').value;
  const payload = {
    merchantName: document.getElementById('offerMerchant').value.trim(),
    hasDiscount:  hasDiscountVal === 'yes' ? true : hasDiscountVal === 'no' ? false : null,
    title:        document.getElementById('offerTitle').value.trim() || (hasDiscountVal === 'no' ? 'No offer at present' : ''),
    description:  document.getElementById('offerDescription').value.trim() || null,
    category:     document.getElementById('offerCategory').value.trim() || null,
    discountText: document.getElementById('offerDiscountText').value.trim() || null,
    voucherCode:  document.getElementById('offerVoucherCode').value.trim() || null,
    affiliateUrl: document.getElementById('offerAffiliateUrl').value.trim(),
    imageUrl:     document.getElementById('offerImageUrl').value.trim() || null,
    logoUrl:      document.getElementById('offerLogoUrl').value.trim() || null,
    aboutBrand:   document.getElementById('offerAboutBrand').value.trim() || null,
    howToRedeem:  document.getElementById('offerHowToRedeem').value.trim() || null,
    terms:        document.getElementById('offerTerms').value.trim() || null,
    endDate:      document.getElementById('offerEndDate').value || null,
    redeemType:   document.getElementById('offerRedeemType').value || null,
    sortOrder:    Number(document.getElementById('offerSortOrder').value) || 0,
    isActive:     document.getElementById('offerIsActive').checked,
    featuredDashboard: document.getElementById('offerFeaturedDashboard').checked,
    featuredPublic:    document.getElementById('offerFeaturedPublic').checked,
    targetGender: document.getElementById('offerTargetGender').value || null,
    platform:     document.getElementById('offerPlatform').value || 'AWIN',
    slug:         offerSlugInput.value.trim() || null,
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
  refreshTable();
}

async function init() {
  try {
    await loadOffers();
  } catch {
    window.location.href = '/admin-login.html';
  }

  document.getElementById('searchInput').addEventListener('input', refreshTable);
  document.getElementById('sortSelect').addEventListener('change', refreshTable);

  document.getElementById('adminSignout').addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    window.location.href = '/';
  });
}

document.addEventListener('DOMContentLoaded', init);


// ── Brand logo upload (reuses the admin partner-brand logo upload endpoint) ──
function showOfferLogoPreview(src) {
  const img = document.getElementById('offerLogoPreview');
  if (!img) return;
  if (!src) { img.style.display = 'none'; img.removeAttribute('src'); return; }
  img.src = src; img.style.display = 'block';
}
(function () {
  const btn = document.getElementById('offerLogoUploadBtn');
  const file = document.getElementById('offerLogoFile');
  const url = document.getElementById('offerLogoUrl');
  const status = document.getElementById('offerLogoStatus');
  if (!btn) return;
  url.addEventListener('input', () => showOfferLogoPreview(url.value.trim()));
  btn.addEventListener('click', async () => {
    if (!file.files[0]) { status.textContent = 'Choose an image file first.'; return; }
    btn.disabled = true; btn.textContent = 'Uploading…'; status.textContent = '';
    try {
      const fd = new FormData();
      fd.append('file', file.files[0]);
      const res = await fetch('/api/admin/partner-brands/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) { status.textContent = json.error || 'Upload failed.'; return; }
      url.value = json.url;
      showOfferLogoPreview(json.url);
      status.textContent = 'Uploaded — remember to press Save.';
    } catch {
      status.textContent = 'Network error — please try again.';
    } finally {
      btn.disabled = false; btn.textContent = 'Upload';
    }
  });
})();


// ── Brand page helpers: deal image upload, code field, page link ──
// "Discount available?" Yes shows the deal details (and makes them
// required); No hides them, since the page will say "No offer at present".
const DISCOUNT_FIELDS = ['offerDiscountText', 'offerTitle', 'offerDescription', 'offerRedeemType', 'offerHowToRedeem', 'offerEndDate', 'offerTerms'];
const DISCOUNT_REQUIRED = ['offerDiscountText', 'offerTitle', 'offerDescription', 'offerRedeemType'];
function syncHasDiscount() {
  const yes = document.getElementById('offerHasDiscount').value === 'yes';
  DISCOUNT_FIELDS.forEach(id => {
    const el = document.getElementById(id);
    el.closest('.lfield').style.display = yes ? '' : 'none';
    if (DISCOUNT_REQUIRED.includes(id)) el.required = yes;
  });
  document.getElementById('offerRedeemGroup').style.display = yes ? '' : 'none';
  syncRedeemType();
}
document.getElementById('offerHasDiscount').addEventListener('change', syncHasDiscount);

function syncRedeemType() {
  const type = document.getElementById('offerRedeemType').value;
  const code = document.getElementById('offerVoucherCode');
  const hasDiscount = document.getElementById('offerHasDiscount').value === 'yes';
  const needsCode = hasDiscount && type === 'code';
  code.required = needsCode;
  document.getElementById('offerVoucherReq').style.display = needsCode ? 'inline' : 'none';
  document.getElementById('offerVoucherField').style.display = hasDiscount && (type === 'code' || type === '') ? '' : 'none';
  const slug = document.getElementById('offerSlug').value.trim() || (document.getElementById('offerSlugPreview').textContent || '').trim();
  const link = document.getElementById('offerPageLink');
  if (document.getElementById('offerId').value && /^[a-z0-9-]+$/.test(slug)) { link.href = '/' + slug; link.style.display = 'inline'; }
  else link.style.display = 'none';
}
(function () {
  const sel = document.getElementById('offerRedeemType');
  if (!sel) return;
  sel.addEventListener('change', syncRedeemType);
  document.getElementById('offerSlug').addEventListener('input', syncRedeemType);
  const btn = document.getElementById('offerImageUploadBtn');
  const file = document.getElementById('offerImageFile');
  const url = document.getElementById('offerImageUrl');
  const status = document.getElementById('offerImageStatus');
  btn.addEventListener('click', async () => {
    if (!file.files[0]) { status.textContent = 'Choose an image file first.'; return; }
    btn.disabled = true; btn.textContent = 'Uploading…'; status.textContent = '';
    try {
      const fd = new FormData();
      fd.append('file', file.files[0]);
      const res = await fetch('/api/admin/partner-brands/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) { status.textContent = json.error || 'Upload failed.'; return; }
      url.value = json.url;
      status.textContent = 'Uploaded — remember to press Save.';
    } catch {
      status.textContent = 'Network error — please try again.';
    } finally {
      btn.disabled = false; btn.textContent = 'Upload';
    }
  });
})();
