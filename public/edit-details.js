async function init() {
  try {
    const res  = await fetch('/api/me');
    if (!res.ok) { window.location.href = '/login.html'; return; }
    const data = await res.json();
    document.getElementById('memberDisplay').textContent =
      `${data.firstName} ${data.lastName} (#${data.membershipNumber})`;
  } catch {
    window.location.href = '/login.html';
  }
}

document.getElementById('signoutBtn').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/';
});

const form        = document.getElementById('editDetailsForm');
const submitBtn   = document.getElementById('submitBtn');
const submitLabel = document.getElementById('submitLabel');
const errorBox    = document.getElementById('editError');

form.addEventListener('submit', async e => {
  e.preventDefault();
  errorBox.style.display = 'none';

  const message = document.getElementById('editMessage').value.trim();
  if (!message) { showError('Please describe what you\'d like changed.'); return; }

  submitBtn.disabled      = true;
  submitLabel.textContent = 'Sending...';

  try {
    const res  = await fetch('/api/member/request-edit', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ message }),
    });
    const json = await res.json();

    if (!res.ok) {
      showError(json.error || 'Something went wrong. Please try again.');
      submitBtn.disabled      = false;
      submitLabel.textContent = 'Send Request';
      return;
    }

    document.getElementById('editForm').style.display    = 'none';
    document.getElementById('editSuccess').style.display = 'block';
  } catch {
    showError('Network error — please check your connection and try again.');
    submitBtn.disabled      = false;
    submitLabel.textContent = 'Send Request';
  }
});

function showError(msg) {
  errorBox.textContent   = msg;
  errorBox.style.display = 'block';
}

init();
