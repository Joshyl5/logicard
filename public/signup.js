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
    ['companyName',  'Company Name'],
    ['roleCategory', 'Which part of logistics do you work in'],
    ['role',         'Job Title / Role'],
    ['firstName',    'First Name'],
    ['lastName',    'Last Name'],
    ['email',       'Email Address'],
    ['phone',       'Phone Number'],
    ['town',        'Town'],
    ['city',        'City'],
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

// ── Job roles: fetched once from the shared /api/job-roles source so this
// form and the Check Your Eligibility page can never drift apart ──────────
async function loadJobRoles() {
  const categorySelect = document.getElementById('roleCategory');
  const roleSelect      = document.getElementById('role');
  if (!categorySelect || !roleSelect) return;

  try {
    const res  = await fetch('/api/job-roles');
    const { categories } = await res.json();

    categorySelect.innerHTML = '<option value="" disabled selected>— Select a category —</option>' +
      categories.map(c => `<option>${c.name}</option>`).join('');

    roleSelect.innerHTML = '<option value="" disabled selected>— Select your job title —</option>' +
      categories.map(c => `<optgroup label="${c.name}">${c.roles.map(r => `<option>${r}</option>`).join('')}</optgroup>`).join('');
  } catch {
    categorySelect.innerHTML = '<option value="" disabled selected>Unable to load — please refresh</option>';
    roleSelect.innerHTML     = '<option value="" disabled selected>Unable to load — please refresh</option>';
    return;
  }

  initRoleSearch();
}

// ── Job title selector: type to search, select to lock it in ────
// All titles sit in the background (in the <select id="role"> populated by
// loadJobRoles() above, which stays the real form control FormData submits).
// Nothing is shown until the member starts typing; picking a result
// collapses the list and leaves just that title in the field.
function initRoleSearch() {
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
  searchInput.placeholder = 'Start typing your job title…';
  searchInput.autocomplete = 'off';

  const dropdown = document.createElement('div');
  dropdown.className = 'role-dropdown';

  select.insertAdjacentElement('beforebegin', wrap);
  wrap.appendChild(searchInput);
  wrap.appendChild(select);

  // The dropdown is attached directly to <body> rather than nested inside
  // the fieldset — fieldsets use backdrop-filter for their frosted-glass
  // look, which creates its own stacking context that a child's z-index
  // can never escape, no matter how high it's set. Positioning it here and
  // placing it with fixed coordinates sidesteps that entirely.
  document.body.appendChild(dropdown);

  const label = document.querySelector('label[for="role"]');
  if (label) label.setAttribute('for', 'roleSearchInput');

  let activeIndex = -1;
  let hasSelection = false;

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

  function positionDropdown() {
    const rect = searchInput.getBoundingClientRect();
    dropdown.style.left  = `${rect.left}px`;
    dropdown.style.width = `${rect.width}px`;
    dropdown.style.top   = `${rect.bottom + 4}px`;
  }

  function openDropdown() {
    positionDropdown();
    dropdown.classList.add('open');
    window.addEventListener('scroll', positionDropdown, true);
    window.addEventListener('resize', positionDropdown);
  }

  // Emptying the dropdown (not just hiding it) means there's never stale
  // content left behind for a stray focus/blur to accidentally reveal.
  function closeDropdown() {
    dropdown.classList.remove('open');
    dropdown.innerHTML = '';
    activeIndex = -1;
    window.removeEventListener('scroll', positionDropdown, true);
    window.removeEventListener('resize', positionDropdown);
  }

  function renderDropdown() {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) { closeDropdown(); return; }

    const matches = items.filter(i => i.value.toLowerCase().includes(q) || i.group.toLowerCase().includes(q));
    activeIndex = -1;

    if (!matches.length) {
      dropdown.innerHTML = '<div class="role-dropdown-empty">No matching job titles — try "Other / Not Listed"</div>';
    } else {
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
    }
    openDropdown();
  }

  function selectValue(value) {
    select.value = value;
    searchInput.value = value;
    hasSelection = true;
    closeDropdown();
  }

  searchInput.addEventListener('focus', () => {
    // Re-focusing an already-answered field selects the text for easy
    // replacement, rather than re-opening a results list underneath it.
    if (hasSelection) searchInput.select();
  });

  searchInput.addEventListener('input', () => {
    hasSelection = false;
    select.value = ''; // typing invalidates the previous pick until a real option is chosen again
    renderDropdown();
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
        hasSelection = true;
      } else if (!hasSelection) {
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
    if (!wrap.contains(e.target) && !dropdown.contains(e.target)) closeDropdown();
  });
}

loadJobRoles();

// ── Town / City: type-ahead suggestions, but never enforced ─────
// Unlike the job-title picker, Town and City stay free text — typing
// something not in the list is always accepted (see PLACE_PATTERN in
// server.js for the actual character restriction, which is the only real
// gate). This is a plain suggestion aid, aimed at making the field faster
// and more accessible to fill in correctly, not a closed list.
function createPlaceCombobox(inputId, items, minChars = 2) {
  const input = document.getElementById(inputId);
  if (!input) return;

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  const dropdown = document.createElement('div');
  dropdown.className = 'role-dropdown';
  document.body.appendChild(dropdown);

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

  function positionDropdown() {
    const rect = input.getBoundingClientRect();
    dropdown.style.left  = `${rect.left}px`;
    dropdown.style.width = `${rect.width}px`;
    dropdown.style.top   = `${rect.bottom + 4}px`;
  }

  function openDropdown() {
    positionDropdown();
    dropdown.classList.add('open');
    window.addEventListener('scroll', positionDropdown, true);
    window.addEventListener('resize', positionDropdown);
  }

  function closeDropdown() {
    dropdown.classList.remove('open');
    dropdown.innerHTML = '';
    activeIndex = -1;
    window.removeEventListener('scroll', positionDropdown, true);
    window.removeEventListener('resize', positionDropdown);
  }

  function renderDropdown() {
    const q = input.value.trim().toLowerCase();
    if (q.length < minChars) { closeDropdown(); return; }

    const matches = items.filter(i => i.toLowerCase().includes(q));
    activeIndex = -1;

    if (!matches.length) {
      dropdown.innerHTML = '<div class="role-dropdown-empty">No matches — you can still type your own</div>';
    } else {
      dropdown.innerHTML = matches.map(m => `<div class="role-dropdown-option" data-value="${escapeHtml(m)}">${escapeHtml(m)}</div>`).join('');
    }
    openDropdown();
  }

  function selectValue(value) {
    input.value = value;
    closeDropdown();
  }

  input.addEventListener('input', renderDropdown);

  input.addEventListener('blur', () => {
    // Delay so a click on a dropdown option registers before the list closes.
    // Unlike the role picker, free text is always kept — nothing gets cleared.
    setTimeout(closeDropdown, 150);
  });

  input.addEventListener('keydown', e => {
    const opts = getVisibleOptions();
    if (!opts.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(Math.min(activeIndex + 1, opts.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(Math.max(activeIndex - 1, 0));
    } else if (e.key === 'Enter') {
      // Only hijack Enter if the member has actually navigated to a
      // suggestion — otherwise let Enter behave normally (free text).
      if (activeIndex >= 0) {
        e.preventDefault();
        selectValue(opts[activeIndex].dataset.value);
      }
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
    if (!input.contains(e.target) && !dropdown.contains(e.target)) closeDropdown();
  });
}

(async function loadTowns() {
  const townInput = document.getElementById('townInput');
  const cityInput = document.getElementById('cityInput');
  if (!townInput || !cityInput) return;
  try {
    const res = await fetch('/api/uk-towns');
    const { towns } = await res.json();
    createPlaceCombobox('townInput', towns, 2);
    createPlaceCombobox('cityInput', towns, 2);
  } catch { /* non-critical — fields still work as plain free-text inputs */ }
})();
