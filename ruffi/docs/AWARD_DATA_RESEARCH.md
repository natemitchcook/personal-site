# Award Data Research Brief

Research date: 2026-09-29

## Conclusion

Ruffi should build and own a provider-neutral award API plus MCP tools. It should not promise zero upstream dependencies, because airlines and loyalty programs are the upstream systems of record.

The practical route is hybrid:

1. Use sanctioned commercial award APIs for broad coverage and product validation.
2. Build direct loyalty-program connectors where permission, economics, and unique inventory justify them.
3. Store normalized observations in a Ruffi-controlled index when upstream rights allow caching.
4. Verify live inventory before recommending an irreversible transfer.

## How existing products obtain data

Public documentation shows several patterns:

- PointsYeah offers a developer API over more than 40 loyalty programs with filters for regions, cabins, seats, taxes, stops, banks, and transfer bonuses.
- Seats.aero exposes cached award availability and broad route searches through an API. Its public terms distinguish personal noncommercial access from commercial use.
- AwardWallet documents airline award-search jobs and user-authorized loyalty account access.
- Travel distribution APIs and NDC primarily expose commercial shopping and servicing. They do not create a universal award-inventory feed.

The exact internal collection method of a competitor is usually proprietary. Public interfaces and behavior are consistent with a mix of program-specific searches, cached observations, commercial feeds, and user-authorized account access.

## Alliance coverage

Alliance membership is useful for route and partner planning, but it is not a data interface.

- American Airlines and British Airways are oneworld members.
- United Airlines is a Star Alliance member.
- Delta Air Lines and Virgin Atlantic are SkyTeam members.
- Emirates, Etihad, and Virgin Australia rely primarily on bilateral partnerships rather than membership in those three global alliances.

Ruffi's connector plan therefore starts with loyalty programs that can expose broad partner inventories, then adds programs with unique pricing or inventory.

## Why one direct API is not enough

Even when two loyalty programs can book the same operating flight, they may disagree on:

- whether partner space is visible
- point price
- taxes and surcharges
- cabin shown for a mixed itinerary
- number of seats
- change and cancellation terms
- login or member restrictions

“All availability” must be defined and measured as a coverage target, not treated as a binary technical property.

## MCP decision

MCP is valuable for agent discovery and tool calls, but it should wrap Ruffi's API rather than become the internal architecture. HTTP remains the stable service contract for the web app, scheduler, mobile clients, and integrations.

Local MCP should use stdio. A remote deployment should use Streamable HTTP with OAuth and scoped tokens.

## Jev decisioning

Jev is appropriate after deterministic eligibility and funding logic. Ruffi sends a bounded list of candidate facts plus explicit preference notes, asks a fixed Choice question, and uses a Noul uncertainty signal to decide whether human review is needed.

Jev is not used to fetch inventory, validate seats, calculate balances, or authorize a transfer. If Jev is unavailable or insufficiently confident, Ruffi keeps the deterministic ranking.

## Sources consulted

Primary sources:

1. MCP architecture, lifecycle, transports, and authorization
   - https://modelcontextprotocol.io/docs/learn/architecture
   - https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle
   - https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
   - https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
2. IATA New Distribution Capability
   - https://www.iata.org/en/programs/airline-distribution/retailing/ndc/
3. PointsYeah developer documentation
   - https://www.pointsyeah.com/developers/getting-started
   - https://www.pointsyeah.com/developers/explorer-search
4. Seats.aero API and terms
   - https://developers.seats.aero/
   - https://developers.seats.aero/reference/getting-started
   - https://seats.aero/terms-of-use
5. AwardWallet APIs
   - https://awardwallet.com/api/flight-award-search
   - https://awardwallet.com/api/account-access
6. Alliance member directories
   - https://www.oneworld.com/members
   - https://www.staralliance.com/en/members
   - https://www.skyteam.com/en/about
7. Jev and SystemOne
   - https://github.com/TypeSafe-AI/jev
   - https://blog.langchain.com/customizing-cognitive-architectures-with-systemone/

## Gaps and caveats

- Airline-specific automation permission must be reviewed program by program.
- Commercial API pricing and redistribution rights often require private negotiation.
- Published alliance membership does not prove identical partner award access.
- No public source establishes that any consumer award tool has literally complete global coverage.
