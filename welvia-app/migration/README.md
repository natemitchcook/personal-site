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
