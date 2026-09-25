// "Our partners" strip on category pages: the live partner brands in this
// page's categories (from Manage Partner Brands), as logo tiles linking to
// each brand's page at /deals/<slug>. Categories come from the section's
// data-cats attribute; the section stays hidden if there are none.
(function () {
  var box = document.getElementById('catPartners');
  if (!box) return;
  var cats = [];
  try { cats = JSON.parse(box.getAttribute('data-cats') || '[]'); } catch (e) { return; }
  var section = document.getElementById('cat-partners');
  var MAX = 10;

  var css = document.createElement('style');
  css.textContent =
    '.cat-partners { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(150px, 100%), 1fr)); gap: 14px; }' +
    '.cp-tile { display: flex; flex-direction: column; align-items: center; gap: 10px; text-decoration: none; color: #fff; }' +
    '.cp-logo { box-sizing: border-box; width: 100%; height: 110px; background: #fff; border-radius: 14px; display: flex; align-items: center; justify-content: center; padding: 14px; overflow: hidden; border: 1px solid rgba(255,255,255,0.12); transition: transform .15s, box-shadow .15s; }' +
    '.cp-logo img { display: block; max-width: 100%; max-height: 82px; width: auto; height: auto; object-fit: contain; }' +
    '.cp-logo .cp-initial { font: 400 34px "Archivo Black", "Arial Black", sans-serif; color: #111; }' +
    '.cp-tile:hover .cp-logo { transform: translateY(-3px); box-shadow: 0 10px 24px rgba(0,0,0,.4); }' +
    '.cp-name { font: 600 14px "Montserrat", sans-serif; text-align: center; line-height: 1.3; }' +
    '.cp-more { margin-top: 18px; }';
  document.head.appendChild(css);

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safeImg(u) { return typeof u === 'string' && (/^https:\/\//i.test(u) || /^\/(?!\/)/.test(u)); }

  fetch('/api/public/partner-brands').then(function (r) { return r.ok ? r.json() : []; }).then(function (brands) {
    var list = (brands || []).filter(function (b) {
      return cats.indexOf(b.category) !== -1 && /^[a-z0-9-]+$/i.test(b.slug || '');
    }).slice(0, MAX);
    if (!list.length) return;
    box.innerHTML = list.map(function (b) {
      var logo = safeImg(b.logoUrl)
        ? '<img src="' + esc(b.logoUrl) + '" alt="' + esc(b.brandName) + ' logo" loading="lazy" onerror="this.outerHTML=\'<span class=&quot;cp-initial&quot;>' + esc((b.brandName || '?').charAt(0)) + '</span>\'" />'
        : '<span class="cp-initial">' + esc((b.brandName || '?').charAt(0)) + '</span>';
      return '<a class="cp-tile" href="/deals/' + esc(b.slug) + '"><span class="cp-logo">' + logo + '</span><span class="cp-name">' + esc(b.brandName) + '</span></a>';
    }).join('');
    section.hidden = false;
  }).catch(function () { /* section stays hidden */ });
})();
