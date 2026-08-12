# DuelTicker: Yu-Gi-Oh! Card Prices

Search any Yu-Gi-Oh! card and watch its market price like a stock ticker. Add Blue-Eyes, Dark Magician, or whatever your deck runs and see the TCGplayer market price, cross-market prices (eBay, Cardmarket, Amazon), a price-history sparkline with trend arrows, and a scrolling ticker tape right from your toolbar.

## Features

- Card search against the free, keyless YGOPRODeck API (db.ygoprodeck.com v7)
- Hyphen-aware search: typing "blue eyes white dragon" automatically retries with "blue-eyes white dragon", so hyphenated card names still match
- Headline price from TCGplayer, with eBay as a fallback when a card has no TCGplayer listing yet
- Cross-market line per card: TCGplayer · eBay · Cardmarket · Amazon
- Client-side price history: each watched card keeps its last 8 quotes, so you get real trend arrows (▲/▼ vs the previous check) and a mini sparkline — no server-side history needed
- Scrolling ticker tape across the top of the popup
- One click to open any card on YGOPRODeck
- Auto-refresh while the popup is open
- 12s fetch timeout, 3-try growing-backoff retries, honest "feed is hiccuping" messages
- Offline fallback: last good prices stay on screen with their age ("Offline — prices from 3h ago"), color-coded green/amber/red by how stale
- Watchlist persists locally; Ctrl/Cmd +/−/0 zooms the popup if it feels small

## Permissions (least privilege)

- `storage` only, to persist your watchlist locally.
- Host access is limited to `https://db.ygoprodeck.com/*` for card data and prices.
- No page access, no content scripts, no tracking.

## Privacy

Your watchlist never leaves your browser. The only network calls are to the YGOPRODeck API for card data and prices, with a descriptive User-Agent identifying the extension. See PRIVACY.md.

## Support

Free forever. If the ticker pays for itself, a coffee is appreciated: https://www.buymeacoffee.com/contactae2b. Found a bug? Email contactae2000@gmail.com.

## Development

```bash
npm run syntax   # syntax check the modules
npm test         # unit tests
```
