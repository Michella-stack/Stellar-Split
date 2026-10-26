// Docs behaviour: drawer, heading anchors, table of contents, code tabs, highlighting, search. No dependencies.
(function () {
  var LANG_KEY = 'stellar-split.docs.lang';
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };

  // Drawer (under 960px)
  var side = document.querySelector('.docs-sidebar');
  var scrim = document.querySelector('.drawer-scrim');
  var sbtn = document.querySelector('[data-sidebar]');
  function drawer(open) {
    if (!side) return;
    side.classList.toggle('open', open);
    if (scrim) scrim.classList.toggle('open', open);
    if (sbtn) sbtn.setAttribute('aria-expanded', String(open));
    if (open) { var a = side.querySelector('a, button'); if (a) a.focus(); } else if (sbtn) sbtn.focus();
  }
  if (sbtn) sbtn.addEventListener('click', function () { drawer(!side.classList.contains('open')); });
  if (scrim) scrim.addEventListener('click', function () { drawer(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && side && side.classList.contains('open')) drawer(false); });

  // Heading anchors and table of contents
  var headings = Array.prototype.slice.call(document.querySelectorAll('.docs-main article h2[id], .docs-main article h3[id]'));
  headings.forEach(function (h) {
    var a = document.createElement('a');
    a.className = 'anchor';
    a.href = '#' + h.id;
    a.setAttribute('aria-label', 'Link to this section');
    a.textContent = '#';
    h.appendChild(a);
  });
  var toc = document.querySelector('.docs-toc ul');
  var links = [];
  if (toc) {
    var depth = Number(toc.getAttribute('data-depth') || 3);
    headings.forEach(function (h) {
      if (h.tagName === 'H3' && depth < 3) return;
      var li = document.createElement('li');
      li.className = h.tagName === 'H3' ? 'lvl3' : 'lvl2';
      var a = document.createElement('a');
      a.href = '#' + h.id;
      a.textContent = h.getAttribute('data-toc') || h.firstChild.textContent.trim();
      li.appendChild(a);
      toc.appendChild(li);
      links.push([h, a]);
    });
    if (!links.length) toc.closest('.docs-toc').hidden = true;
    var onScroll = function () {
      var cur = null;
      for (var i = 0; i < links.length; i++) if (links[i][0].getBoundingClientRect().top < 120) cur = links[i][1];
      links.forEach(function (l) { l[1].classList.toggle('active', l[1] === cur); });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // Syntax highlighting: one tokenizer for JSON, bash, JavaScript and Python. Escapes everything it emits.
  var esc = function (s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var KW = /^(const|let|var|await|async|function|return|if|else|new|import|from|export|true|false|null|None|True|False|def|for|in|print|curl|export)$/;
  var RE = /(#[^\n]*|\/\/[^\n]*)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_]\w*\b)|(\s-{1,2}[A-Za-z][\w-]*)/g;
  document.querySelectorAll('pre code').forEach(function (code) {
    var src = code.textContent, out = '', last = 0, m;
    var lang = code.className;
    RE.lastIndex = 0;
    while ((m = RE.exec(src))) {
      out += esc(src.slice(last, m.index));
      var t = m[0], cls = null;
      if (m[1]) { cls = (lang.indexOf('json') >= 0 || (m[1][0] === '#' && lang.indexOf('js') >= 0)) ? null : 'c'; if (m[1][0] === '/' && lang.indexOf('bash') >= 0) cls = null; }
      else if (m[2]) cls = 's';
      else if (m[3]) cls = 'n';
      else if (m[4]) cls = KW.test(t) ? 'k' : null;
      else if (m[5]) cls = lang.indexOf('bash') >= 0 ? 'p' : null;
      out += cls ? '<span class="tk-' + cls + '">' + esc(t) + '</span>' : esc(t);
      last = m.index + t.length;
    }
    code.innerHTML = out + esc(src.slice(last));
  });

  // Code tabs that remember the language
  var tabsets = Array.prototype.slice.call(document.querySelectorAll('[data-tabs]'));
  function pick(lang, save) {
    tabsets.forEach(function (set) {
      var btns = set.querySelectorAll('[role=tab]');
      var has = set.querySelector('[role=tab][data-lang="' + lang + '"]');
      var target = has ? lang : btns[0].getAttribute('data-lang');
      btns.forEach(function (b) {
        var on = b.getAttribute('data-lang') === target;
        b.setAttribute('aria-selected', String(on));
        b.tabIndex = on ? 0 : -1;
      });
      set.querySelectorAll('[role=tabpanel]').forEach(function (p) { p.hidden = p.getAttribute('data-lang') !== target; });
    });
    if (save) store.set(LANG_KEY, lang);
  }
  tabsets.forEach(function (set) {
    var btns = Array.prototype.slice.call(set.querySelectorAll('[role=tab]'));
    btns.forEach(function (b, i) {
      b.addEventListener('click', function () { var y = b.getBoundingClientRect().top; pick(b.getAttribute('data-lang'), true); window.scrollBy(0, b.getBoundingClientRect().top - y); });
      b.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        var n = btns[(i + d + btns.length) % btns.length];
        pick(n.getAttribute('data-lang'), true);
        n.focus();
      });
    });
  });
  if (tabsets.length) pick(store.get(LANG_KEY) || 'curl', false);

  // Search over the prebuilt index
  var modal = document.querySelector('.search-modal');
  var input = modal && modal.querySelector('input');
  var list = modal && modal.querySelector('.search-results');
  var index = null, opener = null, sel = 0;
  function load() {
    if (index) return Promise.resolve(index);
    return fetch('/assets/search-index.json').then(function (r) { return r.json(); }).then(function (d) { index = d; return d; });
  }
  function render() {
    var q = input.value.trim().toLowerCase();
    list.innerHTML = '';
    if (!q) return;
    var words = q.split(/\s+/);
    var hits = (index || []).map(function (e) {
      var hay = (e.title + ' ' + e.heading + ' ' + e.text).toLowerCase();
      var score = 0;
      for (var i = 0; i < words.length; i++) {
        if (hay.indexOf(words[i]) < 0) return null;
        if (e.heading.toLowerCase().indexOf(words[i]) >= 0) score += 3;
        if (e.title.toLowerCase().indexOf(words[i]) >= 0) score += 1;
      }
      return [score, e];
    }).filter(Boolean).sort(function (a, b) { return b[0] - a[0]; }).slice(0, 12);
    if (!hits.length) { list.innerHTML = '<li class="search-empty">No results for "' + esc(q) + '"</li>'; return; }
    hits.forEach(function (h, i) {
      var e = h[1];
      var li = document.createElement('li');
      li.innerHTML = '<a href="' + esc(e.url) + '"' + (i === 0 ? ' class="sel"' : '') + '><span class="r-page">' + esc(e.title) + '</span><br>' + esc(e.heading) + '<small>' + esc(e.text.slice(0, 120)) + '</small></a>';
      list.appendChild(li);
    });
    sel = 0;
  }
  function openSearch() {
    if (!modal) return;
    opener = document.activeElement;
    modal.classList.add('open');
    input.value = '';
    list.innerHTML = '';
    input.focus();
    load().catch(function () { list.innerHTML = '<li class="search-empty">Search index could not be loaded.</li>'; });
  }
  function closeSearch() { modal.classList.remove('open'); if (opener) opener.focus(); }
  if (modal) {
    document.querySelectorAll('[data-search]').forEach(function (b) { b.addEventListener('click', openSearch); });
    input.addEventListener('input', function () { load().then(render); });
    modal.addEventListener('click', function (e) { if (e.target === modal) closeSearch(); if (e.target.closest('a')) modal.classList.remove('open'); });
    input.addEventListener('keydown', function (e) {
      var as = list.querySelectorAll('a');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!as.length) return;
        as[sel].classList.remove('sel');
        sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + as.length) % as.length;
        as[sel].classList.add('sel');
        as[sel].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' && as[sel]) { window.location.href = as[sel].getAttribute('href'); modal.classList.remove('open'); }
    });
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); modal.classList.contains('open') ? closeSearch() : openSearch(); }
      else if (e.key === 'Escape' && modal.classList.contains('open')) closeSearch();
      else if (e.key === '/' && !modal.classList.contains('open') && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); openSearch(); }
    });
  }
})();
