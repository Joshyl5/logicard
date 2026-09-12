let allBrands = [];

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function renderTable(brands) {
  const tbody = document.getElementById('brandsBody');
  const count = document.getElementById('tableCount');

  if (!brands.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No partner brands found.</td></tr>';
    count.textContent = '';
    return;
  }

  tbody.innerHTML = brands.map(b => `
    <tr>
      <td><img src="${escapeHtml(b.logoUrl)}" alt="" style="width:60px;height:40px;object-fit:contain;background:#fff;border-radius:4px;display:block;" /></td>
      <td>${escapeHtml(b.brandName)}</td>
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

// ── Modal ─────────────────────────────────────────────────────
const brandModal      = document.getElementById('brandModal');
const brandModalTitle = document.getElementById('brandModalTitle');
const brandForm       = document.getElementById('brandForm');
const brandFormError  = document.getElementById('brandFormError');
const brandSubmitBtn  = document.getElementById('brandSubmitBtn');

function openModal(id) {
  brandFormError.textContent = '';
  brandForm.reset();
  document.getElementById('brandId').value        = '';
  document.getElementById('brandIsActive').checked = true;
  document.getElementById('brandSortOrder').value  = 0;

  if (id) {
    const brand = allBrands.find(b => b.id === id);
    if (brand) {
      brandModalTitle.textContent = 'Edit Brand';
      document.getElementById('brandId').value        = brand.id;
      document.getElementById('brandName').value      = brand.brandName || '';
      document.getElementById('brandLogoUrl').value   = brand.logoUrl || '';
      document.getElementById('brandSortOrder').value = brand.sortOrder || 0;
      document.getElementById('brandIsActive').checked = !!brand.isActive;
    }
  } else {
    brandModalTitle.textContent = 'Add Brand';
  }

  brandModal.style.display = 'flex';
}

function closeModal() { brandModal.style.display = 'none'; }

document.getElementById('addBrandBtn').addEventListener('click', () => openModal(null));
document.getElementById('brandCancelBtn').addEventListener('click', closeModal);
brandModal.addEventListener('click', e => { if (e.target === brandModal) closeModal(); });

brandForm.addEventListener('submit', async e => {
  e.preventDefault();
  brandFormError.textContent = '';

  const id      = document.getElementById('brandId').value;
  const payload = {
    brandName: document.getElementById('brandName').value.trim(),
    logoUrl:   document.getElementById('brandLogoUrl').value.trim(),
    sortOrder: Number(document.getElementById('brandSortOrder').value) || 0,
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
