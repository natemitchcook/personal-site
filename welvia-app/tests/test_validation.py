import os, sys, unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch, MagicMock
os.environ['TABLE_NAME']='test';os.environ['SITE_URL']='https://welvia.natemitchcook.com'
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
with patch('boto3.resource'):import index as app
class Validation(unittest.TestCase):
 def setUp(self):
    self.data={'food':'Bagel breakfast box','quantity':12,'fulfillment':'delivery','address':'TEST ADDRESS','city':'Test city','state':'CA','zip':'92870','date':(datetime.now()+timedelta(days=7)).strftime('%Y-%m-%d'),'time':'10:30','timezone':'America/Los_Angeles','recipient':'Test Recipient','requester':'Test Person','phone':'TEST ONLY','confirm':True}
 def test_complete(self):self.assertEqual({},app.validate('requests',self.data))
 def test_missing(self):
    for key in ['food','recipient','address','time','phone']:
        with self.subTest(key=key):
            d=dict(self.data);d.pop(key);self.assertIn(key,app.validate('requests',d))
 def test_area(self):
    self.data['zip']='10024';self.assertIn('zip',app.validate('requests',self.data))
 def test_minimum(self):
    self.data['quantity']=3;self.assertIn('quantity',app.validate('requests',self.data))
 def test_notice(self):
    self.data['date']=datetime.now().strftime('%Y-%m-%d');self.assertIn('date',app.validate('requests',self.data))
 def test_time(self):
    self.data['time']='22:00';self.assertIn('time',app.validate('requests',self.data))
 def test_timezone(self):
    self.data['timezone']='America/New_York';self.assertIn('timezone',app.validate('requests',self.data))
 def test_confirmation(self):
    self.data['confirm']=False;self.assertIn('confirm',app.validate('requests',self.data))
 def test_menu(self):
    self.data['food']='Pizza';self.assertIn('food',app.validate('requests',self.data))
 def test_onboarding_required(self):self.assertIn('contact_email',app.validate('onboarding',{}))
 def test_onboarding_valid(self):self.assertEqual({},app.validate('onboarding',{'contact_name':'Test','contact_email':'test@example.com','services':'Catering','request_route':'email','request_destination':'test@example.com','website_help':'me','approval':True}))
 def test_unknown_business(self):
    with patch.object(app,'get_business',return_value=None):
        r=app.handler({'rawPath':'/api/businesses/unknown','requestContext':{'http':{'method':'GET'}}},None);self.assertEqual(404,r['statusCode'])
 def test_protected_business(self):
    with patch.object(app,'get_business',return_value={'id':'avalon','is_demo':False}),patch.object(app,'limit',return_value=True):
        r=app.handler({'rawPath':'/api/businesses/avalon/onboarding','requestContext':{'http':{'method':'POST'}},'body':'{}'},None);self.assertEqual(403,r['statusCode'])
 def test_invalid_body(self):
    with patch.object(app,'get_business',return_value={'id':'test-kitchen','is_demo':True}),patch.object(app,'auth',return_value={'business_id':'test-kitchen'}),patch.object(app,'limit',return_value=True):
        r=app.handler({'rawPath':'/api/businesses/test-kitchen/requests','requestContext':{'http':{'method':'POST'}},'body':'[]'},None);self.assertEqual(400,r['statusCode'])
 def test_draft_does_not_publish(self):
    mock=MagicMock()
    with patch.object(app,'db',mock):app.save_owner_answers('avalon',{'services':'New claim'},[], 'TEST', '2026-10-11')
    self.assertNotIn('services',mock.update_item.call_args.kwargs['UpdateExpression'])

 def test_private_draft_denied(self):
    with patch.object(app,'get_business',return_value={'id':'247foru','public_enabled':False}),patch.object(app,'auth',return_value=None):
        r=app.handler({'rawPath':'/api/businesses/247foru','requestContext':{'http':{'method':'GET'}}},None)
        self.assertEqual(403,r['statusCode'])
 def test_public_projection_excludes_private_fields(self):
    b={'id':'avalon','campaign':{'business_name':'Avalon'},'contact_email':'secret@example.com','email_draft':'private','owner_answers':{'secret':'value'},'fields':{'do_not_contact':True}}
    with patch.object(app,'get_business',return_value=b),patch.object(app,'auth',return_value={'business_id':'avalon'}):
        r=app.handler({'rawPath':'/api/businesses/avalon','requestContext':{'http':{'method':'GET'}}},None)
        self.assertEqual(200,r['statusCode']);self.assertNotIn('secret',r['body']);self.assertNotIn('email_draft',r['body']);self.assertNotIn('do_not_contact',r['body'])
 def test_cross_business_invite_rejected(self):
    with patch.object(app,'db') as db:
        db.get_item.return_value={'Item':{'business_id':'other','expires':9999999999}}
        self.assertIsNone(app.auth({'headers':{'authorization':'Bearer '+'x'*43}},'avalon'))
