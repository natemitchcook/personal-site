# Welvia Care — implementation foundation and launch specification

Status: isolated foundation; NOT deployed or connected to production billing, email, or AWS. Run `cd welvia-app/care && python3 -m unittest -v test_engine.py`.

## Product promise
For $50/month (or $475/year), Welvia checks approved public business facts and supported agent-facing surfaces monthly, reports evidence-backed findings, and handles one factual correction batch capped at 30 minutes per month. Additional integrations and redesigns require separate approval/quote. The introductory setup fee is separate. No guaranteed AI recommendations, rankings, leads, or revenue.

## Owner experience
1. Permanent personalized proposal, with researched fields and no account requirement to view.
2. Owner verifies only uncertain facts, selects services and request destination, and consents to contact.
3. Verified owner authorization before private edits or site changes. Show precise requested access and least-privilege instructions.
4. Stripe TEST subscription checkout after prices, signed webhook and billing portal are ready; no activation on success URL alone.
5. Activation timeline: pending owner verification -> awaiting access -> implementing -> verified -> active care.
6. Dashboard: current facts, checks and evidence, last checked, open approvals, request correction, invoices, cancel membership.
7. Monthly report: checks completed, fixes shipped, outstanding approvals, upcoming checks. Email only with valid contact/consent.
8. On cancellation: stop future paid care; preserve or remove installed public metadata only according to agreed terms; export owner facts and explain effects.

## Engineering architecture
- Reuse existing DynamoDB business records and evaluations service. Introduce isolated `CARE#<business-id>` partition (or dedicated table if IAM policy requires it). Suggested sort keys: `SUBSCRIPTION`, `PROFILE`, `RUN#<ISO-date>#<uuid>`, `FINDING#<id>`, `CHANGE#<id>`, `REPORT#<month>`, `LOCK#<month>`. Never expose these records in public business projection.
- Stripe webhook endpoint: verify raw body signature, persist event ID idempotently, resolve customer to verified business, map subscription status. Handle created/updated/deleted, invoice paid/payment failed, refunds and disputes. Process retries safely. Reconcile daily against Stripe.
- EventBridge Scheduler invokes care worker monthly, plus daily health/failed-job checks. Worker uses a conditional lock per business/month, rate limits, retries, and a DLQ. No browser-triggered secret endpoints.
- Checks: HTTPS, availability, owner-approved business facts, JSON-LD validity, llms.txt or equivalent (advisory only), supported agent action endpoints, contact/booking/catering route, source freshness. Record URLs, timestamps, response evidence, and evaluator version. Third-party model tests must be labeled controlled, not proof of public discovery.
- Use existing evaluations snapshots for comparison; avoid storing sensitive owner data in reports or public S3.
- Auto-remediation limited to Welvia-owned content after owner grants scoped permission. External website changes always require approval and audit trail. Do not silently modify prices, menus, operating hours or fulfillment policies.
- Report generator includes factual counts and change log only. Deliver via Resend with unsubscribe controls for marketing; distinguish transactional billing/service notices. Capture bounce and delivery status.
- Admin queue: pending verification, missing access, failed checks, review-required corrections, payment issues, cancellations, and delivery failures.
- Security: authenticated owner and staff roles, per-business authorization, encrypted storage, no credentials in URLs/logs, webhook replay defense, request throttles, audit log, retention/deletion policy and backup restore test.
- Observability: per-run outcomes, retry counts, DLQ depth, webhook lag, monthly report delivery, active paid accounts, churn, correction minutes, and cost per business.

## Required gates before live launch
- [ ] Unit, integration, and browser E2E tests using synthetic Juniper Table fixture.
- [ ] Real deployed smoke tests against test environment, including mobile.
- [ ] Stripe sandbox lifecycle: successful subscription, failed payment, cancellation, renewal, webhook retry/reorder and portal.
- [ ] Owner verification and private tenant isolation.
- [ ] Scheduled job IAM, idempotency, DLQ, alarms and budget.
- [ ] Approved change request and audit trail, no unauthorized website writes.
- [ ] Monthly report generated from actual evidence, delivery and opt-out behavior.
- [ ] Restore/rollback test, access revocation, cancellation terms, refund policy.
- [ ] Avalon pilot only after signoff.

## Core acceptance criteria
- Missing observation => NOT TESTED, never PASSED.
- Identical business, observations and timestamp => identical assessment ID.
- Duplicate scheduled runs and Stripe events never double charge or double apply a fix.
- Owner cannot access another business's private data.
- Billing failure produces visible state, not a falsely active subscription.
- No reported AI leads or revenue without reliable attributable evidence.
- Owner can update a fact with one concise correction request; staff approval recorded.
- Monthly report contains check timestamps, evidence and clear next actions.
