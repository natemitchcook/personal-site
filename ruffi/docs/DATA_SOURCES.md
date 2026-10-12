# Award Data Sources

## The key distinction

Ruffi can avoid dependence on another product's data model, ranking, UI, wallet, and alerts. It cannot avoid dependence on the airline and loyalty systems that create award inventory.

There is no single public interface that exposes every award seat and every loyalty-program price. NDC and GDS APIs are useful for commercial airline shopping, but award availability and loyalty pricing remain program-specific.

## Source hierarchy

### 1. Sanctioned loyalty or airline access

Best long-term source. Requires a published API, partner agreement, or written permission. Ruffi should prefer this whenever available.

### 2. Commercial award-search API

Fastest way to prove product value and broad coverage. Ruffi normalizes results so a provider can be replaced, combined, or used only for backfill.

Current adapter:

- Seats.aero Pro cached search with included trip details, enabled with
  `seats_aero_api_key` in `.data/credentials.txt`

Optional and planned adapter candidates:

- PointsYeah, enabled with `pointsyeah_api_key` in the same protected file
- AwardTool enterprise API
- AwardWallet Flight Award Search API

### 3. User-authorized program connector

A connector searches a loyalty program using the user's authorized session. This can provide program-specific pricing and inventory, but it creates credential, MFA, bot-detection, maintenance, and terms-of-use obligations.

### 4. Ruffi's own cached award index

Ruffi can retain normalized, provenance-tagged observations when the upstream license permits caching. The index improves broad discovery and change detection, but live verification remains necessary before a transfer.

## Wallet data

The MVP uses manual balances. This is cheap, explainable, and avoids bank credential access.

Later options:

- authorized balance aggregation
- read-only loyalty account connections
- email-based balance reminders
- direct issuer integrations

## Cash comparison

Cash fares should come from a sanctioned flight-shopping API. They are a comparison input, not a substitute for award inventory.

## Transfer data

Transfer partners, ratios, temporary bonuses, and expiration dates require provenance. Ruffi should use official issuer pages or a licensed structured feed and retain the source and verification date for every edge.
