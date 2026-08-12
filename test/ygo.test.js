'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Ygo = require('../ext/ygo.js');

// Realistic fixture from db.ygoprodeck.com (Blue-Eyes White Dragon, id 89631139)
const BLUE_EYES = {
  id: 89631139,
  name: 'Blue-Eyes White Dragon',
  type: 'Normal Monster',
  race: 'Dragon',
  card_sets: [{ set_name: 'Legend of Blue Eyes White Dragon', set_rarity: 'Ultra Rare' }],
  card_images: [{ image_url_small: 'https://images.ygoprodeck.com/images/cards_small/89631139.jpg' }],
  card_prices: [{
    cardmarket_price: '0.02',
    tcgplayer_price: '0.16',
    ebay_price: '5.95',
    amazon_price: '3.90',
    coolstuffinc_price: '0.99'
  }]
};

test('searchUrl uses fname fuzzy search with num+offset and a hyphen variant', () => {
  const u = Ygo.searchUrl('blue eyes white dragon');
  assert.ok(u.startsWith('https://db.ygoprodeck.com/api/v7/cardinfo.php?fname='));
  assert.ok(u.includes('blue%20eyes%20white%20dragon'));
  assert.ok(u.includes('num=8'));
  assert.ok(u.includes('offset=0'));
  // variant 1 hyphenates the first space (Blue-Eyes is a hyphenated compound)
  const h = Ygo.searchUrl('blue eyes white dragon', 8, 1);
  assert.ok(h.includes('blue-eyes%20white%20dragon'));
  // no spaces to replace => identical URLs (popup.js skips the fallback)
  assert.equal(Ygo.searchUrl('exodia', 8, 0), Ygo.searchUrl('exodia', 8, 1));
});

test('parseSearch maps cards to compact summaries, priced first', () => {
  const unpriced = {
    id: 1, name: 'Mystical Elf', type: 'Normal Monster',
    card_sets: [{ set_name: 'LOB', set_rarity: 'Common' }],
    card_images: [{ image_url_small: '' }],
    card_prices: [{ tcgplayer_price: '0', ebay_price: '0', cardmarket_price: '0' }]
  };
  const out = Ygo.parseSearch({ data: [unpriced, BLUE_EYES] });
  assert.equal(out.length, 2);
  assert.equal(out[0].id, '89631139'); // priced first
  assert.equal(out[0].price, 0.16);
  assert.equal(out[0].set, 'Legend of Blue Eyes White Dragon');
  assert.equal(out[0].rarity, 'Ultra Rare');
  assert.equal(out[0].markets.tcgplayer, 0.16);
  assert.equal(out[0].markets.cardmarket, 0.02);
  assert.equal(out[1].price, null);
  assert.equal(Ygo.parseSearch(null).length, 0);
  assert.equal(Ygo.parseSearch({ data: [] }).length, 0);
});

test('parseQuote builds a full quote from the id endpoint', () => {
  const q = Ygo.parseQuote({ data: [BLUE_EYES] });
  assert.equal(q.price, 0.16);
  assert.equal(q.name, 'Blue-Eyes White Dragon');
  assert.equal(q.markets.ebay, 5.95);
  assert.equal(q.markets.amazon, 3.9);
  assert.equal(Ygo.parseQuote(null), null);
  assert.equal(Ygo.parseQuote({ data: [] }), null);
});

test('pickMarket prefers TCGplayer and falls back to eBay', () => {
  assert.equal(Ygo.pickMarket(BLUE_EYES), 0.16);
  assert.equal(Ygo.pickMarket({ card_prices: [{ tcgplayer_price: '0', ebay_price: '42.5' }] }), 42.5);
  assert.equal(Ygo.pickMarket({ card_prices: [{ tcgplayer_price: '0', ebay_price: '0' }] }), null);
  assert.equal(Ygo.pickMarket({}), null);
});

test('formatPrice and formatTrend match the family style', () => {
  assert.equal(Ygo.formatPrice(0.16), '$0.16');
  assert.equal(Ygo.formatPrice(0.02, 'EUR'), '€0.02');
  assert.equal(Ygo.formatPrice(null), '—');
  assert.equal(Ygo.formatTrend({ pct: 2.13 }), '+2.1%');
  assert.equal(Ygo.formatTrend({ pct: -1.5 }), '-1.5%');
  assert.equal(Ygo.formatTrend(null), '');
});

test('historyTrend computes latest-vs-previous from client history', () => {
  const up = Ygo.historyTrend([{ p: 0.5, t: 1 }, { p: 0.6, t: 2 }]);
  assert.equal(up.dir, 1);
  assert.ok(Math.abs(up.pct - 20) < 0.01);
  const down = Ygo.historyTrend([{ p: 10, t: 1 }, { p: 9, t: 2 }]);
  assert.equal(down.dir, -1);
  assert.equal(Ygo.historyTrend([{ p: 1, t: 1 }]), null);
  assert.equal(Ygo.historyTrend(null), null);
  assert.equal(Ygo.historyTrend([{ p: 1, t: 1 }, { p: 1, t: 2 }]).pct, 0);
});

test('sparkBars normalizes the recent history into 0..1 heights', () => {
  const bars = Ygo.sparkBars([{ p: 2, t: 1 }, { p: 4, t: 2 }, { p: 1, t: 3 }]);
  assert.equal(bars.length, 3);
  assert.equal(bars[1], 1); // max maps to 1
  assert.ok(bars[2] > 0 && bars[2] < 1);
  assert.equal(Ygo.sparkBars([], 8).length, 0);
  // caps at n points
  const many = Array.from({ length: 12 }, (_, i) => ({ p: i + 1, t: i }));
  assert.equal(Ygo.sparkBars(many, 8).length, 8);
});

test('ageLabel / offlineMsg / staleLevel match the family pattern', () => {
  const now = Date.now();
  assert.equal(Ygo.ageLabel(now - 30_000), 'just now');
  assert.equal(Ygo.ageLabel(now - 5 * 60_000), '5m ago');
  assert.equal(Ygo.ageLabel(null), '');
  assert.equal(Ygo.offlineMsg(null), 'Offline — showing last prices.');
  assert.match(Ygo.offlineMsg(now - 120_000), /^Offline — prices from 2m ago$/);
  assert.equal(Ygo.staleLevel(now - 30_000), 'stale-fresh');
  assert.equal(Ygo.staleLevel(now - 2 * 3600_000), 'stale-warn');
  assert.equal(Ygo.staleLevel(now - 2 * 86400_000), 'stale-old');
  assert.equal(Ygo.staleLevel(null), '');
});

test('fetchJson retries transient 5xx with growing backoff, not 4xx', async () => {
  const realFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls++;
    if (calls < 3) return { ok: false, status: 503 };
    return { ok: true, json: async () => ({ data: [{ id: 'x' }] }) };
  };
  try {
    const out = await Ygo.fetchJson('https://db.ygoprodeck.com/api/v7/cardinfo.php?id=1', { tries: 3, backoff: 1 });
    assert.equal(calls, 3);
    assert.equal(out.data[0].id, 'x');
  } finally {
    global.fetch = realFetch;
  }
  calls = 0;
  global.fetch = async () => { calls++; return { ok: false, status: 400 }; };
  try {
    await assert.rejects(() => Ygo.fetchJson('https://db.ygoprodeck.com/api/v7/cardinfo.php?id=1', { tries: 3, backoff: 1 }));
    assert.equal(calls, 1);
  } finally {
    global.fetch = realFetch;
  }
});
