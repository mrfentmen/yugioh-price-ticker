(function () {
  var f = document.getElementById('pv');
  var box = document.getElementById('box');

  // Seed the popup preview with demo ticker content (pure DOM, no chrome.*).
  function seed() {
    try {
      var doc = f.contentDocument;
      if (!doc) return;
      var tape = doc.getElementById('tape-wrap');
      var tapeEl = doc.getElementById('tape');
      var clear = doc.getElementById('clear-all');
      var empty = doc.getElementById('empty');
      if (tape) tape.hidden = false;
      if (clear) clear.hidden = false;
      if (empty) empty.hidden = true;
      var parts = [
        ['Blue-Eyes White Dragon', '$0.16', 'up', '+20.0%'],
        ['Dark Magician', '$0.27', 'up', '+5.2%'],
        ['Exodia the Forbidden One', '$4.85', 'down', '-2.1%'],
        ['Pot of Greed', '$2.30', 'flat', '—']
      ];
      var items = parts.map(function (p) {
        return '<span class="tape-item"><span class="tape-name">' + p[0] + '</span>' +
          '<span class="tape-price">' + p[1] + '</span>' +
          '<span class="tape-chg ' + p[2] + '">' + p[3] + '</span></span>';
      }).join('');
      if (tapeEl) tapeEl.innerHTML = items + items; // duplicated for the seamless loop
      var list = doc.getElementById('list');
      if (list) {
        list.innerHTML =
          '<article class="card-row" tabindex="0" role="button">' +
          '<div class="card-thumb ph">⚔️</div>' +
          '<div class="card-info"><div class="card-name">Blue-Eyes White Dragon</div><div class="card-set">Legend of Blue Eyes · Ultra Rare</div></div>' +
          '<div class="card-bars" title="Price history"><span class="bar" style="height:8px"></span><span class="bar" style="height:10px"></span><span class="bar" style="height:16px"></span></div>' +
          '<div class="card-quote"><div class="card-price">$0.16<span class="card-variant">ULTRA RARE</span></div><div class="card-trend up">▲ +20.0%</div></div>' +
          '<div class="card-markets">TCGplayer $0.16 · eBay $5.95 · Cardmarket €0.02 · Amazon $3.90</div>' +
          '<button class="row-x" type="button" title="Remove from ticker">✕</button>' +
          '</article>' +
          '<article class="card-row" tabindex="0" role="button">' +
          '<div class="card-thumb ph">⚔️</div>' +
          '<div class="card-info"><div class="card-name">Dark Magician</div><div class="card-set">Legend of Blue Eyes · Ultra Rare</div></div>' +
          '<div class="card-bars" title="Price history"><span class="bar" style="height:10px"></span><span class="bar" style="height:12px"></span><span class="bar" style="height:14px"></span></div>' +
          '<div class="card-quote"><div class="card-price">$0.27<span class="card-variant">ULTRA RARE</span></div><div class="card-trend up">▲ +5.2%</div></div>' +
          '<div class="card-markets">TCGplayer $0.27 · eBay $3.40 · Cardmarket €0.05</div>' +
          '<button class="row-x" type="button" title="Remove from ticker">✕</button>' +
          '</article>';
      }
    } catch (e) { /* iframe not ready yet */ }
  }

  function done() {
    window.__storeReady = true;
    window.dispatchEvent(new Event('store-ready'));
  }

  function measure() {
    var w = 380, h = 590;
    try {
      var doc = f.contentDocument;
      if (doc && doc.body) {
        w = Math.max(doc.body.scrollWidth, doc.documentElement ? doc.documentElement.scrollWidth : 0, 320);
        h = Math.max(doc.body.scrollHeight, doc.documentElement ? doc.documentElement.scrollHeight : 0, 180);
      }
    } catch (e) {}
    var scale = Math.min(430 / w, 560 / h, 1.25);
    f.width = w; f.height = h;
    box.style.width = Math.round(w * scale) + 'px';
    box.style.height = Math.round(h * scale) + 'px';
    f.style.transform = 'scale(' + scale + ')';
    f.style.transformOrigin = 'top left';
    done();
  }

  window.addEventListener('load', function () {
    try {
      var doc = f.contentDocument;
      if (doc && doc.readyState === 'complete') { seed(); measure(); }
      else { f.addEventListener('load', function () { seed(); measure(); }); }
    } catch (e) { f.addEventListener('load', function () { seed(); measure(); }); }
  });
  setTimeout(done, 4000);
})();
