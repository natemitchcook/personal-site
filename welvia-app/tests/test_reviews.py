import base64
import io
import json
import os
import socket
import sys
import time
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import MagicMock, patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
import reviews

class Conditional(Exception): pass

def database(lead=None):
    db=MagicMock()
    db.meta.client.exceptions.ConditionalCheckFailedException=Conditional
    db.get_item.return_value={'Item':lead} if lead else {}
    return db

class Reviews(unittest.TestCase):
    def test_url_rejects_credentials_ports_schemes(self):
        for url in ['file:///etc/passwd','https://name:password@example.com','https://example.com:8080','https://[::1]/']:
            with self.subTest(url=url),self.assertRaises(ValueError): reviews.canonical(url)

    def test_pin_rejects_private_and_mixed_dns(self):
        for addresses in [['127.0.0.1'],['169.254.169.254'],['8.8.8.8','10.0.0.1']]:
            records=[(socket.AF_INET,socket.SOCK_STREAM,6,'',(ip,443)) for ip in addresses]
            with patch.object(socket,'getaddrinfo',return_value=records), patch.object(socket,'create_connection') as connect:
                with self.assertRaises(ValueError): reviews.PublicHTTPS('example.com').connect()
                connect.assert_not_called()

    def test_preparation_extracts_only_public_site_navigation(self):
        db=database()
        document='<title>Example &amp; Sons</title><meta name="description" content="Local catering"><a href="/menu">Menu</a><a href="https://evil.example/order">Order</a><a href="mailto:owner@example.com">Contact</a>'
        with patch.object(reviews,'fetch',side_effect=[('https://example.com/robots.txt','text/plain','User-agent: *\nAllow: /'),('https://example.com/','text/html',document)]):
            artifact=reviews.prepare(db,'https://example.com')
        self.assertIn('[Menu](https://example.com/menu)',artifact['llms_txt'])
        self.assertNotIn('evil.example',artifact['llms_txt'])
        self.assertNotIn('mailto:',artifact['llms_txt'])
        self.assertEqual('Homepage title, description and same-site navigation links; linked pages and booking flows were not tested.',artifact['scope'])

    def test_respects_robots_and_does_not_fabricate(self):
        with patch.object(reviews,'fetch',return_value=('https://example.com/robots.txt','text/plain','User-agent: *\nDisallow: /')) as fetch:
            with self.assertRaises(ValueError): reviews.prepare(database(),'https://example.com')
            self.assertEqual(fetch.call_count,1)

    def test_missing_robots_access_error_allows_public_homepage(self):
        with patch.object(reviews,'fetch',side_effect=[ValueError('Website returned HTTP 403'),('https://example.com/','text/html','<title>Example</title>')]):
            artifact=reviews.prepare(database(),'https://example.com')
        self.assertIn('# Example',artifact['llms_txt'])

    def test_robots_server_error_does_not_crawl(self):
        with patch.object(reviews,'fetch',side_effect=ValueError('Website returned HTTP 503')) as fetch:
            with self.assertRaises(ValueError): reviews.prepare(database(),'https://example.com')
            self.assertEqual(fetch.call_count,1)

    def test_unavailable_page_is_not_an_outreach_ready_file(self):
        self.assertFalse(reviews.usable({'name':'Site Unavailable','prepared_at':int(time.time())}))
        with patch.object(reviews,'fetch',side_effect=[ValueError('Website returned HTTP 404'),('https://example.com/','text/html','<title>Site Unavailable</title>')]):
            with self.assertRaises(ValueError): reviews.prepare(database(),'https://example.com')

    def test_cached_artifact_avoids_network(self):
        artifact={'name':'Example','prepared_at':int(time.time()),'llms_txt':'# Example'}
        with patch.object(reviews,'fetch') as fetch:
            self.assertEqual(artifact,reviews.prepare(database(artifact),'https://example.com'))
            fetch.assert_not_called()

    def lead(self):
        return {'pk':'LEAD#general#123','business_id':'general','answers':{'contact_email':'owner@example.com','business_url':'https://example.com'}}

    def artifact(self):
        return {'pk':'REVIEW#1','source_url':'https://example.com/','scope':'Homepage check','recommendations':['Review facts <before> publishing'],'llms_txt':'# Example\n'}

    def test_email_attachment_instructions_cta_and_escaping(self):
        payload=reviews.email_payload(self.lead(),self.artifact())
        self.assertEqual(b'# Example\n',base64.b64decode(payload['attachments'][0]['content']))
        self.assertEqual('llms.txt',payload['attachments'][0]['filename'])
        self.assertIn('https://example.com/llms.txt',payload['text'])
        self.assertIn('Your free website review is ready!',payload['html'])
        self.assertIn('Was anything about this review confusing or not useful?', payload['text'])
        self.assertIn("What's one task you're trying to get done", payload['text'])
        self.assertIn("It doesn't even have to involve AI.", payload['text'])
        self.assertIn("You can reply to just one question.", payload['text'])
        self.assertIn('before agreeing on any paid work', payload['text'])
        self.assertIn('Reply with feedback', payload['html'])
        self.assertIn('subject=Feedback+on+my+free+Welvia+review', payload['html'])
        self.assertIn('&lt;before&gt;',payload['html'])
        self.assertIn('does not enable bookings',payload['text'])
        self.assertEqual('owner@example.com', payload['to'][0])
        self.assertEqual('natemitchcook@gmail.com', payload['reply_to'])

    def test_same_free_review_email_for_general_and_personalized_prospects(self):
        general = self.lead()
        personal = {'pk':'LEAD#avalon#456', 'business_id':'avalon',
                    'answers':{'contact_email':'another@example.com'}}
        a = reviews.email_payload(general, self.artifact())
        b = reviews.email_payload(personal, self.artifact())
        self.assertEqual(a['subject'], b['subject'])
        self.assertEqual(a['text'], b['text'])
        self.assertEqual(a['html'], b['html'])
        self.assertEqual(a['attachments'], b['attachments'])
        self.assertEqual(['owner@example.com'], a['to'])
        self.assertEqual(['another@example.com'], b['to'])

    def test_acquisition_reaches_out_with_founder_story_and_open_question(self):
        business={'id':'example','name':'Example Local Shop','campaign':{'benefits':[]}}
        draft=reviews.acquisition_payload(business)
        self.assertIn('grew up around my family', draft['text'])
        self.assertIn('what is the main thing you are trying to improve', draft['text'])
        self.assertIn('Reply and tell me', draft['html'])
        self.assertIn('Nate\nFounder, Welvia', draft['text'])

    @patch.dict(os.environ,{'RESEND_API_KEY':'test-only'})
    def test_send_records_acceptance_and_reuses_frozen_payload(self):
        lead=self.lead();lead.update(email_payload={'to':['owner@example.com'],'text':'frozen'},email_started_at=int(time.time()))
        db=database(lead)
        reply=MagicMock();reply.__enter__.return_value=io.StringIO('{"id":"email-123"}')
        with patch.object(reviews.urllib.request,'urlopen',return_value=reply) as send,patch.object(reviews,'prepare') as prepare:
            reviews.deliver(db,lead['pk'],MagicMock())
            request=send.call_args.args[0]
            self.assertEqual(lead['email_payload'],json.loads(request.data))
            self.assertEqual('WelviaReviews/1.0',request.get_header('User-agent'))
            self.assertEqual('review-'+reviews.digest(lead['pk']),request.get_header('Idempotency-key'))
            prepare.assert_not_called()
        self.assertTrue(any(c.kwargs.get('ExpressionAttributeValues',{}).get(':s')=='Accepted by Resend' for c in db.update_item.call_args_list))

    def test_duplicate_accepted_job_does_not_send(self):
        lead=self.lead();lead['email_status']='Accepted by Resend'
        with patch.object(reviews.urllib.request,'urlopen') as send:
            reviews.deliver(database(lead),lead['pk'],MagicMock());send.assert_not_called()

    @patch.dict(os.environ,{'RESEND_API_KEY':'test-only'})
    def test_transient_retries_permanent_failure_does_not(self):
        for code in [429,503,422]:
            lead=self.lead();lead.update(email_payload={'text':'frozen'},email_started_at=int(time.time()))
            db=database(lead)
            with patch.object(reviews.urllib.request,'urlopen',side_effect=urllib.error.HTTPError('https://api.resend.com',code,'test',{},None)):
                if code==422: reviews.deliver(db,lead['pk'],MagicMock())
                else:
                    with self.assertRaises(RuntimeError): reviews.deliver(db,lead['pk'],MagicMock())
            expected='Failed' if code==422 else 'Retrying'
            self.assertTrue(any(c.kwargs.get('ExpressionAttributeValues',{}).get(':s')==expected for c in db.update_item.call_args_list))

    def test_expired_retry_window_does_not_send(self):
        lead=self.lead();lead.update(email_payload={'text':'frozen'},email_started_at=int(time.time())-86400)
        with patch.object(reviews.urllib.request,'urlopen') as send:
            reviews.deliver(database(lead),lead['pk'],MagicMock());send.assert_not_called()

    def test_manual_review_when_crawl_fails(self):
        lead=self.lead();db=database(lead)
        with patch.object(reviews,'prepare',side_effect=ValueError('blocked')),patch.object(reviews.urllib.request,'urlopen') as send:
            reviews.deliver(db,lead['pk'],MagicMock());send.assert_not_called()
        self.assertTrue(any(c.kwargs.get('ExpressionAttributeValues',{}).get(':s')=='Needs manual review' for c in db.update_item.call_args_list))

    def test_queue_contains_only_private_record_reference(self):
        lead=self.lead()
        with patch.dict(os.environ,{'REVIEW_QUEUE_URL':'queue'}),patch.object(reviews.boto3,'client') as client:
            self.assertEqual('Queued',reviews.enqueue(database(),lead))
            self.assertEqual({'lead_key':lead['pk']},json.loads(client.return_value.send_message.call_args.kwargs['MessageBody']))

class ResearchStarters(unittest.TestCase):
    def db(self, cached=None):
        db=database()
        records={
            'PROSPECT#example':{'fields':{'business_name':'Example Catering','website_url':'https://example.com','category':'Catering','city':'Albany','state':'NY','contact_email':'private@example.com','notes':'PRIVATE NOTES','source_urls':'https://example.com/menu; https://unrelated.example/private'}},
            'BUSINESS#example':{'owner_answers':{'password':'PRIVATE PASSWORD'},'sources':[{'url':'https://example.com/contact'}]}
        }
        if cached: records['REVIEW#'+reviews.digest('https://example.com/')]=cached
        db.get_item.side_effect=lambda **kw: {'Item':records[kw['Key']['pk']]} if kw['Key']['pk'] in records else {}
        return db

    def test_blocked_site_has_honest_research_starter_without_private_fields(self):
        db=self.db()
        with patch.object(reviews,'prepare',side_effect=ValueError('blocked')):
            artifact=reviews.prepare_business(db,'example')
        self.assertEqual('public_research',artifact['preparation_mode'])
        self.assertIn('Example Catering',artifact['llms_txt'])
        self.assertIn('Albany, NY',artifact['llms_txt'])
        self.assertIn('https://example.com/menu',artifact['llms_txt'])
        self.assertIn('prior public business research',artifact['scope'])
        self.assertIn('could not complete',artifact['scope'])
        self.assertNotIn('PRIVATE',json.dumps(artifact))
        self.assertNotIn('private@example.com',json.dumps(artifact))
        self.assertNotIn('unrelated.example',json.dumps(artifact))
        preparation=db.put_item.call_args.kwargs['Item']
        self.assertEqual('PREPARATION#example',preparation['pk'])
        self.assertEqual(artifact['pk'],preparation['review_key'])
        self.assertEqual('Ready',preparation['state'])

    def test_saved_file_delivers_without_recrawling_even_when_old(self):
        artifact={'pk':'REVIEW#'+reviews.digest('https://example.com/'),'name':'Example','llms_txt':'# Example','version':'v1','prepared_at':int(time.time())-40*86400}
        with patch.object(reviews,'prepare') as crawl:
            result=reviews.prepare_business(self.db(artifact),'example')
            crawl.assert_not_called()
        self.assertEqual(artifact,result)
        self.assertFalse(reviews.usable(artifact))
        self.assertTrue(reviews.usable(artifact,fresh=False))

    def test_missing_business_does_not_get_a_fabricated_file(self):
        with self.assertRaises(ValueError): reviews.prepare_business(self.db(),'missing')

    def test_explicit_refresh_can_upgrade_research_file(self):
        cached={'pk':'REVIEW#'+reviews.digest('https://example.com/'),'name':'Example','version':'v1','prepared_at':int(time.time()),'preparation_mode':'public_research'}
        live=dict(cached,llms_txt='# Live Example',version='v2')
        with patch.object(reviews,'prepare',return_value=live) as crawl:
            result=reviews.prepare_business(self.db(cached),'example',refresh=True)
        crawl.assert_called_once()
        self.assertEqual('homepage',result['preparation_mode'])

    def test_fictional_demo_is_excluded(self):
        db=database({'is_demo':True})
        with self.assertRaises(ValueError): reviews.business_identity(db,'demo')
