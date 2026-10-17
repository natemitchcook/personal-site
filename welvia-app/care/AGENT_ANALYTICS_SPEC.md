# Welvia Agent Analytics — product and implementation specification

Status: prototype dashboard at care/demo/index.html. ALL metrics in prototype are synthetic. Do not deploy as authenticated production dashboard without the controls below.

## Core product / activation
1. Business opens permanent public proposal; owner verifies domain ownership via DNS TXT or approved site-file challenge (or verified administrative email plus staff verification, not email alone).
2. Welvia pre-fills business facts from public sources. Owner confirms 3-5 uncertain facts and approves service-specific actions. Store versioned approved facts separately from research.
3. Generate reviewable, site-specific JSON-LD using appropriate schema.org types (Restaurant, LocalBusiness, Menu, OfferCatalog, potentialAction only if supported), canonical business profile, llms.txt as OPTIONAL advisory file, robots/sitemap checks, and documented OpenAPI action routes where actually implemented. Do not promise llms.txt ingestion by models.
4. Publish only after domain/site authorization. Record each change, rollback data, verification timestamp and approved source.
5. First baseline: crawl reachability, schema validation, action-route availability, factual Q&A against an approved golden set. Save model, prompt version, cost, run timestamp, sources and full results. No fake pass/fail.
6. Owner dashboard with Overview, Agent Answers, Observed Activity, Business Facts, Care History, Billing. Private login and tenant-scoped API. Mobile-first.
7. Monthly care run, report and correction workflow. Alerts for severe regressions. Customer can request changes without learning structured data.

## Telemetry feasibility and honest labeling
- First-party CloudFront or origin logs: time, URL path, status, bytes, latency, coarse agent user-agent classification, bot verification when available. User agents alone are NOT proof of an agent. Avoid storing IPs long-term; hash/truncate as required by privacy policy.
- API Gateway/Lambda: event type (agent discovery fetch, quote request, validated lead, completed action), endpoint, request ID, business ID, status, latency, source category. Never infer a completed order from an attempted request.
- Optional customer-site instrumentation: server-side proxy/log forwarding or Cloudflare/hosting integration. Client-side JS misses many agents and cannot reliably measure crawlers. Customer explicitly opts in; disclose data collection.
- Third-party AI answers: controlled probes with fixed questions, pinned model/prompt version where available, factual score and citations. Never label these as actual agent visits, market share, recommendation rank, or conversions.
- Not measurable: model internal reasoning, private browsing sessions, training use, visits to third-party pages without telemetry. Some agents fetch through browsers or generic infrastructure; bot identity remains probabilistic.
- Present observed requests, identified-agent subset, completed actions, and controlled answer accuracy as SEPARATE metrics. Include coverage badges and source provenance.

## Event schema
Event {event_id, business_id, occurred_at, source, event_type, request_path, status_code, duration_ms, agent_family, identity_confidence, session_correlation_id?, action_id?, conversion_verified, evidence_ref, consent_basis, retention_expires_at}. Never store query/body secrets or customer PII in analytics events.
Evaluation {run_id, business_id, timestamp, model_id, model_version, prompt_version, test_set_version, question_id, expected_facts, actual_answer_ref, rubric_version, score, evidence_refs, input_tokens, output_tokens, billed_usd, status}.
Cost {business_id, run_id, service, resource_units, unit_rate_usd, cost_usd, estimated, pricing_version, timestamp}.

## Storage and pipeline
- CloudFront/ALB/Cloudflare logs -> encrypted private S3 -> scheduled transform -> partitioned aggregates in DynamoDB or Athena/Parquet, never query raw logs for each dashboard render.
- Lambda/API Gateway action events -> EventBridge/SQS -> dedupe -> daily aggregates.
- Existing evaluations service -> immutable run records and evidence in private S3; materialize monthly score summaries.
- Dashboard reads pre-aggregated data, paginated for drill-down. Cache summary with short TTL; never leak across tenants. Implement IAM tenant boundaries and authorization on every API.
- Stripe subscription lifecycle and staff approval workflow from care README remain prerequisites.
- Data minimization, consent, deletion/export, retention windows, rate limits, cost alarms, backpressure and privacy review required.

## Dashboard monthly snapshots
Baseline: verified profile, 6 check states (passed/failed/not tested), 10-20 fixed questions, model+version, initial observations, cost.
Month N: same fixed test set + limited rotating questions, regressions by question and model, observed first-party requests with coverage notes, completed actions with receipts, maintenance log and pending owner approvals, freshness and last check.
When models change: compare matched questions separately from version changes; mark non-comparable if provider/model/prompt/rubric changed.

## Unit economics (illustrative ONLY)
Monthly variable cost per business = evaluation_runs * average_cost_per_run + log_ingestion_storage + report_delivery + scheduler_compute + support_minutes * fully_loaded_labor_rate / 60 + payment_fees + monitoring/alerts. Cost per run = input_tokens/1e6 * model_input_rate + output_tokens/1e6 * model_output_rate + tool/search charges + retries + compute. Obtain actual provider prices and AWS Cost Explorer bills before forecasts.
Example synthetic assumption: 24 evaluations × $0.025 = $0.60, log/storage $0.35, total $0.95 before labor, email, Stripe and fixed AWS costs. At 40,000 customers: $38,000/month of those two components ONLY; NOT a complete cost forecast. At 30 min/month of human work, labor dominates. Use exception-based workflow and cap manual correction batch to 30 minutes.
Budget controls: monthly spend cap per business, max model calls per test, capped tokens, bounded retries, daily global budget, cached website fetches, no full-page model analysis per dashboard render, sample high-volume logs, batch aggregates, stop low-value evaluations when budget exhausted. No silent skipping: display not tested.

## Acceptance criteria
- Synthetic Juniper data cannot appear in production metrics.
- Business A cannot read Business B records, raw logs, costs, or corrections.
- Dashboard render does not trigger model inference; it reads aggregates.
- Model provider changes do not create misleading accuracy trend.
- No unverified bot identity or conversion attribution.
- Webhook and schedule replay do not double bill or duplicate evaluations.
- All site changes require scoped authorization and auditable rollback.
- Dashboard accessible and useful with zero observed traffic.
- Monthly report cites observed events or controlled test evidence, never invented revenue.
- Measure cost per customer and gross contribution including labor, payment processing, and infrastructure.
