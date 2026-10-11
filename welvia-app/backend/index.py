import os, json, re, uuid, hashlib, secrets, time, logging
from datetime import datetime, timezone
from decimal import Decimal
import boto3
from boto3.dynamodb.conditions import Attr
from botocore.exceptions import ClientError

db = boto3.resource('dynamodb').Table(os.environ['TABLE_NAME'])
LOG = logging.getLogger(__name__)
PUBLIC_FIELDS = ['id','name','city','state','category','site','is_demo','headline','description','benefits','services','rules','sources','faq','ordering_url']
REQUIRED_ONBOARDING = ['contact_name','contact_email','services','request_route','request_destination','website_help','approval']
REQUIRED_REQUEST = ['food','quantity','fulfillment','date','time','timezone','recipient','requester','phone','confirm']

def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()

def response(code, data):
    return {'statusCode':code,'headers':{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'},'body':json.dumps(data,default=lambda x:float(x) if isinstance(x,Decimal) else str(x))}

def get_business(bid):
    return db.get_item(Key={'pk':'BUSINESS#'+bid},ConsistentRead=True).get('Item')

def auth(event, bid):
    token = (event.get('headers',{}).get('authorization') or event.get('headers',{}).get('Authorization') or '').removeprefix('Bearer ')
    if len(token)<30:
        return None
    item=db.get_item(Key={'pk':'INVITE#'+digest(token)},ConsistentRead=True).get('Item')
    return item if item and item.get('business_id')==bid and item.get('expires',0)>time.time() else None

def validate(kind,data):
    errors={k:'Please answer this question.' for k in (REQUIRED_ONBOARDING if kind=='onboarding' else REQUIRED_REQUEST) if not data.get(k)}
    if kind=='onboarding':
        if data.get('contact_email') and not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',str(data['contact_email'])):
            errors['contact_email']='Enter a valid email address.'
        if data.get('request_route') not in ['email','phone','form']:
            errors['request_route']='Choose email, phone or existing form.'
        if data.get('website_help') not in ['me','team','provider','unsure']:
            errors['website_help']='Choose who can help.'
        if data.get('approval') is not True:
            errors['approval']='Confirm that you are authorized to submit these answers.'
    else:
        if data.get('fulfillment') not in ['pickup','delivery']:
            errors['fulfillment']='Choose pickup or delivery.'
        if data.get('fulfillment')=='delivery':
            for k in ['address','city','state','zip']:
                if not data.get(k): errors[k]='A complete delivery address is required.'
        if data.get('timezone')!='America/Los_Angeles': errors['timezone']='The test kitchen uses America/Los_Angeles.'
        try:
            qty=int(data.get('quantity',0))
            if not 12<=qty<=500: errors['quantity']='The fictional kitchen requires 12 to 500 portions.'
        except (TypeError,ValueError): errors['quantity']='Enter a whole-number quantity.'
        try:
            from zoneinfo import ZoneInfo
            arrival=datetime.fromisoformat(str(data.get('date',''))+'T'+str(data.get('time',''))).replace(tzinfo=ZoneInfo('America/Los_Angeles'))
            if not 8 <= arrival.hour < 17: errors['time']='The fictional kitchen handles requests from 8 AM to 5 PM Pacific.'
            if (arrival-datetime.now(timezone.utc)).total_seconds()<48*3600:
                errors['date']='The fictional kitchen requires at least 48 hours notice.'
        except (ValueError,TypeError): errors['date']='Enter a valid date and time.'
        if data.get('confirm') is not True: errors['confirm']='Review and approve this test request.'
        if data.get('fulfillment')=='delivery' and str(data.get('zip','')) not in ['92870','92886']:
            errors['zip']='The fictional delivery area is ZIP 92870 or 92886.'
        if data.get('food') not in ['Bagel breakfast box','Sandwich lunch box']:
            errors['food']='Choose a listed test menu item.'
    return errors

def limit(event):
    ip=event.get('requestContext',{}).get('http',{}).get('sourceIp','unknown')
    # Minute buckets expire; only a hash of the source IP is stored.
    key='RATE#'+digest(ip)+'#'+str(int(time.time())//60)
    result=db.update_item(Key={'pk':key},UpdateExpression='SET expires = :e ADD requests :one',ExpressionAttributeValues={':e':int(time.time())+180,':one':1},ReturnValues='UPDATED_NEW')
    return int(result['Attributes']['requests'])<=20

def save_owner_answers(bid,data,checklist,rid,created_at):
    try:
        db.update_item(Key={'pk':'BUSINESS#'+bid},UpdateExpression='SET owner_answers = :a, onboarding_status = :s, implementation_checklist = :c, last_submission = :r, last_answer_at = :t',ExpressionAttributeValues={':a':data,':s':'Needs review',':c':checklist,':r':rid,':t':created_at},ConditionExpression=Attr('last_answer_at').not_exists() | Attr('last_answer_at').lte(created_at))
    except db.meta.client.exceptions.ConditionalCheckFailedException:
        pass

def handler(event,context):
    if event.get('admin_action')=='invite':
        bid=event.get('business_id','')
        if not get_business(bid): return {'error':'unknown business'}
        token=secrets.token_urlsafe(32)
        db.put_item(Item={'pk':'INVITE#'+digest(token),'business_id':bid,'expires':int(time.time())+7*86400})
        return {'url':os.environ['SITE_URL']+'/?business='+bid+'#invite='+token,'expires_in_days':7}
    if event.get('admin_action')=='review':
        bid=event.get('business_id','')
        b=get_business(bid)
        return {'business':b} if b else {'error':'unknown business'}
    try:
        method=event.get('requestContext',{}).get('http',{}).get('method','GET')
        path=event.get('rawPath','').rstrip('/')
        if path=='/api/health':return response(200,{'status':'ok','mode':'pilot','version':'1.0.0'})
        match=re.fullmatch(r'/api/businesses/([a-z0-9-]{1,80})(?:/(onboarding|requests|qa|receipts))?',path)
        if not match:return response(404,{'error':'Not found'})
        bid,kind=match.groups()
        business=get_business(bid)
        if not business:return response(404,{'error':'Unknown business'})
        if method=='GET' and not kind:
            public={k:business.get(k) for k in PUBLIC_FIELDS}
            public['can_submit']=bool(business.get('is_demo') or auth(event,bid))
            return response(200,public)
        if method!='POST':return response(405,{'error':'Method not allowed'})
        if not limit(event):return response(429,{'error':'Too many requests. Please wait a minute.'})
        raw=event.get('body') or '{}'
        if len(raw)>16000:return response(413,{'error':'Submission too large'})
        data=json.loads(raw,parse_float=Decimal)
        if not isinstance(data,dict):return response(400,{'error':'Expected an object'})
        if any(isinstance(v,str) and len(v)>2000 for v in data.values()):return response(400,{'error':'Answer is too long'})
        if data.get('website'):return response(400,{'error':'Invalid submission'})
        if kind=='qa':
            question=str(data.get('question','')).lower()[:500]
            faqs=business.get('faq',[])
            ranked=sorted(faqs,key=lambda f:sum(w in question for w in f.get('keywords',[])),reverse=True)
            found=ranked and any(w in question for w in ranked[0].get('keywords',[]))
            return response(200,{'answer':ranked[0]['answer'] if found else 'That detail is not in the approved business facts. Ask the business to confirm; do not assume it.','sources':business.get('sources',[]),'mode':'approved_facts_lookup'})
        if kind=='receipts':
            token=str(data.get('receipt_token',''))
            item=db.get_item(Key={'pk':'RECEIPT#'+digest(token)},ConsistentRead=True).get('Item')
            if not item or item.get('business_id')!=bid:return response(404,{'error':'Receipt not found'})
            return response(200,{k:item.get(k) for k in ['reference','status','kind','is_demo','created_at','notification','checklist']})
        if kind not in ['onboarding','requests']:return response(404,{'error':'Not found'})
        if not business.get('is_demo') and not auth(event,bid):return response(403,{'error':'Use your private invitation link to submit.'})
        if kind=='requests' and not business.get('is_demo'):return response(403,{'error':'Live customer requests are not enabled for this business.'})
        errors=validate(kind,data)
        if errors:return response(422,{'error':'Please complete the highlighted details.','fields':errors})
        idem=str(data.pop('submission_id',''))
        if not re.fullmatch(r'[a-f0-9-]{36}',idem):return response(400,{'error':'A valid submission ID is required.'})
        rid='WEL-'+idem[:8].upper()
        token=digest(bid+':'+kind+':'+idem) # random UUID is the bearer capability; returned only to submitter
        checklist=['Review owner answers','Confirm website editing route','Approve implementation scope'] if kind=='onboarding' else ['Staff review availability and price','No food prepared or payment taken']
        if kind=='onboarding':
            for k in ['lead_time','delivery_area','minimum','rules']:
                if not data.get(k) or data.get(k)=='Not sure':checklist.append('Confirm '+k.replace('_',' '))
        now=datetime.now(timezone.utc).isoformat()
        item={'pk':'RECEIPT#'+digest(token),'reference':rid,'business_id':bid,'kind':kind,'answers':data,'status':'Needs review' if kind=='onboarding' else 'Test request received — not an accepted order','is_demo':bool(business.get('is_demo')),'created_at':now,'notification':'Stored in database; external notifications disabled for this pilot','checklist':checklist}
        try:
            db.put_item(Item=item,ConditionExpression=Attr('pk').not_exists())
        except db.meta.client.exceptions.ConditionalCheckFailedException:
            old=db.get_item(Key={'pk':item['pk']},ConsistentRead=True)['Item']
            if old.get('answers')!=data:return response(409,{'error':'This submission ID was already used with different answers.'})
            if kind=='onboarding': save_owner_answers(bid,data,checklist,old['reference'],old['created_at'])
            return response(200,{'reference':old['reference'],'receipt_token':token,'duplicate':True,'status':old['status']})
        if kind=='onboarding':
            save_owner_answers(bid,data,checklist,rid,now)
        return response(201,{'reference':rid,'receipt_token':token,'status':item['status'],'checklist':checklist,'notification':item['notification']})
    except (ValueError,TypeError):return response(400,{'error':'Invalid request'})
    except ClientError:
        LOG.exception('AWS request failed')
        return response(503,{'error':'Could not save the request. Retry with the same submission ID.'})
