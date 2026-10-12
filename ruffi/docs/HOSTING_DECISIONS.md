# Ruffi hosting decisions

Ruffi is local-only while its product design is refined. No deployment is authorized by this document.

## Current recommendation

Keep both parsing paths during local evaluation:

1. Deterministic TypeScript produces and validates a baseline `SearchIntent`.
2. Local Ollama can refine ambiguous natural-language requests during development.
3. TypeSafe Jev can make bounded semantic selections and preference judgments.
4. Deterministic code owns eligibility, funding math, quotas, watches, alerts, and all external actions.

For a hosted version, remove Ollama as a production dependency. Replace its useful judgments with candidate generation in code plus Jev Choice and Noul questions. Preserve the deterministic parser as the fallback.

## Hosting options to decide

### Preserve S3 and CloudFront

Keep the existing static homepage and route `/ruffi*` from CloudFront to a server-side Next.js origin.

Good fit when:

- minimizing changes to the existing homepage matters most
- Ruffi should launch before rebuilding the Cards page
- path-based routing at `natemitchcook.com/ruffi` is required

Main tradeoff:

- a container origin has a baseline monthly compute cost

### Convert the complete site to Next.js

Rebuild the homepage and Cards page inside one Next.js application, then use a managed Next.js hosting platform.

Good fit when:

- one visual system and one deployment are preferred
- Cards is being redesigned anyway
- the larger one-time migration is acceptable

Main tradeoff:

- the static site and Cards source must be rebuilt before cutover

## Product decisions

- Confirm whether `/cards` and `/ruffi` become pages in one Next.js application.
- Choose free and premium search and watch quotas.
- Choose alert frequency and acceptable Seats.aero request budgets.
- Obtain commercial award-data permission before accepting payment.
- Choose email-only alerts for the first release or include SMS.
- Decide whether a failed or uncertain Jev interpretation asks a clarifying question or uses deterministic defaults.

## Production requirements

- Email/password and Google authentication
- Per-user authorization on every wallet, watch, and alert operation
- Managed encrypted data storage with backups and retention
- Managed secret retrieval, with no production secrets in environment variables or source
- Signed and idempotent Stripe webhooks
- WAF protection and per-user rate limits
- Durable scheduling, queueing, retries, duplicate suppression, and dead-letter handling
- No email addresses, payment identifiers, or credentials sent to model providers
