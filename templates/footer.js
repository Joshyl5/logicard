// ── Shared site footer ──
// Single source for the block server.js renders into every page that
// includes <!-- SHARED_FOOTER -->. Edit once, applies everywhere — same
// pattern as templates/nav.js + nav.css. Every link here points at a real
// Logicard page; no placeholder sections (cookies policy, careers, social
// links, partner logos) are included until the real thing exists.
function renderFooter() {
  return `
  <footer class="sf-footer">
    <div class="sf-inner">
      <div class="sf-grid">
        <div class="sf-col">
          <a href="/" class="sf-brand-logo"><span class="logi">Logi</span><span class="card">card</span></a>
          <p class="sf-brand-tagline">The UK's membership platform for logistics workers — built for the people who keep the country moving.</p>
        </div>

        <div class="sf-col">
          <h4>Platform</h4>
          <ul>
            <li><a href="/about.html">About Us</a></li>
            <li><a href="/how-it-works.html">How It Works</a></li>
            <li><a href="/qualify.html">Who Qualifies?</a></li>
            <li><a href="/our-story.html">Our Story</a></li>
            <li><a href="/faqs.html">FAQs</a></li>
            <li><a href="/categories.html">Browse Deals</a></li>
          </ul>
        </div>

        <div class="sf-col">
          <h4>Company</h4>
          <ul>
            <li><a href="/partnerships.html">Partnerships</a></li>
            <li><a href="/logistics-news.html">Logistics News</a></li>
            <li><a href="/workforce-recognition.html">Workforce Recognition</a></li>
            <li><a href="/#contact">Contact Us</a></li>
          </ul>
        </div>

        <div class="sf-col">
          <h4>Legal</h4>
          <ul>
            <li><a href="/privacy.html">Privacy Policy</a></li>
            <li><a href="/t&amp;cs">Terms &amp; Conditions</a></li>
          </ul>
        </div>

        <div class="sf-col">
          <h4>Contact</h4>
          <p><a href="mailto:info@logicard.co.uk">info@logicard.co.uk</a></p>
        </div>
      </div>

      <div class="sf-bottom">
        <span class="sf-copy">&copy; 2026 Logicard Ltd. All rights reserved. Registered in England and Wales, company number 17474646. Registered office: 7 Linnet Close, Hinckley, LE10 3FP.</span>
        <ul class="sf-bottom-links">
          <li><a href="/privacy.html">Privacy</a></li>
          <li><a href="/privacy.html#cookies" data-cookie-settings>Cookie settings</a></li>
          <li><a href="/t&amp;cs">Terms</a></li>
        </ul>
      </div>
    </div>
  </footer>`;
}

module.exports = { renderFooter };
