# Ruffi Points Product Vision

## Problem

Travelers hold value across transferable bank currencies and airline loyalty programs, but award availability, transfer paths, taxes, pricing, and partner rules are fragmented. Existing search products can surface seats, but the user still has to decide which program and currency to use.

## Product

Ruffi is a specialized points-redemption agent.

The user asks:

> I want two business-class seats from New York to Europe in July.

Ruffi responds with the best bookable options, explains how the user's balances can fund each option, and offers to keep watching for something better.

## Core job

Given this traveler, wallet, trip request, and current inventory, determine the best combination of loyalty program, transferable currency, points, cash fees, routing, and timing.

## Product graph

### Wallet graph

- transferable bank points
- airline miles
- relevant card benefits
- expirations and constraints

### Transfer graph

- source and destination programs
- transfer ratios
- temporary bonuses
- estimated transfer time
- transfer reversibility and risk

### Redemption graph

- award seats
- loyalty-program price
- taxes and surcharges
- cabin mix
- stops and duration
- cancellation rules
- freshness and verification state

### Preference graph

- home and acceptable positioning airports
- cabin and airline preferences
- maximum stops
- date flexibility
- point-value and cash thresholds

## Core loop

**Ask → parse → search → normalize → fund → rank → explain → watch → detect change → alert.**

## Trust model

Ruffi recommends and monitors. The user verifies inventory and approves transfers or bookings. A future transaction layer must treat point transfers as irreversible unless the loyalty program explicitly says otherwise.

## Decisioning

Hard constraints stay in deterministic code. Jev is an optional soft-decision engine for preference matching, tie-breaking, and review confidence. This gives the product agentic judgment without letting a model invent availability, bypass wallet constraints, or take financial action.

Explicit preference notes remain visible and editable. Inferred preferences require provenance, confidence, and user correction before they influence high-impact recommendations.

## Moat

The proprietary core is not a single inventory feed. It is the normalized award graph, personal wallet optimizer, cross-provider reconciliation, historical change data, and the quality of Ruffi's recommendations and alerts.
