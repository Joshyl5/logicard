const form         = document.getElementById('signupForm');
const submitBtn    = document.getElementById('submitBtn');
const btnLabel     = document.getElementById('btnLabel');
const btnSpinner   = document.getElementById('btnSpinner');
const formError    = document.getElementById('formError');
const formWrapper  = document.getElementById('formWrapper');
const successPanel = document.getElementById('successPanel');
const membershipEl = document.getElementById('membershipNumber');

function showError(msg) {
  formError.textContent = msg;
  formError.classList.add('visible');
  formError.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function clearError() {
  formError.textContent = '';
  formError.classList.remove('visible');
}

function setLoading(on) {
  submitBtn.disabled       = on;
  btnLabel.style.display   = on ? 'none'  : 'inline';
  btnSpinner.style.display = on ? 'block' : 'none';
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  clearError();

  const data = Object.fromEntries(new FormData(form).entries());
  data.gdprConsent = document.getElementById('gdprConsent').checked;

  const required = [
    ['companyName',  'Company Name'],
    ['role',         'Job Title / Role'],
    ['firstName',    'First Name'],
    ['lastName',     'Last Name'],
    ['email',        'Email Address'],
    ['phone',        'Phone Number'],
    ['addressLine1', 'Address Line 1'],
    ['city',         'City'],
    ['postcode',     'Postcode'],
    ['country',      'Country'],
  ];

  for (const [key, label] of required) {
    if (!data[key] || !String(data[key]).trim()) {
      showError(`Please fill in: ${label}`);
      return;
    }
  }

  if (!data.password || data.password.length < 8) {
    showError('Password must be at least 8 characters.');
    return;
  }
  if (data.password !== data.confirmPassword) {
    showError('Passwords do not match.');
    return;
  }
  if (!data.gdprConsent) {
    showError('You must accept the Privacy Policy to continue.');
    return;
  }

  setLoading(true);

  try {
    const res  = await fetch('/api/signup', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    });
    const json = await res.json();

    if (!res.ok) {
      showError(json.error || 'Something went wrong. Please try again.');
      setLoading(false);
      return;
    }

    membershipEl.textContent   = json.membershipNumber;
    formWrapper.style.display  = 'none';
    successPanel.style.display = 'block';
    successPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });

  } catch {
    showError('Network error — please check your connection and try again.');
    setLoading(false);
  }
});
