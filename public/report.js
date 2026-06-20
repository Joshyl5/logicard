let membershipNumber = null;
let memberName = null;

async function init() {
  try {
    const res  = await fetch('/api/me');
    if (!res.ok) { window.location.href = '/login.html'; return; }
    const data = await res.json();
    membershipNumber = data.membershipNumber;
    memberName       = data.firstName + ' ' + data.lastName;
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

const form       = document.getElementById('issueForm');
const submitBtn  = document.getElementById('submitBtn');
const submitLabel= document.getElementById('submitLabel');
const errorBox   = document.getElementById('reportError');

form.addEventListener('submit', async e => {
  e.preventDefault();
  errorBox.style.display = 'none';

  const issueType  = document.getElementById('issueType').value;
  const issueTitle = document.getElementById('issueTitle').value.trim();
  const issueDesc  = document.getElementById('issueDesc').value.trim();

  if (!issueType) { showError('Please select a report type.'); return; }
  if (!issueDesc) { showError('Please describe the issue.'); return; }

  submitBtn.disabled    = true;
  submitLabel.textContent = 'Submitting...';

  try {
    const res  = await fetch('/api/report', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ issueType, issueTitle, issueDesc }),
    });
    const json = await res.json();

    if (!res.ok) {
      showError(json.error || 'Something went wrong. Please try again.');
      submitBtn.disabled      = false;
      submitLabel.textContent = 'Submit Report';
      return;
    }

    document.getElementById('reportForm').style.display    = 'none';
    document.getElementById('reportSuccess').style.display = 'block';
  } catch {
    showError('Network error — please check your connection and try again.');
    submitBtn.disabled      = false;
    submitLabel.textContent = 'Submit Report';
  }
});

function showError(msg) {
  errorBox.textContent    = msg;
  errorBox.style.display  = 'block';
}

init();
