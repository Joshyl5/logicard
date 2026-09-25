// Deal card pictures (.dc-img). Two jobs:
// 1. Pin the image to the 16:9 box. Some phone browsers ignore height:100%
//    on a grid child and crop the image at its own height instead.
// 2. Logos: if a picture has a plain border (e.g. a square logo file that is
//    mostly white space) trim it off and show the logo large and centred on
//    its own background colour, so the brand name is the focal point.
//    Photos have no plain border and are left exactly as they are.
(function () {
  var css = document.createElement('style');
  css.textContent =
    '.dc-img > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }' +
    '.dc-img.dc-img--logo > img { inset: 12% 10%; width: 80%; height: 76%; }';
  document.head.appendChild(css);

  function tidy(img) {
    if (img.dataset.tidied) return;
    img.dataset.tidied = '1';
    var w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return;
    var scale = Math.min(1, 300 / Math.max(w, h));
    var sw = Math.max(1, Math.round(w * scale)), sh = Math.max(1, Math.round(h * scale));
    var c = document.createElement('canvas'); c.width = sw; c.height = sh;
    var x = c.getContext('2d', { willReadFrequently: true });
    var d;
    try { x.drawImage(img, 0, 0, sw, sh); d = x.getImageData(0, 0, sw, sh).data; } catch (e) { return; } // other-site image: leave it
    function px(i, j) { var k = (j * sw + i) * 4; return [d[k], d[k + 1], d[k + 2], d[k + 3]]; }
    // Background = the colour shared by all four corners
    var cs = [px(0, 0), px(sw - 1, 0), px(0, sh - 1), px(sw - 1, sh - 1)];
    function diff(a, b) {
      if (a[3] < 30 && b[3] < 30) return 0; // both transparent
      return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) + Math.abs(a[3] - b[3]);
    }
    for (var n = 1; n < 4; n++) if (diff(cs[0], cs[n]) > 40) return; // no plain border: a photo
    var bg = cs[0], top = sh, left = sw, right = -1, bottom = -1;
    for (var j = 0; j < sh; j++) for (var i = 0; i < sw; i++) {
      if (diff(px(i, j), bg) > 60) { if (i < left) left = i; if (i > right) right = i; if (j < top) top = j; if (j > bottom) bottom = j; }
    }
    if (right < 0) return; // blank image
    var box = img.closest('.dc-img');
    if (!box) return;
    // Back in full-size pixels, with a little breathing room
    var pad = 2, L = Math.max(0, (left - pad) / scale), T = Math.max(0, (top - pad) / scale);
    var R = Math.min(w, (right + 1 + pad) / scale), B = Math.min(h, (bottom + 1 + pad) / scale);
    var trimmed = (R - L) * (B - T) < w * h * 0.9;
    if (trimmed) {
      var out = document.createElement('canvas');
      var k = Math.min(1, 1200 / Math.max(R - L, B - T));
      out.width = Math.round((R - L) * k); out.height = Math.round((B - T) * k);
      out.getContext('2d').drawImage(img, L, T, R - L, B - T, 0, 0, out.width, out.height);
      try { img.src = out.toDataURL('image/png'); } catch (e) { return; }
    }
    box.style.background = bg[3] < 30 ? '#fff' : 'rgb(' + bg[0] + ',' + bg[1] + ',' + bg[2] + ')';
    box.classList.add('dc-img--logo');
  }

  function scan(root) {
    (root.querySelectorAll ? root : document).querySelectorAll('.dc-img > img').forEach(function (img) {
      if (img.complete && img.naturalWidth) tidy(img);
      else img.addEventListener('load', function () { tidy(img); }, { once: true });
    });
  }
  function start() {
    scan(document);
    new MutationObserver(function (list) {
      list.forEach(function (m) { m.addedNodes.forEach(function (nd) { if (nd.nodeType === 1) scan(nd.parentNode || nd); }); });
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
