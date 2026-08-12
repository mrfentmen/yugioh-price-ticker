'use strict';
/* global Ygo, chrome */

(function () {
  var REFRESH_MS = 60 * 1000; // auto-refresh quotes while the popup is open
  var HIST_MAX = 8;           // client-side price history points per card

  var state = {
    watch: [],   // {id, name, type, race, set, rarity, image, price, markets, trend, hist:[{p,t}], ts}
    loading: false
  };

  var els = {
    search: document.getElementById('search'),
    go: document.getElementById('go'),
    results: document.getElementById('results'),
    list: document.getElementById('list'),
    empty: document.getElementById('empty'),
    status: document.getElementById('status'),
    refresh: document.getElementById('refresh'),
    tapeWrap: document.getElementById('tape-wrap'),
    tape: document.getElementById('tape'),
    clearAll: document.getElementById('clear-all'),
    retry: document.getElementById('retry')
  };

  var hintTimer = null;
  var pageZoom = 1;
  var debounce = null;
  var searchId = 0;
  var refreshId = 0;

  function setStatus(msg, isError) {
    if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
    els.status.textContent = msg || '';
    els.status.classList.toggle('error', !!isError);
    els.status.classList.remove('stale-fresh', 'stale-warn', 'stale-old');
    els.retry.hidden = true;
  }

  function setStale(ts) {
    var lv = Ygo.staleLevel(ts);
    if (lv) els.status.classList.add(lv);
    if (lv) els.retry.hidden = false;
  }

  function flashAlert(entry) {
    if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
    els.status.textContent = '🎯 ' + entry.name + ' hit $' + entry.alertAbove.toLocaleString() + ' — now ' + Ygo.formatPrice(entry.price) + '!';
    els.status.classList.remove('error', 'stale-fresh', 'stale-warn', 'stale-old');
    els.status.classList.add('alert');
    els.retry.hidden = true;
    hintTimer = setTimeout(function () {
      els.status.classList.remove('alert');
      els.status.textContent = '';
    }, 5000);
  }

  // ---------- persistence ----------
  function save() {
    chrome.storage.local.set({ ygWatchlist: state.watch });
  }

  function load(cb) {
    chrome.storage.local.get('ygWatchlist', function (d) {
      var w = d && d.ygWatchlist;
      if (Array.isArray(w)) {
        state.watch = w.filter(function (c) { return c && c.id && c.name; }).map(function (c) {
          // normalize the client-side history
          if (!Array.isArray(c.hist)) c.hist = [];
          c.hist = c.hist.filter(function (h) { return h && typeof h.p === 'number' && typeof h.t === 'number'; });
          if (!Array.isArray(c.daily)) c.daily = [];
          return c;
        });
      }
      if (cb) cb();
    });
  }

  // ---------- search ----------
  function doSearch(query) {
    var q = query.trim();
    if (q.length < 2) {
      els.results.hidden = true;
      return;
    }
    var myId = ++searchId;
    els.results.innerHTML = '<div class="res-note">Searching…</div>';
    els.results.hidden = false;
    // Three tries with a growing backoff: the feed can flap. Many card names
    // are hyphenated ("Blue-Eyes White Dragon"), so if the as-typed query
    // finds nothing, retry with spaces replaced by hyphens.
    var v0 = Ygo.searchUrl(q, 8, 0);
    var v1 = Ygo.searchUrl(q, 8, 1);
    Ygo.fetchJson(v0, { tries: 3, backoff: 700 })
      .catch(function (err) {
        if (v1 === v0) throw err;
        return Ygo.fetchJson(v1, { tries: 3, backoff: 700 });
      })
      .then(function (json) {
        if (myId !== searchId) return;
        var cards = Ygo.parseSearch(json);
        renderResults(cards, q);
      })
      .catch(function (err) {
        if (myId !== searchId) return;
        var feedProblem = !err || !err.status || err.status === 429 || err.status >= 500;
        els.results.innerHTML = feedProblem
          ? '<div class="res-note">The price feed is hiccuping — try again in a moment.</div>'
          : '<div class="res-note">No luck — check the name and try again.</div>';
      });
  }

  function renderResults(cards, q) {
    els.results.innerHTML = '';
    if (!cards.length) {
      els.results.innerHTML = '<div class="res-note">No cards found for "' + esc(q) + '".</div>';
      return;
    }
    cards.forEach(function (c) {
      var row = document.createElement('button');
      row.type = 'button';
      row.className = 'res-row';
      var thumb = document.createElement('img');
      thumb.className = 'res-thumb';
      thumb.alt = '';
      thumb.src = c.image;
      thumb.addEventListener('error', function () { thumb.remove(); });
      var body = document.createElement('span');
      body.className = 'res-body';
      var name = document.createElement('span');
      name.className = 'res-name';
      name.textContent = c.name;
      var set = document.createElement('span');
      set.className = 'res-set';
      set.textContent = [c.set, c.rarity].filter(Boolean).join(' · ');
      body.appendChild(name);
      body.appendChild(set);
      var price = document.createElement('span');
      price.className = 'res-price';
      price.textContent = c.price != null ? Ygo.formatPrice(c.price) : '—';
      row.appendChild(thumb);
      row.appendChild(body);
      row.appendChild(price);
      row.addEventListener('click', function () {
        addCard(c);
        els.results.hidden = true;
        els.search.value = '';
      });
      els.results.appendChild(row);
    });
  }

  els.search.addEventListener('input', function () {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(function () { doSearch(els.search.value); }, 250);
  });
  els.search.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') { doSearch(els.search.value); }
    if (ev.key === 'Escape') { els.results.hidden = true; }
  });
  els.go.addEventListener('click', function () { doSearch(els.search.value); });
  document.addEventListener('click', function (ev) {
    if (!ev.target.closest('.search-wrap')) els.results.hidden = true;
  });

  // ---------- watchlist ----------
  function addCard(c) {
    var existing = state.watch.some(function (w) { return w.id === c.id; });
    if (existing) {
      setStatus('Already on your ticker.');
      return;
    }
    state.watch.unshift({
      id: c.id, name: c.name, type: c.type, race: c.race, set: c.set, rarity: c.rarity,
      image: c.image, price: c.price, markets: c.markets, trend: null, hist: [],
      // ts seeded from the search result: the price shown is real and fresh, so
      // a failed quote refresh degrades to the staleness path instead of a red
      // error.
      ts: Date.now()
    });
    save();
    render();
    refreshCard(state.watch[0]);
  }

  function removeCard(id) {
    state.watch = state.watch.filter(function (w) { return w.id !== id; });
    save();
    render();
  }

  // Refresh a single card's quote (used right after adding).
  function refreshCard(entry) {
    var myId = ++refreshId;
    Ygo.fetchJson(Ygo.cardUrl(entry.id), { tries: 3, backoff: 700 })
      .then(function (json) {
        if (myId !== refreshId) return;
        var q = Ygo.parseQuote(json);
        if (!q) throw new Error('bad payload');
        applyQuote(entry.id, q);
        setStatus('');
      })
      .catch(function () {
        if (myId !== refreshId) return;
        if (entry.ts) {
          setStatus(Ygo.offlineMsg(entry.ts));
          setStale(entry.ts);
        } else {
          setStatus('Could not fetch a quote for ' + entry.name + '.', true);
        }
      });
  }

  function refreshAll() {
    if (!state.watch.length) return;
    var myId = ++refreshId;
    els.refresh.classList.add('spinning');
    var pending = state.watch.length;
    var succeeded = 0;
    state.watch.forEach(function (entry) {
      Ygo.fetchJson(Ygo.cardUrl(entry.id), { tries: 3, backoff: 700 })
        .then(function (json) {
          if (myId !== refreshId) return;
          var q = Ygo.parseQuote(json);
          if (q && q.price != null) { applyQuote(entry.id, q); succeeded++; }
        })
        .catch(function () { /* per-card failure keeps the cached quote */ })
        .finally(function () {
          if (myId !== refreshId) return;
          pending--;
          if (pending > 0) return;
          els.refresh.classList.remove('spinning');
          if (succeeded > 0) {
            setStatus('');
          } else {
            var oldest = null;
            state.watch.forEach(function (w) {
              if (w.ts && (oldest === null || w.ts < oldest)) oldest = w.ts;
            });
            if (oldest) {
              setStatus(Ygo.offlineMsg(oldest));
              setStale(oldest);
            } else {
              setStatus('Could not reach the price feed. Check your connection.', true);
            }
          }
        });
    });
  }

  function applyQuote(id, q) {
    var entry = state.watch.find(function (w) { return w.id === id; });
    if (!entry) return;
    var crossed = entry.alertAbove != null && entry.price != null &&
      entry.price < entry.alertAbove && q.price != null && q.price >= entry.alertAbove;
    entry.price = q.price;
    entry.markets = q.markets;
    entry.type = q.type || entry.type;
    entry.race = q.race || entry.race;
    entry.set = q.set || entry.set;
    entry.rarity = q.rarity || entry.rarity;
    entry.image = q.image || entry.image;
    if (q.price != null) {
      entry.hist.push({ p: q.price, t: Date.now() });
      if (entry.hist.length > HIST_MAX) entry.hist = entry.hist.slice(-HIST_MAX);
      // daily price snapshot (30-day sparkline — update today's entry or push a new day)
      if (!entry.daily) entry.daily = [];
      var today = new Date().toISOString().slice(0, 10);
      var last = entry.daily.length ? entry.daily[entry.daily.length - 1] : null;
      if (last && last.d === today) { last.p = q.price; }
      else { entry.daily.push({ d: today, p: q.price }); if (entry.daily.length > 30) entry.daily = entry.daily.slice(-30); }
    }
    entry.trend = Ygo.historyTrend(entry.hist);
    entry.ts = Date.now();
    if (crossed) flashAlert(entry);
    save();
    render();
  }

  // ---------- rendering ----------
  function render() {
    els.empty.hidden = state.watch.length > 0;
    els.tapeWrap.hidden = state.watch.length === 0;
    els.clearAll.hidden = state.watch.length === 0;
    renderTape();
    els.list.innerHTML = '';
    state.watch.forEach(function (w) {
      els.list.appendChild(rowFor(w));
    });
  }

  function marketsLine(w) {
    if (!w.markets) return '';
    var parts = [];
    if (w.markets.tcgplayer != null) parts.push('TCGplayer ' + Ygo.formatPrice(w.markets.tcgplayer));
    if (w.markets.ebay != null) parts.push('eBay ' + Ygo.formatPrice(w.markets.ebay));
    if (w.markets.cardmarket != null) parts.push('Cardmarket ' + Ygo.formatPrice(w.markets.cardmarket, 'EUR'));
    if (w.markets.amazon != null) parts.push('Amazon ' + Ygo.formatPrice(w.markets.amazon));
    return parts.join(' · ');
  }

  function rowFor(w) {
    var row = document.createElement('article');
    row.className = 'card-row';
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.title = 'Open on YGOPRODeck';

    var thumb = document.createElement('img');
    thumb.className = 'card-thumb';
    thumb.alt = '';
    thumb.loading = 'lazy';
    thumb.src = w.image;
    thumb.addEventListener('error', function () {
      thumb.remove();
      row.insertBefore(thumbPlaceholder(), row.querySelector('.card-info') || row.firstChild);
    });

    var info = document.createElement('div');
    info.className = 'card-info';
    var name = document.createElement('div');
    name.className = 'card-name';
    name.textContent = w.name;
    var set = document.createElement('div');
    set.className = 'card-set';
    set.textContent = [w.set, w.rarity].filter(Boolean).join(' · ');
    info.appendChild(name);
    info.appendChild(set);

    var quote = document.createElement('div');
    quote.className = 'card-quote';
    var price = document.createElement('div');
    price.className = 'card-price';
    price.textContent = Ygo.formatPrice(w.price);
    if (w.rarity) {
      var v = document.createElement('span');
      v.className = 'card-variant';
      v.textContent = String(w.rarity).toUpperCase();
      price.appendChild(v);
    }
    var trend = document.createElement('div');
    trend.className = 'card-trend' + (w.trend ? (w.trend.dir === 1 ? ' up' : ' down') : ' flat');
    trend.textContent = w.trend ? '▲ ' + Ygo.formatTrend(w.trend) : '—';
    quote.appendChild(price);
    quote.appendChild(trend);

    var bars = document.createElement('div');
    bars.className = 'card-bars';
    bars.title = '30-day price sparkline';
    var heights = Ygo.sparkBars(w.daily, 30);
    if (heights.length) {
      heights.forEach(function (v) {
        var b = document.createElement('span');
        b.className = 'bar';
        b.style.height = Math.round(v * 16) + 'px';
        bars.appendChild(b);
      });
    } else {
      bars.title = '';
    }

    var mkts = document.createElement('div');
    mkts.className = 'card-markets';
    mkts.textContent = marketsLine(w);

    var x = document.createElement('button');
    x.className = 'row-x';
    x.type = 'button';
    x.title = 'Remove from ticker';
    x.setAttribute('aria-label', 'Remove ' + w.name + ' from ticker');
    x.textContent = '✕';
    x.addEventListener('click', function (ev) {
      ev.stopPropagation();
      removeCard(w.id);
    });

    row.appendChild(thumb);
    row.appendChild(info);
    row.appendChild(bars);
    row.appendChild(quote);
    row.appendChild(mkts);
    row.appendChild(x);

    // ---- alert affordance ----
    var alertBtn = document.createElement('button');
    alertBtn.className = 'alert-btn';
    alertBtn.type = 'button';
    if (w.alertAbove) {
      alertBtn.title = 'Alert: above $' + w.alertAbove.toLocaleString() + ' (click to change)';
      alertBtn.classList.remove('alert-off');
    } else {
      alertBtn.title = 'Set a price alert';
      alertBtn.classList.add('alert-off');
    }
    alertBtn.textContent = '🔔';
    row.appendChild(alertBtn);

    var panel = document.createElement('div');
    panel.className = 'alert-panel';
    panel.hidden = true;
    var al = document.createElement('span');
    al.className = 'alert-label'; al.textContent = 'Alert me above $';
    var ainp = document.createElement('input');
    ainp.className = 'alert-input'; ainp.type = 'number'; ainp.min = '0.01'; ainp.step = 'any';
    ainp.value = w.alertAbove || '';
    ainp.placeholder = (w.price != null ? w.price.toFixed(2) : '0.00');
    var aset = document.createElement('button');
    aset.className = 'alert-set'; aset.type = 'button'; aset.textContent = 'Set';
    var aclr = document.createElement('button');
    aclr.className = 'alert-clear'; aclr.type = 'button'; aclr.textContent = 'Clear';
    panel.appendChild(al); panel.appendChild(ainp); panel.appendChild(aset); panel.appendChild(aclr);

    alertBtn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      panel.hidden = !panel.hidden;
      if (!panel.hidden) ainp.focus();
    });
    aset.addEventListener('click', function (ev) {
      ev.stopPropagation();
      var v = parseFloat(ainp.value);
      if (isNaN(v) || v <= 0) { panel.hidden = true; return; }
      w.alertAbove = v;
      alertBtn.title = 'Alert: above $' + v.toLocaleString() + ' (click to change)';
      alertBtn.classList.remove('alert-off');
      panel.hidden = true;
      save();
    });
    aclr.addEventListener('click', function (ev) {
      ev.stopPropagation();
      w.alertAbove = null;
      alertBtn.title = 'Set a price alert';
      alertBtn.classList.add('alert-off');
      ainp.value = '';
      panel.hidden = true;
      save();
    });

    var wrap = document.createElement('div');
    wrap.appendChild(row);
    wrap.appendChild(panel);

    row.addEventListener('click', function () {
      chrome.tabs.create({ url: 'https://ygoprodeck.com/card/?search=' + encodeURIComponent(w.name) });
    });
    row.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        chrome.tabs.create({ url: 'https://ygoprodeck.com/card/?search=' + encodeURIComponent(w.name) });
      }
    });
    return wrap;
  }

  function thumbPlaceholder() {
    var d = document.createElement('div');
    d.className = 'card-thumb ph';
    d.textContent = '⚔️';
    return d;
  }

  function renderTape() {
    if (!state.watch.length) {
      els.tape.innerHTML = '';
      return;
    }
    var parts = state.watch.map(function (w) {
      var cls = w.trend ? (w.trend.dir === 1 ? 'up' : 'down') : 'flat';
      var chg = w.trend ? Ygo.formatTrend(w.trend) : '—';
      return '<span class="tape-item"><span class="tape-name">' + esc(w.name) + '</span>' +
        '<span class="tape-price">' + esc(Ygo.formatPrice(w.price)) + '</span>' +
        '<span class="tape-chg ' + cls + '">' + esc(chg) + '</span></span>';
    });
    // duplicate for a seamless loop
    els.tape.innerHTML = parts.join('') + parts.join('');
    els.tape.style.animation = 'none';
    void els.tape.offsetWidth;
    els.tape.style.animation = '';
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  // ---------- refresh button + auto-refresh ----------
  els.refresh.addEventListener('click', refreshAll);
  els.retry.addEventListener('click', refreshAll);
  els.clearAll.addEventListener('click', function () {
    state.watch = [];
    save();
    setStatus('Cleared your ticker');
    render();
  });

  // ---------- keyboard page zoom (family pattern) ----------
  function applyPageZoom(z) {
    pageZoom = Math.round(z * 10) / 10;
    document.body.style.zoom = pageZoom === 1 ? '' : String(pageZoom);
  }
  function flashZoomHint() {
    setStatus('Zoom ' + Math.round(pageZoom * 100) + '%');
    hintTimer = setTimeout(function () { setStatus(''); }, 1400);
  }
  document.addEventListener('keydown', function (ev) {
    if (!(ev.ctrlKey || ev.metaKey)) return;
    var k = ev.key;
    if (k === '+' || k === '=' || k === '-' || k === '_') {
      ev.preventDefault();
      var dz = (k === '+' || k === '=') ? 0.1 : -0.1;
      applyPageZoom(Math.max(0.5, Math.min(2, pageZoom + dz)));
      flashZoomHint();
    } else if (k === '0') {
      ev.preventDefault();
      applyPageZoom(1);
      flashZoomHint();
    }
  });

  // ---------- init ----------
  load(function () {
    render();
    if (state.watch.length) refreshAll();
    setInterval(refreshAll, REFRESH_MS);
  });
})();
