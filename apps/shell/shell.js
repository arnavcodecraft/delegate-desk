// The app's start screen: open the DelegateDesk site set when the app was built, or the one the person entered before;
// otherwise ask for it. Desktop saves it through the app (window.dd); the Android app keeps it in local storage.
(function () {
  var KEY = 'dd-server-url';
  var store = {
    get: function () { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } },
    set: function (v) { try { localStorage.setItem(KEY, v); } catch (e) { /* private mode */ } },
  };
  function normalise(v) {
    v = String(v || '').trim();
    if (!v) return null;
    if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
    try { var u = new URL(v); if (u.protocol !== 'https:' && !/^(localhost|127\.|192\.168\.|10\.)/.test(u.hostname)) return null; return u.origin; } catch (e) { return null; }
  }
  function open(url) { if (window.dd && window.dd.setServer) window.dd.setServer(url); else { store.set(url); window.location.href = url; } }
  var fixed = normalise(window.DD_URL);
  var saved = normalise(store.get());
  var params = new URLSearchParams(window.location.search);
  if (!params.has('change')) { if (fixed) return open(fixed); if (saved && !window.dd) return open(saved); }
  var input = document.getElementById('url');
  if (saved) input.value = saved;
  document.getElementById('f').addEventListener('submit', function (e) {
    e.preventDefault();
    var url = normalise(input.value);
    var err = document.getElementById('err');
    if (!url) { err.textContent = 'Enter a full address starting with https://'; err.hidden = false; return; }
    err.hidden = true; open(url);
  });
})();
