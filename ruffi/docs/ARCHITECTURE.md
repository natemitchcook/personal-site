# Ruffi Points Architecture

## Design decision

The domain service is the source of truth. HTTP and MCP are adapters over the same functions.

```text
Web app     Other agents     Scheduled worker
   │             │                 │
   ├── HTTP API ─┼── MCP tools ────┤
   │             │                 │
   └──────── Ruffi points service ─┘
                    │
  Deterministic parser + optional local Ollama
              + validated SearchIntent
                    │
               Manual wallet
                    │
            Provider orchestrator
          ┌─────────┼──────────┐
     Commercial   Direct     Cached
       adapters  connectors   index
          └─────────┼──────────┘
                    │
          Normalized AwardOffer[]
                    │
   Hard filters + funding + Jev soft decision
                    │
          Watches + material changes
                    │
       Browser / email / text delivery
```

## Decisioning

Ruffi separates hard constraints from soft judgment.

1. Deterministic parsing creates a baseline request. Local Ollama can refine it during development.
2. Deterministic code validates every model field and enforces dates, seats, cabin, airlines, departure time, stops, wallet funding, and provider freshness.
3. Jev optionally selects among the eligible top candidates using the user's explicit preference notes.
4. Low-confidence or unavailable model responses preserve deterministic behavior.
5. Neither model can make an ineligible option eligible or trigger a point transfer or booking.
6. The hosted design should use candidate generation plus Jev for bounded semantic interpretation instead of operating an Ollama server.

## Canonical types

- `SearchIntent`: normalized origins, destinations, dates, cabins, travelers, and constraints.
- `AwardOffer`: provider-neutral award result.
- `FundingPlan`: direct miles plus the best compatible transfer path.
- `AwardWatch`: persistent request, best-known snapshot, and next check time.
- `WatchAlert`: material availability, point-price, tax, or seat-count improvement.

## Interfaces

### HTTP

Versioned routes live under `/ruffi/api/v1/points`. The OpenAPI contract is served at `/ruffi/api/v1/openapi`.

### MCP

`npm run mcp` starts a local stdio MCP server. It exposes narrow tools instead of giving another agent arbitrary database or browser access.

### Provider adapters

Adapters receive a validated `SearchIntent` and return normalized offers.
Seats.aero is the current default adapter and uses one cached-search call with
included trip details. No provider controls the wallet, rankings, watches,
alerts, or public Ruffi schema.

## Current local storage

Manual balances, notification destinations, watches, and alerts are encrypted with a randomly generated local key in `.data`. Files are written atomically with owner-only permissions.

## Watch scheduling

- more than 90 days before departure: every 12 hours
- 14 to 90 days: every 3 hours
- fewer than 14 days: every 30 minutes

The local web page triggers due checks every five minutes while open. A deployed version should move this to a durable scheduler and job queue.

## Security boundaries

- Raw airline credentials do not enter the model or MCP tool payloads.
- Provider credentials live in an owner-only local file and are cached in
  server memory.
- Every local HTTP route requires the short-lived browser session bearer token.
- A future remote HTTP or MCP service requires per-user authorization and scoped tokens.
- Search providers receive only the request required for the search.
- Point transfers and bookings remain outside the MVP.
- A provider result is never represented as live when it came from demo data.
