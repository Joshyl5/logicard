const form         = document.getElementById('forgotForm');
const forgotBtn    = document.getElementById('forgotBtn');
const forgotLabel  = document.getElementById('forgotLabel');
const forgotSpinner= document.getElementById('forgotSpinner');
const forgotError  = document.getElementById('forgotError');
const forgotSuccess= document.getElementById('forgotSuccess');

function showError(msg) {
  forgotError.textContent = msg;
  forgotError.classList.add('visible');
  forgotSuccess.style.display = 'none';
}

function showSuccess(msg) {
  forgotSuccess.textContent = msg;
  forgotSuccess.style.display = 'block';
  forgotError.classList.remove('visible');
  form.style.display = 'none';
}

function setLoading(on) {
  forgotBtn.disabled          = on;
  forgotLabel.style.display   = on ? 'none'  : 'inline';
  forgotSpinner.style.display = on ? 'block' : 'none';
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  forgotError.classList.remove('visible');

  const email = document.getElementById('email').value.trim();
  if (!email) { showError('Please enter your email address.'); return; }

  setLoading(true);

  try {
    const res  = await fetch('/api/forgot-password', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email }),
    });
    const json = await res.json();

    if (!res.ok) {
      showError(json.error || 'Something went wrong. Please try again.');
      setLoading(false);
      return;
    }

    showSuccess('If that email is registered, a reset link has been sent. Please check your inbox.');
  } catch {
    showError('Network error — please check your connection and try again.');
    setLoading(false);
  }
});
