let pendingId = null;

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const DOC_LABELS = {
  uniform: 'Uniform photo',
  badge: 'Name badge',
  payslip: 'Payslip',
  work_email_screenshot: 'Work email screenshot',
  other: 'Other document',
};

function render(items) {
  const list = document.getElementById('vrList');
  if (!items.length) {
    list.innerHTML = '<p style="color:var(--muted);text-align:center;padding:40px 0;">No pending verifications — you\'re all caught up.</p>';
    return;
  }

  list.innerHTML = items.map(d => `
    <div class="vr-item" data-id="${d.id}">
      <div class="vr-info">
        <div class="vr-name">${escapeHtml(d.firstName)} ${escapeHtml(d.lastName)} — #${d.membershipNumber}</div>
        <div class="vr-meta">${escapeHtml(d.companyName || '—')} · ${escapeHtml(d.role || '—')} · ${escapeHtml(DOC_LABELS[d.docType] || d.docType)} · ${fmtDate(d.submittedAt)}</div>
        ${d.note ? `<div class="vr-note">"${escapeHtml(d.note)}"</div>` : ''}
      </div>
      <div class="vr-actions">
        <button type="button" class="vr-btn vr-btn--view" data-id="${d.id}" data-action="view">View Document</button>
        <button type="button" class="vr-btn vr-btn--approve" data-id="${d.id}" data-action="approve">Approve</button>
        <button type="button" class="vr-btn vr-btn--reject" data-id="${d.id}" data-action="reject">Reject</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('[data-action="view"]').forEach(btn => btn.addEventListener('click', () => viewDoc(Number(btn.dataset.id))));
  list.querySelectorAll('[data-action="approve"]').forEach(btn => btn.addEventListener('click', () => approveDoc(Number(btn.dataset.id), btn)));
  list.querySelectorAll('[data-action="reject"]').forEach(btn => btn.addEventListener('click', () => openRejectModal(Number(btn.dataset.id))));
}

async function viewDoc(id) {
  try {
    const res = await fetch(`/api/admin/verifications/${id}/view-url`);
    const json = await res.json();
    if (!res.ok) { alert(json.error || 'Could not load document.'); return; }
    window.open(json.url, '_blank', 'noopener');
  } catch {
    alert('Network error — please try again.');
  }
}

async function approveDoc(id, btn) {
  if (!confirm('Approve this member? They will be emailed and their offers unlocked immediately.')) return;
  btn.disabled = true;
  btn.textContent = 'Approving…';
  try {
    const res = await fetch(`/api/admin/verifications/${id}/approve`, { method: 'POST' });
    if (!res.ok) { alert('Failed to approve.'); btn.disabled = false; btn.textContent = 'Approve'; return; }
    await load();
  } catch {
    alert('Network error — please try again.');
    btn.disabled = false;
    btn.textContent = 'Approve';
  }
}

const rejectModal   = document.getElementById('rejectModal');
const rejectReason  = document.getElementById('rejectReason');
const rejectConfirm = document.getElementById('rejectConfirm');
const rejectCancel  = document.getElementById('rejectCancel');

function openRejectModal(id) {
  pendingId = id;
  rejectReason.value = '';
  rejectModal.style.display = 'flex';
}
rejectCancel.addEventListener('click', () => { rejectModal.style.display = 'none'; pendingId = null; });
rejectModal.addEventListener('click', e => { if (e.target === rejectModal) { rejectModal.style.display = 'none'; pendingId = null; } });

rejectConfirm.addEventListener('click', async () => {
  if (!pendingId) return;
  rejectConfirm.disabled = true;
  rejectConfirm.textContent = 'Rejecting…';
  try {
    const res = await fetch(`/api/admin/verifications/${pendingId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: rejectReason.value.trim() }),
    });
    if (!res.ok) { alert('Failed to reject.'); return; }
    rejectModal.style.display = 'none';
    pendingId = null;
    await load();
  } catch {
    alert('Network error — please try again.');
  } finally {
    rejectConfirm.disabled = false;
    rejectConfirm.textContent = 'Confirm Reject';
  }
});

async function load() {
  const res = await fetch('/api/admin/verifications');
  if (!res.ok) { window.location.href = '/admin-login.html'; return; }
  render(await res.json());
}

async function init() {
  try {
    await load();
  } catch {
    window.location.href = '/admin-login.html';
  }

  document.getElementById('adminSignout').addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    window.location.href = '/';
  });
}

document.addEventListener('DOMContentLoaded', init);
