"""Offline synthetic report tests; no network, AWS, or real leads."""
import copy
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('referral_report', ROOT / 'scripts/referral_report.py')
r = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(r)


def lead(n=1, email='owner@example.com', source='ica', created='2026-10-29T12:00:00Z', marketing=False):
    return {'pk':f'LEAD#business#{n}', 'created_at':created,
            'answers':{'contact_email':email, 'consent':True}, 'attribution':{'ref':source},
            'marketing_consent':marketing,
            'consent_record':{'version':r.CONSENT_VERSION, 'marketing_opt_in':marketing}}


class ReferralReportTests(unittest.TestCase):
    def test_source_vocabulary_parity(self):
        sources = json.loads(subprocess.check_output(['node', '-e',
            "console.log(JSON.stringify(require('./referral.cjs').SOURCES))"], cwd=ROOT, text=True))
        self.assertEqual(sources, r.SOURCES)

    def test_unique_normalized_emails_earliest_attribution_and_repeat_requests(self):
        first = lead(email=' Owner@Example.Com ', created='2026-10-28T12:00:00Z')
        later = lead(2, source='jobber', marketing=True)
        result = r.report([later, first, copy.deepcopy(first)])
        self.assertEqual(result['submitted_requests'], 2)
        self.assertEqual(result['unique_emails'], 1)
        self.assertEqual(result['explicit_marketing_opt_ins'], 0)
        self.assertEqual(result['by_source']['ica']['unique_emails'], 1)
        self.assertEqual(result['by_source']['jobber']['unique_emails'], 0)

    def test_utc_date_range_is_start_inclusive_end_exclusive(self):
        records = [lead(1, created='2026-09-30T23:59:59Z'),
                   lead(2, source='jobber', created='2026-10-01T01:00:00+01:00'),
                   lead(3, email='other@example.com', created='2026-11-01T00:00:00Z')]
        result = r.report(records, '2026-10-01', '2026-11-01')
        self.assertEqual(result['unique_emails'], 1)
        self.assertEqual(list(result['by_source']), ['jobber'])
        with self.assertRaises(ValueError):
            r.report(records, '2026-11-01', '2026-10-01')

    def test_explicit_exclusions_family_and_test_markers(self):
        family = lead(1, email='Family@example.com')
        test = lead(2); test['is_test'] = True
        demo = lead(3); demo['answers']['is_demo'] = True
        self.assertEqual(r.report([family, test, demo], exclude_emails=[' family@EXAMPLE.com '])['unique_emails'], 0)

    def test_legacy_combined_consent_is_not_marketing(self):
        old = lead(1, email='old@example.com', marketing=True)
        del old['consent_record']
        version = lead(2, email='version@example.com', marketing=True)
        version['consent_record']['version'] = 'legacy-bundled'
        false = lead(3, email='false@example.com', marketing=True)
        false['consent_record']['marketing_opt_in'] = 'true'
        current = lead(4, email='current@example.com', marketing=True)
        result = r.report([old, version, false, current])
        self.assertEqual(result['unique_emails'], 4)
        self.assertEqual(result['explicit_marketing_opt_ins'], 1)

    def test_malformed_records_and_missing_review_consent_ignored(self):
        records = [None, [], 'private', {'pk':{'S':'LEAD#1'}}, lead()]
        records[-1]['answers']['consent'] = 1
        for key, value in [('created_at','not a date'), ('answers',[]), ('pk','BUSINESS#x')]:
            bad = lead(); bad[key] = value; records.append(bad)
        bad = lead(email='not-an-email'); records.append(bad)
        self.assertEqual(r.report(records)['submitted_requests'], 0)

    def test_unknown_pii_source_is_never_output_and_source_fallback(self):
        bad = lead(source='private@example.com')
        other = lead(2, email='second@example.com'); other['attribution'] = {'ref':{}, 'utm_source':'jobber'}
        result = r.report([bad, other])
        self.assertEqual(set(result['by_source']), {'unattributed', 'jobber'})
        output = json.dumps(result)
        for secret in ('private@example.com','owner@example.com','second@example.com','LEAD#'):
            self.assertNotIn(secret, output)

    def test_input_not_modified_and_conflicting_snapshot_conservatively_deduped(self):
        records = [lead(marketing=True), lead(marketing=False)]
        original = copy.deepcopy(records)
        result = r.report(records)
        self.assertEqual(result['submitted_requests'], 1)
        self.assertEqual(result['explicit_marketing_opt_ins'], 0)
        self.assertEqual(records, original)

    def test_cli_output_and_failure_never_echo_input(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'private.json'
            path.write_text(json.dumps([lead()]))
            command = [sys.executable, str(ROOT / 'scripts/referral_report.py'), str(path)]
            done = subprocess.run(command, text=True, capture_output=True)
            self.assertEqual(done.returncode, 0)
            self.assertEqual(json.loads(done.stdout)['unique_emails'], 1)
            self.assertNotIn('owner@example.com', done.stdout + done.stderr)
            path.write_text('SECRET@example.com')
            done = subprocess.run(command, text=True, capture_output=True)
            self.assertEqual(done.returncode, 2)
            self.assertNotIn('SECRET@example.com', done.stdout + done.stderr)


if __name__ == '__main__':
    unittest.main()
