let allMembers = [];

function fmt(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
}

function isThisMonth(dateStr) {
  const d = new Date(dateStr), n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
}

function isThisWeek(dateStr) {
  const d = new Date(dateStr), n = new Date();
  const start = new Date(n); start.setDate(n.getDate() - n.getDay());
  start.setHours(0,0,0,0);
  return d >= start;
}

function renderStats(members) {
  document.getElementById('statTotal').textContent  = members.length;
  document.getElementById('statMonth').textContent  = members.filter(m => isThisMonth(m.createdAt)).length;
  document.getElementById('statWeek').textContent   = members.filter(m => isThisWeek(m.createdAt)).length;
  const latest = members[members.length - 1];
  document.getElementById('statLatest').textContent = latest ? `#${latest.membershipNumber}` : '—';
}

function renderTable(members) {
  const tbody = document.getElementById('membersBody');
  const count = document.getElementById('tableCount');

  if (!members.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="table-empty">No members found.</td></tr>';
    count.textContent = '';
    return;
  }

  tbody.innerHTML = members.map(m => `
    <tr>
      <td><span class="mem-num">#${m.membershipNumber}</span></td>
      <td>${m.firstName} ${m.lastName}</td>
      <td><a href="mailto:${m.email}" class="table-link">${m.email}</a></td>
      <td>${m.phone || '—'}</td>
      <td>${m.companyName || '—'}</td>
      <td>${m.role || '—'}</td>
      <td>${m.city || '—'}</td>
      <td>${m.postcode || '—'}</td>
      <td>${m.country || '—'}</td>
      <td>${fmt(m.createdAt)}</td>
    </tr>`).join('');

  count.textContent = `Showing ${members.length} of ${allMembers.length} member${allMembers.length !== 1 ? 's' : ''}`;
}

function filterMembers(query) {
  if (!query) return allMembers;
  const q = query.toLowerCase();
  return allMembers.filter(m =>
    String(m.membershipNumber).includes(q) ||
    (m.firstName  || '').toLowerCase().includes(q) ||
    (m.lastName   || '').toLowerCase().includes(q) ||
    (m.email      || '').toLowerCase().includes(q) ||
    (m.companyName|| '').toLowerCase().includes(q) ||
    (m.city       || '').toLowerCase().includes(q) ||
    (m.postcode   || '').toLowerCase().includes(q)
  );
}

async function init() {
  try {
    const res = await fetch('/api/admin/members');
    if (!res.ok) { window.location.href = '/admin-login.html'; return; }
    allMembers = await res.json();
    renderStats(allMembers);
    renderTable(allMembers);
  } catch {
    window.location.href = '/admin-login.html';
  }

  document.getElementById('searchInput').addEventListener('input', e => {
    renderTable(filterMembers(e.target.value.trim()));
  });

  document.getElementById('adminSignout').addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    window.location.href = '/';
  });
}

document.addEventListener('DOMContentLoaded', init);
