let allNewsItems = [];

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function renderTable(items) {
  const tbody = document.getElementById('newsBody');
  const count = document.getElementById('tableCount');

  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No news items found.</td></tr>';
    count.textContent = '';
    return;
  }

  tbody.innerHTML = items.map(n => `
    <tr>
      <td>${escapeHtml(n.title)}</td>
      <td>${escapeHtml(n.source)}</td>
      <td>${formatDate(n.publishedAt)}</td>
      <td>${n.isManual ? 'Manual' : 'Auto (RSS)'}</td>
      <td>
        <button type="button" class="table-link news-edit-btn" data-id="${n.id}" style="margin-right:10px;background:none;border:none;cursor:pointer;">Edit</button>
        <button type="button" class="table-link news-delete-btn" data-id="${n.id}" style="background:none;border:none;cursor:pointer;color:#f87171;">Delete</button>
      </td>
    </tr>`).join('');

  count.textContent = `Showing ${items.length} of ${allNewsItems.length} news item${allNewsItems.length !== 1 ? 's' : ''}`;

  tbody.querySelectorAll('.news-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => openModal(Number(btn.dataset.id)));
  });
  tbody.querySelectorAll('.news-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteNewsItem(Number(btn.dataset.id)));
  });
}

function filterNewsItems(query) {
  if (!query) return allNewsItems;
  const q = query.toLowerCase();
  return allNewsItems.filter(n => (n.title || '').toLowerCase().includes(q) || (n.source || '').toLowerCase().includes(q));
}

// ── Modal ─────────────────────────────────────────────────────
const newsModal      = document.getElementById('newsModal');
const newsModalTitle = document.getElementById('newsModalTitle');
const newsForm       = document.getElementById('newsForm');
const newsFormError  = document.getElementById('newsFormError');
const newsSubmitBtn  = document.getElementById('newsSubmitBtn');

function toDateInputValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function openModal(id) {
  newsFormError.textContent = '';
  newsForm.reset();
  document.getElementById('newsId').value = '';

  if (id) {
    const item = allNewsItems.find(n => n.id === id);
    if (item) {
      newsModalTitle.textContent = 'Edit News Item';
      document.getElementById('newsId').value            = item.id;
      document.getElementById('newsTitle').value          = item.title || '';
      document.getElementById('newsLink').value           = item.link || '';
      document.getElementById('newsSource').value         = item.source || '';
      document.getElementById('newsSummary').value        = item.summary || '';
      document.getElementById('newsPublishedAt').value    = toDateInputValue(item.publishedAt);
    }
  } else {
    newsModalTitle.textContent = 'Add News Item';
  }

  newsModal.style.display = 'flex';
}

function closeModal() { newsModal.style.display = 'none'; }

document.getElementById('addNewsBtn').addEventListener('click', () => openModal(null));
document.getElementById('newsCancelBtn').addEventListener('click', closeModal);
newsModal.addEventListener('click', e => { if (e.target === newsModal) closeModal(); });

newsForm.addEventListener('submit', async e => {
  e.preventDefault();
  newsFormError.textContent = '';

  const id      = document.getElementById('newsId').value;
  const dateVal = document.getElementById('newsPublishedAt').value;
  const payload = {
    title:       document.getElementById('newsTitle').value.trim(),
    link:        document.getElementById('newsLink').value.trim(),
    source:      document.getElementById('newsSource').value.trim(),
    summary:     document.getElementById('newsSummary').value.trim() || null,
    publishedAt: dateVal ? new Date(dateVal).toISOString() : null,
  };

  newsSubmitBtn.disabled    = true;
  newsSubmitBtn.textContent = 'Saving…';

  try {
    const res = await fetch(id ? `/api/admin/news-items/${id}` : '/api/admin/news-items', {
      method:  id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    const json = await res.json();

    if (!res.ok) {
      newsFormError.textContent = json.error || 'Something went wrong. Please try again.';
      return;
    }

    closeModal();
    await loadNewsItems();
  } catch {
    newsFormError.textContent = 'Network error — please try again.';
  } finally {
    newsSubmitBtn.disabled    = false;
    newsSubmitBtn.textContent = 'Save News Item';
  }
});

async function deleteNewsItem(id) {
  const item = allNewsItems.find(n => n.id === id);
  if (!item) return;
  if (!confirm(`Delete "${item.title}"? This cannot be undone.`)) return;

  try {
    const res = await fetch(`/api/admin/news-items/${id}`, { method: 'DELETE' });
    if (!res.ok) { alert('Failed to delete news item.'); return; }
    await loadNewsItems();
  } catch {
    alert('Network error — please try again.');
  }
}

// ── Load ──────────────────────────────────────────────────────
async function loadNewsItems() {
  const res = await fetch('/api/admin/news-items');
  if (!res.ok) { window.location.href = '/admin-login.html'; return; }
  allNewsItems = await res.json();
  renderTable(allNewsItems);
}

async function init() {
  try {
    await loadNewsItems();
  } catch {
    window.location.href = '/admin-login.html';
  }

  document.getElementById('searchInput').addEventListener('input', e => {
    renderTable(filterNewsItems(e.target.value.trim()));
  });

  document.getElementById('adminSignout').addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    window.location.href = '/';
  });
}

document.addEventListener('DOMContentLoaded', init);
