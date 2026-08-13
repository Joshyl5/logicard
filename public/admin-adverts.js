let allAdverts = [];

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function renderTable(adverts) {
  const tbody = document.getElementById('advertsBody');
  const count = document.getElementById('tableCount');

  if (!adverts.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No adverts found.</td></tr>';
    count.textContent = '';
    return;
  }

  tbody.innerHTML = adverts.map(a => `
    <tr>
      <td><img src="${escapeHtml(a.imageUrl)}" alt="" style="width:60px;height:40px;object-fit:cover;border-radius:4px;display:block;" /></td>
      <td>${escapeHtml(a.title)}</td>
      <td>${a.linkUrl ? `<span style="color:rgba(255,255,255,0.5);font-size:12px;">${escapeHtml(a.linkUrl)}</span>` : '—'}</td>
      <td>${a.sortOrder || 0}</td>
      <td>${a.isActive ? 'Yes' : 'No'}</td>
      <td>${a.clickCount || 0}</td>
      <td>
        <button type="button" class="table-link advert-edit-btn" data-id="${a.id}" style="margin-right:10px;background:none;border:none;cursor:pointer;">Edit</button>
        <button type="button" class="table-link advert-delete-btn" data-id="${a.id}" style="background:none;border:none;cursor:pointer;color:#f87171;">Delete</button>
      </td>
    </tr>`).join('');

  count.textContent = `Showing ${adverts.length} of ${allAdverts.length} advert${allAdverts.length !== 1 ? 's' : ''}`;

  tbody.querySelectorAll('.advert-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => openModal(Number(btn.dataset.id)));
  });
  tbody.querySelectorAll('.advert-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteAdvert(Number(btn.dataset.id)));
  });
}

function filterAdverts(query) {
  if (!query) return allAdverts;
  const q = query.toLowerCase();
  return allAdverts.filter(a => (a.title || '').toLowerCase().includes(q));
}

// ── Modal ─────────────────────────────────────────────────────
const advertModal      = document.getElementById('advertModal');
const advertModalTitle = document.getElementById('advertModalTitle');
const advertForm       = document.getElementById('advertForm');
const advertFormError  = document.getElementById('advertFormError');
const advertSubmitBtn  = document.getElementById('advertSubmitBtn');

function openModal(id) {
  advertFormError.textContent = '';
  advertForm.reset();
  document.getElementById('advertId').value        = '';
  document.getElementById('advertIsActive').checked = true;
  document.getElementById('advertSortOrder').value  = 0;

  if (id) {
    const advert = allAdverts.find(a => a.id === id);
    if (advert) {
      advertModalTitle.textContent = 'Edit Advert';
      document.getElementById('advertId').value       = advert.id;
      document.getElementById('advertTitle').value     = advert.title || '';
      document.getElementById('advertImageUrl').value  = advert.imageUrl || '';
      document.getElementById('advertLinkUrl').value   = advert.linkUrl || '';
      document.getElementById('advertSortOrder').value = advert.sortOrder || 0;
      document.getElementById('advertIsActive').checked = !!advert.isActive;
    }
  } else {
    advertModalTitle.textContent = 'Add Advert';
  }

  advertModal.style.display = 'flex';
}

function closeModal() { advertModal.style.display = 'none'; }

document.getElementById('addAdvertBtn').addEventListener('click', () => openModal(null));
document.getElementById('advertCancelBtn').addEventListener('click', closeModal);
advertModal.addEventListener('click', e => { if (e.target === advertModal) closeModal(); });

advertForm.addEventListener('submit', async e => {
  e.preventDefault();
  advertFormError.textContent = '';

  const id      = document.getElementById('advertId').value;
  const payload = {
    title:     document.getElementById('advertTitle').value.trim(),
    imageUrl:  document.getElementById('advertImageUrl').value.trim(),
    linkUrl:   document.getElementById('advertLinkUrl').value.trim() || null,
    sortOrder: Number(document.getElementById('advertSortOrder').value) || 0,
    isActive:  document.getElementById('advertIsActive').checked,
  };

  advertSubmitBtn.disabled    = true;
  advertSubmitBtn.textContent = 'Saving…';

  try {
    const res = await fetch(id ? `/api/admin/adverts/${id}` : '/api/admin/adverts', {
      method:  id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    const json = await res.json();

    if (!res.ok) {
      advertFormError.textContent = json.error || 'Something went wrong. Please try again.';
      return;
    }

    closeModal();
    await loadAdverts();
  } catch {
    advertFormError.textContent = 'Network error — please try again.';
  } finally {
    advertSubmitBtn.disabled    = false;
    advertSubmitBtn.textContent = 'Save Advert';
  }
});

async function deleteAdvert(id) {
  const advert = allAdverts.find(a => a.id === id);
  if (!advert) return;
  if (!confirm(`Delete "${advert.title}"? This cannot be undone.`)) return;

  try {
    const res = await fetch(`/api/admin/adverts/${id}`, { method: 'DELETE' });
    if (!res.ok) { alert('Failed to delete advert.'); return; }
    await loadAdverts();
  } catch {
    alert('Network error — please try again.');
  }
}

// ── Load ──────────────────────────────────────────────────────
async function loadAdverts() {
  const res = await fetch('/api/admin/adverts');
  if (!res.ok) { window.location.href = '/admin-login.html'; return; }
  allAdverts = await res.json();
  renderTable(allAdverts);
}

async function init() {
  try {
    await loadAdverts();
  } catch {
    window.location.href = '/admin-login.html';
  }

  document.getElementById('searchInput').addEventListener('input', e => {
    renderTable(filterAdverts(e.target.value.trim()));
  });

  document.getElementById('adminSignout').addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    window.location.href = '/';
  });
}

document.addEventListener('DOMContentLoaded', init);
