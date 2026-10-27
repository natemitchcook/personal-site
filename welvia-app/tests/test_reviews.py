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

    def test_cached_artifact_avoids_network(self):
        artifact={'prepared_at':int(time.time()),'llms_txt':'# Example'}
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
        self.assertIn('Ask Nate for help',payload['html'])
        self.assertIn('&lt;before&gt;',payload['html'])
        self.assertIn('does not enable bookings',payload['text'])

    @patch.dict(os.environ,{'RESEND_API_KEY':'test-only'})
    def test_send_records_acceptance_and_reuses_frozen_payload(self):
        lead=self.lead();lead.update(email_payload={'to':['owner@example.com'],'text':'frozen'},email_started_at=int(time.time()))
        db=database(lead)
        reply=MagicMock();reply.__enter__.return_value=io.StringIO('{"id":"email-123"}')
        with patch.object(reviews.urllib.request,'urlopen',return_value=reply) as send,patch.object(reviews,'prepare') as prepare:
            reviews.deliver(db,lead['pk'],MagicMock())
            request=send.call_args.args[0]
            self.assertEqual(lead['email_payload'],json.loads(request.data))
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
