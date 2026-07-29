const CATEGORY_LABELS = {
  'beauty-wellness': 'Beauty &amp; Wellness',
  'children-baby':   'Children &amp; Baby',
  'food-drink':      'Food &amp; Drink',
  fashion:           'Fashion',
  'gifts-flowers':   'Gifts &amp; Flowers',
};

function cls(active, key) {
  return active === key ? ' class="active"' : '';
}

// active: 'categories' | 'things-to-do' | 'shopping-cards' | 'e-learning' |
//         'financial-wellbeing' | 'mental-wellbeing' | 'qualify' | null
// activeDropdown: one of the CATEGORY_LABELS keys, for the 5 shop-category pages | null
// tagline: whether this page still shows the "Discounts • Giveaways..." strip
//          in the top navy bar (only index/qualify/categories do — the other
//          10 category pages moved it into their own hero-gold-bar instead)
function renderNav({ active = null, activeDropdown = null, tagline = false } = {}) {
  const categoriesCls = cls(active, 'categories');
  const thingsToDoCls = cls(active, 'things-to-do');
  const shoppingCardsCls = cls(active, 'shopping-cards');
  const eLearningCls = cls(active, 'e-learning');
  const financialCls = cls(active, 'financial-wellbeing');
  const mentalCls = cls(active, 'mental-wellbeing');
  const ctaCls = active === 'qualify' ? 'active cat-nav-cta' : 'cat-nav-cta';
  const dropdownCls = (key) => cls(activeDropdown, key);

  const mobileFirstItem = activeDropdown
    ? `<a href="/${activeDropdown}.html" class="active">${CATEGORY_LABELS[activeDropdown]}</a>`
    : `<a href="/categories.html"${categoriesCls}>Categories</a>`;

  const ctaSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

  return `
  <div class="site-header-wrap">
    <nav class="site-header">
      <a href="/" class="site-header-logo"><span class="logi">Logi</span><span class="card">card</span></a>${tagline ? `
      <p class="site-header-tagline">Discounts &bull; Giveaways &bull; Rewards &bull; Recognition <span class="site-header-divider">|</span> for the people who keep Britain moving</p>` : ''}
      <div class="site-header-actions">
        <a href="/login.html" class="site-header-signin">Log In</a>
        <a href="/signup.html" class="site-header-join">Sign Up</a>
      </div>
    </nav>
    <div class="category-nav">
      <div class="category-nav-item">
        <a href="/categories.html"${categoriesCls}>Categories</a>
        <div class="category-dropdown">
          <a href="/beauty-wellness.html"${dropdownCls('beauty-wellness')}>Beauty &amp; Wellness</a>
          <a href="/children-baby.html"${dropdownCls('children-baby')}>Children &amp; Baby</a>
          <a href="/food-drink.html"${dropdownCls('food-drink')}>Food &amp; Drink</a>
          <a href="/fashion.html"${dropdownCls('fashion')}>Fashion</a>
          <a href="/gifts-flowers.html"${dropdownCls('gifts-flowers')}>Gifts &amp; Flowers</a>
          <a href="/signup.html">Holiday &amp; Travel</a>
          <a href="/signup.html">Home &amp; Garden</a>
          <a href="/signup.html">Pets</a>
          <a href="/signup.html">Sports &amp; Fitness</a>
          <a href="/signup.html">Tech &amp; Mobile</a>
        </div>
      </div>
      <div class="category-nav-item">
        <a href="/things-to-do.html"${thingsToDoCls}>Things to Do</a>
        <div class="category-dropdown">
          <a href="/things-to-do.html#days-out">Days Out &amp; Attractions</a>
          <a href="/things-to-do.html#cinema">Cinema</a>
          <a href="/things-to-do.html#activities-experiences">Activities &amp; Experiences</a>
          <a href="/things-to-do.html#outdoor-adventures">Outdoor Adventures</a>
          <a href="/things-to-do.html#learning-education">Learning &amp; Education</a>
          <a href="/things-to-do.html#music">Music</a>
          <a href="/things-to-do.html#sports">Sports</a>
        </div>
      </div>
      <div class="category-nav-item">
        <a href="/shopping-cards.html"${shoppingCardsCls}>Shopping Cards</a>
        <div class="category-dropdown">
          <a href="/shopping-cards.html#supermarkets">Supermarkets</a>
          <a href="/shopping-cards.html#high-street-fashion">High Street Fashion</a>
          <a href="/shopping-cards.html#diy-home">DIY &amp; Home</a>
          <a href="/shopping-cards.html#electronics-tech">Electronics &amp; Tech</a>
          <a href="/shopping-cards.html#restaurants-dining">Restaurants &amp; Dining</a>
          <a href="/shopping-cards.html#gaming-entertainment">Gaming &amp; Entertainment</a>
          <a href="/shopping-cards.html#holidays-travel">Holidays &amp; Travel</a>
          <a href="/shopping-cards.html#health-beauty">Health &amp; Beauty</a>
          <a href="/shopping-cards.html#cinema-streaming">Cinema &amp; Streaming</a>
          <a href="/shopping-cards.html#fuel-motoring">Fuel &amp; Motoring</a>
        </div>
      </div>
      <a href="/e-learning.html"${eLearningCls}>E-learning</a>
      <a href="/financial-wellbeing.html"${financialCls}>Financial Wellbeing</a>
      <a href="/mental-wellbeing.html"${mentalCls}>Mental Wellbeing</a>
      <a href="/qualify.html" class="${ctaCls}">${ctaSvg}Check Your Eligibility Now</a>
    </div>
    <details class="mobile-benefits">
      <summary>
        Logicard Benefits
        <svg class="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
      </summary>
      <div class="mobile-benefits-panel">
        ${mobileFirstItem}
        <a href="/things-to-do.html"${thingsToDoCls}>Things to Do</a>
        <a href="/shopping-cards.html"${shoppingCardsCls}>Shopping Cards</a>
        <a href="/e-learning.html"${eLearningCls}>E-learning</a>
        <a href="/financial-wellbeing.html"${financialCls}>Financial Wellbeing</a>
        <a href="/mental-wellbeing.html"${mentalCls}>Mental Wellbeing</a>
        <a href="/qualify.html" class="${ctaCls}">${ctaSvg}Check Your Eligibility Now</a>
      </div>
    </details>
  </div>`;
}

module.exports = { renderNav };
