let allBrands = [];
let activeTab = 'all';
const selectedIds = new Set();

// Cold list = not live yet (imported brands, or anything switched off).
const isLive = b => !!b.isActive;

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function renderTable(brands) {
  const tbody = document.getElementById('brandsBody');
  const count = document.getElementById('tableCount');

  if (!brands.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="table-empty">No partner brands found.</td></tr>';
    count.textContent = '';
    updateTabCounts();
    return;
  }

  tbody.innerHTML = brands.map(b => `
    <tr>
      <td><input type="checkbox" class="bulk-pick" data-id="${b.id}" ${selectedIds.has(b.id) ? 'checked' : ''} style="width:auto;" /></td>
      <td>${b.logoUrl ? `<img src="${escapeHtml(b.logoUrl)}" alt="" loading="lazy" style="width:60px;height:40px;object-fit:contain;background:#fff;border-radius:4px;display:block;" />` : `<span title="No logo yet" style="width:60px;height:40px;border-radius:4px;display:grid;place-items:center;background:#FFB300;color:#000;font-weight:900;">${escapeHtml((b.brandName || '?').charAt(0).toUpperCase())}</span>`}</td>
      <td>${escapeHtml(b.brandName)}</td>
      <td>${b.slug ? `<a href="/deals/${escapeHtml(b.slug)}" target="_blank" rel="noopener" style="color:rgba(255,255,255,0.5);font-size:12px;">/deals/${escapeHtml(b.slug)}</a>` : '—'}</td>
      <td>${b.liveOffers ? `<a href="${b.liveOffers === 1 && b.liveOfferIds ? '/admin/offers?edit=' + b.liveOfferIds[0] : '/admin/offers?search=' + encodeURIComponent(b.brandName)}" title="Open ${b.liveOffers === 1 ? 'this offer' : 'these offers'} in Manage Offers" style="color:#4ade80;font-weight:700;">Yes (${b.liveOffers}) &rarr;</a>` : '<span style="color:#f87171;font-weight:700;">No</span> - page says "No offer at present"'}</td>
      <td>${b.sortOrder || 0}</td>
      <td>${b.featuredCarousel ? '<span title="On the homepage brands carousel" style="color:#FFB300;">&#9733; Carousel</span><br>' : ''}${isLive(b) ? '<span style="color:#4ade80;font-weight:700;">Live</span>' : b.logoUrl ? '<span style="color:#FFB300;font-weight:700;">Cold</span> - logo added, tick Live when ready' : '<span style="color:#FFB300;font-weight:700;">Cold</span> - needs a logo'}</td>
      <td>
        <button type="button" class="table-link brand-offer-btn" data-id="${b.id}" style="margin-right:10px;background:none;border:none;cursor:pointer;color:#FFB300;font-weight:700;">+ Offer</button>
        <button type="button" class="table-link brand-edit-btn" data-id="${b.id}" style="margin-right:10px;background:none;border:none;cursor:pointer;">Edit</button>
        <button type="button" class="table-link brand-delete-btn" data-id="${b.id}" style="background:none;border:none;cursor:pointer;color:#f87171;">Delete</button>
      </td>
    </tr>`).join('');

  count.textContent = `Showing ${brands.length} of ${allBrands.length} brand${allBrands.length !== 1 ? 's' : ''}`;
  updateTabCounts();

  tbody.querySelectorAll('.bulk-pick').forEach(cb => cb.addEventListener('change', () => {
    const id = Number(cb.dataset.id);
    if (cb.checked) selectedIds.add(id); else selectedIds.delete(id);
    updateBulkCount();
  }));
  updateBulkCount();
  tbody.querySelectorAll('.brand-offer-btn').forEach(btn => {
    btn.addEventListener('click', () => openQuickOffer(Number(btn.dataset.id)));
  });
  tbody.querySelectorAll('.brand-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => openModal(Number(btn.dataset.id)));
  });
  tbody.querySelectorAll('.brand-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteBrand(Number(btn.dataset.id)));
  });
}

// Column filters (logo / carousel / offers / category) combine with the
// All / Live / Cold tabs and the search box.
function filterValue(id) { const el = document.getElementById(id); return el ? el.value : ''; }
function matchYesNo(value, has) { return !value || (value === 'yes') === has; }
function filterBrands(query) {
  const q = (query || '').toLowerCase();
  const logo = filterValue('fLogo'), carousel = filterValue('fCarousel'), offers = filterValue('fOffers'), cat = filterValue('fCategory');
  return allBrands.filter(b =>
    (activeTab === 'all' || (activeTab === 'live') === isLive(b)) &&
    (!q || (b.brandName || '').toLowerCase().includes(q) || (b.tags || '').toLowerCase().includes(q)) &&
    matchYesNo(logo, !!b.logoUrl) &&
    matchYesNo(carousel, !!b.featuredCarousel) &&
    matchYesNo(offers, (b.liveOffers || 0) > 0) &&
    (!cat || b.category === cat));
}

function updateTabCounts() {
  const live = allBrands.filter(isLive).length;
  const n = { all: allBrands.length, live, cold: allBrands.length - live };
  document.querySelectorAll('.brand-tab[data-tab]').forEach(t => {
    t.textContent = { all: 'All', live: 'Live', cold: 'Cold list' }[t.dataset.tab] + ' (' + n[t.dataset.tab] + ')';
    t.classList.toggle('active', t.dataset.tab === activeTab);
  });
}

function refreshTable() {
  renderTable(filterBrands(document.getElementById('searchInput').value.trim()));
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
  document.getElementById('brandCarousel').checked = false;
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
      document.getElementById('brandTags').value      = brand.tags || '';
      document.getElementById('brandIsActive').checked = !!brand.isActive;
      document.getElementById('brandCarousel').checked = !!brand.featuredCarousel;
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
    logoUrl:   document.getElementById('brandLogoUrl').value.trim() || null,
    slug:      brandSlugInput.value.trim() || null,
    sortOrder: Number(document.getElementById('brandSortOrder').value) || 0,
    category:   document.getElementById('brandCategory').value || null,
    aboutBrand: document.getElementById('brandAbout').value.trim() || null,
    bannerUrl:  document.getElementById('brandBannerUrl').value.trim() || null,
    websiteUrl: document.getElementById('brandWebsite').value.trim() || null,
    tags: document.getElementById('brandTags').value.split(',').map(t => t.trim().toLowerCase()).filter(Boolean).join(', ') || null,
    isActive:  document.getElementById('brandIsActive').checked,
    featuredCarousel: document.getElementById('brandCarousel').checked,
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
  refreshTable();
}

async function init() {
  try {
    await loadBrands();
  } catch {
    window.location.href = '/admin-login.html';
  }

  document.getElementById('searchInput').addEventListener('input', refreshTable);
  document.querySelectorAll('.brand-tab[data-tab]').forEach(t => t.addEventListener('click', () => { activeTab = t.dataset.tab; refreshTable(); }));
  // Column filters
  const catSel = document.getElementById('fCategory');
  if (catSel) {
    [...document.querySelectorAll('#brandCategory option')].filter(o => o.value).forEach(o => {
      const opt = document.createElement('option'); opt.value = o.value; opt.textContent = o.value; catSel.appendChild(opt);
    });
    const syncFilters = () => {
      document.querySelectorAll('.brand-filter').forEach(s => s.classList.toggle('on', !!s.value));
      refreshTable();
    };
    document.querySelectorAll('.brand-filter').forEach(s => s.addEventListener('change', syncFilters));
    document.getElementById('fReset').addEventListener('click', () => {
      document.querySelectorAll('.brand-filter').forEach(s => { s.value = ''; });
      document.getElementById('searchInput').value = '';
      activeTab = 'all';
      syncFilters();
    });
  }
  initImport();

  document.getElementById('adminSignout').addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    window.location.href = '/';
  });
}

// ── Import brands from Excel / CSV (cold list) ─────────────────
// The file is read in the browser (SheetJS), shown as a preview, and only
// sent once every category wording has been matched to a Logicard category.

// Same rule as the server's brandSlug(): "Spabreaks.com" -> spabreakscom
function importSlug(name) {
  return String(name || '').toLowerCase().replace(/[.'’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Words that point at each category, for suggesting a match for wording
// like "Utility/Mobile phone". The admin confirms or changes every match.
const CATEGORY_HINTS = {
  'Adult': ['adult', '18'],
  'Advice': ['advice', 'guidance'],
  'Beauty & Wellness': ['beauty', 'health', 'wellness', 'cosmetic', 'cosmetics', 'skincare', 'hair', 'haircare', 'makeup', 'spa', 'fragrance'],
  'Benefits': ['benefit', 'benefits', 'perks'],
  'Children & Baby': ['child', 'children', 'baby', 'kids', 'toys', 'toy', 'nursery'],
  'E-learning': ['learning', 'elearning', 'course', 'courses', 'education', 'training', 'online'],
  'Events & Experiences': ['event', 'events', 'experience', 'experiences', 'tickets', 'concert', 'festival'],
  'Family, Leisure & Travel': ['travel', 'holiday', 'holidays', 'hotel', 'hotels', 'flights', 'flight', 'leisure', 'family', 'cruise', 'airport', 'parking'],
  'Fashion & Lifestyle': ['fashion', 'clothing', 'clothes', 'apparel', 'lifestyle', 'shoes', 'footwear', 'jewellery', 'jewelry', 'accessories'],
  'Financial Wellbeing': ['finance', 'financial', 'insurance', 'bank', 'banking', 'money', 'loan', 'loans', 'credit', 'mortgage', 'pension'],
  'Food & Drink': ['food', 'drink', 'drinks', 'grocery', 'groceries', 'restaurant', 'restaurants', 'meal', 'meals', 'wine', 'beer', 'spirits', 'coffee', 'takeaway'],
  'Gifts & Flowers': ['gift', 'gifts', 'flowers', 'flower', 'gifting', 'hampers'],
  'Home & Garden': ['home', 'garden', 'diy', 'furniture', 'homeware', 'homewares', 'kitchen', 'bedding', 'appliances'],
  'Mental Wellbeing': ['mental', 'mindfulness', 'therapy', 'counselling', 'sleep', 'meditation', 'wellbeing'],
  'Pets': ['pet', 'pets', 'dog', 'dogs', 'cat', 'cats', 'vet'],
  'Shopping Cards': ['giftcard', 'giftcards', 'voucher', 'vouchers', 'shopping'],
  'Sport & Fitness': ['sport', 'sports', 'fitness', 'gym', 'supplement', 'supplements', 'nutrition', 'protein', 'outdoor'],
  'Technology & Office': ['tech', 'technology', 'electronic', 'electronics', 'computer', 'computers', 'laptop', 'laptops', 'office', 'gadget', 'gadgets', 'software'],
  'Things to Do': ['days', 'out', 'entertainment', 'attraction', 'attractions', 'activity', 'activities', 'cinema', 'theme', 'park'],
  'Trade Supplies & Tools': ['trade', 'tools', 'tool', 'building', 'business', 'hardware', 'plumbing', 'electrical'],
  'Utilities & Mobile': ['utility', 'utilities', 'mobile', 'mobiles', 'phone', 'phones', 'broadband', 'energy', 'sim', 'network', 'telecom', 'telecoms', 'gas', 'electricity', 'internet', 'tv'],
  'Vehicles & Motoring': ['car', 'cars', 'motoring', 'vehicle', 'vehicles', 'auto', 'motor', 'tyre', 'tyres', 'fuel', 'van', 'vans', 'breakdown'],
  'Workwear': ['workwear', 'ppe', 'hivis', 'boots', 'uniform', 'uniforms', 'safety'],
};

function importCategories() {
  return [...document.querySelectorAll('#brandCategory option')].map(o => o.value).filter(Boolean);
}

function suggestCategory(raw) {
  const cats = importCategories();
  const norm = s => String(s).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
  const r = norm(raw);
  if (!r) return '';
  const exact = cats.find(c => norm(c) === r);
  if (exact) return exact;
  const words = r.replace(/gift card/g, 'giftcard').replace(/hi vis/g, 'hivis').replace(/days out/g, 'days out').split(' ');
  let best = '', bestScore = 0, tie = false;
  for (const c of cats) {
    const hints = CATEGORY_HINTS[c] || [];
    // A hint word counts double; a word that merely appears in the category name counts once
    const score = words.reduce((n, w) => n + (hints.includes(w) ? 2 : norm(c).split(' ').includes(w) && w.length > 3 ? 1 : 0), 0);
    if (score > bestScore) { best = c; bestScore = score; tie = false; } else if (score && score === bestScore) tie = true;
  }
  return bestScore && !tie ? best : '';
}

// Find the header row and the name / category / description columns.
function readImportRows(sheetRows) {
  const isName = h => /brand|company|business|merchant|name/.test(h);
  const isCat = h => /categor|sector|type|industry/.test(h);
  const isDesc = h => /desc|about|what|summary|detail/.test(h);
  let headerIdx = sheetRows.findIndex(r => r.some(c => isName(String(c).toLowerCase())));
  let col = { name: 0, cat: 1, desc: 2, web: -1, logo: -1 };
  if (headerIdx !== -1 && headerIdx < 10) {
    const h = sheetRows[headerIdx].map(c => String(c).toLowerCase().trim());
    const find = (test, fallback) => { const i = h.findIndex(test); return i === -1 ? fallback : i; };
    col = { cat: find(isCat, 1), desc: find(isDesc, 2), web: find(x => /website|web site|homepage/.test(x), -1), logo: find(x => /logo/.test(x), -1), tags: find(x => /\btags?\b|keywords/.test(x), -1) };
    col.name = h.findIndex((x, i) => isName(x) && i !== col.cat && i !== col.desc);
    if (col.name === -1) col.name = 0;
  } else headerIdx = -1;
  const rows = [];
  sheetRows.slice(headerIdx + 1).forEach((r, i) => {
    const brandName = String(r[col.name] ?? '').trim();
    const rawCategory = String(r[col.cat] ?? '').trim();
    const aboutBrand = String(r[col.desc] ?? '').trim();
    const websiteUrl = col.web >= 0 ? String(r[col.web] ?? '').trim() : '';
    const logoUrl = col.logo >= 0 ? String(r[col.logo] ?? '').trim() : '';
    const tags = col.tags >= 0 ? String(r[col.tags] ?? '').trim() : '';
    if (!brandName && !rawCategory && !aboutBrand) return; // blank line
    rows.push({ line: headerIdx + 2 + i, brandName, rawCategory, aboutBrand, websiteUrl, logoUrl, tags });
  });
  return rows;
}

let importRows = [];
let importMap = {}; // raw category wording -> Logicard category

function renderImportPreview() {
  const box = document.getElementById('importPreview');
  const go = document.getElementById('importGoBtn');
  const cats = importCategories();
  const existing = new Set(allBrands.flatMap(b => [b.slug, importSlug(b.brandName)]));
  const named = importRows.filter(r => r.brandName);
  const seen = new Set();
  let dupes = 0;
  const fresh = named.filter(r => { const s = importSlug(r.brandName); if (seen.has(s)) { dupes++; return false; } seen.add(s); return !existing.has(s); });
  const already = named.length - fresh.length - dupes;
  const noName = importRows.length - named.length;
  const longDesc = named.filter(r => r.aboutBrand.length > 1500).length;
  const noDesc = named.filter(r => !r.aboutBrand).length;
  const withLogo = named.filter(r => /^https?:\/\//i.test(r.logoUrl)).length;

  const groups = {};
  named.forEach(r => { groups[r.rawCategory] = (groups[r.rawCategory] || 0) + 1; });
  const unmatched = Object.keys(groups).filter(k => !importMap[k]).length;

  box.innerHTML = `
    <p class="imp-note"><strong>${named.length}</strong> brands read: <strong style="color:#4ade80;">${fresh.length} new</strong> will go on the cold list${already ? `, <strong>${already}</strong> already exist` : ''}${dupes ? `, <strong>${dupes}</strong> repeated in the file (first one used)` : ''}${noName ? `, ${noName} row${noName > 1 ? 's' : ''} with no brand name (ignored)` : ''}.</p>
    ${already ? `<label class="imp-note" style="display:flex;gap:8px;align-items:center;"><input type="checkbox" id="importUpdate" style="width:auto;" /> Update the category, description and website link of the ${already} that already exist (their logo and live status are not changed)</label>` : ''}
    ${withLogo ? `<p class="imp-note">${withLogo} brand${withLogo > 1 ? 's come' : ' comes'} with a logo link. ${withLogo > 1 ? 'They' : 'It'} still stay on the cold list until you check the logo and tick Live.</p>` : ''}
    ${noDesc ? `<p class="imp-note">${noDesc} brand${noDesc > 1 ? 's have' : ' has'} no description. You can add ${noDesc > 1 ? 'them' : 'it'} later from Edit.</p>` : ''}
    ${longDesc ? `<p class="imp-note" style="color:#f87171;">${longDesc} description${longDesc > 1 ? 's are' : ' is'} over 1,500 characters and will be skipped. Shorten ${longDesc > 1 ? 'them' : 'it'} in the file first.</p>` : ''}
    <p class="imp-note"><strong>Match each category in your file</strong> to a Logicard category${unmatched ? ` (<span style="color:#f87171;">${unmatched} still to choose</span>)` : ' (all matched)'}:</p>
    <table class="imp-table"><thead><tr><th>In your file</th><th>Brands</th><th>Logicard category</th></tr></thead><tbody>
      ${Object.entries(groups).sort((a, b) => b[1] - a[1]).map(([raw, n]) => `
        <tr><td>${escapeHtml(raw || '(blank)')}</td><td>${n}</td><td>
          <select data-raw="${escapeHtml(raw)}" class="${importMap[raw] ? '' : 'imp-missing'}">
            <option value="">— Choose —</option>
            ${cats.map(c => `<option${importMap[raw] === c ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('')}
          </select></td></tr>`).join('')}
    </tbody></table>
    <p class="imp-note">First rows:</p>
    <table class="imp-table"><thead><tr><th>Row</th><th>Brand</th><th>Page</th><th>Category</th><th>Description</th></tr></thead><tbody>
      ${named.slice(0, 8).map(r => `<tr><td>${r.line}</td><td>${escapeHtml(r.brandName)}</td><td>/deals/${escapeHtml(importSlug(r.brandName))}</td><td>${escapeHtml(importMap[r.rawCategory] || '—')}</td><td>${escapeHtml(r.aboutBrand.slice(0, 90))}${r.aboutBrand.length > 90 ? '…' : ''}</td></tr>`).join('')}
    </tbody></table>`;

  box.querySelectorAll('select[data-raw]').forEach(sel => sel.addEventListener('change', () => {
    importMap[sel.dataset.raw] = sel.value;
    renderImportPreview();
  }));
  go.disabled = !fresh.length && !already || unmatched > 0;
  go.textContent = unmatched ? `Choose ${unmatched} categor${unmatched > 1 ? 'ies' : 'y'} to continue`
    : fresh.length ? `Import ${fresh.length} brand${fresh.length !== 1 ? 's' : ''} to the cold list${already ? ' (and update existing if ticked)' : ''}`
    : `Update the ${already} existing brand${already !== 1 ? 's' : ''} (tick the box above)`;
}

function initImport() {
  const modal = document.getElementById('importModal');
  const fileInput = document.getElementById('importFile');
  const err = document.getElementById('importError');
  const go = document.getElementById('importGoBtn');

  document.getElementById('importBrandsBtn').addEventListener('click', () => {
    importRows = []; importMap = {}; fileInput.value = ''; err.textContent = '';
    document.getElementById('importPreview').innerHTML = '';
    go.disabled = true; go.textContent = 'Import';
    modal.style.display = 'flex';
  });
  document.getElementById('importCancelBtn').addEventListener('click', () => { modal.style.display = 'none'; });

  fileInput.addEventListener('change', async () => {
    err.textContent = '';
    const file = fileInput.files[0];
    if (!file) return;
    if (typeof XLSX === 'undefined') { err.textContent = 'The spreadsheet reader did not load. Check your connection and refresh the page.'; return; }
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      importRows = readImportRows(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false }));
      if (!importRows.length) { err.textContent = 'No brands found in the first sheet of that file.'; return; }
      importMap = {};
      [...new Set(importRows.map(r => r.rawCategory))].forEach(raw => { importMap[raw] = suggestCategory(raw); });
      renderImportPreview();
    } catch {
      err.textContent = 'Could not read that file. Please upload an .xlsx or .csv file.';
    }
  });

  go.addEventListener('click', async () => {
    err.textContent = '';
    const rows = importRows.filter(r => r.brandName && r.aboutBrand.length <= 1500)
      .map(r => ({ line: r.line, brandName: r.brandName, category: importMap[r.rawCategory], aboutBrand: r.aboutBrand, websiteUrl: r.websiteUrl, logoUrl: r.logoUrl, tags: r.tags }));
    const upd = document.getElementById('importUpdate');
    go.disabled = true; go.textContent = 'Importing…';
    try {
      const res = await fetch('/api/admin/partner-brands/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, updateExisting: !!(upd && upd.checked) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Import failed.');
      const problems = (json.invalid || []).map(p => `row ${p.line}${p.brandName ? ' (' + p.brandName + ')' : ''}: ${p.error}`);
      document.getElementById('importPreview').innerHTML = `<p class="imp-note" style="color:#4ade80;font-weight:700;">Done: ${json.created} added to the cold list${json.updated ? `, ${json.updated} updated` : ''}${json.skipped ? `, ${json.skipped} already existed (skipped)` : ''}.</p>` +
        (problems.length ? `<p class="imp-note" style="color:#f87171;">Not imported:<br>${problems.map(escapeHtml).join('<br>')}</p>` : '');
      go.textContent = 'Imported';
      activeTab = 'cold';
      await loadBrands();
    } catch (e) {
      err.textContent = e.message;
      go.disabled = false; go.textContent = 'Try again';
    }
  });
}

// ── Bulk Live / Cold list ──────────────────────────────────────
function updateBulkCount() {
  const el = document.getElementById('bulkCount');
  if (el) el.textContent = selectedIds.size + ' selected';
  const all = document.getElementById('bulkAllShown');
  if (all) { const shown = [...document.querySelectorAll('.bulk-pick')]; all.checked = shown.length > 0 && shown.every(c => c.checked); }
}
async function bulkSetLive(live) {
  const msg = document.getElementById('bulkMsg');
  if (!selectedIds.size) { msg.textContent = 'Tick some brands first.'; return; }
  const noLogo = live ? allBrands.filter(b => selectedIds.has(b.id) && !b.logoUrl).length : 0;
  const ok = confirm((live ? 'Make ' : 'Move ') + selectedIds.size + ' brand' + (selectedIds.size !== 1 ? 's' : '') + (live ? ' live on the website' : ' to the cold list (hidden from the website)') + '?' + (noLogo ? '\n\n' + noLogo + ' have no logo and will stay on the cold list.' : ''));
  if (!ok) return;
  msg.textContent = 'Saving…';
  try {
    const res = await fetch('/api/admin/partner-brands/bulk-live', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [...selectedIds], live }) });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Could not update the brands.');
    msg.textContent = json.changed + (live ? ' now live' : ' moved to the cold list') + (json.skipped ? ', ' + json.skipped + ' skipped (no logo)' : '') + '.';
    selectedIds.clear();
    await loadBrands();
  } catch (e) {
    msg.textContent = e.message;
  }
}
(function initBulk() {
  if (!document.getElementById('bulkBar')) return;
  // Pin the bulk buttons just below the (sticky) admin header
  const setHeaderHeight = () => {
    const h = document.querySelector('.admin-header');
    document.documentElement.style.setProperty('--admin-header-h', (h ? h.offsetHeight : 0) + 'px');
  };
  setHeaderHeight();
  window.addEventListener('resize', setHeaderHeight);
  document.getElementById('bulkSelectLogo').addEventListener('click', () => {
    filterBrands(document.getElementById('searchInput').value.trim()).filter(b => b.logoUrl).forEach(b => selectedIds.add(b.id));
    refreshTable();
  });
  document.getElementById('bulkClear').addEventListener('click', () => { selectedIds.clear(); document.getElementById('bulkMsg').textContent = ''; refreshTable(); });
  document.getElementById('bulkAllShown').addEventListener('change', e => {
    document.querySelectorAll('.bulk-pick').forEach(cb => { const id = Number(cb.dataset.id); if (e.target.checked) selectedIds.add(id); else selectedIds.delete(id); });
    refreshTable();
  });
  // Paste a list of brand names (one per line, # lines ignored) to tick them
  document.getElementById('bulkNamesGo').addEventListener('click', () => {
    const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const byName = new Map(allBrands.map(b => [norm(b.brandName), b]));
    const lines = document.getElementById('bulkNames').value.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    const missing = [];
    let ticked = 0;
    lines.forEach(l => { const b = byName.get(norm(l)); if (b) { selectedIds.add(b.id); ticked++; } else missing.push(l); });
    activeTab = 'all'; document.getElementById('searchInput').value = ''; refreshTable();
    document.getElementById('bulkNamesMsg').textContent = ticked + ' ticked.' + (missing.length ? ' Not found: ' + missing.join(', ') : '');
  });
  document.getElementById('bulkLive').addEventListener('click', () => bulkSetLive(true));
  const bulkCarousel = async on => {
    const msg = document.getElementById('bulkMsg');
    if (!selectedIds.size) { msg.textContent = 'Tick some brands first.'; return; }
    msg.textContent = 'Saving…';
    try {
      const res = await fetch('/api/admin/partner-brands/bulk-carousel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [...selectedIds], on }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not update the carousel.');
      msg.textContent = json.changed + (on ? ' added to' : ' removed from') + ' the carousel' + (on ? ' (it only shows live brands with a logo).' : '.');
      selectedIds.clear();
      await loadBrands();
    } catch (e) { msg.textContent = e.message; }
  };
  document.getElementById('bulkCarouselOn').addEventListener('click', () => bulkCarousel(true));
  document.getElementById('bulkCarouselOff').addEventListener('click', () => bulkCarousel(false));
  document.getElementById('bulkCold').addEventListener('click', () => bulkSetLive(false));
})();

// ── Quick "Add offer" for a brand ──────────────────────────────
let qoBrand = null;
function qoSync() {
  const type = document.getElementById('qoRedeem').value;
  document.getElementById('qoCodeField').style.display = type === 'code' ? '' : 'none';
  const headline = document.getElementById('qoHeadline').value.trim() || '[headline]';
  const how = { code: 'Copy your code and enter it at checkout', unique: 'Get your own unique code and enter it at checkout', link: 'Your discount applies when you shop through the Logicard link', instore: 'Show your digital Logicard in store to claim it' }[type];
  document.getElementById('qoDescHint').textContent = 'Blank = "Logicard members get ' + headline + ' at ' + (qoBrand ? qoBrand.brandName : '') + '. ' + how + '."';
}
function openQuickOffer(id) {
  qoBrand = allBrands.find(b => b.id === id);
  if (!qoBrand) return;
  document.getElementById('qoForm').reset();
  document.getElementById('qoForm').style.display = '';
  document.getElementById('qoDone').style.display = 'none';
  document.getElementById('qoError').textContent = '';
  document.getElementById('qoActive').checked = true;
  document.getElementById('qoTitle').textContent = 'Add offer: ' + qoBrand.brandName;
  const missing = [!qoBrand.logoUrl && 'a logo', !qoBrand.websiteUrl && 'a website / Awin link', !qoBrand.category && 'a category', !qoBrand.aboutBrand && '"About the brand" text'].filter(Boolean);
  document.getElementById('qoNote').innerHTML = missing.length
    ? '<span style="color:#f87171;">This brand still needs ' + missing.join(', ') + '. Add ' + (missing.length > 1 ? 'them' : 'it') + ' with Edit first.</span>'
    : 'Just the deal. The brand name, category, About text, logo and your tracked link are copied from the brand.' + (qoBrand.isActive ? '' : ' <span style="color:#FFB300;">This brand is still on the cold list: tick Live on the brand too, or its page will not show.</span>');
  qoSync();
  document.getElementById('qoModal').style.display = 'flex';
}
(function initQuickOffer() {
  const modal = document.getElementById('qoModal');
  if (!modal) return;
  document.getElementById('qoRedeem').addEventListener('change', qoSync);
  document.getElementById('qoHeadline').addEventListener('input', qoSync);
  document.getElementById('qoCancel').addEventListener('click', () => { modal.style.display = 'none'; });
  document.getElementById('qoImageUpload').addEventListener('click', async () => {
    const file = document.getElementById('qoImageFile').files[0];
    const err = document.getElementById('qoError');
    if (!file) { err.textContent = 'Choose an image file first.'; return; }
    const fd = new FormData(); fd.append('file', file);
    try {
      const res = await fetch('/api/admin/partner-brands/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Upload failed.');
      document.getElementById('qoImage').value = json.url; err.textContent = '';
    } catch (e) { err.textContent = e.message; }
  });
  document.getElementById('qoForm').addEventListener('submit', async e => {
    e.preventDefault();
    const err = document.getElementById('qoError');
    const val = id => document.getElementById(id).value.trim();
    err.textContent = '';
    if (!val('qoHeadline')) { err.textContent = 'Please enter the offer headline, e.g. 20% off everything.'; return; }
    if (val('qoRedeem') === 'code' && !val('qoCode')) { err.textContent = 'Please enter the discount code.'; return; }
    const btn = document.getElementById('qoSave'); btn.disabled = true; btn.textContent = 'Adding…';
    try {
      const res = await fetch('/api/admin/partner-brands/' + qoBrand.id + '/quick-offer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headline: val('qoHeadline'), redeemType: val('qoRedeem'), code: val('qoCode'), terms: val('qoTerms'),
          endDate: document.getElementById('qoEnd').value || null, description: val('qoDesc'), imageUrl: val('qoImage'),
          isActive: document.getElementById('qoActive').checked }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not add the offer.');
      document.getElementById('qoForm').style.display = 'none';
      const done = document.getElementById('qoDone');
      done.style.display = '';
      done.innerHTML = '<p class="imp-note" style="color:#4ade80;font-weight:700;">Offer added.</p>' +
        '<p class="imp-note">Offer page: <a href="' + json.offerPage + '" target="_blank" rel="noopener" style="color:#FFB300;">logicard.co.uk' + escapeHtml(json.offerPage) + '</a><br>' +
        'Brand page: <a href="' + json.brandPage + '" target="_blank" rel="noopener" style="color:#FFB300;">logicard.co.uk' + escapeHtml(json.brandPage) + '</a>' +
        (json.brandLive ? '' : ' <span style="color:#FFB300;">(shows once you tick Live on the brand)</span>') + '</p>' +
        '<p class="imp-note">Need more options (featured, unique codes, how-to steps)? Edit it in Manage Offers.</p>' +
        '<button type="button" id="qoClose" style="width:100%;padding:12px;border-radius:8px;border:none;background:#FFB300;color:#000;font-weight:800;cursor:pointer;">Done</button>';
      document.getElementById('qoClose').addEventListener('click', () => { modal.style.display = 'none'; loadBrands(); });
    } catch (e2) {
      err.textContent = e2.message;
    } finally {
      btn.disabled = false; btn.textContent = 'Add offer';
    }
  });
})();

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
