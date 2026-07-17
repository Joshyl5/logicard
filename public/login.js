const form        = document.getElementById('loginForm');
const loginBtn    = document.getElementById('loginBtn');
const loginLabel  = document.getElementById('loginLabel');
const loginSpinner= document.getElementById('loginSpinner');
const loginError  = document.getElementById('loginError');

// Password visibility toggle
document.getElementById('pwToggle').addEventListener('click', () => {
  const pw = document.getElementById('password');
  pw.type = pw.type === 'password' ? 'text' : 'password';
});

function showError(msg) {
  loginError.textContent = msg;
  loginError.classList.add('visible');
}

function clearError() {
  loginError.textContent = '';
  loginError.classList.remove('visible');
}

function setLoading(on) {
  loginBtn.disabled         = on;
  loginLabel.style.display  = on ? 'none'  : 'inline';
  loginSpinner.style.display= on ? 'block' : 'none';
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  clearError();

  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  if (!email || !password) {
    showError('Please enter your email and password.');
    return;
  }

  setLoading(true);

  try {
    const res  = await fetch('/api/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    });
    const json = await res.json();

    if (!res.ok) {
      showError(json.error || 'Sign in failed. Please try again.');
      setLoading(false);
      return;
    }

    window.location.href = '/member-offers';

  } catch {
    showError('Network error — please check your connection and try again.');
    setLoading(false);
  }
});
