import os,json,sys,unittest
from pathlib import Path
from unittest.mock import patch,MagicMock
from botocore.exceptions import ClientError
os.environ.update(EVAL_TABLE='eval-test',BUSINESS_TABLE='business-test',RESULT_BUCKET='private-test',WORKER_NAME='worker-test')
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'evaluations'))
with patch('boto3.resource'),patch('boto3.client'):import service as app
FACTS={'menu':['Bagel breakfast box','Sandwich lunch box'],'minimum_portions':12,'maximum_portions':500,'notice_hours':48,'delivery_zips':['92870','92886']}
PROFILE={'revision':1,'facts':FACTS,'corrections':[],'baseline':{'/':{'links':['/catering','/faq']},'/catering':{'text':'All existing menu details'},'/faq':{'text':'48 hours'}}}
class Evals(unittest.TestCase):
 def event(self,route='',data=None,bid='test-kitchen'):
  return {'rawPath':'/api/businesses/'+bid+'/evaluations'+('/'+route if route else ''),'headers':{'authorization':'Bearer '+'x'*43},'requestContext':{'http':{'method':'POST' if data is not None else 'GET'}},'body':json.dumps(data or {})}
 def test_invite_bound_to_business_and_expiry(self):
  with patch.object(app,'BUSINESS') as b:
   for item in [{'business_id':'other','expires':9999999999},{'business_id':'test-kitchen','expires':1}]:
    b.get_item.return_value={'Item':item};self.assertFalse(app.authorize(self.event(),'test-kitchen'))
 def test_api_denies_before_any_report_reads(self):
  with patch.object(app,'authorize',return_value=False),patch.object(app,'get') as get:
   self.assertEqual(403,app.handler(self.event(),None)['statusCode']);get.assert_not_called()
 def test_http_body_cannot_invoke_worker(self):
  with patch.object(app,'authorize',return_value=False),patch.object(app,'run_worker') as worker:
   app.handler(self.event('runs',{'worker':True,'business_id':'other'}),None);worker.assert_not_called()
 def test_original_sources_preserved(self):
  docs=app.sources(PROFILE)
  self.assertEqual(PROFILE['baseline'],docs['without']);self.assertNotIn('/llms.txt',PROFILE['baseline']['/']['links']);self.assertIn('/llms.txt',docs['with']['/']['links'])
 def test_complete_request_and_rejections(self):
  request=app.cases()[8]['request'];self.assertEqual([],app.validate_request(request,FACTS))
  for change in [{'zip':'10023'},{'confirm':False},{'quantity':True},{'quantity':1},{'food':'Pizza'},{'recipient':''},{'time':'17:00'}]:self.assertTrue(app.validate_request({**request,**change},FACTS))
 def test_profile_revision_conflict(self):
  with patch.object(app,'authorize',return_value=True),patch.object(app,'get',return_value=PROFILE),patch.object(app,'TABLE') as t:
   t.update_item.return_value={'Attributes':{'requests':1}}
   r=app.handler(self.event('profile',{'revision':0,'confirm':True}),None);self.assertEqual(409,r['statusCode']);t.put_item.assert_not_called()
 def test_unknown_business_cannot_be_seeded(self):
  with patch.object(app,'BUSINESS') as b:
   b.get_item.return_value={'Item':{'is_demo':True}}
   with self.assertRaises(ValueError):app.seed_profile('avalon')
 def test_report_html_escapes_model_content(self):
  report={'completed_at':'today','model':'test','profile_revision':1,'method':'test','cases':[{'title':'<script>','prompt':'a','without':{'answer':'<script>alert(1)</script>'},'with':{'answer':'ok'}}]}
  output=app.report_html(report);self.assertNotIn('<script>',output);self.assertIn('&lt;script&gt;',output)
 def test_run_report_lookup_is_tenant_scoped(self):
  calls=[]
  def lookup(bid,sk):calls.append((bid,sk));return PROFILE if sk=='PROFILE' else None
  with patch.object(app,'authorize',return_value=True),patch.object(app,'get',side_effect=lookup),patch.object(app,'load_json') as s3:
   r=app.handler(self.event('runs/20261012T100000-abcdef12'),None);self.assertEqual(404,r['statusCode']);s3.assert_not_called();self.assertIn(('test-kitchen','RUN#20261012T100000-abcdef12'),calls)
 def test_feedback_does_not_mutate_profile(self):
  def lookup(bid,sk):return PROFILE if sk=='PROFILE' else {'result_key':'private/result'}
  t=MagicMock();t.update_item.return_value={'Attributes':{'requests':1}};t.meta.client.exceptions.ConditionalCheckFailedException=type('ConditionalFailure',(Exception,),{})
  with patch.object(app,'authorize',return_value=True),patch.object(app,'get',side_effect=lookup),patch.object(app,'load_json',return_value={'profile_revision':1,'cases':[{'id':'menu'}]}),patch.object(app,'TABLE',t):
   r=app.handler(self.event('feedback',{'submission_id':'12345678-1234-1234-1234-123456789abc','run_id':'r','case_id':'menu','kind':'correct','text':'Please update menu.'}),None)
   self.assertEqual(201,r['statusCode']);self.assertEqual('Needs review',t.put_item.call_args.kwargs['Item']['status']);self.assertNotIn('PROFILE',str(t.update_item.call_args))
 def test_summary_counts_failures_honestly(self):
  s=app.summary([{'without':{'passed':True},'with':{'error':'Timeout','passed':False}}]);self.assertEqual(0,s['with']['passed']);self.assertEqual(1,s['with']['errors'])
 def test_rubric_tracks_approved_notice(self):
  p={**PROFILE,'facts':{**FACTS,'notice_hours':72}};self.assertEqual(['72'],app.cases(p)[1]['patterns'])
if __name__=='__main__':unittest.main()
