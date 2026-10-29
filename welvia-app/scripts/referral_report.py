"""Offline, aggregate-only referral KPI report (standard library; no AWS/network).

From welvia-app:
  python scripts/referral_report.py private-leads.json --start 2026-10-01 --end 2026-11-01
  python scripts/referral_report.py private-leads.json --exclude-emails private-exclusions.json

Input: JSON list of decoded private LEAD records, NOT raw DynamoDB attribute maps.
Exclusions: optional JSON list of email strings (e.g. family/test participants).
Keep both input files private. Output contains counts only, never emails or hashes.
Dates are UTC, start inclusive and end exclusive. Earliest valid request per
trimmed/lowercased email WITHIN the selected interval wins attribution and consent.
This measures unique email addresses, not unique people or verified subscribers.
Repeated snapshots of a request are deduplicated by pk. is_test/is_demo=True on
the record or answers is excluded. Explicit marketing opt-ins are counted only
on the selected first request, not as current send eligibility: suppression,
unsubscription and subsequent consent changes are intentionally not evaluated.
"""
import argparse
import json
import re
import sys
from datetime import datetime, timezone

SOURCES = ['helen-guo','smb-deal-hunter','eric-cacciatore','restaurant-unstoppable',
           'adam-sylvester','melinda-emerson','smallbizlady','ramon-ray','donald-burns',
           'paul-jamison','ica','main-street','jobber','nsfva','barista-exchange','shopify',
           'manhattan-chamber','restaurant-owners-managers','alignable','skool']
CONSENT_VERSION = '2026-10-29-v1'


def timestamp(value):
    if not isinstance(value, str):
        raise ValueError('Invalid timestamp')
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)


def email_key(value):
    if not isinstance(value, str):
        return None
    value = value.strip().lower()
    return value if len(value) <= 254 and re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', value) else None


def source(record):
    attribution = record.get('attribution', {})
    if not isinstance(attribution, dict):
        return 'unattributed'
    for key in ('ref', 'utm_source'):
        if attribution.get(key) in SOURCES:
            return attribution[key]
    return 'unattributed'


def explicit_opt_in(record):
    consent = record.get('consent_record', {})
    return (isinstance(consent, dict) and record.get('marketing_consent') is True
            and consent.get('marketing_opt_in') is True
            and consent.get('version') == CONSENT_VERSION)


def report(records, start=None, end=None, exclude_emails=()):
    if not isinstance(records, list):
        raise ValueError('Expected a JSON list of decoded lead records')
    if not isinstance(exclude_emails, (list, tuple)) or any(not isinstance(x, str) for x in exclude_emails):
        raise ValueError('Expected a JSON list of exclusion emails')
    start = timestamp(start) if start else None
    end = timestamp(end) if end else None
    if start and end and start >= end:
        raise ValueError('Start must precede end')
    exclusions = {email_key(value) for value in exclude_emails}
    candidates = []
    for record in records:
        if not isinstance(record, dict) or not isinstance(record.get('pk'), str) or not record['pk'].startswith('LEAD#'):
            continue
        answers = record.get('answers', {})
        if not isinstance(answers, dict) or answers.get('consent') is not True:
            continue
        if any(obj.get(key) is True for obj in (record, answers) for key in ('is_test', 'is_demo')):
            continue
        email = email_key(answers.get('contact_email'))
        if not email or email in exclusions:
            continue
        try:
            created = timestamp(record.get('created_at'))
        except (ValueError, TypeError, OverflowError):
            continue
        if (start and created < start) or (end and created >= end):
            continue
        candidates.append((created, record['pk'], email, record))
    # Conservative tie breaking avoids an inconsistent duplicate claiming opt-in.
    candidates.sort(key=lambda row: (row[0], row[1], explicit_opt_in(row[3]), source(row[3])))
    seen_requests, seen_emails, counts = set(), set(), {}
    for _, pk, email, record in candidates:
        if pk in seen_requests:
            continue
        seen_requests.add(pk)
        bucket = counts.setdefault(source(record), {'submitted_requests':0, 'unique_emails':0, 'explicit_marketing_opt_ins':0})
        bucket['submitted_requests'] += 1
        if email in seen_emails:
            continue
        seen_emails.add(email)
        bucket['unique_emails'] += 1
        bucket['explicit_marketing_opt_ins'] += int(explicit_opt_in(record))
    return {'submitted_requests':len(seen_requests), 'unique_emails':len(seen_emails),
            'explicit_marketing_opt_ins':sum(row['explicit_marketing_opt_ins'] for row in counts.values()),
            'by_source':dict(sorted(counts.items()))}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('input')
    parser.add_argument('--start')
    parser.add_argument('--end')
    parser.add_argument('--exclude-emails')
    args = parser.parse_args()
    try:
        with open(args.input, encoding='utf-8') as handle:
            records = json.load(handle)
        exclusions = []
        if args.exclude_emails:
            with open(args.exclude_emails, encoding='utf-8') as handle:
                exclusions = json.load(handle)
        result = report(records, args.start, args.end, exclusions)
    except (OSError, ValueError, TypeError, OverflowError):
        print('Unable to generate report: check private input format and date range.', file=sys.stderr)
        return 2
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
