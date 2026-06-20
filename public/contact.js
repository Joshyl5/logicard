let newsletterOptIn = false;

const toggle = document.getElementById('newsletterToggle');
if (toggle) {
  toggle.addEventListener('click', () => {
    newsletterOptIn = !newsletterOptIn;
    toggle.style.background = newsletterOptIn ? '#FFB300' : 'rgba(255,255,255,0.15)';
    if (toggle.querySelector('::after')) return;
    toggle.style.setProperty('--pos', newsletterOptIn ? '21px' : '3px');
  });
}

const form       = document.getElementById('contactForm');
const contactBtn = document.getElementById('contactBtn');
const errorBox   = document.getElementById('contactError');
const successBox = document.getElementById('contactSuccess');

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.style.display = 'block';
  successBox.style.display = 'none';
}

function showSuccess(msg) {
  successBox.textContent = msg;
  successBox.style.display = 'block';
  errorBox.style.display = 'none';
  form.reset();
  newsletterOptIn = false;
  if (toggle) toggle.style.background = 'rgba(255,255,255,0.15)';
}

if (form) {
  form.addEventListener('submit', async e => {
    e.preventDefault();
    errorBox.style.display = 'none';

    const name    = document.getElementById('contactName').value.trim();
    const email   = document.getElementById('contactEmail').value.trim();
    const title   = document.getElementById('contactTitle').value.trim();
    const company = document.getElementById('contactCompany').value.trim();
    const phone   = document.getElementById('contactPhone').value.trim();

    if (!name)  { showError('Please enter your full name.'); return; }
    if (!email) { showError('Please enter your email address.'); return; }

    contactBtn.disabled    = true;
    contactBtn.textContent = 'SENDING...';

    try {
      const res  = await fetch('/api/contact', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name, email, title, company, phone, newsletterOptIn }),
      });
      const json = await res.json();

      if (!res.ok) {
        showError(json.error || 'Something went wrong. Please try again.');
      } else {
        showSuccess('Thank you for getting in touch — we\'ll be in contact shortly.');
      }
    } catch {
      showError('Network error — please check your connection and try again.');
    } finally {
      contactBtn.disabled    = false;
      contactBtn.textContent = 'SUBMIT FORM';
    }
  });
}
