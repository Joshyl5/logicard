let allBrands = [];

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function renderTable(brands) {
  const tbody = document.getElementById('brandsBody');
  const count = document.getElementById('tableCount');

  if (!brands.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No partner brands found.</td></tr>';
    count.textContent = '';
    return;
  }

  tbody.innerHTML = brands.map(b => `
    <tr>
      <td><img src="${escapeHtml(b.logoUrl)}" alt="" style="width:60px;height:40px;object-fit:contain;background:#fff;border-radius:4px;display:block;" /></td>
      <td>${escapeHtml(b.brandName)}</td>
      <td>${b.slug ? `<a href="/deals/${escapeHtml(b.slug)}" target="_blank" rel="noopener" style="color:rgba(255,255,255,0.5);font-size:12px;">/deals/${escapeHtml(b.slug)}</a>` : '—'}</td>
      <td>${b.liveOffers ? `<span style="color:#4ade80;font-weight:700;">Yes</span> (${b.liveOffers})` : '<span style="color:#f87171;font-weight:700;">No</span> - page says "No offer at present"'}</td>
      <td>${b.sortOrder || 0}</td>
      <td>${b.isActive ? 'Yes' : 'No'}</td>
      <td>
        <button type="button" class="table-link brand-edit-btn" data-id="${b.id}" style="margin-right:10px;background:none;border:none;cursor:pointer;">Edit</button>
        <button type="button" class="table-link brand-delete-btn" data-id="${b.id}" style="background:none;border:none;cursor:pointer;color:#f87171;">Delete</button>
      </td>
    </tr>`).join('');

  count.textContent = `Showing ${brands.length} of ${allBrands.length} brand${allBrands.length !== 1 ? 's' : ''}`;

  tbody.querySelectorAll('.brand-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => openModal(Number(btn.dataset.id)));
  });
  tbody.querySelectorAll('.brand-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteBrand(Number(btn.dataset.id)));
  });
}

function filterBrands(query) {
  if (!query) return allBrands;
  const q = query.toLowerCase();
  return allBrands.filter(b => (b.brandName || '').toLowerCase().includes(q));
}

function slugify(str) {
  return String(str || '').trim().toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ── Slug: auto-fills from the brand name, but stops once the admin has
// typed in the slug field themselves, so it never silently overwrites a
// deliberate edit. ──
let slugTouched = false;
const brandNameInput = document.getElementById('brandName');
const brandSlugInput = document.getElementById('brandSlug');
const brandSlugPreview = document.getElementById('brandSlugPreview');

function updateSlugPreview() {
  brandSlugPreview.textContent = brandSlugInput.value.trim() || '…';
}

brandNameInput.addEventListener('input', () => {
  if (!slugTouched) {
    brandSlugInput.value = slugify(brandNameInput.value);
    updateSlugPreview();
  }
});
brandSlugInput.addEventListener('input', () => {
  slugTouched = true;
  brandSlugInput.value = slugify(brandSlugInput.value);
  updateSlugPreview();
});

// ── Logo upload ──
const brandLogoFile    = document.getElementById('brandLogoFile');
const brandLogoUrl     = document.getElementById('brandLogoUrl');
const brandLogoPreview = document.getElementById('brandLogoPreview');
const brandUploadBtn   = document.getElementById('brandUploadBtn');
const brandUploadStatus = document.getElementById('brandUploadStatus');

function showLogoPreview(src) {
  if (!src) { brandLogoPreview.style.display = 'none'; return; }
  brandLogoPreview.src = src;
  brandLogoPreview.style.display = 'block';
}

brandUploadBtn.addEventListener('click', async () => {
  const file = brandLogoFile.files[0];
  if (!file) { brandUploadStatus.textContent = 'Choose an image file first.'; return; }

  brandUploadBtn.disabled = true;
  brandUploadBtn.textContent = 'Uploading…';
  brandUploadStatus.textContent = '';

  try {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/admin/partner-brands/upload', { method: 'POST', body: formData });
    const json = await res.json();

    if (!res.ok) {
      brandUploadStatus.textContent = json.error || 'Upload failed.';
      return;
    }

    brandLogoUrl.value = json.url;
    showLogoPreview(json.url);
    brandUploadStatus.textContent = 'Uploaded — Logo Image field filled in below.';
  } catch {
    brandUploadStatus.textContent = 'Network error — please try again.';
  } finally {
    brandUploadBtn.disabled = false;
    brandUploadBtn.textContent = 'Upload';
  }
});

brandLogoUrl.addEventListener('input', () => showLogoPreview(brandLogoUrl.value.trim()));

// ── Modal ─────────────────────────────────────────────────────
const brandModal      = document.getElementById('brandModal');
const brandModalTitle = document.getElementById('brandModalTitle');
const brandForm       = document.getElementById('brandForm');
const brandFormError  = document.getElementById('brandFormError');
const brandSubmitBtn  = document.getElementById('brandSubmitBtn');

function openModal(id) {
  brandFormError.textContent = '';
  brandUploadStatus.textContent = '';
  brandForm.reset();
  document.getElementById('brandId').value        = '';
  document.getElementById('brandIsActive').checked = true;
  document.getElementById('brandSortOrder').value  = 0;
  slugTouched = false;
  showLogoPreview('');

  if (id) {
    const brand = allBrands.find(b => b.id === id);
    if (brand) {
      brandModalTitle.textContent = 'Edit Brand';
      document.getElementById('brandId').value        = brand.id;
      document.getElementById('brandName').value      = brand.brandName || '';
      document.getElementById('brandLogoUrl').value   = brand.logoUrl || '';
      document.getElementById('brandSortOrder').value = brand.sortOrder || 0;
      document.getElementById('brandCategory').value  = brand.category || '';
      document.getElementById('brandAbout').value     = brand.aboutBrand || '';
      document.getElementById('brandBannerUrl').value = brand.bannerUrl || '';
      document.getElementById('brandWebsite').value   = brand.websiteUrl || '';
      document.getElementById('brandIsActive').checked = !!brand.isActive;
      brandSlugInput.value = brand.slug || '';
      slugTouched = !!brand.slug; // don't clobber an existing slug on name edit
      showLogoPreview(brand.logoUrl || '');
    }
  } else {
    brandModalTitle.textContent = 'Add Brand';
  }

  updateSlugPreview();
  brandModal.style.display = 'flex';
}

function closeModal() { brandModal.style.display = 'none'; }

document.getElementById('addBrandBtn').addEventListener('click', () => openModal(null));
document.getElementById('brandCancelBtn').addEventListener('click', closeModal);
brandModal.addEventListener('click', e => { if (e.target === brandModal) closeModal(); });


// The browser's own "please fill in this field" bubble is easy to miss in
// the scrolling form, so list every missing or invalid field above Save,
// outline each one, and scroll to the first.
function missingFields(form) {
  const bad = [...form.querySelectorAll('input, select, textarea')].filter(el => {
    el.style.outline = '';
    if (el.type === 'hidden' || el.type === 'file' || el.disabled) return false;
    const field = el.closest('.lfield');
    if (field && field.style.display === 'none') return false;
    return !el.checkValidity();
  });
  bad.forEach(el => { el.style.outline = '2px solid #f87171'; el.addEventListener('input', () => { el.style.outline = ''; }, { once: true }); });
  return bad;
}
function fieldName(el) {
  const label = document.querySelector('label[for="' + el.id + '"]');
  return label ? label.textContent.replace('*', '').replace(/\(optional\)/i, '').trim() : el.id;
}

brandForm.addEventListener('submit', async e => {
  e.preventDefault();
  brandFormError.textContent = '';
  const bad = missingFields(brandForm);
  if (bad.length) {
    brandFormError.textContent = 'Please fill in or fix: ' + bad.map(fieldName).join(', ') + '.';
    bad[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    bad[0].focus({ preventScroll: true });
    return;
  }

  const id      = document.getElementById('brandId').value;
  const payload = {
    brandName: document.getElementById('brandName').value.trim(),
    logoUrl:   document.getElementById('brandLogoUrl').value.trim(),
    slug:      brandSlugInput.value.trim() || null,
    sortOrder: Number(document.getElementById('brandSortOrder').value) || 0,
    category:   document.getElementById('brandCategory').value || null,
    aboutBrand: document.getElementById('brandAbout').value.trim() || null,
    bannerUrl:  document.getElementById('brandBannerUrl').value.trim() || null,
    websiteUrl: document.getElementById('brandWebsite').value.trim() || null,
    isActive:  document.getElementById('brandIsActive').checked,
  };

  brandSubmitBtn.disabled    = true;
  brandSubmitBtn.textContent = 'Saving…';

  try {
    const res = await fetch(id ? `/api/admin/partner-brands/${id}` : '/api/admin/partner-brands', {
      method:  id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    const json = await res.json();

    if (!res.ok) {
      brandFormError.textContent = json.error || 'Something went wrong. Please try again.';
      return;
    }

    closeModal();
    await loadBrands();
  } catch {
    brandFormError.textContent = 'Network error — please try again.';
  } finally {
    brandSubmitBtn.disabled    = false;
    brandSubmitBtn.textContent = 'Save Brand';
  }
});

async function deleteBrand(id) {
  const brand = allBrands.find(b => b.id === id);
  if (!brand) return;
  if (!confirm(`Delete "${brand.brandName}"? This cannot be undone.`)) return;

  try {
    const res = await fetch(`/api/admin/partner-brands/${id}`, { method: 'DELETE' });
    if (!res.ok) { alert('Failed to delete brand.'); return; }
    await loadBrands();
  } catch {
    alert('Network error — please try again.');
  }
}

// ── Load ──────────────────────────────────────────────────────
async function loadBrands() {
  const res = await fetch('/api/admin/partner-brands');
  if (!res.ok) { window.location.href = '/admin-login.html'; return; }
  allBrands = await res.json();
  renderTable(allBrands);
}

async function init() {
  try {
    await loadBrands();
  } catch {
    window.location.href = '/admin-login.html';
  }

  document.getElementById('searchInput').addEventListener('input', e => {
    renderTable(filterBrands(e.target.value.trim()));
  });

  document.getElementById('adminSignout').addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    window.location.href = '/';
  });
}

document.addEventListener('DOMContentLoaded', init);


// ── Banner image upload (same admin upload endpoint as the logo) ──
(function () {
  const btn = document.getElementById('brandBannerUploadBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const file = document.getElementById('brandBannerFile').files[0];
    const status = document.getElementById('brandBannerStatus');
    if (!file) { status.textContent = 'Choose an image file first.'; return; }
    btn.disabled = true; btn.textContent = 'Uploading…';
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/admin/partner-brands/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) { status.textContent = json.error || 'Upload failed.'; return; }
      document.getElementById('brandBannerUrl').value = json.url;
      status.textContent = 'Uploaded — remember to press Save.';
    } catch {
      status.textContent = 'Network error — please try again.';
    } finally {
      btn.disabled = false; btn.textContent = 'Upload';
    }
  });
})();
