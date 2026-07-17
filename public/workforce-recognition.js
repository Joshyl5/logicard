const form = document.getElementById('wrForm');
const btn  = document.getElementById('wrSubmitBtn');
const msg  = document.getElementById('wrFormMsg');

function showMsg(text, type) {
  msg.textContent = text;
  msg.className = `wr-form-msg ${type}`;
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  msg.className = 'wr-form-msg';

  const name     = document.getElementById('wrName').value.trim();
  const email    = document.getElementById('wrEmail').value.trim();
  const company  = document.getElementById('wrCompany').value.trim();
  const title    = document.getElementById('wrTitle').value.trim();
  const phone    = document.getElementById('wrPhone').value.trim();
  const teamSize = document.getElementById('wrTeamSize').value;
  const message  = document.getElementById('wrMessage').value.trim();

  if (!name)    { showMsg('Please enter your full name.', 'error'); return; }
  if (!email)   { showMsg('Please enter your work email address.', 'error'); return; }
  if (!company) { showMsg('Please enter your company name.', 'error'); return; }

  btn.disabled    = true;
  btn.textContent = 'Sending…';

  try {
    const res = await fetch('/api/contact', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        name, email, title, company, phone, teamSize, message,
        source: 'Workforce Recognition',
      }),
    });
    const json = await res.json();

    if (!res.ok) {
      showMsg(json.error || 'Something went wrong. Please try again.', 'error');
    } else {
      showMsg("Thanks — we'll be in touch within one working day to get your team set up.", 'success');
      form.reset();
    }
  } catch {
    showMsg('Network error — please check your connection and try again.', 'error');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Get In Touch';
  }
});
