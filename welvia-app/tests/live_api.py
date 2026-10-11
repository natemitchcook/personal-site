import json,uuid,urllib.request,urllib.error
from datetime import datetime,timedelta
BASE='https://qewoua8c3m.execute-api.us-east-1.amazonaws.com'
results=[]
def call(path,data=None):
 req=urllib.request.Request(BASE+path,data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json'},method='POST' if data is not None else 'GET')
 try:
  with urllib.request.urlopen(req,timeout=30) as r:return r.status,json.load(r)
 except urllib.error.HTTPError as e:return e.code,json.load(e)
def check(name,status,expected):
 assert status==expected,(name,status,expected);results.append(name)
root='/api/businesses/test-kitchen'
s,b=call(root);check('approved test facts',s,200);assert b['is_demo'] and 'owner_answers' not in b
s,b=call(root+'/qa',{'question':'Where do you deliver?'});check('grounded answer',s,200);assert '92870' in b['answer']
s,b=call(root+'/qa',{'question':'What is your CEO net worth?'});check('unknown answer fallback',s,200);assert 'not in the approved' in b['answer']
s,b=call('/api/businesses/does-not-exist');check('unknown business',s,404)
s,b=call('/api/businesses/avalon/onboarding',{});check('real business invite protection',s,403)
s,b=call(root+'/requests',{});check('missing fields',s,422);assert 'recipient' in b['fields']
d={'submission_id':str(uuid.uuid4()),'food':'Bagel breakfast box','quantity':12,'fulfillment':'delivery','address':'TEST ONLY — no delivery','city':'Demo City','state':'CA','zip':'92870','date':(datetime.now()+timedelta(days=7)).strftime('%Y-%m-%d'),'time':'10:30','timezone':'America/Los_Angeles','recipient':'Synthetic Recipient','requester':'Synthetic Tester','phone':'TEST ONLY','confirm':True}
s,b=call(root+'/requests',{**d,'zip':'10024'});check('delivery rule',s,422)
s,b=call(root+'/requests',{**d,'quantity':2});check('minimum rule',s,422)
s,b=call(root+'/requests',{**d,'confirm':False});check('customer approval',s,422)
s,b=call(root+'/requests',d);check('persistent request',s,201);assert 'not an accepted' in b['status'];receipt=b
s,b=call(root+'/requests',d);check('duplicate prevention',s,200);assert b['duplicate'] and b['reference']==receipt['reference']
s,b=call(root+'/requests',{**d,'quantity':15});check('idempotency conflict',s,409)
s,b=call(root+'/receipts',{'receipt_token':receipt['receipt_token']});check('receipt lookup',s,200)
s,b=call(root+'/receipts',{'receipt_token':'wrong'});check('receipt isolation',s,404)
o={'submission_id':str(uuid.uuid4()),'contact_name':'Synthetic Owner','contact_email':'owner@example.com','services':'Catering inquiries','request_route':'email','request_destination':'test@example.com','website_help':'provider','approval':True,'lead_time':'48 hours','delivery_area':'92870 and 92886','minimum':'12 portions','rules':'TEST ONLY'}
s,b=call(root+'/onboarding',o);check('onboarding database write',s,201);assert b['status']=='Needs review'
s,b=call(root);check('private answers excluded',s,200);assert 'owner_answers' not in b
print(json.dumps({'passed':len(results),'checks':results,'request_reference':receipt['reference'],'onboarding_reference':'Verified in database'},indent=2))
