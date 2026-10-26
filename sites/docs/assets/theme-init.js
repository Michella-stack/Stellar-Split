// Runs before first paint. Same storage key as the app so the theme follows you across sites.
(function () {
  var t = null;
  try { t = localStorage.getItem('stellar-split.theme'); } catch (e) {}
  if (t !== 'dark' && t !== 'light') t = window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
})();
