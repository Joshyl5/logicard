function cls(active, key) {
  return active === key ? ' class="active"' : '';
}

// active: 'categories' | 'things-to-do' | 'shopping-cards' | 'e-learning' |
//         'financial-wellbeing' | 'mental-wellbeing' | 'qualify' | 'about' |
//         'partnerships' | null
// activeDropdown: 'trade-supplies-tools' | 'vehicles-motoring' |
//                 'technology-office' | 'home-garden' | 'food-drink' |
//                 'fashion' | 'family-leisure-travel' | 'utilities-mobile' |
//                 'events-experiences' (the 9 pages represented in the
//                 Deals dropdown) | null
// tagline: unused — kept as an accepted option so existing call sites
//          (NAV_OPTIONS_BY_PAGE in server.js) don't need to change; the
//          single-row TYC-style header has no room for the tagline strip.
function renderNav({ active = null, activeDropdown = null } = {}) {
  const dropdownCls = (key) => cls(activeDropdown, key);

  // Top-level tabs: which group is "active" bundles several `active` values
  // into one parent tab, same way TYC highlights DEALS/ABOUT/MORE as a whole.
  const dealsTabCls = active === 'categories' ? ' active' : '';
  const aboutTabCls = (active === 'about' || active === 'qualify') ? ' active' : '';
  const moreKeys = ['things-to-do', 'shopping-cards', 'e-learning', 'financial-wellbeing', 'mental-wellbeing'];
  const moreTabCls = moreKeys.includes(active) ? ' active' : '';

  const chevronSvg = '<svg class="nav-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
  const checkSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

  return `
  <div class="site-header-wrap">
    <nav class="site-header">
      <a href="/" class="site-header-logo"><span class="logi">Logi</span><span class="card">card</span></a>

      <div class="site-header-nav">
        <div class="nav-item">
          <a href="/categories.html" class="nav-link${dealsTabCls}">Deals</a>
          <div class="nav-dropdown">
            <a href="/trade-supplies-tools.html"${dropdownCls('trade-supplies-tools')}>Trade Supplies &amp; Tools</a>
            <a href="/vehicles-motoring.html"${dropdownCls('vehicles-motoring')}>Vehicles &amp; Motoring</a>
            <a href="/technology-office.html"${dropdownCls('technology-office')}>Technology &amp; Office</a>
            <a href="/home-garden.html"${dropdownCls('home-garden')}>Home &amp; Garden</a>
            <a href="/food-drink.html"${dropdownCls('food-drink')}>Food &amp; Drink</a>
            <a href="/fashion.html"${dropdownCls('fashion')}>Fashion &amp; Lifestyle</a>
            <a href="/family-leisure-travel.html"${dropdownCls('family-leisure-travel')}>Family, Leisure &amp; Travel</a>
            <a href="/utilities-mobile.html"${dropdownCls('utilities-mobile')}>Utilities &amp; Mobile</a>
            <a href="/events-experiences.html"${dropdownCls('events-experiences')}>Events &amp; Experiences</a>
          </div>
        </div>

        <div class="nav-item">
          <a href="/about.html" class="nav-link${aboutTabCls}">About${chevronSvg}</a>
          <div class="nav-dropdown nav-dropdown--single">
            <a href="/about.html"${cls(active, 'about')}>About Us</a>
            <a href="/#how-it-works">How It Works</a>
            <a href="/qualify.html"${cls(active, 'qualify')}>Who Qualifies?</a>
            <a href="/#our-story">Our Story</a>
            <a href="/#faqs">FAQs</a>
          </div>
        </div>

        <a href="/partnerships.html" class="nav-link${active === 'partnerships' ? ' active' : ''}">Partnerships</a>
        <a href="/signup.html" class="nav-link">Join Logicard</a>

        <div class="nav-item">
          <a href="#" class="nav-link${moreTabCls}" onclick="return false;">More${chevronSvg}</a>
          <div class="nav-dropdown nav-dropdown--single">
            <a href="/things-to-do.html"${cls(active, 'things-to-do')}>Things to Do</a>
            <a href="/shopping-cards.html"${cls(active, 'shopping-cards')}>Shopping Cards</a>
            <a href="/e-learning.html"${cls(active, 'e-learning')}>E-learning</a>
            <a href="/financial-wellbeing.html"${cls(active, 'financial-wellbeing')}>Financial Wellbeing</a>
            <a href="/mental-wellbeing.html"${cls(active, 'mental-wellbeing')}>Mental Wellbeing</a>
          </div>
        </div>

        <a href="/qualify.html" class="site-header-cta${active === 'qualify' ? ' active' : ''}">${checkSvg}Check Your Eligibility Now</a>
      </div>

      <div class="site-header-actions">
        <a href="/login.html" class="site-header-signin">Log In</a>
        <a href="/signup.html" class="site-header-join">Join Now</a>
      </div>
    </nav>
  </div>`;
}

module.exports = { renderNav };
