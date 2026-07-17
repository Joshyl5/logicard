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
    ['city',        'Town / City'],
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

// ── Searchable job title selector ───────────────────────────────
// Layers a filterable text combobox on top of the existing <select id="role">
// so the select stays the real form control (FormData still submits its
// value unchanged) while search/keyboard navigation is added on top.
(function initRoleSearch() {
  const select = document.getElementById('role');
  if (!select) return;

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  const items = [];
  select.querySelectorAll('option').forEach(opt => {
    if (!opt.value) return;
    const group = opt.parentElement && opt.parentElement.tagName === 'OPTGROUP' ? opt.parentElement.label : '';
    items.push({ value: opt.value, group });
  });

  select.style.display = 'none';

  const wrap = document.createElement('div');
  wrap.className = 'role-combobox';

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.id = 'roleSearchInput';
  searchInput.placeholder = 'Search or select your job title…';
  searchInput.autocomplete = 'off';

  const dropdown = document.createElement('div');
  dropdown.className = 'role-dropdown';

  select.insertAdjacentElement('beforebegin', wrap);
  wrap.appendChild(searchInput);
  wrap.appendChild(dropdown);
  wrap.appendChild(select);

  const label = document.querySelector('label[for="role"]');
  if (label) label.setAttribute('for', 'roleSearchInput');

  let activeIndex = -1;

  function getVisibleOptions() {
    return Array.from(dropdown.querySelectorAll('.role-dropdown-option'));
  }

  function setActive(index) {
    const opts = getVisibleOptions();
    opts.forEach(o => o.classList.remove('active'));
    if (opts[index]) {
      opts[index].classList.add('active');
      opts[index].scrollIntoView({ block: 'nearest' });
    }
    activeIndex = index;
  }

  function renderDropdown(query) {
    const q = query.trim().toLowerCase();
    const matches = q
      ? items.filter(i => i.value.toLowerCase().includes(q) || i.group.toLowerCase().includes(q))
      : items;

    activeIndex = -1;

    if (!matches.length) {
      dropdown.innerHTML = '<div class="role-dropdown-empty">No matching job titles — try "Other / Not Listed"</div>';
      dropdown.classList.add('open');
      return;
    }

    let html = '';
    let lastGroup = null;
    matches.forEach(item => {
      if (item.group !== lastGroup) {
        html += `<div class="role-dropdown-group">${escapeHtml(item.group)}</div>`;
        lastGroup = item.group;
      }
      html += `<div class="role-dropdown-option" data-value="${escapeHtml(item.value)}">${escapeHtml(item.value)}</div>`;
    });
    dropdown.innerHTML = html;
    dropdown.classList.add('open');
  }

  function closeDropdown() { dropdown.classList.remove('open'); }

  function selectValue(value) {
    select.value = value;
    searchInput.value = value;
    closeDropdown();
  }

  searchInput.addEventListener('focus', () => renderDropdown(searchInput.value));
  searchInput.addEventListener('input', () => {
    select.value = ''; // typing invalidates the previous pick until a real option is chosen again
    renderDropdown(searchInput.value);
  });

  searchInput.addEventListener('blur', () => {
    // Delay so a click on a dropdown option registers before the list closes.
    setTimeout(() => {
      closeDropdown();
      const typed = searchInput.value.trim();
      const exact = items.find(i => i.value.toLowerCase() === typed.toLowerCase());
      if (exact) {
        select.value = exact.value;
        searchInput.value = exact.value;
      } else {
        select.value = '';
        searchInput.value = '';
      }
    }, 150);
  });

  searchInput.addEventListener('keydown', e => {
    const opts = getVisibleOptions();
    if (!opts.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(Math.min(activeIndex + 1, opts.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(Math.max(activeIndex - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = opts[activeIndex] || opts[0];
      if (target) selectValue(target.dataset.value);
    } else if (e.key === 'Escape') {
      closeDropdown();
    }
  });

  dropdown.addEventListener('mousedown', e => {
    const target = e.target.closest('.role-dropdown-option');
    if (!target) return;
    e.preventDefault(); // keep focus on the input so blur doesn't fire before the click registers
    selectValue(target.dataset.value);
  });

  document.addEventListener('click', e => {
    if (!wrap.contains(e.target)) closeDropdown();
  });
})();
