// Shared helpers for the Members Forum pages (views/forum.html,
// views/forum-post.html). All member-written text is set with textContent,
// never innerHTML.
(function () {
  function api(method, url, body) {
    return fetch(url, {
      method: method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin'
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (r.status === 401) { window.location.href = '/login.html'; throw new Error('Please log in.'); }
        if (!r.ok) { var e = new Error(d.error || 'Something went wrong. Please try again.'); e.code = d.error; throw e; }
        return d;
      });
    });
  }

  function timeAgo(iso) {
    var s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 604800) return Math.floor(s / 86400) + 'd ago';
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  // Fills a .pmeta element: "Name · Role · 3h ago · extra"
  function meta(el, author, when, extra) {
    el.textContent = '';
    var b = document.createElement('b'); b.textContent = author.name; el.appendChild(b);
    [author.role, timeAgo(when), extra].forEach(function (t) {
      if (!t) return;
      var s = document.createElement('span'); s.textContent = t; el.appendChild(s);
    });
  }

  // Unverified members get a pointer to /verify instead of a bare error code.
  function showError(el, err) {
    if (err.code === 'pending_verification') {
      el.textContent = 'Your membership needs verifying before you can post. ';
      var a = document.createElement('a'); a.href = '/verify'; a.textContent = 'Verify now'; a.style.color = '#FFB300';
      el.appendChild(a);
    } else {
      el.textContent = err.message;
    }
  }

  window.LogicardForum = { api: api, meta: meta, timeAgo: timeAgo, showError: showError };
})();
