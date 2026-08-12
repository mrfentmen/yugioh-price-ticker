'use strict';
/*
 * Pure helpers for DuelTicker. No DOM, no chrome.* calls — the same module
 * runs in the extension (browser) and in the Node unit tests.
 *
 * Data comes from the free, keyless YGOPRODeck API (db.ygoprodeck.com v7):
 * card search + metadata, plus TCGplayer / Cardmarket / eBay / Amazon market
 * prices in `card_prices`. There is no server-side price history, so trend
 * arrows and sparklines are computed from the client-side quote history that
 * popup.js keeps per watched card.
 */
(function (root) {
  var API = 'https://db.ygoprodeck.com/api/v7';
  var UA = 'DuelTicker/1.0 (https://github.com/mrfentmen/yugioh-price-ticker; contactae2000@gmail.com)';

  // fname is a literal substring match, and many card names are hyphenated
  // ("Blue-Eyes White Dragon") — so a user typing "blue eyes white dragon"
  // matches nothing. variant 0 = as typed; variant 1 = first space replaced
  // with a hyphen ("blue eyes white dragon" -> "blue-eyes white dragon", the
  // literal substring that matches); popup.js tries variant 1 when variant 0
  // finds nothing.
  function searchUrl(query, pageSize, variant) {
    var q = variant === 1 ? query.replace(/\s/, '-') : query;
    return API + '/cardinfo.php?fname=' + encodeURIComponent(q) +
      '&num=' + (pageSize || 8) + '&offset=0';
  }

  function cardUrl(id) {
    return API + '/cardinfo.php?id=' + encodeURIComponent(id);
  }

  // {tcgplayer, ebay, cardmarket, amazon, coolstuff} — USD floats (cardmarket
  // is EUR), null when the feed reports nothing for that marketplace.
  function marketsOf(c) {
    var p = c.card_prices && c.card_prices[0];
    if (!p) return null;
    function f(v) {
      var n = parseFloat(v);
      return isNaN(n) || n <= 0 ? null : n;
    }
    return {
      tcgplayer: f(p.tcgplayer_price),
      ebay: f(p.ebay_price),
      cardmarket: f(p.cardmarket_price),
      amazon: f(p.amazon_price),
      coolstuff: f(p.coolstuffinc_price)
    };
  }

  // Headline market price: TCGplayer first (real USD market data), eBay as a
  // fallback when a card has no TCGplayer listing yet.
  function pickMarket(c) {
    var m = marketsOf(c);
    if (!m) return null;
    if (m.tcgplayer != null) return m.tcgplayer;
    if (m.ebay != null) return m.ebay;
    return null;
  }

  // Parse the search endpoint into compact card summaries. Cards with a price
  // rank first (stable sort keeps the API order within each group).
  function parseSearch(json) {
    if (!json || !Array.isArray(json.data)) return [];
    return json.data.map(function (c) {
      var cs = c.card_sets && c.card_sets[0];
      return {
        id: String(c.id),
        name: c.name || '',
        type: c.type || '',
        race: c.race || '',
        set: (cs && cs.set_name) || '',
        rarity: (cs && cs.set_rarity) || '',
        image: (c.card_images && c.card_images[0] && c.card_images[0].image_url_small) || '',
        price: pickMarket(c),
        markets: marketsOf(c)
      };
    }).filter(function (c) { return c.name; })
      .sort(function (a, b) {
        return ((b.price != null) - (a.price != null));
      });
  }

  // Full quote for a watchlist card (same endpoint, single id).
  function parseQuote(json) {
    if (!json || !Array.isArray(json.data) || !json.data.length) return null;
    var c = json.data[0];
    var cs = c.card_sets && c.card_sets[0];
    return {
      id: String(c.id),
      name: c.name || '',
      type: c.type || '',
      race: c.race || '',
      set: (cs && cs.set_name) || '',
      rarity: (cs && cs.set_rarity) || '',
      image: (c.card_images && c.card_images[0] && c.card_images[0].image_url_small) || '',
      price: pickMarket(c),
      markets: marketsOf(c)
    };
  }

  function formatPrice(n, currency) {
    if (n == null || isNaN(n)) return '—';
    var sym = currency === 'EUR' ? '€' : '$';
    return sym + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatTrend(trend) {
    if (!trend) return '';
    var sign = trend.pct >= 0 ? '+' : '';
    return sign + trend.pct.toFixed(1) + '%';
  }

  // Client-side price history trend: latest vs previous quote (latest last).
  function historyTrend(hist) {
    if (!Array.isArray(hist) || hist.length < 2) return null;
    var last = hist[hist.length - 1];
    var prev = hist[hist.length - 2];
    if (!last || !prev || !(prev.p > 0) || last.p == null) return null;
    var pct = ((last.p - prev.p) / prev.p) * 100;
    return { pct: pct, dir: pct >= 0 ? 1 : -1 };
  }

  // Normalized heights (0..1) for the last `n` history points — the sparkline.
  function sparkBars(hist, n) {
    n = n || 8;
    if (!Array.isArray(hist) || !hist.length) return [];
    var pts = hist.slice(-n).map(function (h) { return h.p; });
    var max = Math.max.apply(null, pts);
    if (!(max > 0)) return pts.map(function () { return 0; });
    return pts.map(function (p) { return Math.max(0.04, p / max); });
  }

  // Relative age for "prices from X ago" (ms timestamps).
  function ageLabel(ts) {
    if (!ts) return '';
    var s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return 'just now';
    var m = Math.floor(s / 60);
    if (m < 60) return m + 'm ago';
    var h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    return Math.floor(h / 24) + 'd ago';
  }

  // Offline status message for cached prices, with their age.
  function offlineMsg(ts) {
    var age = ageLabel(ts);
    return age ? 'Offline — prices from ' + age : 'Offline — showing last prices.';
  }

  // Staleness class for the offline status: green < 1h, amber 1-24h, red 24h+.
  function staleLevel(ts) {
    if (!ts) return '';
    var h = (Date.now() - ts) / 3600000;
    if (h < 1) return 'stale-fresh';
    if (h < 24) return 'stale-warn';
    return 'stale-old';
  }

  // Timeout + quiet retries with a growing backoff (the family resilience
  // pattern): retries only network errors and 5xx/429, never 4xx. The wait
  // before each retry is backoff * attempt-number (800ms, 1600ms, …).
  function fetchJson(url, opts) {
    opts = opts || {};
    var tries = opts.tries != null ? opts.tries : 2;
    var ms = opts.ms || 12000;
    var backoff = opts.backoff || 800;
    var headers = { 'Api-User-Agent': UA };
    var extra = opts.headers || {};
    Object.keys(extra).forEach(function (k) { headers[k] = extra[k]; });
    function attempt(left) {
      return fetch(url, {
        headers: headers,
        signal: AbortSignal.timeout(ms)
      })
        .then(function (r) {
          if (!r.ok) {
            var e = new Error('HTTP ' + r.status);
            e.status = r.status;
            throw e;
          }
          return r.json();
        })
        .catch(function (err) {
          var retryable = !err.status || err.status === 429 || err.status >= 500;
          if (retryable && left > 1) {
            var wait = backoff * (tries - left + 1);
            return new Promise(function (resolve) { setTimeout(resolve, wait); })
              .then(function () { return attempt(left - 1); });
          }
          throw err;
        });
    }
    return attempt(tries);
  }

  var api = {
    searchUrl: searchUrl,
    cardUrl: cardUrl,
    marketsOf: marketsOf,
    pickMarket: pickMarket,
    parseSearch: parseSearch,
    parseQuote: parseQuote,
    formatPrice: formatPrice,
    formatTrend: formatTrend,
    historyTrend: historyTrend,
    sparkBars: sparkBars,
    ageLabel: ageLabel,
    offlineMsg: offlineMsg,
    staleLevel: staleLevel,
    fetchJson: fetchJson,
    UA: UA
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.Ygo = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
