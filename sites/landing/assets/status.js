/* Checks each [data-svc] row from the browser. CORS-blocked answers show "Check manually". */
(function () {
  // Fixed list so no URL is read from the DOM into a link.
  var LINKS = { api: 'https://stellar-split-sooty.vercel.app/v1/health', horizon: 'https://horizon-testnet.stellar.org/' };
  var rows = document.querySelectorAll('[data-svc]');
  var stamp = document.getElementById('status-time');

  function set(row, state, text) {
    var pill = row.querySelector('.status-pill');
    pill.setAttribute('data-state', state);
    pill.textContent = text;
    if (state === 'manual') {
      pill.appendChild(document.createTextNode(' '));
      var a = document.createElement('a');
      a.href = LINKS[row.getAttribute('data-svc')] || '#'; a.textContent = 'open'; a.rel = 'noopener';
      pill.appendChild(a);
    }
  }
  function timeout(ms) { var c = new AbortController(); setTimeout(function () { c.abort(); }, ms); return c.signal; }

  function check(row) {
    var url = row.getAttribute('data-url');
    set(row, 'checking', 'Checking');
    fetch(url, { cache: 'no-store', signal: timeout(8000) }).then(function (r) {
      if (r.ok) set(row, 'ok', 'Operational'); else set(row, 'down', 'Unreachable (' + r.status + ')');
    }).catch(function () {
      // A readable answer failed. A no-cors request tells apart "blocked by CORS" from "no network answer".
      fetch(url, { mode: 'no-cors', cache: 'no-store', signal: timeout(8000) })
        .then(function () { set(row, 'manual', 'Check manually'); })
        .catch(function () { set(row, 'down', 'Unreachable'); });
    });
  }
  function run() {
    rows.forEach(check);
    if (stamp) stamp.textContent = 'Last checked: ' + new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  }
  var btn = document.getElementById('status-refresh');
  if (btn) btn.addEventListener('click', run);
  run();
})();
