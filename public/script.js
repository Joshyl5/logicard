/* ── Star canvas ──────────────────────────────────────────────── */
(function () {
  const canvas = document.getElementById('stars');
  const ctx    = canvas.getContext('2d');
  let stars    = [];

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  class Star {
    constructor() { this.reset(); }

    reset() {
      this.x     = Math.random() * canvas.width;
      this.y     = Math.random() * canvas.height;
      this.r     = Math.random() * 1.6 + 0.2;
      this.alpha = Math.random() * 0.7 + 0.1;
      this.speed = Math.random() * 0.008 + 0.002;
      this.phase = Math.random() * Math.PI * 2;
    }

    draw(t) {
      const twinkle = this.alpha * (0.6 + 0.4 * Math.sin(t * this.speed * 60 + this.phase));
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200, 225, 255, ${twinkle})`;
      ctx.fill();
    }
  }

  function init() {
    resize();
    stars = [];
    const count = Math.floor((canvas.width * canvas.height) / 5000);
    for (let i = 0; i < count; i++) stars.push(new Star());
  }

  function loop(t) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    stars.forEach(s => s.draw(t));
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', init);
  init();
  requestAnimationFrame(loop);
})();

/* ── Smooth scroll ────────────────────────────────────────────── */
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth' }); }
  });
});

/* ── Form ─────────────────────────────────────────────────────── */
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
  submitBtn.disabled    = on;
  btnLabel.style.display   = on ? 'none'   : 'inline';
  btnSpinner.style.display = on ? 'block'  : 'none';
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

    membershipEl.textContent  = json.membershipNumber;
    formWrapper.style.display = 'none';
    successPanel.style.display = 'block';
    successPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });

  } catch {
    showError('Network error — please check your connection and try again.');
    setLoading(false);
  }
});
