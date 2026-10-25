// Runs before first paint. Keep the keys and values in sync with src/lib/theme.js.
(function () {
  var root = document.documentElement;
  var theme = null;
  var accent = null;
  try {
    theme = localStorage.getItem('stellar-split.theme');
    accent = localStorage.getItem('stellar-split.accent');
  } catch {
    // Storage can be blocked; fall back to the system preference.
  }
  if (theme !== 'dark' && theme !== 'light') {
    var prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    theme = prefersLight ? 'light' : 'dark';
  }
  root.setAttribute('data-theme', theme);
  if (accent === 'lime' || accent === 'cyan' || accent === 'orange' || accent === 'violet') {
    root.setAttribute('data-accent', accent);
  }
})();
