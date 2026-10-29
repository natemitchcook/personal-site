"""Referral and consent contract tests; all AWS/email operations are mocked."""
import copy
import json
import os
import subprocess
import sys
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault('TABLE_NAME', 'test')
os.environ.setdefault('SITE_URL', 'https://welvia.natemitchcook.com')
sys.path.insert(0, str(ROOT / 'backend'))
with patch('boto3.resource'):
    import index as app


class ConditionalFailed(Exception):
    pass


class ReferralAndConsent(unittest.TestCase):
    def data(self, **changes):
        value = {'contact_name':'Test Owner', 'contact_email':'test@example.com',
                 'consent':True, 'submission_id':'12345678-1234-1234-1234-123456789abc'}
        value.update(changes)
        return value

    def save(self, data):
        db = MagicMock()
        db.meta.client.exceptions.ConditionalCheckFailedException = ConditionalFailed
        with patch.object(app, 'db', db), patch.object(app.reviews, 'enqueue', return_value='Queued') as enqueue:
            response = app.save_interest('avalon', data)
        item = db.put_item.call_args.kwargs['Item'] if db.put_item.called else None
        return response, item, db, enqueue

    def test_frontend_and_backend_share_exact_finite_vocabulary(self):
        frontend = json.loads(subprocess.check_output(
            ['node','-e',"console.log(JSON.stringify(require('./referral.cjs').VALUES))"], cwd=ROOT, text=True))
        self.assertEqual(frontend, app.REFERRAL_VALUES)

    def test_sanitize_unknown_and_pii(self):
        for value in (None, [], 'ica', 1, True, {'ref':'private@example.com'},
                      {'ref':'a'*10000}, {'ref':{'nested':'ica'}}, {'utm_campaign':'free-review'}):
            with self.subTest(value=str(value)[:60]):
                self.assertEqual({}, app.sanitize_attribution(value))
        self.assertEqual({'ref':'ica','utm_medium':'newsletter'}, app.sanitize_attribution(
            {'ref':'ica','utm_medium':'newsletter','utm_source':'private@example.com','email':'PRIVATE','utm_content':'<script>'}))

    def test_sanitized_attribution_saved_in_private_lead_only(self):
        data = self.data(attribution={'ref':'ica','utm_campaign':'free-review','email':'SECRET','utm_content':'SECRET'})
        original = copy.deepcopy(data)
        response,item,db,enqueue = self.save(data)
        self.assertEqual(201,response['statusCode'])
        expected={'ref':'ica','utm_campaign':'free-review'}
        self.assertEqual(expected,item['attribution'])
        self.assertEqual(expected,item['answers']['attribution'])
        self.assertNotIn('SECRET',json.dumps(item))
        self.assertEqual(original,data)
        self.assertTrue(item['pk'].startswith('LEAD#avalon#'))
        db.update_item.assert_not_called()
        self.assertNotIn('attribution',app.public_proposal({'id':'avalon',**item}))
        enqueue.assert_called_once_with(db,item)
        self.assertNotIn('attribution',json.loads(response['body']))

    def test_unknown_attribution_does_not_block_review_or_persist(self):
        for value in ({'ref':'SECRET'},None,['ica'],'private@example.com'):
            with self.subTest(value=value):
                response,item,_,_=self.save(self.data(attribution=value))
                self.assertEqual(201,response['statusCode'])
                self.assertNotIn('attribution',item)
                self.assertNotIn('attribution',item['answers'])

    def test_legacy_consent_never_grants_marketing(self):
        response,item,_,_=self.save(self.data())
        self.assertEqual(201,response['statusCode'])
        self.assertIs(False,item['marketing_consent'])
        self.assertIs(False,item['consent_record']['marketing_opt_in'])
        self.assertEqual('legacy-bundled',item['consent_record']['version'])
        self.assertEqual('unknown',item['consent_record']['source_page'])
        self.assertEqual('',item['consent_record']['marketing_copy'])

    def test_current_review_request_accepts_optional_marketing_false_or_missing(self):
        for extra in ({}, {'marketing_consent':False}):
            with self.subTest(extra=extra):
                response,item,_,enqueue=self.save(self.data(consent_version=app.CONSENT_VERSION,source_page='/new',**extra))
                self.assertEqual(201,response['statusCode'])
                self.assertIs(False,item['marketing_consent'])
                self.assertTrue(item['consent_record']['review_requested'])
                self.assertEqual(app.REVIEW_CONSENT_COPY,item['consent_record']['review_copy'])
                self.assertEqual(app.CONSENT_VERSION,item['consent_record']['version'])
                enqueue.assert_called_once() # Requested review still allowed; this is not a marketing send.

    def test_explicit_marketing_records_version_copy_server_time_and_source(self):
        response,item,_,_=self.save(self.data(marketing_consent=True,consent_version=app.CONSENT_VERSION,source_page='/new'))
        self.assertEqual(201,response['statusCode'])
        self.assertIs(True,item['marketing_consent'])
        record=item['consent_record']
        self.assertIs(True,record['marketing_opt_in'])
        self.assertEqual(app.MARKETING_CONSENT_COPY,record['marketing_copy'])
        self.assertEqual(app.REVIEW_CONSENT_COPY,record['review_copy'])
        self.assertEqual('/new',record['source_page'])
        self.assertEqual(item['created_at'],record['recorded_at'])
        self.assertIsNotNone(datetime.fromisoformat(record['recorded_at']).tzinfo)

    def test_marketing_requires_boolean_and_current_copy_version(self):
        for value in ('on','true','false',1,0,None,[],{}):
            with self.subTest(value=value):
                response,_,db,enqueue=self.save(self.data(marketing_consent=value,consent_version=app.CONSENT_VERSION))
                self.assertEqual(422,response['statusCode'])
                db.put_item.assert_not_called()
                enqueue.assert_not_called()
        for fields in ({'marketing_consent':True}, {'marketing_consent':True,'consent_version':'old'}, {'consent_version':None}):
            response,_,db,_=self.save(self.data(**fields))
            self.assertEqual(422,response['statusCode'])
            db.put_item.assert_not_called()

    def test_review_consent_still_required_even_with_marketing(self):
        for value in (False,None,'on',1):
            response,_,db,_=self.save(self.data(consent=value,marketing_consent=True,consent_version=app.CONSENT_VERSION))
            self.assertEqual(422,response['statusCode'])
            db.put_item.assert_not_called()

    def test_source_page_cannot_contain_pii_query_fragment_or_arbitrary_path(self):
        for page in app.SOURCE_PAGES:
            response,item,_,_=self.save(self.data(source_page=page))
            self.assertEqual(201,response['statusCode'])
            self.assertEqual(page,item['consent_record']['source_page'])
        for page in ('/new?email=secret@example.com','/new#TOKEN','https://example.com','/private/person',None,[],{}):
            with self.subTest(page=page):
                response,_,db,_=self.save(self.data(source_page=page))
                self.assertEqual(422,response['statusCode'])
                db.put_item.assert_not_called()

    def test_caller_cannot_supply_recorded_at_or_server_consent_record(self):
        for fields in ({'recorded_at':'2000-01-01'}, {'consent_record':{'marketing_opt_in':True}}, {'owner_answers':{}}):
            response,_,db,_=self.save(self.data(**fields))
            self.assertEqual(400,response['statusCode'])
            db.put_item.assert_not_called()

    def test_duplicate_request_reuses_original_item_without_overwriting_metadata(self):
        data=self.data(attribution={'ref':'ica'},marketing_consent=True,consent_version=app.CONSENT_VERSION,source_page='/new')
        _,old,_,_=self.save(data)
        old['created_at']='2026-10-29T00:00:00+00:00'
        old['consent_record']['recorded_at']=old['created_at']
        db=MagicMock()
        db.meta.client.exceptions.ConditionalCheckFailedException=ConditionalFailed
        db.put_item.side_effect=ConditionalFailed()
        db.get_item.return_value={'Item':old}
        with patch.object(app,'db',db),patch.object(app.reviews,'enqueue',return_value='Queued') as enqueue:
            response=app.save_interest('avalon',data)
        self.assertEqual(201,response['statusCode'])
        enqueue.assert_called_once_with(db,old)
        self.assertEqual('2026-10-29T00:00:00+00:00',old['consent_record']['recorded_at'])
        db.update_item.assert_not_called()

    def test_duplicate_id_cannot_change_referral_or_marketing_consent(self):
        data=self.data(attribution={'ref':'ica'},marketing_consent=False,consent_version=app.CONSENT_VERSION)
        _,old,_,_=self.save(data)
        for updates in ({'attribution':{'ref':'jobber'}},{'marketing_consent':True}):
            db=MagicMock()
            db.meta.client.exceptions.ConditionalCheckFailedException=ConditionalFailed
            db.put_item.side_effect=ConditionalFailed()
            db.get_item.return_value={'Item':old}
            with patch.object(app,'db',db),patch.object(app.reviews,'enqueue') as enqueue:
                response=app.save_interest('avalon',{**data,**updates})
            self.assertEqual(409,response['statusCode'])
            enqueue.assert_not_called()

    def test_historical_request_retry_not_promoted_or_rewritten(self):
        data=self.data()
        old={'pk':'LEAD#avalon#'+data['submission_id'],'answers':data,'created_at':'2026-10-01T00:00:00Z'}
        db=MagicMock()
        db.meta.client.exceptions.ConditionalCheckFailedException=ConditionalFailed
        db.put_item.side_effect=ConditionalFailed()
        db.get_item.return_value={'Item':old}
        with patch.object(app,'db',db),patch.object(app.reviews,'enqueue',return_value='Accepted by Resend') as enqueue:
            response=app.save_interest('avalon',data)
        self.assertEqual(201,response['statusCode'])
        self.assertNotIn('marketing_consent',old)
        self.assertNotIn('consent_record',old)
        enqueue.assert_called_once_with(db,old)
        db.update_item.assert_not_called()


if __name__ == '__main__':
    unittest.main()
