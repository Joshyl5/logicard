function cls(active, key) {
  return active === key ? ' class="active"' : '';
}

// active: 'home' | 'categories' | 'things-to-do' | 'shopping-cards' |
//         'e-learning' | 'financial-wellbeing' | 'mental-wellbeing' |
//         'logistics-news' | 'qualify' | 'about' | 'how-it-works' |
//         'our-story' | 'faqs' | 'partnerships' | 'forum' | null
// activeDropdown: 'trade-supplies-tools' | 'vehicles-motoring' |
//                 'technology-office' | 'home-garden' | 'food-drink' |
//                 'fashion' | 'family-leisure-travel' | 'utilities-mobile' |
//                 'events-experiences' (the 9 pages represented in the
//                 Deals group) | null
// tagline: unused — kept as an accepted option so existing call sites
//          (NAV_OPTIONS_BY_PAGE in server.js) don't need to change.
//
// Layout (2026-09-24 black rebrand): gold top bar with the wordmark on the
// left and a burger on the right at every width, opening a slide-out drawer
// — the same header the homepage launched with, now shared by every page.
function renderNav({ active = null, activeDropdown = null, loggedIn = false } = {}) {
  const dropdownCls = (key) => cls(activeDropdown, key);
  const aboutKeys = ['about', 'qualify', 'how-it-works', 'our-story', 'faqs'];
  const moreKeys = ['things-to-do', 'shopping-cards', 'e-learning', 'financial-wellbeing', 'mental-wellbeing', 'logistics-news', 'forum', 'guides'];
  const dealsOpen = active === 'categories' || !!activeDropdown ? ' open' : '';
  const aboutOpen = aboutKeys.includes(active) ? ' open' : '';
  const moreOpen = moreKeys.includes(active) ? ' open' : '';
  const top = (key) => (active === key ? ' class="active"' : '');

  return `
  <div class="site-header-wrap">
    <header class="site-header">
      <a href="/" class="site-header-logo" aria-label="Logicard home"><span class="logi">Logi</span><span class="card">card</span></a>
      <button type="button" class="site-burger" id="siteMenuOpen" aria-label="Open menu" aria-controls="siteDrawer" aria-expanded="false"><span></span><span></span><span></span></button>
    </header>
  </div>
  <div class="site-scrim" id="siteScrim"></div>
  <aside class="site-drawer" id="siteDrawer" aria-label="Main menu">
    <div class="site-drawer-head">
      <strong>MENU</strong>
      <button type="button" class="site-drawer-close" id="siteMenuClose" aria-label="Close menu">&times;</button>
    </div>
    <nav class="site-drawer-nav">
      <a href="/"${top('home')}>Home</a>
      <details${dealsOpen}>
        <summary>Deals</summary>
        <div class="sub">
          <a href="/categories.html"${cls(active, 'categories')}>All Deal Categories</a>
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
      </details>
      <details${aboutOpen}>
        <summary>About</summary>
        <div class="sub">
          <a href="/about.html"${cls(active, 'about')}>About Us</a>
          <a href="/how-it-works.html"${cls(active, 'how-it-works')}>How It Works</a>
          <a href="/qualify.html"${cls(active, 'qualify')}>Who Qualifies?</a>
          <a href="/our-story.html"${cls(active, 'our-story')}>Our Story</a>
          <a href="/faqs.html"${cls(active, 'faqs')}>FAQs</a>
        </div>
      </details>
      <a href="/partnerships.html"${top('partnerships')}>Partnerships</a>
      <a href="/signup.html">Join Logicard</a>
      <details${moreOpen}>
        <summary>More</summary>
        <div class="sub">
          <a href="/guides"${cls(active, 'guides')}>Guides</a>
          <a href="/forum"${cls(active, 'forum')}>Members Forum</a>
          <a href="/logistics-news.html"${cls(active, 'logistics-news')}>Logistics News</a>
          <a href="/things-to-do.html"${cls(active, 'things-to-do')}>Things to Do</a>
          <a href="/shopping-cards.html"${cls(active, 'shopping-cards')}>Shopping Cards</a>
          <a href="/e-learning.html"${cls(active, 'e-learning')}>E-learning</a>
          <a href="/financial-wellbeing.html"${cls(active, 'financial-wellbeing')}>Financial Wellbeing</a>
          <a href="/mental-wellbeing.html"${cls(active, 'mental-wellbeing')}>Mental Wellbeing</a>
          <a href="/workforce-recognition.html">Workforce Recognition</a>
          <a href="/#contact">Contact Us</a>
        </div>
      </details>
    </nav>
    <div class="site-drawer-foot">${loggedIn ? `
      <a class="site-drawer-login" href="/member-dashboard"><span aria-hidden="true">&#9679;</span> My Dashboard</a>
      <a class="site-drawer-login" href="/member-offers"><span aria-hidden="true">&#9679;</span> My Offers</a>
      <button type="button" class="site-drawer-join" id="siteLogout">Log out</button>` : `
      <a class="site-drawer-login" href="/login.html"><span aria-hidden="true">&#10132;</span> Log in</a>
      <a class="site-drawer-join" href="/signup.html">Join Now</a>`}
    </div>
  </aside>
  <script>
    (function () {
      var b = document.body, open = document.getElementById('siteMenuOpen');
      function set(on) { b.classList.toggle('site-menu-open', on); open.setAttribute('aria-expanded', on); }
      open.addEventListener('click', function () { set(true); });
      document.getElementById('siteMenuClose').addEventListener('click', function () { set(false); });
      document.getElementById('siteScrim').addEventListener('click', function () { set(false); });
      document.querySelectorAll('.site-drawer a').forEach(function (a) { a.addEventListener('click', function () { set(false); }); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') set(false); });
      var out = document.getElementById('siteLogout');
      if (out) out.addEventListener('click', function () {
        fetch('/api/logout', { method: 'POST' }).then(function () { window.location.href = '/'; });
      });
    })();
  </script>`;
}

module.exports = { renderNav };
