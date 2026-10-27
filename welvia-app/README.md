# Founder-led PULL discovery in free-review outreach

The current acquisition and requested-review emails invite genuine customer discovery instead of solely asking for opinions about AI. The initial acquisition email asks one optional, open-ended business-priority question. The free-review interest form asks what the owner is actively trying to improve, with optional expanded questions about attempted solutions, confusion and tasks they would consider paying someone to handle. These responses are stored only in private LEAD answers, not in public campaigns, owner answers or their llms.txt file. The free-review delivery email asks for honest feedback by replying to Nate. It includes practical upload instructions, a prepared factual starter attachment and an optional help CTA.

Customer-discovery interviews should fill out Rob Snyder's PULL framework for the specific person: current Project, why Unavoidable now, existing List of options, and Limitations of those options. A useful reply, positive sentiment, or clicking the page is not evidence of willingness to buy. Ask whether they want an actual next step: implementation, a scoped service, or a dated follow-up. Do not automatically send further campaigns or imply that an AI agent will discover, recommend or transact through llms.txt alone. Do not send follow-up questions to people who opted out.

Suggested founder follow-up, for the first five conversations: (1) What are you trying to get done this month? (2) Why now? (3) What have you tried? (4) What was missing? (5) What would be the most useful concrete outcome? (6) Is this a task you would pay to take off your plate? (7) If Welvia could do that, would you want to move forward? (8) If not, what's the task you would most want someone to handle right now? Ask these conversationally, not all at once. Treat customers who ask for pricing, access, implementation or a scoped proposal as stronger signals than praise.

# Every prospect has a prepared starter file

Each real prospect is linked through `PREPARATION#<business-id>` to a private `REVIEW#<normalized-website-hash>` record. Preparation uses readable live homepages where possible. When a site cannot be read, it builds a clearly labeled starter from whitelisted prior public research: business name, category, location, official website and same-site source links. It never includes private contacts, internal notes, owner answers, guessed hours/prices or invented action endpoints. Fictional demos and records missing a business name or website do not enter prospect preparation.

Personalized-page requests use the prepared file without recrawling. Stored files remain deliverable past 30 days and the email shows when they were prepared; they are not silently described as current live audits. Explicit staff preparation with `refresh:true` refreshes a file separately. Generic homepage requests for previously unknown websites still need on-demand preparation. `outreach_preflight` checks that a deliverable file exists for that exact website.

After adding prospects, invoke `prepare_review` for each new business ID, then verify every `PREPARATION` reference resolves to a nonempty review with the matching normalized URL. This preparation sends no acquisition email. The actual requested review email uses Resend and its saved-request idempotency key.

# Requested review delivery

Resend is the email provider. Deploy the reviewed CloudFormation change set as well as the app code; code-only CI does not provision the queue or credential. The `welvia/resend/reviews` Secrets Manager secret contains a domain-restricted sending key and is resolved by CloudFormation into the Lambda environment. Never put its value in source, logs or browser assets.

The public interest form saves an isolated LEAD record, then queues only its key. For known businesses the worker uses the prepared private artifact immediately. Unknown general-page websites use a recent cache or a public homepage check. It respects robots.txt, validates all DNS addresses and pins the connection to a public IP with TLS hostname verification. Redirects, response size and network timeouts are bounded. No model executes website instructions. The file contains only the title, description and selected same-site navigation links. It is a starter review, not a full crawl or tested booking integration.

The email includes the llms.txt attachment, practical recommendations, exact root URL upload instructions, a reply-to address and an Ask Nate for help CTA. The same frozen email payload and Resend idempotency key are reused on retries. A conditional per-lead lock prevents concurrent sends; accepted messages are skipped permanently. Ambiguous retries stop after 23 hours, within Resend's 24-hour idempotency window. Transient provider failures retry via SQS; permanent failures remain marked Failed. Three reviews per recipient per UTC day limit form abuse. Requests never subscribe recipients to a broadcast list.

`email_status` distinguishes Queued, Retrying, Accepted by Resend, Failed and Needs manual review. Acceptance is not inbox delivery. Resend's dashboard/API is the source for actual delivered/bounced events; no delivery webhook is claimed implemented. A retained encrypted DLQ holds jobs after five failed receives, with a CloudWatch alarm (no notification subscription). Staff must monitor that queue and manual-review LEAD records. A queue-enqueue failure returns a retryable form error while retaining the lead and its idempotency ID.

Before prospect outreach, IAM-invoke the function with `{"admin_action":"prepare_review","business_id":"avalon"}`. This queues preparation without sending anything. `PREPARATION#<id>` records show Ready or Needs manual review. Then invoke `{"admin_action":"outreach_preflight","business_id":"avalon"}`; send an acquisition email only if ready is true. This release does not add bulk outreach or silently send emails to stored prospects. Use this preflight for connector-based outreach too. The saved file is reused when the prospect requests it. A new general-page request is prepared on demand.

To retry a saved request after a queue failure, IAM-invoke `{"admin_action":"retry_review","lead_key":"LEAD#general#<submission-id>"}`. Failed/manual-review records and expired retry windows require staff investigation, not blind redrives. Inspect Resend before resetting any accepted or ambiguous send. No historical requests are resent automatically.

Validation: `npm test`, `node --test tests/analytics.test.cjs`, `npm run build`, and `cfn-lint infrastructure.json evaluations/infrastructure.json`. Review security.guard and the change set before applying infrastructure. A live smoke test must verify the provider's delivery status and attachment separately from the form's queued response.

# Current acquisition offer: free first website review

The public offer is a free first website review, practical recommendations and a starter file with upload instructions, delivered by email. The interest form requires name, email and a website on the general page, and uses the existing isolated LEAD# storage and explicit follow-up consent. Business pages use the same short review form even when an invitation is present. No payment or website editing access is requested. Requested reviews use Resend and a private SQS delivery queue. The worker prepares a factual homepage-based llms.txt starter file, recommendations and upload instructions, then emails them as an attachment. Blocked/unreadable known prospects receive a clearly labeled starter based on prior public research; missing identities require staff review. No email is claimed delivered solely because a request was saved. Optional implementation and ongoing care are scoped and priced separately. Historical prices below are superseded for acquisition.

# Current acquisition release — October 15, 2026

Business proposals at /business?business=<stable-id> are publicly viewable and do not expire. This owner-authorized change supersedes the historical access descriptions below. Existing draft/review flags remain workflow metadata, not viewing gates. Public GET returns marketing content, findings, public sources and pricing; private answers, contacts, email drafts, notes, receipts and evaluations remain protected. Never put confidential data into campaign or finding fields.

Public POST /api/businesses/<id>/interest creates a separate LEAD# record, never owner answers or implementation authorization. It validates consent, fields, lengths, idempotency and rate limits. The generic homepage uses /api/businesses/general/interest. Other business POST routes and all evaluation APIs require private owner access. Acquisition email links must use permanent parameter URLs without invitation fragments.

Setup is $250 introductory (regular $500). Optional care is $50/month or $475/year. Care scope proposes monthly checks, a report and one factual correction batch capped at 30 minutes. Custom integrations require a separate quote. No countdown or expired-page screen. The lead form takes no payment; authenticated checkout remains disabled until credentials, prices, webhooks and lifecycle tests are ready.

Findings use existing research, labeled Needs review or Not tested, with stored last_verified dates when available. Do not manufacture Passed checks. Controlled evaluations are not evidence of public assistant recommendations. Current branding and existing chat examples remain.

Remaining pilot gates: secure runtime Resend credential and automatic notifications; staff approval UI; verified owner onboarding; Stripe sandbox lifecycle, billing portal and agreed cancellation/refund terms; implementation completion records and scheduled care reports; full Juniper rehearsal before Avalon implementation. These are not claimed complete by this release.

Validation: npm test; node --test tests/analytics.test.cjs; npm run build. Test public viewing, protected writes, isolated lead storage, mobile layout and live API routes.

## Historical architecture notes (access and pricing descriptions superseded above)

# Welvia working pilot

Homepage: https://welvia.natemitchcook.com/
Private example business: https://welvia.natemitchcook.com/business?business=test-kitchen
Avalon proposal: https://welvia.natemitchcook.com/business?business=avalon

This app lives alongside the personal website in `welvia-app/`; it has its own AWS stack, asset bucket, CloudFront distribution, API, database and GitHub deployment role. The personal homepage and cards remain separate.

## Development

Run `npm ci`, `npm test`, and `npm run build` here. Serve `dist/` locally for layout; APIs require the deployed backend. SurveyJS Form Library is bundled locally, MIT licensed; Survey Creator is not used.

## AWS

CloudFormation stack `welvia-app` in us-east-1 uses retained private versioned encrypted S3 assets, CloudFront HTTPS/OAC, throttled API Gateway, a narrowly scoped Lambda runtime role, retained DynamoDB on-demand/PITR/TTL, 14-day logs and a repository/branch-scoped GitHub OIDC deployment role. Source: `infrastructure.json`, generated by `make_template.py`.

The app workflow builds/tests, updates the function code, uploads assets and invalidates only Welvia's distribution. Infrastructure changes require a reviewed CloudFormation change set; the CI role cannot modify IAM or other sites. First seed writes were performed through authenticated AWS APIs. Seed updates must not overwrite owner answers.

## Forms and data

Onboarding answers are saved in a private receipt and in the business record's `owner_answers`, `onboarding_status` and `implementation_checklist`. Public approved business copy is separate and never silently replaced by submitted answers. Synthetic test submissions are persisted. No email/SMS is sent; staff notifications and confirmation dashboard are not yet connected. Q&A is deterministic lookup over approved FAQ facts, not an LLM chatbot.

Real business forms are embedded but submit only with a seven-day, random invitation. Call the Lambda function directly through IAM-authorized AWS tooling with `{"admin_action":"invite","business_id":"avalon"}` to generate a private URL. Tokens are stored as hashes and passed in the URL fragment; never commit an invitation URL. The browser removes the fragment and retains the token in session storage. Direct admin payloads cannot be triggered through the HTTP API.

The demo request enforces 12–500 portions, 48-hour notice, a Pacific arrival window, two synthetic delivery ZIPs, required address/date/time/recipient/callback and explicit customer approval. Duplicate IDs return the same receipt; conflicting contents are rejected. Receipt lookup requires the random receipt capability. Customer requests for real businesses are disabled.

## Discovery and access

`llms.txt` and `openapi.json` describe the action contract. They do not grant access to private records. Robots/noindex discourage indexing; they do not restrict viewing access. The generic homepage is public. Business pages and all business APIs require an expiring invitation unless the Page record is explicitly public_enabled and content_approval is Approved. The internal example uses realistic presentation; it remains a non-operational request fixture. Onboarding answers and receipts are private. The earlier ChatGPT Sites preview keeps its original access settings.

## Operational limits before commercial launch

Add authenticated staff review/status UI, approved notification destination/service, verified real-business rules, monitoring alerts/budgets, retention/deletion policy, abuse protection beyond pilot throttles, cross-agent discovery testing and verified provider-specific ordering capabilities. No payments, Popmenu cart automation, PAP integration or automated outreach is enabled. Do not call this commercial production ready.

Automated backend and live API tests cover completeness, policy handling, duplicate requests, receipt isolation and invitation access. Browser testing verifies the embedded SurveyJS flow. See the deployment result in the conversation for what actually passed.

Recovery storage parameters reuse the original retained encrypted bucket and table. They are external to the app stack; preserve them when changing infrastructure.

## One template, DynamoDB content

The homepage and business-page design come from the original Sites version 4. `campaign.js` validates `?business=<stable-id>` and fetches the same-origin backend with a private invitation. The backend reads `PROSPECT#<id>` and `PAGE#<id>` on every load with consistent reads, and projects only a named set of business identity and landing-page fields. No static per-business exports or database credentials are shipped to browsers. All variable content uses textContent or React text escaping. API responses use no-store; CloudFront disables API caching. Private email drafts, contacts, notes, suppression, research and owner answers never enter the public projection.

Existing Avalon and Juniper Table supplemental campaign records remain in DynamoDB, using the same shared template. They preserve the original Avalon proposal's two scenarios. Owner answers are kept separately from approved page copy.

The workbook v2 import preserves 72 prospect rows, 72 joined Page content rows and 59 Workflow rules in private DynamoDB items. `scripts/import_workbook.py` supports source-version guards, revisions and a three-way merge preserving manual database edits against the imported baseline. Raw workbook data must never be committed to this public repository or uploaded to the assets bucket. The daily research task now reconciles workbook and private database records using source/version and revision guards. It retains the workbook as the human review copy, verifies database synchronization separately, and never enables public pages or sends outreach. The first run of this updated task is still pending.

## Service intake and billing preparation

Onboarding starts with researched business suggestions, accepts optional additions and asks for a delivery radius. Customer Q&A and catering demonstrations are separate from owner intake and shown only for the example business. The confirmation describes the implementation plan and website access step; it does not claim that site changes are already running. Proposal delivery preferences are saved privately. Outbound email/SMS transport is not connected yet.

Pricing has separate setup and monthly amounts from an owner-approved BUSINESS# record's offer. The countdown uses the stored invitation/offer deadline, never browser storage or a reset-on-load timer. CONFIG#billing is private and must contain enabled, webhook_ready, setup_price_id and monthly_price_id. STRIPE_SECRET_KEY is server-side only. The checkout adapter validates Stripe Price amounts, currencies and recurring intervals against the approved offer and refuses mismatches or expired offers. The hosted session expires no later than the offer; Stripe requires at least 30 minutes to create a new session, so new checkout creation closes for that final window. One-time and monthly line items use subscription mode.

Checkout remains disabled until actual prices, Stripe credentials and a verified signed webhook/subscription lifecycle are configured. Webhook processing, subscriber portal and automatic proposal email/text delivery are not implemented in this change. Do not set webhook_ready before those services and end-to-end test payments are verified. A checkout return URL is not proof of payment. Secrets must not be entered in chat or committed to GitHub.

## Agent quality evaluations

`evaluations/service.py` is a separate API/async worker deployed by `evaluations/infrastructure.json` (stack `welvia-evaluations`). Generate it with `python3 evaluations/make_template.py`. The stack adds specific `/api/businesses/{businessId}/evaluations` routes to the existing HTTP API. It owns a separate private encrypted/versioned S3 results bucket, on-demand composite-key DynamoDB table with PITR, Lambda, restricted IAM role, dead-letter queue and error alarm. The app's existing website bucket never contains reports or feedback. Changes to evaluation infrastructure require a reviewed CloudFormation change set; the GitHub role only deploys function code after provisioning.

Storage access patterns:
- `pk=BUSINESS#<id>, sk=PROFILE`: versioned evaluation profile, baseline and approved additions. Conditional revisions prevent overwriting concurrent edits.
- Same partition, `RUN#<UTC timestamp>-<random id>`: small run metadata and S3 references; descending Query returns recent history without a table scan.
- Same partition, `FEEDBACK#<UUID>`: idempotent answer-specific owner feedback. Submission does not change approved facts.
- Same partition, `RUNLOCK` and `BUDGET#<UTC date>`: bounded run frequency and daily use. TTL only cleans counters; authorization checks expiry explicitly.
- S3 `businesses/<id>/runs/<run-id>/{profile.json,results.json,report.html}`: immutable snapshots, actual answers, source paths, tool activity, checks and a read-only HTML report. Conditional object writes prevent replacing an existing run. Export URLs expire after 15 minutes. Recipients can retain downloaded copies.

The pilot enables only Juniper Table (`test-kitchen`). Every API read/write needs the existing business-scoped unexpired invitation. No browser-selected S3 key, model, target URL or business is trusted. All output renders as escaped text. The worker can only read supplied source snapshots and prepare an isolated inquiry; it cannot message customers, browse arbitrary URLs, pay or place orders. Both variants use the same Nova Lite model, prompt, temperature, tools, question and grading rules. The original FAQ/scenario content is retained in the baseline. Enriched source representations add linked structured facts and an action contract. Operating-rule corrections update explicit structured fields; arrival-window changes require review.

Each manual run evaluates ten scenarios once per variant. Reported checks are deterministic coverage checks, not comprehensive factual accuracy scores. Reports distinguish controlled website-snapshot discoverability from public-agent/search visibility, which is not measured yet. Run several trials before drawing reliability conclusions. Review feedback is persisted; explicit confirmation updates the evaluation profile only, never the live business website. Rerun to compare the next profile revision. Up to 20 recent runs and 50 recent feedback items are displayed initially. Per-tenant run cooldown is five minutes, max twelve runs per UTC day, bounded six model turns per trial, two trials in flight per worker. Shared Lambda reserved concurrency is five: tenant-partitioned storage is extensible, but this pilot has not been load-tested for commercial subscriber scale. No scheduled evaluation, external report email or SMS delivery is enabled. Failed async work is retained in the dead-letter queue; the alarm has no outbound notification destination yet.

## Welvia Journal and brand

Public journal: `/blog/index.html`; Current identity and brand profile: `/brand.html` (noindex). Ten initial articles live in `content/posts.json`. Read `content/EDITORIAL.md` before editing or publishing. Weekly articles are produced by an owner-authorized ChatGPT task, committed through a validated PR and deployed by the existing app workflow; no model or publishing secret is shipped to the browser. The task runs Monday mornings in America/New_York.

The build generates readable article HTML, alternate Markdown, article-specific titles/descriptions/canonical and social tags, BlogPosting structured data, RSS and a journal-only sitemap. Static assets include SVG/PNG favicons, Apple touch icon, manifest and a 1200×630 social image. No invented social handles or unverifiable business contact metadata are added. Homepage and private business noindex/access settings are preserved. The new public journal is allowed in robots.txt. A crawler being allowed does not guarantee indexing.

## Google Analytics
GA4 property measurement ID: `G-N5KBXBFBPD`. The shared HTML head loads
`/analytics.js` on homepage, brand page, business proposal shell, journal and
all articles (including future articles). A business proposal is distinguished
by its validated business slug. URL fragments and other query parameters are
excluded from explicitly configured page URLs; referrers are reduced to origin.
Custom events record clicks, onboarding/request form starts and submission
outcomes, Q&A requests/responses and checkout starts. Event payloads never copy
form values, answer text, errors or invitation tokens. Advertising signals and
personalization are disabled. Cookies are scoped to the Welvia hostname.
Google Analytics stream-side Enhanced Measurement is controlled separately in
Google's admin; review its automatic collection settings before enabling
additional features or user-provided data collection. No indexing settings change.
Keep this property when moving domains and update the stream URL at launch.

Business proposal URLs use `https://welvia.natemitchcook.com/business?business=<business_id>`. The query selects a stored record; existing invitation authorization still applies. The build emits an extensionless HTML shell and deployment sets its content type explicitly.

## Private email previews

`/email-preview.html` is a static shell with no prospect data or analytics. The private API requires a separate, read-only `PREVIEW#` bearer capability. Generate a 30-day link with an IAM-authorized Lambda invocation `{"admin_action":"preview_invite"}`. The token travels in the URL fragment, is removed from the address bar on load, and is kept only in sessionStorage for that tab. Lock clears it. Revoke a link by deleting its hashed `PREVIEW#` record. Business invitations cannot access previews, and preview links cannot submit owner answers.

The business picker reads `CONFIG#email-preview` with a `businesses` list of `{id,name}`. Refresh this catalog after adding prospects by scanning PROSPECT/BUSINESS records through an operator's AWS connection, excluding demos, and replacing this configuration item. The runtime needs no Scan permission. Each selection reads the current business data and prepared review artifact. Missing files are shown as missing, never generated by a preview request.

Review delivery uses `reviews.email_payload`, exactly as the live send worker does, with a clearly labeled requester placeholder. Acquisition uses `reviews.acquisition_payload`, preserving the saved Resend `welvia-current-acquisition` layout and substituting each business's campaign content plus the free-review offer. This shared renderer is the source for future outreach sends; no outreach sending endpoint is introduced. The acquisition template is still a draft: mailing address and recipient verification are outstanding before real outreach. HTML and plain text are available; the iframe is sandboxed, remote tracking is blocked, and llms.txt downloads match the stored attachment. Browser previews do not emulate every email client's rendering quirks.
