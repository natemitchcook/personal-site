# Controlled quote-request lab

Static, zero-dependency synthetic fixture. Not a customer evaluation, lead form or agent success benchmark. Everything is local to the current browser tab; no storage, network submission, analytics, account, payment or real contact entry. The immutable contact uses the reserved example.test namespace. This does not protect against ordinary web-server access logs when the public page is requested.

## Task and same rules
Request office cleaning for Alex Example, Demo North, up to 2,000 square feet, next week. Review and create one browser-local receipt. Both variants use `model.js`: the same options, validation, eligibility, confirmation and repeated-submission behavior. Demo South is out of area in both. The baseline deliberately abbreviates options and uses generic labels/errors; do not claim an agent failed unless an actual observed run did fail. Auto-fill is not agent performance evidence.

`node --test agent-lab/test.cjs` runs model and static source checks only. `evidence.json` records a dated local run and hashes, not a standing guarantee for modified source. This is a direct static page; no build/dependency installation required.

## Pending release gates
- Independent browser interaction: both variants, empty submit, out-of-area recovery, review/edit, repeated confirmation, reset, download, reload clearing.
- Desktop/mobile visual, keyboard and screen-reader checks. Source assertions are not substitutes.
- Approved merge/deployment; check HTML MIME and 200 on `/agent-lab`, `/agent-lab/`, assets and evidence file.
- Only then activate Welvia homepage and /smb links: task -> `/agent-lab/#task`, report -> `#report`, change -> `#changes`, retest -> `#retest`.
- No continuous monitoring is configured or claimed. Real-site pilots require separate authorized tasks and dated runs.

The existing deployment only gains exact lab HTML objects. Existing personal homepage, cards and other source are untouched. Roll back by reverting this PR; existing S3 sync removes lab assets on next approved deployment.
