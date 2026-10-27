# Welvia Journal publishing guide

Mission: help small businesses participate as agents help people find services, buy food and take useful actions. Be optimistic, concrete and honest. Preserve the user's warm cream/green design and business-specific private flows.

## Content

Edit `posts.json`, the public editorial source. Each entry contains `slug`, `title`, `category`, `description`, `date`, `updated`, `author`, `sections` (heading and paragraphs), `takeaway`, and `sources` (title, HTTPS URL, verified date). The author is Welvia; do not impersonate a personal author or claim manual human review. Date every article accurately. Never backdate or future-date news. Aim for 400–700 words for new weekly articles when the subject supports it; avoid padding.

Open official sources to verify specific claims. Attribute statistics, state their period and scope, and distinguish measured results from forecasts. Put the source attribution in the relevant paragraph and include the source link in the article's sources list. Avoid excessive quotation. Opinions and invented examples must be clear from context. Preserve the distinction between a request and an accepted order. Do not imply a protocol, platform partnership, integration or certification exists merely because we discuss it. Do not promise rankings, orders or revenue. No customer data, prospect spreadsheet data, invitation tokens, private metrics or subscriber targets may enter these public files.

Use current news where there is a meaningful, verified small-business implication. Otherwise prefer practical evergreen information. Check existing article slugs, titles and open PRs before adding one article per scheduled run. No duplicate publishing after an interrupted run: check whether the article already merged.

## Build and publication

Run `npm test` and `npm run build` in `welvia-app`. Build runs `scripts/build_editorial.py` and `scripts/check_editorial.py`; it emits HTML, matching Markdown, article metadata, BlogPosting data, RSS and sitemap. Do not edit generated `dist/`. Public article URLs use `/blog/<slug>` without an extension. The build emits extensionless HTML objects and the deployment sets their HTML content type explicitly. Legacy `.html` copies remain available with clean canonical URLs. Journal index: `/blog/index.html`. Draft articles stay outside `posts.json` until ready to publish.

Open a narrowly scoped PR, wait for required checks, merge with a current-head guard, then verify `Deploy Welvia pilot` succeeds and the real article URL returns the intended HTML. A commit or merged PR alone does not establish deployment. Preserve concurrent work; re-read before resolving conflicts.

The weekly publishing task is owner-authorized. Do not create additional schedules. Do not send email or outreach. Site files deploy through the existing GitHub workflow; no direct AWS infrastructure changes are needed.

## Discovery and privacy

Only the journal is newly allowed for indexing in robots.txt. Existing root homepage and business shells keep noindex/nofollow. Private APIs still enforce expiring invitations; robots.txt is not access control. Never add business links, report links, private brand-review pages or query parameters to the public sitemap/feed. The static homepage metadata is generic so social crawlers do not receive private business details. `/brand.html` is a noindex visual review page, not an authenticated secret.

## Identity assets

Current is the owner's selected Welvia identity: three flowing lines for discovery, understanding and action. `/brand.html` presents only this mark and its brand profile. On-page SVGs animate once every ten seconds with pause and reduced-motion support; favicons and social images remain still. Assets live under public/brand, with the shared SVG geometry in scripts/brand_studies.py. Do not change the mark in a weekly content run. No trademark clearance is claimed.
