const token = new URLSearchParams(window.location.search).get('token');

if (!token) {
  document.getElementById('resetForm').style.display = 'none';
  document.getElementById('invalidToken').style.display = 'block';
}

document.getElementById('pwToggle1').addEventListener('click', () => {
  const pw = document.getElementById('password');
  pw.type = pw.type === 'password' ? 'text' : 'password';
});

document.getElementById('pwToggle2').addEventListener('click', () => {
  const pw = document.getElementById('confirmPassword');
  pw.type = pw.type === 'password' ? 'text' : 'password';
});

const form        = document.getElementById('resetForm');
const resetBtn    = document.getElementById('resetBtn');
const resetLabel  = document.getElementById('resetLabel');
const resetSpinner= document.getElementById('resetSpinner');
const resetError  = document.getElementById('resetError');
const resetSuccess= document.getElementById('resetSuccess');

function showError(msg) {
  resetError.textContent = msg;
  resetError.classList.add('visible');
}

function showSuccess(msg) {
  resetSuccess.textContent = msg;
  resetSuccess.style.display = 'block';
  resetError.classList.remove('visible');
  form.style.display = 'none';
  document.getElementById('backToLogin').style.display = 'block';
}

function setLoading(on) {
  resetBtn.disabled          = on;
  resetLabel.style.display   = on ? 'none'  : 'inline';
  resetSpinner.style.display = on ? 'block' : 'none';
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  resetError.classList.remove('visible');

  const password        = document.getElementById('password').value;
  const confirmPassword = document.getElementById('confirmPassword').value;

  if (!password || password.length < 8) {
    showError('Password must be at least 8 characters.'); return;
  }
  if (password !== confirmPassword) {
    showError('Passwords do not match.'); return;
  }

  setLoading(true);

  try {
    const res  = await fetch('/api/reset-password', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ token, password }),
    });
    const json = await res.json();

    if (!res.ok) {
      if (res.status === 400 || res.status === 404) {
        form.style.display = 'none';
        document.getElementById('invalidToken').style.display = 'block';
      } else {
        showError(json.error || 'Something went wrong. Please try again.');
        setLoading(false);
      }
      return;
    }

    showSuccess('Your password has been reset. You can now sign in with your new password.');
  } catch {
    showError('Network error — please check your connection and try again.');
    setLoading(false);
  }
});
