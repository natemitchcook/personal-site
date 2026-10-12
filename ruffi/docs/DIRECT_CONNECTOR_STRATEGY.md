# Direct Loyalty Connector Strategy

## Goal

Own the Ruffi experience and normalized award index without making the product permanently dependent on one award-search vendor.

## Why connectors are program-specific

Award seats are sold by loyalty programs, not by alliances as one unified product. A single flight may have different prices, fees, access, and availability through American AAdvantage, British Airways Club, Alaska Mileage Plan, or Qantas Frequent Flyer.

Ruffi therefore needs a portfolio of loyalty-program connectors, not one connector per operating airline.

## Priority coverage

### Wave 1

- American AAdvantage
- United MileagePlus
- Delta SkyMiles
- Air Canada Aeroplan
- Air France-KLM Flying Blue
- British Airways Club
- Virgin Atlantic Flying Club

This group creates broad initial coverage of oneworld, Star Alliance, and SkyTeam while preserving the home-program prices most US users care about.

### Wave 2

- Alaska Mileage Plan
- Avianca LifeMiles
- Qantas Frequent Flyer
- Qatar Airways Privilege Club
- Singapore KrisFlyer
- ANA Mileage Club
- Emirates Skywards
- Etihad Guest
- Virgin Australia Velocity

### Wave 3

- additional programs that expose materially different inventory or pricing
- regional programs requested by customers
- programs needed to close verified coverage gaps

## Connector components

Each production connector needs:

1. A documented permission basis, published API, or commercial agreement.
2. A capability manifest covering cabins, partners, regions, date range, seats, taxes, and freshness.
3. An isolated authentication flow with MFA and session expiry handling.
4. A query planner that stays within program limits.
5. Strict response validation and normalized fixtures.
6. Parser drift monitoring and synthetic canary searches.
7. Bot-challenge detection that fails closed.
8. Provenance for every observation.
9. A live verification method before Ruffi recommends a transfer.
10. A kill switch when reliability or permission changes.

## Ruffi award index

Normalized observations can be indexed by:

```text
program + origin + destination + date + cabin + seats + routing
```

Each observation also stores:

- first and last seen time
- point price and taxes
- source connector
- freshness class
- verification state
- upstream cache and redistribution rights

This lets Ruffi run broad discovery cheaply, then perform a narrower live verification only when a result is promising or an alert threshold is crossed.

## Expected effort

The first reliable direct connector establishes the framework and is the most expensive. A planning assumption for a small team is several weeks for the first program, then roughly one to four weeks per additional program when authentication and anti-automation behavior are straightforward. Some programs may remain unavailable without commercial permission.

Covering the priority portfolio with production reliability is a multi-quarter program, not a single API integration. Ongoing maintenance is permanent because airline sites, sessions, responses, and controls change.

## Recommended business path

1. Prove user value with one sanctioned broad-coverage provider.
2. Measure which loyalty programs create the most searches and bookings.
3. Negotiate commercial access for the highest-value programs.
4. Build direct connectors only where they improve economics, freshness, or unique inventory.
5. Keep at least two sources for critical programs when licenses allow it.

## Non-goals

- bypassing bot controls
- storing raw credentials in agent-visible state
- claiming complete alliance coverage without measured tests
- relying on one airline program to represent every partner's true inventory
- transferring points before live verification
