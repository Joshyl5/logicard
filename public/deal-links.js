// Deal cards: "Get deal" goes to a different place depending on who is
// looking. Cards render it as <a data-get-deal="<slug>" href="/signup.html">
// and call LogicardDeal.apply() after rendering; once /api/session answers,
// every such link is pointed at:
//   guest      -> /signup.html              (join first)
//   unverified -> /verify                   (finish verification)
//   member     -> /<slug>#redeem            (straight to their code)
(function () {
  var state = null, waiting = false;
  function target(slug) {
    if (state === 'member') return '/' + slug + '#redeem';
    if (state === 'unverified') return '/verify';
    return '/signup.html';
  }
  function update() {
    document.querySelectorAll('a[data-get-deal]').forEach(function (a) {
      var slug = a.getAttribute('data-get-deal');
      if (/^[a-z0-9-]+$/i.test(slug)) a.href = target(slug);
    });
  }
  function apply() {
    if (state) return update();
    if (waiting) return;
    waiting = true;
    fetch('/api/session', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : { state: 'guest' }; })
      .catch(function () { return { state: 'guest' }; })
      .then(function (d) { state = d.state || 'guest'; update(); });
  }
  window.LogicardDeal = { apply: apply };
})();
