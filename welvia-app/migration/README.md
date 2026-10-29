# welvia.app cutover (not deployed)

This branch includes PR37's exact referral/consent commit. Merge PR37 first, then merge this migration only after the release gates below. Owner merges manually. Do not run `make_template.py` blindly: retained resources/current deployed stack must be reconciled first. CI updates code/assets only, not infrastructure.

## Release gates and order

1. Reconnect AWS Core. Verify Route53 Domains registration SUCCESSFUL, correct authoritative delegation and hosted-zone ID. No additional purchase authorized. Record real observed IDs; do not guess.
2. Export the live `welvia-app` CloudFormation template/parameters and distribution configuration. Preserve bucket, DynamoDB, queues, Lambda environment, API behavior, OAC and role separation. Keep old hostname/DNS indefinitely for existing shared business links. Inventory private PAGE/PROSPECT IDs read-only; never publish contact data or a directory of private records.
3. Issue/validate a CloudFront-compatible ACM certificate in us-east-1 covering both `welvia.app` and `welvia.natemitchcook.com`. Use both distribution aliases, retain old DNS, add A/AAAA aliases for the new domain. Review any cost impact before adding paid resources. Do not alter natemitchcook.com or other subdomains.
4. Attach `viewer-request.js` as a CloudFront Function **only to the static default behavior**, not `/api/*`. It retains query parameters and redirects the old host, /new to /smb, /journal to /blog/. It rewrites /blog/ and /care-demo/ to S3 index objects. Review/test the function before publishing. Old invitation fragments must remain intact in browser redirect testing; fragments are not transmitted to the edge. An existing invitation saved only in old-origin sessionStorage cannot migrate across origins; public proposals remain accessible and private sessions may need a fresh authorized invitation. Never copy invitation tokens to query strings/logs.
5. Set Lambda `SITE_URL=https://welvia.app`, preserve all other variables. Verify same-origin `/api/*` behavior and any CORS allowlist against actual infrastructure. Do not reset business records or seed over founder edits. New host content must be available over valid HTTPS before emailed links switch.
6. Verify `welvia.app` in Resend with its exact returned DKIM/SPF records; configure DMARC without clobbering other records. Verify receiving/inbox before pointing replies to it. The existing `welvia/resend/reviews` secret is documented as domain-restricted; a new sending domain may require separately approved credential scope/replacement. Never print or create credentials here.
7. Only once domain authentication and permitted key scope are verified, set `REVIEW_FROM=Nate at Welvia <hello@welvia.app>`. Until then code retains the old verified sender by default. `REVIEW_REPLY_TO` remains the working existing reply destination until a new inbox is verified. Do not silently change personal Gmail. Migrate the external Resend acquisition template separately. No real customer test email or form submission is authorized by this patch.
8. Preserve already-frozen LEAD email_payload/idempotency state. Do not rewrite/resend accepted or ambiguous messages. Keep old domain functioning through retries and permanently for linked URLs.
9. After all gates, owner manual merge/deploy, inspect exact CI/deploy head; verify HTTPS, all routes in generated route-manifest.json, redirects with business/ref/UTM, header/footer desktop/mobile, forms (non-submitting), authorized views and asset MIME types. Confirm email acceptance vs delivery separately if a test is authorized.

## Route inventory

Public routes: `/`, `/smb`, `/blog/`, `/brand.html`, `/privacy.html`, `/service.html`; 12 article routes from content/posts.json, their `.html` compatibility and `.md` readable versions; `/blog/feed.xml`, `/sitemap.xml`, `/llms.txt`, `/openapi.json`, `/robots.txt`, `/site.webmanifest`. `/business?business=<stable-id>` uses the existing private database, with no expiration or copied contacts. Known historical IDs such as `avalon` are not a verified complete inventory. `/care-demo/` and `/care-demo.html` are synthetic demo content, not customer evidence. `/email-preview.html` requires private authorization. `/pitch-template.html` is an app fragment, not a marketing destination. API `/api/*` remains same-origin and retains authorization checks. `/new`, `/new.html`, `/journal`, `/journal.html`, and `/journal/<article>` are legacy compatibility redirects. Build emits `route-manifest.json` for verification, not a claim of deployment.

## Rollback

Keep a copy of the pre-cutover distribution/function association, DNS, Lambda environment and deployed asset version. If needed, detach/revert the edge function first (avoid redirect loops), restore previous assets/code and SITE_URL/REVIEW_FROM/REVIEW_REPLY_TO, invalidate affected cache. Retain both hostnames/certificate until rollback is verified. Never delete/recreate retained data, queues, credentials or old DNS. Do not rewrite sent message URLs or consent history.

## Still intentionally pending

AWS registration/DNS/certificate/live template identifiers; reviewed infrastructure change set; domain-restricted email key authorization; new receiving inbox verification; dynamic business ID export; browser redirect/HTTPS/API/email verification. Source changes alone do not complete migration.

## Offline proposal helper (AWS inventory refreshed October 29)

`prepare_template.py` reads a fresh exported **live** template, not the stale embedded bootstrap in the repository generator. It never calls AWS, reads credentials or applies changes. Supply the inspected hosted zone and choose a distinct output file:

```sh
python3 migration/prepare_template.py live-stack.json prepare.json --phase prepare --zone-id Z053932135TAY9N1QUIVN
python3 migration/prepare_template.py live-stack.json cutover.json --phase cutover --zone-id Z053932135TAY9N1QUIVN
cfn-lint prepare.json cutover.json
```

Both proposals add a required `MigrationCertificateArn` parameter with no default. Supply only a verified issued certificate covering the two exact hostnames in us-east-1. The prepare phase changes CDN aliases/certificate and adds new A/AAAA DNS records while preserving old DNS. It does not redirect or change the API environment. The cutover phase additionally attaches the static viewer function and updates SITE_URL/SiteUrl. That function is a newly metered AWS resource: obtain cost approval before creating it. Do not enable cutover until code is deployed on the new origin and the owner-approved release gates are met.

The helper asserts Lambda Code, API behaviors, existing DNS, IAM and unrelated resources remain unchanged. Inspect the actual change set for only intended resources; any Lambda code/IAM/storage change is a stop condition. Export the template again if infrastructure changed since preparation. Keep the code-only CI deployment and infrastructure changes coordinated: never run the repository's historical generator against production without reconciling its bootstrap and live resources.

Current verified inventory: stack `welvia-app`; distribution `E28HYCEER7L2DP`; new zone `Z053932135TAY9N1QUIVN`; no existing edge function associations; API uses same-origin requests with no CORS allowlist. These observations do not prove registration, HTTPS or cutover completion. [CloudFront Function resource documentation](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-cloudfront-function.html).


## Activation order (avoid a code/DNS circular dependency)

1. Owner may merge PR37 independently; it has no domain cutover. Confirm its deployment succeeds.
2. With the issued two-host certificate, review/apply only the prepare proposal: both aliases and new A/AAAA, no redirect and no SITE_URL change. Verify new-host HTTPS serves the existing app. The old host continues working.
3. Owner merges PR38 after new-host HTTPS is available. Its workflow publishes `/smb` and explicit S3 objects for `/blog/` and `/care-demo/`, so new navigation works **before** edge redirects. The retained `/new` alias also works without an edge function. Wait for this code deployment, then test both hosts without submitting customer forms.
4. Activate the reviewed cutover proposal only after those checks: add the static viewer function and SITE_URL change. Keep `/api/*` untouched. Confirm old-host business links and referral queries redirect correctly and canonical routes work. Use the fresh live template to avoid overwriting intervening infrastructure changes.
5. Email From/Reply-To activation is a separate gate: verify new domain authentication, receiving inbox and separately approved domain-restricted key capability. Existing verified From is deliberately the fallback; never rotate or print a credential in this procedure. Frozen existing messages remain unchanged.

The certificate parameter file for this run must use the actually issued us-east-1 certificate, not a placeholder. Updated progress and AWS approvals belong in the private operational record, not guessed source defaults. No merge or application is performed by these instructions.
