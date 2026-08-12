# Chrome Web Store Form Answers

## DuelTicker: Yu-Gi-Oh! Card Prices

**Single purpose description**
Search any Yu-Gi-Oh! card and watch its live market price like a stock
ticker. Add cards to your watchlist and see TCGplayer market prices,
cross-market prices (eBay, Cardmarket, Amazon), price-history sparklines
with trend arrows, and a scrolling price tape — all in a small toolbar popup.

**Permission justification**

`storage`: Saves your watchlist (which cards you added, their last seen
prices and price history) locally in your browser so it is still there the
next time you open the popup. The list lives only in your browser and is
never sent anywhere.

`host_permissions: https://db.ygoprodeck.com/*`: Required so the popup can
fetch card search results and current market prices from the free YGOPRODeck
API. No other site is accessed.

**Are you using remote code?**
No, I am not using Remote code.

Justification: All JavaScript is bundled inside the extension package. The
extension fetches card and price data from the YGOPRODeck API, but every
script file it runs ships with the extension itself.

**What user data do you plan to collect?**
None of the listed categories. The extension only reads public card data and
market prices. No personal data is collected.

**Privacy policy URL**
https://mrfentmen.github.io/privacy-policies/yugioh-price-ticker.html
