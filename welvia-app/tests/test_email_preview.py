import os, sys, json, time, unittest
from pathlib import Path
from unittest.mock import patch, MagicMock
os.environ['TABLE_NAME']='test'
os.environ['SITE_URL']='https://welvia.natemitchcook.com'
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
with patch('boto3.resource'): import index as app
import reviews

class PreviewTests(unittest.TestCase):
    def event(self,path='/api/email-preview',method='GET',token='x'*43):
        return {'rawPath':path,'requestContext':{'http':{'method':method}},'headers':{'authorization':'Bearer '+token}}
    def test_no_access_denies_without_data(self):
        with patch.object(app,'db') as db:
            r=app.handler(self.event(token=''),None)
            self.assertEqual(403,r['statusCode']);db.get_item.assert_not_called()
    def test_expired_or_wrong_scope_denied(self):
        for item in [{'scope':'email-preview','expires':0},{'scope':'owner','expires':time.time()+900}]:
            with patch.object(app,'db') as db:
                db.get_item.return_value={'Item':item}
                self.assertEqual(403,app.handler(self.event(),None)['statusCode'])
    def test_business_invitation_not_preview_credential(self):
        with patch.object(app,'db') as db:
            db.get_item.return_value={'Item':{'business_id':'avalon','expires':time.time()+900}}
            self.assertEqual(403,app.handler(self.event(),None)['statusCode'])
            self.assertTrue(db.get_item.call_args.kwargs['Key']['pk'].startswith('PREVIEW#'))
    def test_read_only_catalog(self):
        with patch.object(app,'db') as db,patch.object(app,'preview_access',return_value=True):
            db.get_item.return_value={'Item':{'businesses':[{'id':'a','name':'A'}]}}
            r=app.handler(self.event(),None)
            self.assertEqual([{'id':'a','name':'A'}],json.loads(r['body'])['businesses'])
            self.assertEqual('no-store',r['headers']['Cache-Control'])
            self.assertEqual(405,app.handler(self.event(method='POST'),None)['statusCode'])
            db.put_item.assert_not_called();db.update_item.assert_not_called()
    def test_http_body_cannot_create_invite(self):
        with patch.object(app,'db') as db:
            event=self.event(method='POST',token='');event['body']=json.dumps({'admin_action':'preview_invite'})
            self.assertEqual(403,app.handler(event,None)['statusCode']);db.put_item.assert_not_called()
    def test_preview_matches_delivery_and_never_sends(self):
        artifact={'pk':'REVIEW#a','name':'Example','url':'https://example.com/','source_url':'https://example.com/',
                  'llms_txt':'# Example\n','scope':'Homepage only.','recommendations':['Check facts.'],'prepared_at':int(time.time()),'version':'v1'}
        business={'id':'sample','name':'Sample <script>bad</script>','campaign':{}}
        with patch.object(app,'db') as db,patch.object(app,'preview_access',return_value=True),patch.object(app,'get_business',return_value=business),patch.object(reviews,'business_identity',return_value={'url':artifact['url']}),patch.object(reviews,'usable',return_value=True),patch.object(reviews,'enqueue') as enqueue,patch.object(reviews,'prepare_business') as prepare,patch.object(reviews.urllib.request,'urlopen') as network:
            db.get_item.side_effect=[{'Item':{'fields':{'contact_email':'public@example.com','private_note':'SECRET'}}},{'Item':artifact}]
            r=app.handler(self.event('/api/email-preview/sample'),None);data=json.loads(r['body'])
            self.assertEqual(reviews.email_payload({'answers':{'contact_email':'requester@example.com'}},artifact),data['review'])
            self.assertNotIn('SECRET',r['body']);self.assertNotIn('<script>bad',data['outreach']['html']);self.assertNotIn('{{{',data['outreach']['html'])
            self.assertEqual('# Example\n',data['file']['text'])
            db.put_item.assert_not_called();db.update_item.assert_not_called();enqueue.assert_not_called();prepare.assert_not_called();network.assert_not_called()
    def test_missing_artifact_is_not_generated(self):
        with patch.object(app,'db') as db,patch.object(app,'preview_access',return_value=True),patch.object(app,'get_business',return_value={'id':'a','name':'A'}),patch.object(reviews,'business_identity',return_value={'url':'https://example.com/'}),patch.object(reviews,'prepare_business') as prepare:
            db.get_item.return_value={}
            data=json.loads(app.handler(self.event('/api/email-preview/a'),None)['body'])
            self.assertIsNone(data['review']);self.assertIsNone(data['file']);prepare.assert_not_called()
    def test_new_invite_only_has_preview_scope(self):
        with patch.object(app,'db') as db:
            r=app.handler({'admin_action':'preview_invite'},None)
            self.assertIn('/email-preview.html#access=',r['url'])
            self.assertEqual('email-preview',db.put_item.call_args.kwargs['Item']['scope'])
            self.assertNotIn('business_id',db.put_item.call_args.kwargs['Item'])
