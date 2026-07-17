function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

function verificationLabel(me) {
  if (me.verified) return 'Verified ✅';
  if (me.verificationStatus === 'rejected') return 'Needs Attention';
  return 'Pending';
}

async function init() {
  let me;
  try {
    const res = await fetch('/api/me');
    if (!res.ok) { window.location.href = '/login.html'; return; }
    me = await res.json();
  } catch {
    window.location.href = '/login.html';
    return;
  }

  document.getElementById('userName').textContent    = me.firstName;
  document.getElementById('memberBadge').textContent = '#' + me.membershipNumber;

  document.getElementById('signoutBtn').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/';
  });

  document.getElementById('statOffersAccepted').textContent = me.offersAccepted || 0;
  document.getElementById('statReferrals').textContent      = me.totalReferrals || 0;
  document.getElementById('statMonthlyEntries').textContent = me.monthlyEntries || 0;

  const rows = [
    ['Full Name', `${me.firstName} ${me.lastName}`],
    ['Membership Number', `#${me.membershipNumber}`],
    ['Email Address', me.email],
    ['Phone Number', me.phone || '—'],
    ['Company', me.companyName || '—'],
    ['Role', me.role || '—'],
    ['Location', me.city || '—'],
    ['Member Since', fmtDate(me.createdAt)],
    ['Verification Status', verificationLabel(me)],
  ];

  document.getElementById('detailCard').innerHTML = rows.map(([label, value]) => `
    <div class="detail-row">
      <span class="detail-label">${escapeHtml(label)}</span>
      <span class="detail-value">${escapeHtml(value)}</span>
    </div>
  `).join('');
}

document.addEventListener('DOMContentLoaded', init);
