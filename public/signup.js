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

// ── Job title selector: browse by category, or search ───────────
// Layers a category drill-down + search combobox on top of the existing
// <select id="role"> so the select stays the real form control (FormData
// still submits its value unchanged) while the fancier UI sits on top.
// Default view is the 10 category headers; clicking one drills into its
// job titles; typing anything switches to a flat search across all of them.
(function initRoleSearch() {
  const select = document.getElementById('role');
  if (!select) return;

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  const items = [];
  const categories = [];
  select.querySelectorAll('option').forEach(opt => {
    if (!opt.value) return;
    const group = opt.parentElement && opt.parentElement.tagName === 'OPTGROUP' ? opt.parentElement.label : '';
    items.push({ value: opt.value, group });
    if (group && group !== 'Other' && !categories.includes(group)) categories.push(group);
  });
  const otherItems = items.filter(i => i.group === 'Other');

  select.style.display = 'none';

  const wrap = document.createElement('div');
  wrap.className = 'role-combobox';

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.id = 'roleSearchInput';
  searchInput.placeholder = 'Search or browse by category…';
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
  let activeCategory = null;

  function getVisibleRows() {
    return Array.from(dropdown.querySelectorAll('.role-dropdown-row'));
  }

  function setActive(index) {
    const rows = getVisibleRows();
    rows.forEach(r => r.classList.remove('active'));
    if (rows[index]) {
      rows[index].classList.add('active');
      rows[index].scrollIntoView({ block: 'nearest' });
    }
    activeIndex = index;
  }

  function renderCategoryList() {
    let html = categories.map(cat =>
      `<div class="role-dropdown-row role-dropdown-category" data-action="category" data-value="${escapeHtml(cat)}">${escapeHtml(cat)}</div>`
    ).join('');
    if (otherItems.length) {
      html += '<div class="role-dropdown-divider"></div>';
      html += otherItems.map(item =>
        `<div class="role-dropdown-row role-dropdown-option" data-action="select" data-value="${escapeHtml(item.value)}">${escapeHtml(item.value)}</div>`
      ).join('');
    }
    dropdown.innerHTML = html;
    dropdown.classList.add('open');
  }

  function renderJobsForCategory(cat) {
    const jobs = items.filter(i => i.group === cat);
    let html = `<div class="role-dropdown-row role-dropdown-back" data-action="back">← All categories</div>`;
    html += `<div class="role-dropdown-group">${escapeHtml(cat)}</div>`;
    html += jobs.map(job =>
      `<div class="role-dropdown-row role-dropdown-option" data-action="select" data-value="${escapeHtml(job.value)}">${escapeHtml(job.value)}</div>`
    ).join('');
    dropdown.innerHTML = html;
    dropdown.classList.add('open');
  }

  function renderSearchResults(query) {
    const q = query.toLowerCase();
    const matches = items.filter(i => i.value.toLowerCase().includes(q) || i.group.toLowerCase().includes(q));

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
      html += `<div class="role-dropdown-row role-dropdown-option" data-action="select" data-value="${escapeHtml(item.value)}">${escapeHtml(item.value)}</div>`;
    });
    dropdown.innerHTML = html;
    dropdown.classList.add('open');
  }

  function renderDropdown() {
    activeIndex = -1;
    const query = searchInput.value.trim();
    if (query) { renderSearchResults(query); return; }
    if (activeCategory) { renderJobsForCategory(activeCategory); return; }
    renderCategoryList();
  }

  function closeDropdown() { dropdown.classList.remove('open'); }

  function selectValue(value) {
    select.value = value;
    searchInput.value = value;
    closeDropdown();
  }

  function handleRowAction(row) {
    if (!row) return;
    const action = row.dataset.action;
    if (action === 'category') {
      activeCategory = row.dataset.value;
      searchInput.value = '';
      renderDropdown();
    } else if (action === 'back') {
      activeCategory = null;
      renderDropdown();
    } else if (action === 'select') {
      selectValue(row.dataset.value);
    }
  }

  searchInput.addEventListener('focus', renderDropdown);
  searchInput.addEventListener('input', () => {
    select.value = ''; // typing invalidates the previous pick until a real option is chosen again
    renderDropdown();
  });

  searchInput.addEventListener('blur', () => {
    // Delay so a click on a dropdown row registers before the list closes.
    setTimeout(() => {
      closeDropdown();
      const typed = searchInput.value.trim();
      const exact = items.find(i => i.value.toLowerCase() === typed.toLowerCase());
      if (exact) {
        select.value = exact.value;
        searchInput.value = exact.value;
      } else if (!select.value) {
        searchInput.value = '';
      }
      activeCategory = null;
    }, 150);
  });

  searchInput.addEventListener('keydown', e => {
    const rows = getVisibleRows();
    if (!rows.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(Math.min(activeIndex + 1, rows.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(Math.max(activeIndex - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleRowAction(rows[activeIndex] || rows[0]);
    } else if (e.key === 'Escape') {
      closeDropdown();
    }
  });

  dropdown.addEventListener('mousedown', e => {
    const row = e.target.closest('.role-dropdown-row');
    if (!row) return;
    e.preventDefault(); // keep focus on the input so blur doesn't fire before the click registers
    handleRowAction(row);
  });

  document.addEventListener('click', e => {
    if (!wrap.contains(e.target)) { closeDropdown(); activeCategory = null; }
  });
})();
