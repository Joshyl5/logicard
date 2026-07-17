function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const DOC_LABELS = {
  uniform: 'Uniform photo',
  badge: 'Name badge',
  payslip: 'Payslip',
  work_email_screenshot: 'Work email screenshot',
  other: 'Other document',
};

function renderDocs(documents) {
  const list = document.getElementById('docList');
  if (!documents.length) {
    list.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;">No submissions yet.</p>';
    return;
  }
  list.innerHTML = documents.map(d => `
    <div class="verify-doc-item">
      <span>
        <span class="verify-doc-type">${escapeHtml(DOC_LABELS[d.docType] || d.docType)}</span>
        <span class="verify-doc-date">${fmtDate(d.submittedAt)}</span>
      </span>
      <span class="verify-doc-status verify-doc-status--${d.status}">${d.status}</span>
    </div>
  `).join('');
}

function applyStatus(status, rejectionReason) {
  const badge = document.getElementById('statusBadge');
  const title = document.getElementById('statusTitle');
  const text  = document.getElementById('statusText');
  const rejectionBox = document.getElementById('rejectionBox');

  badge.className = 'verify-badge verify-badge--' + (status === 'verified' ? 'verified' : status === 'rejected' ? 'rejected' : 'pending');

  if (status === 'rejected') {
    badge.textContent = 'Needs Another Look';
    title.textContent = "We couldn't verify your last submission";
    text.textContent  = 'No problem — you can submit a new document or try your work email below.';
    if (rejectionReason) {
      rejectionBox.style.display = 'block';
      rejectionBox.textContent = rejectionReason;
    }
  } else {
    badge.textContent = 'Pending Verification';
    title.textContent = 'Verify you work in logistics';
    text.textContent  = "Logicard is a closed group for verified logistics workers — this keeps the deals genuine and exclusive. Confirm your employment one of two ways below, and we'll unlock your offers as soon as it's approved.";
  }
}

async function loadStatus() {
  const res = await fetch('/api/verification/status');
  if (!res.ok) { window.location.href = '/login.html'; return; }
  const data = await res.json();

  if (data.verified) {
    document.getElementById('methodsWrap').style.display = 'none';
    document.getElementById('statusCard').style.display = 'none';
    document.getElementById('verifiedWrap').style.display = 'block';
    return;
  }

  applyStatus(data.verificationStatus, data.rejectionReason);
  renderDocs(data.documents || []);
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

  const params = new URLSearchParams(window.location.search);
  const workEmailFeedback = document.getElementById('workEmailFeedback');
  if (params.get('result') === 'success') {
    workEmailFeedback.textContent = 'Work email confirmed!';
    workEmailFeedback.className = 'verify-method-feedback success';
  } else if (params.get('result') === 'invalid') {
    workEmailFeedback.textContent = 'That confirmation link is invalid or has expired — please request a new one.';
    workEmailFeedback.className = 'verify-method-feedback error';
  }

  await loadStatus();

  // Work email form
  const workEmailForm = document.getElementById('workEmailForm');
  workEmailForm.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('workEmailBtn');
    const feedback = document.getElementById('workEmailFeedback');
    btn.disabled = true;
    btn.textContent = 'Sending…';
    feedback.textContent = '';

    try {
      const res = await fetch('/api/verification/work-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workEmail: document.getElementById('workEmailInput').value.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        feedback.textContent = json.error || 'Something went wrong. Please try again.';
        feedback.className = 'verify-method-feedback error';
      } else {
        feedback.textContent = 'Check your inbox — click the link to verify instantly.';
        feedback.className = 'verify-method-feedback success';
        workEmailForm.reset();
      }
    } catch {
      feedback.textContent = 'Network error — please try again.';
      feedback.className = 'verify-method-feedback error';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Send Verification Link';
    }
  });

  // Upload form
  const fileInput = document.getElementById('fileInput');
  fileInput.addEventListener('change', () => {
    document.getElementById('dropzoneFilename').textContent = fileInput.files[0] ? fileInput.files[0].name : '';
  });

  const uploadForm = document.getElementById('uploadForm');
  uploadForm.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('uploadBtn');
    const feedback = document.getElementById('uploadFeedback');

    const docType = document.getElementById('docType').value;
    const file = fileInput.files[0];
    if (!docType) { feedback.textContent = 'Please select a document type.'; feedback.className = 'verify-method-feedback error'; return; }
    if (!file)    { feedback.textContent = 'Please choose a file.'; feedback.className = 'verify-method-feedback error'; return; }

    const formData = new FormData();
    formData.append('docType', docType);
    formData.append('note', document.getElementById('docNote').value.trim());
    formData.append('file', file);

    btn.disabled = true;
    btn.textContent = 'Uploading…';
    feedback.textContent = '';

    try {
      const res = await fetch('/api/verification/upload', { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok) {
        feedback.textContent = json.error || 'Upload failed. Please try again.';
        feedback.className = 'verify-method-feedback error';
      } else {
        feedback.textContent = 'Submitted — we’ll review it within 24-48 hours.';
        feedback.className = 'verify-method-feedback success';
        uploadForm.reset();
        document.getElementById('dropzoneFilename').textContent = '';
        await loadStatus();
      }
    } catch {
      feedback.textContent = 'Network error — please try again.';
      feedback.className = 'verify-method-feedback error';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Submit for Review';
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
