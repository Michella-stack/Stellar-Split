// Theme toggle, mobile menu and copy buttons. No dependencies.
(function () {
  var root = document.documentElement;
  document.querySelectorAll('[data-theme-toggle]').forEach(function (b) {
    b.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('stellar-split.theme', next); } catch (e) {}
    });
  });

  var menu = document.querySelector('[data-menu]');
  var nav = document.getElementById('nav');
  if (menu && nav) {
    menu.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      menu.setAttribute('aria-expanded', String(open));
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) { nav.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('open')) { nav.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); menu.focus(); }
    });
  }

  document.querySelectorAll('pre').forEach(function (pre) {
    if (pre.closest('.code-block') || pre.hasAttribute('data-nocopy')) return;
    var wrap = document.createElement('div');
    wrap.className = 'code-block';
    pre.parentNode.insertBefore(wrap, pre);
    wrap.appendChild(pre);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-btn';
    btn.textContent = 'Copy';
    btn.addEventListener('click', function () {
      navigator.clipboard.writeText(pre.innerText).then(function () {
        btn.textContent = 'Copied';
        setTimeout(function () { btn.textContent = 'Copy'; }, 1500);
      });
    });
    wrap.appendChild(btn);
  });
})();
