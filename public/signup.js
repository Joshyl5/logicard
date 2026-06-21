'use strict';

const form         = document.getElementById('signupForm');
const submitBtn    = document.getElementById('submitBtn');
const btnLabel     = document.getElementById('btnLabel');
const btnSpinner   = document.getElementById('btnSpinner');
const formError    = document.getElementById('formError');
const formWrapper  = document.getElementById('formWrapper');
const successPanel = document.getElementById('successPanel');
const membershipEl = document.getElementById('membershipNumber');
const promoInput   = document.getElementById('promoCode');
const promoFeedback = document.getElementById('promoFeedback');

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

// Update button label and promo feedback as user types code
promoInput.addEventListener('input', () => {
  const code = promoInput.value.toUpperCase().trim();
  promoInput.value = promoInput.value.toUpperCase();

  if (!code) {
    promoFeedback.textContent = '';
    btnLabel.textContent = 'Continue to Payment — £10/year';
    return;
  }
  if (code === 'FREE') {
    promoFeedback.innerHTML = '<span style="color:#4ade80">✓ Code FREE — first year at £0 applied</span>';
    btnLabel.textContent = 'Activate Free Membership';
  } else {
    promoFeedback.innerHTML = '<span style="color:#f87171">✗ Invalid promo code</span>';
    btnLabel.textContent = 'Continue to Payment — £10/year';
  }
});

form.addEventListener('submit', async e => {
  e.preventDefault();
  clearError();

  const data = Object.fromEntries(new FormData(form).entries());
  data.gdprConsent      = document.getElementById('gdprConsent').checked;
  data.marketingConsent = document.getElementById('marketingConsent').checked;
  const ref = new URLSearchParams(window.location.search).get('ref');
  if (ref) data.ref = ref;

  const required = [
    ['companyName', 'Company Name'],
    ['role',        'Job Title / Role'],
    ['firstName',   'First Name'],
    ['lastName',    'Last Name'],
    ['email',       'Email Address'],
    ['phone',       'Phone Number'],
    ['postcode',    'Postcode'],
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

  const promoCode = (data.promoCode || '').toUpperCase().trim();

  if (promoCode && promoCode !== 'FREE') {
    showError('Invalid promo code. Leave blank to pay £10/year, or use code FREE for your first year at £0.');
    return;
  }

  if (promoCode === 'FREE') {
    // Activate free membership directly
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
    return;
  }

  // No promo code — redirect to checkout with form data stored
  delete data.confirmPassword; // don't carry password confirm to checkout
  sessionStorage.setItem('logicardCheckout', JSON.stringify(data));
  window.location.href = '/checkout.html';
});
