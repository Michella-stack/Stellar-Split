/* Cookie consent. Stores {v, analytics, ts} in localStorage 'stellar-split.consent'. Loads Vercel Web Analytics only after opt-in. */
(function () {
  var KEY = 'stellar-split.consent';
  var VERSION = 1;
  var MAX_AGE = 365 * 24 * 3600 * 1000; // re-ask after 12 months
  var SCRIPT = '/_vercel/insights/script.js';

  function read() {
    try {
      var c = JSON.parse(localStorage.getItem(KEY));
      if (c && c.v === VERSION && typeof c.analytics === 'boolean' && Date.now() - Date.parse(c.ts) < MAX_AGE) return c;
    } catch (e) {}
    return null;
  }
  function write(analytics) {
    try { localStorage.setItem(KEY, JSON.stringify({ v: VERSION, analytics: analytics, ts: new Date().toISOString() })); } catch (e) {}
  }
  function loadAnalytics() {
    if (document.querySelector('script[data-ss-analytics]')) return;
    window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
    var s = document.createElement('script');
    s.defer = true; s.src = SCRIPT; s.setAttribute('data-ss-analytics', '');
    document.head.appendChild(s);
  }

  var current = read();
  if (current && current.analytics) loadAnalytics();

  var banner, dlg, toggle, opener;

  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (html) n.innerHTML = html;
    return n;
  }
  function buttons(prefix) {
    return '<button type="button" class="btn btn-ghost" data-act="reject">Reject all</button>' +
      '<button type="button" class="btn btn-ghost" data-act="custom">Customize</button>' +
      '<button type="button" class="btn btn-ghost" data-act="accept">Accept all</button>';
  }

  function decide(analytics) {
    var was = !!(read() && read().analytics);
    write(analytics);
    if (banner) { banner.remove(); banner = null; }
    if (dlg && dlg.open) dlg.close();
    if (analytics) loadAnalytics();
    else if (was) location.reload(); // stop an analytics script that is already running
  }

  function showBanner() {
    if (banner) return;
    banner = el('div', { class: 'cc-banner', role: 'dialog', 'aria-labelledby': 'cc-title', 'aria-describedby': 'cc-text' },
      '<h2 id="cc-title" class="cc-title">Cookies and analytics</h2>' +
      '<p id="cc-text" class="cc-text">We use storage that the site needs to work. With your OK we also count visits with Vercel Web Analytics, which sets no cookies. <a href="/cookies.html">Read the details</a>.</p>' +
      '<div class="cc-actions">' + buttons() + '</div>');
    banner.addEventListener('click', onAct);
    document.body.appendChild(banner);
  }

  function openDialog(from) {
    opener = from || document.activeElement;
    if (!dlg) {
      dlg = el('dialog', { class: 'cc-dialog', 'aria-labelledby': 'cc-dtitle', 'aria-modal': 'true' },
        '<h2 id="cc-dtitle" class="cc-title">Cookie settings</h2>' +
        '<p class="cc-text">Choose what you allow. You can change this at any time from the footer. <a href="/cookies.html">Cookie details</a></p>' +
        '<div class="cc-row"><div><strong id="cc-n-l">Strictly necessary</strong><p class="cc-text">Remembers your theme, language and consent choice. The site does not work properly without it.</p></div>' +
        '<label class="cc-switch"><input type="checkbox" checked disabled aria-labelledby="cc-n-l"><span class="cc-track" aria-hidden="true"></span></label></div>' +
        '<div class="cc-row"><div><strong id="cc-a-l">Analytics</strong><p class="cc-text">Vercel Web Analytics. Counts page views and referrers. No cookies, no cross-site tracking. Off unless you turn it on.</p></div>' +
        '<label class="cc-switch"><input type="checkbox" data-analytics aria-labelledby="cc-a-l"><span class="cc-track" aria-hidden="true"></span></label></div>' +
        '<div class="cc-actions"><button type="button" class="btn btn-ghost" data-act="reject">Reject all</button>' +
        '<button type="button" class="btn btn-ghost" data-act="save">Save choices</button>' +
        '<button type="button" class="btn btn-ghost" data-act="accept">Accept all</button></div>');
      dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); onAct(e); });
      dlg.addEventListener('close', function () {
        if (opener && opener.focus && document.contains(opener)) opener.focus();
      });
      document.body.appendChild(dlg);
      toggle = dlg.querySelector('[data-analytics]');
    }
    var c = read();
    toggle.checked = !!(c && c.analytics);
    dlg.showModal();
    dlg.querySelector('[data-act="save"]').focus();
  }

  function onAct(e) {
    var b = e.target.closest && e.target.closest('[data-act]');
    if (!b) return;
    var a = b.getAttribute('data-act');
    if (a === 'accept') decide(true);
    else if (a === 'reject') decide(false);
    else if (a === 'save') decide(toggle.checked);
    else if (a === 'custom') openDialog(b);
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-cookie-settings]');
    if (t) { e.preventDefault(); openDialog(t); }
  });

  function init() { if (!current) showBanner(); }
  if (document.body) init(); else document.addEventListener('DOMContentLoaded', init);
})();
