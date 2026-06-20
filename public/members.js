async function init() {
  // Auth check
  let me;
  try {
    const res = await fetch('/api/me');
    if (!res.ok) { window.location.href = '/login.html'; return; }
    me = await res.json();
  } catch {
    window.location.href = '/login.html';
    return;
  }

  // Populate header
  document.getElementById('userName').textContent    = me.firstName;
  document.getElementById('memberBadge').textContent = '#' + me.membershipNumber;

  // Referral banner
  const referralLink = `${window.location.origin}/signup.html?ref=${me.membershipNumber}`;
  document.getElementById('referralLinkInput').value      = referralLink;
  document.getElementById('totalReferrals').textContent   = me.totalReferrals  || 0;
  document.getElementById('monthlyEntries').textContent   = me.monthlyEntries  || 0;

  document.getElementById('referralCopyBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(referralLink).then(() => {
      const btn = document.getElementById('referralCopyBtn');
      btn.textContent = '✓ Copied!';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'Copy link'; btn.classList.remove('copied'); }, 2000);
    });
  });

  // Sign out
  document.getElementById('signoutBtn').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/';
  });
}

document.addEventListener('DOMContentLoaded', init);
