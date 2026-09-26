// Cookie & data consent banner (loaded on every page by templates/nav.js).
// Asks once, remembers the answer for 12 months in the lc_consent cookie,
// and can be reopened from "Cookie settings" in the footer or privacy page.
//
// Two choices, both off until the visitor says yes:
//   partners - record how the visitor uses Logicard and share it with
//              trusted partners (brands and affiliate networks such as Awin)
//   profile  - group the visitor with members of a similar profile to
//              recommend brands and offers that suit them
//
// Other scripts check a choice with LogicardConsent.has('partners') or
// LogicardConsent.has('profile'), and can listen for the
// 'logicard:consent' event, which fires whenever the choice is saved.
(function () {
  var COOKIE = 'lc_consent', VERSION = 'v1', DAYS = 365;

  function read() {
    var m = document.cookie.match(/(?:^|;\s*)lc_consent=([^;]*)/);
    if (!m) return null;
    var p = decodeURIComponent(m[1]).split('.');
    if (p[0] !== VERSION) return null; // wording changed: ask again
    return { partners: p[1] === '1', profile: p[2] === '1', at: Number(p[3]) || 0 };
  }

  function save(partners, profile) {
    var val = [VERSION, partners ? 1 : 0, profile ? 1 : 0, Date.now()].join('.');
    document.cookie = COOKIE + '=' + encodeURIComponent(val) + '; Max-Age=' + DAYS * 86400 + '; Path=/; SameSite=Lax' +
      (location.protocol === 'https:' ? '; Secure' : '');
    var choice = { partners: !!partners, profile: !!profile };
    try { document.dispatchEvent(new CustomEvent('logicard:consent', { detail: choice })); } catch (e) {}
    close();
  }

  var css =
    '.lc-consent { position: fixed; left: 0; right: 0; bottom: 0; z-index: 9000; padding: 0 20px 20px; pointer-events: none; font-family: "Montserrat", Arial, sans-serif; }' +
    '.lc-consent-box { pointer-events: auto; max-width: 1080px; margin: 0 auto; background: #0b0b0b; color: #fff; border: 1px solid rgba(255,179,0,.55); border-radius: 18px; box-shadow: 0 -6px 40px rgba(0,0,0,.6); padding: 22px 24px; max-height: calc(100vh - 40px); max-height: calc(100dvh - 40px); overflow-y: auto; }' +
    '.lc-consent h2 { font: 400 22px/1.2 "Archivo Black", "Arial Black", sans-serif; margin: 0 0 10px; color: #fff; }' +
    '.lc-consent h2 span { color: #FFB300; }' +
    '.lc-consent p, .lc-consent li { font-size: 14px; line-height: 1.55; color: rgba(255,255,255,.9); margin: 0 0 8px; }' +
    '.lc-consent ul { margin: 0 0 10px; padding-left: 20px; }' +
    '.lc-consent a { color: #FFB300; }' +
    '.lc-consent-opts { display: none; margin: 12px 0 4px; border-top: 1px solid rgba(255,255,255,.12); padding-top: 12px; }' +
    '.lc-consent.lc-choose .lc-consent-opts { display: block; }' +
    '.lc-consent-opt { display: flex; gap: 12px; align-items: flex-start; padding: 8px 0; }' +
    '.lc-consent-opt input { width: 20px; height: 20px; margin: 2px 0 0; accent-color: #FFB300; flex-shrink: 0; }' +
    '.lc-consent-opt strong { display: block; color: #fff; font-size: 14px; }' +
    '.lc-consent-opt span { display: block; font-size: 13px; color: rgba(255,255,255,.8); line-height: 1.5; }' +
    '.lc-consent-btns { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; }' +
    '.lc-consent-btns button { flex: 1 1 160px; min-height: 46px; border-radius: 999px; font: 700 14px "Montserrat", Arial, sans-serif; cursor: pointer; padding: 10px 18px; }' +
    '.lc-btn-yes { background: #FFB300; color: #000; border: 2px solid #FFB300; }' +
    '.lc-btn-no { background: #fff; color: #000; border: 2px solid #fff; }' +
    '.lc-btn-alt { background: transparent; color: #fff; border: 2px solid rgba(255,255,255,.45); }' +
    '.lc-consent .lc-save { display: none; }' +
    '.lc-consent.lc-choose .lc-save { display: block; }' +
    '.lc-consent.lc-choose .lc-btn-choose { display: none; }' +
    '@media (max-width: 480px) { .lc-consent { padding: 0 10px 10px; } .lc-consent-box { padding: 18px 16px; } .lc-consent h2 { font-size: 19px; } }';

  var root = null;

  function open(showChoices) {
    if (!root) build();
    var now = read();
    root.querySelector('#lcPartners').checked = !!(now && now.partners);
    root.querySelector('#lcProfile').checked = !!(now && now.profile);
    root.classList.toggle('lc-choose', showChoices === true);
    root.hidden = false;
    var first = root.querySelector('.lc-btn-yes');
    if (first && showChoices !== 'quiet') try { first.focus({ preventScroll: true }); } catch (e) {}
  }

  function close() { if (root) root.hidden = true; }

  function build() {
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    root = document.createElement('div');
    root.className = 'lc-consent';
    root.hidden = true;
    root.innerHTML =
      '<div class="lc-consent-box" role="dialog" aria-modal="false" aria-labelledby="lcTitle" aria-describedby="lcText">' +
        '<h2 id="lcTitle">Your data, <span>your choice</span></h2>' +
        '<div id="lcText">' +
          '<p>Logicard uses essential cookies to keep the site working and to keep you logged in. With your permission we would also like to:</p>' +
          '<ul>' +
            '<li><strong>Record and share information with trusted partners.</strong> We record how you use Logicard, such as the deals you view and click, and share this with our trusted partners (the brands behind our deals and affiliate networks such as Awin) so your savings are tracked and credited correctly.</li>' +
            '<li><strong>Group you for better recommendations.</strong> Your information allows Logicard to group you with members who have a similar profile (for example your job role and the deals you are interested in), so we can recommend brands and offers that suit you better.</li>' +
          '</ul>' +
          '<p>Saying no will not stop you using Logicard or any of its deals. You can change your mind at any time from "Cookie settings" at the bottom of every page. See our <a href="/privacy.html">Privacy Policy</a> for more.</p>' +
        '</div>' +
        '<div class="lc-consent-opts">' +
          '<label class="lc-consent-opt"><input type="checkbox" checked disabled /><div><strong>Essential (always on)</strong><span>Keeps the site working, secure and you logged in.</span></div></label>' +
          '<label class="lc-consent-opt"><input type="checkbox" id="lcPartners" /><div><strong>Record and share with trusted partners</strong><span>How you use Logicard, shared with the brands and affiliate networks behind our deals.</span></div></label>' +
          '<label class="lc-consent-opt"><input type="checkbox" id="lcProfile" /><div><strong>Grouping for recommendations</strong><span>Groups you with members of a similar profile so we can recommend brands that suit you.</span></div></label>' +
        '</div>' +
        '<div class="lc-consent-btns">' +
          '<button type="button" class="lc-btn-yes" data-lc="all">Accept all</button>' +
          '<button type="button" class="lc-btn-no" data-lc="none">Reject all</button>' +
          '<button type="button" class="lc-btn-alt lc-btn-choose" data-lc="choose">Choose</button>' +
          '<button type="button" class="lc-btn-alt lc-save" data-lc="save">Save my choices</button>' +
        '</div>' +
      '</div>';
    root.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-lc]');
      if (!b) return;
      var a = b.getAttribute('data-lc');
      if (a === 'all') save(true, true);
      else if (a === 'none') save(false, false);
      else if (a === 'choose') root.classList.add('lc-choose');
      else if (a === 'save') save(root.querySelector('#lcPartners').checked, root.querySelector('#lcProfile').checked);
    });
    document.body.appendChild(root);
  }

  window.LogicardConsent = {
    has: function (kind) { var c = read(); return !!(c && c[kind]); },
    get: read,
    open: function () { open(true); },
  };

  // Any element with data-cookie-settings reopens the banner
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-cookie-settings]');
    if (!t) return;
    e.preventDefault();
    open(true);
  });

  function start() { if (!read()) open('quiet'); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
