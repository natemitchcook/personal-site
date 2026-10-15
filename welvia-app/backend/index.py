import os, json, re, uuid, hashlib, secrets, time, logging
import urllib.request, urllib.parse, urllib.error
from datetime import datetime, timezone
from decimal import Decimal
import boto3
from boto3.dynamodb.conditions import Attr
from botocore.exceptions import ClientError

db = boto3.resource('dynamodb').Table(os.environ['TABLE_NAME'])
LOG = logging.getLogger(__name__)
PUBLIC_FIELDS = ['campaign','id','name','city','state','category','is_demo','sources','faq','findings','reviewed_at']
REQUIRED_ONBOARDING = ['contact_name','contact_email','services','request_route','request_destination','website_help','approval']
REQUIRED_REQUEST = ['food','quantity','fulfillment','date','time','timezone','recipient','requester','phone','confirm']

def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()

def response(code, data):
    return {'statusCode':code,'headers':{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'},'body':json.dumps(data,default=lambda x:float(x) if isinstance(x,Decimal) else str(x))}

def get_business(bid):
    business = db.get_item(Key={'pk':'BUSINESS#'+bid},ConsistentRead=True).get('Item') or {}
    prospect = db.get_item(Key={'pk':'PROSPECT#'+bid},ConsistentRead=True).get('Item')
    page = db.get_item(Key={'pk':'PAGE#'+bid},ConsistentRead=True).get('Item')
    if prospect and page:
        p, c = prospect['fields'], page['fields']
        split = lambda value: [v.strip() for v in str(value or '').split(';') if v.strip()]
        campaign = {'slug':bid, 'business_name':p['business_name'], 'website':p['website_url'],
          'headline':c['headline'], 'intro':c['subheadline'], 'status':c.get('proposal_notice',''),
          'journey_heading':c['scenario_title'], 'pilot_heading':'Your next step. A focused first pilot.',
          'growth_intro':'Prepare your business information and request workflow for AI-assisted customers.',
          'growth_example':c['specific_observation'],
          'benefits':[{'title':c.get('benefit_'+str(i)+'_title',''),'description':c.get('benefit_'+str(i)+'_body','')} for i in range(1,4) if c.get('benefit_'+str(i)+'_title')],
          'scenarios':[{'title':c['scenario_title'],'prompt':c['customer_prompt'],'fields':split(c['required_fields']),'note':c['business_rules']}],
          'pilot_steps':split(c['pilot_steps']), 'cta_label':c['cta_label']}
        business.update({'id':bid,'name':p['business_name'],'city':p['city'],'state':p['state'],'category':p['category'], 'site':p['website_url'], 'campaign':campaign, 'public_enabled':bool(page.get('public_enabled') and c.get('content_approval')=='Approved')})
        business['reviewed_at']=p.get('last_verified','')
        urls=re.findall(r'https://[^\s;|]+',str(p.get('source_urls','')))
        business['sources']=[{'url':u,'label':'Research source'} for u in urls[:6]]
        business['findings']=[{'title':'Observed on your website','status':'Needs review','detail':c.get('specific_observation',''),'url':p['website_url']},
          {'title':'Your request workflow','status':'Needs review','detail':p.get('observed_workflow',c.get('business_rules','')),'url':p['website_url']},
          {'title':'End-to-end agent handoff','status':'Not tested','detail':'We will test the agreed action after you approve the facts and implementation scope.','url':''}]
    if business.get('campaign_override'):
        business['campaign']=business['campaign_override']
    return business or None

def public_proposal(business):
    """Marketing projection only. Owner answers, contact lists and receipts stay private."""
    public={k:business.get(k) for k in PUBLIC_FIELDS}
    if not public.get('findings'):
        public['findings']=[{'title':f.get('question','Business information'),'status':'Needs review','detail':f.get('answer',''),'url':next((s['url'] for s in business.get('sources',[]) if s.get('url','').startswith('https://')),'')} for f in business.get('faq',[])[:2]]
        public['findings'].append({'title':'End-to-end agent handoff','status':'Not tested','detail':'A proposed workflow, awaiting business confirmation and implementation testing.','url':''})
    public['pricing']={'setup_amount':25000,'regular_setup_amount':50000,'monthly_amount':5000,'annual_amount':47500,'currency':'USD'}
    return public

def save_interest(bid,data):
    """Unauthenticated leads never update verified owner answers or authorize work."""
    allowed={'contact_name','contact_email','business_url','message','submission_id','consent'}
    if set(data)-allowed:return response(400,{'error':'Unexpected fields'})
    if not all(isinstance(data.get(k),str) and data[k].strip() for k in ['contact_name','contact_email','submission_id']):
        return response(422,{'error':'Please enter your name and email.'})
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',data['contact_email']) or data.get('consent') is not True:
        return response(422,{'error':'Enter a valid email and agree to a reply about your plan.'})
    if not re.fullmatch(r'[a-f0-9-]{36}',data['submission_id']):return response(400,{'error':'Invalid submission ID'})
    if bid=='general':
        url=urllib.parse.urlparse(str(data.get('business_url','')))
        if url.scheme not in ['http','https'] or not url.hostname:return response(422,{'error':'Enter your business website, including https://.'})
    key='LEAD#'+bid+'#'+data['submission_id']
    item={'pk':key,'business_id':bid,'answers':data,'status':'Needs review','created_at':datetime.now(timezone.utc).isoformat(),'outreach_state':'Not sent'}
    try:db.put_item(Item=item,ConditionExpression=Attr('pk').not_exists())
    except db.meta.client.exceptions.ConditionalCheckFailedException:
        old=db.get_item(Key={'pk':key},ConsistentRead=True).get('Item',{})
        if old.get('answers')!=data:return response(409,{'error':'This submission ID has already been used.'})
    return response(201,{'reference':'WEL-'+data['submission_id'][:8].upper(),'status':'Needs review'})

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
        channel=data.get('proposal_update_channel','email')
        if channel not in ['email','text']:errors['proposal_update_channel']='Choose email or text message.'
        if channel=='text' and not re.fullmatch(r'[+0-9 ()-]{10,25}',str(data.get('contact_mobile',''))):errors['contact_mobile']='Enter a mobile number with country code.'
        if data.get('approval') is not True:
            errors['approval']='Confirm that you are authorized to submit these answers.'
    else:
        if data.get('fulfillment') not in ['pickup','delivery']:
            errors['fulfillment']='Choose pickup or delivery.'
        if data.get('fulfillment')=='delivery':
            for k in ['address','city','state','zip']:
                if not data.get(k): errors[k]='A complete delivery address is required.'
        if data.get('timezone')!='America/Los_Angeles': errors['timezone']='Our kitchen uses America/Los_Angeles.'
        try:
            qty=int(data.get('quantity',0))
            if not 12<=qty<=500: errors['quantity']='Our kitchen requires 12 to 500 portions.'
        except (TypeError,ValueError): errors['quantity']='Enter a whole-number quantity.'
        try:
            from zoneinfo import ZoneInfo
            arrival=datetime.fromisoformat(str(data.get('date',''))+'T'+str(data.get('time',''))).replace(tzinfo=ZoneInfo('America/Los_Angeles'))
            if not 8 <= arrival.hour < 17: errors['time']='Our kitchen handles requests from 8 AM to 5 PM Pacific.'
            if (arrival-datetime.now(timezone.utc)).total_seconds()<48*3600:
                errors['date']='Our kitchen requires at least 48 hours notice.'
        except (ValueError,TypeError): errors['date']='Enter a valid date and time.'
        if data.get('confirm') is not True: errors['confirm']='Review and approve this request.'
        if data.get('fulfillment')=='delivery' and str(data.get('zip','')) not in ['92870','92886']:
            errors['zip']='Our delivery area is ZIP 92870 or 92886.'
        if data.get('food') not in ['Bagel breakfast box','Sandwich lunch box']:
            errors['food']='Choose a listed menu item.'
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

def billing_offer(business, invitation):
    config=db.get_item(Key={'pk':'CONFIG#billing'},ConsistentRead=True).get('Item') or {}
    offer=business.get('offer',{})
    expires=min(int(offer.get('expires_at',invitation['expires'] if invitation else 0)),int(invitation['expires']) if invitation else 0)
    amounts_valid=all(isinstance(offer.get(k),(int,Decimal)) and offer[k]>=0 for k in ['setup_amount','monthly_amount']) and offer.get('monthly_amount',0)>0
    ready=bool(invitation and offer.get('expires_at') and expires-time.time()>=1800 and config.get('webhook_ready') is True and offer.get('approval')=='Approved' and config.get('enabled') is True and amounts_valid and config.get('setup_price_id') and config.get('monthly_price_id') and os.environ.get('STRIPE_SECRET_KEY'))
    public={k:offer[k] for k in ['setup_amount','monthly_amount','currency','regular_setup_amount','regular_monthly_amount'] if k in offer}
    public.update({'expires_at':expires,'ready':ready})
    return public,config

def stripe_call(method,path,params=None,idempotency_key=None):
    key=os.environ.get('STRIPE_SECRET_KEY','')
    if not key:raise ValueError('Stripe is not configured')
    headers={'Authorization':'Bearer '+key,'Content-Type':'application/x-www-form-urlencoded'}
    if idempotency_key:headers['Idempotency-Key']=idempotency_key
    request=urllib.request.Request('https://api.stripe.com/v1/'+path,method=method,headers=headers,data=urllib.parse.urlencode(params).encode() if params else None)
    with urllib.request.urlopen(request,timeout=10) as reply:return json.load(reply)

def checkout(bid,business,invitation):
    offer,config=billing_offer(business,invitation)
    if not offer['ready']:return response(409,{'error':'Your setup and monthly price need to be confirmed before checkout.'})
    # The client cannot choose prices, currency, redirects, or another business.
    for label,expected_type in [('setup','one_time'),('monthly','recurring')]:
        price=stripe_call('GET','prices/'+urllib.parse.quote(config[label+'_price_id'],safe=''))
        if price.get('unit_amount')!=offer[label+'_amount'] or price.get('currency','').upper()!=offer.get('currency','USD').upper() or price.get('type')!=expected_type or not price.get('active'):
            return response(409,{'error':'Your approved proposal and checkout pricing need to be reconciled.'})
        if label=='monthly' and (price.get('recurring',{}).get('interval')!='month' or price['recurring'].get('interval_count',1)!=1):
            return response(409,{'error':'The monthly plan needs to be confirmed.'})
    site=os.environ['SITE_URL']
    session=stripe_call('POST','checkout/sessions',{'mode':'subscription','line_items[0][price]':config['setup_price_id'],'line_items[0][quantity]':1,'line_items[1][price]':config['monthly_price_id'],'line_items[1][quantity]':1,'expires_at':min(int(time.time())+86400,offer['expires_at']),'client_reference_id':bid,'metadata[business_id]':bid,'subscription_data[metadata][business_id]':bid,'success_url':site+'/business?business='+bid+'&checkout=success','cancel_url':site+'/business?business='+bid+'#pricing'},digest(bid+':'+str(offer['expires_at'])+':'+str(int(time.time())//1800)))
    url=session.get('url','')
    if not url.startswith('https://checkout.stripe.com/'):
        return response(502,{'error':'Checkout could not be opened. Please try again.'})
    return response(200,{'url':url})

def handler(event,context):
    if event.get('admin_action')=='invite':
        bid=event.get('business_id','')
        if not get_business(bid): return {'error':'unknown business'}
        token=secrets.token_urlsafe(32)
        db.put_item(Item={'pk':'INVITE#'+digest(token),'business_id':bid,'expires':int(time.time())+7*86400})
        return {'url':os.environ['SITE_URL']+'/business?business='+bid+'#invite='+token,'expires_in_days':7}
    if event.get('admin_action')=='review':
        bid=event.get('business_id','')
        b=get_business(bid)
        return {'business':b} if b else {'error':'unknown business'}
    try:
        method=event.get('requestContext',{}).get('http',{}).get('method','GET')
        path=event.get('rawPath','').rstrip('/')
        if path=='/api/health':return response(200,{'status':'ok','mode':'pilot','version':'1.0.0'})
        match=re.fullmatch(r'/api/businesses/([a-z0-9-]{1,80})(?:/(interest|onboarding|requests|qa|receipts|checkout))?',path)
        if not match:return response(404,{'error':'Not found'})
        bid,kind=match.groups()
        business={'id':'general'} if bid=='general' and kind=='interest' else get_business(bid)
        if not business:return response(404,{'error':'Unknown business'})
        invitation=auth(event,bid)
        if method=='GET' and not kind:
            public=public_proposal(business)
            public['can_submit']=bool(invitation)
            public['offer']=billing_offer(business,invitation)[0] if invitation else {'ready':False}
            return response(200,public)
        if method!='POST':return response(405,{'error':'Method not allowed'})
        if kind!='interest' and not invitation:
            return response(403,{'error':'Owner access is required for this action. You can request a plan from the public proposal.'})
        if not limit(event):return response(429,{'error':'Too many requests. Please wait a minute.'})
        raw=event.get('body') or '{}'
        if len(raw)>16000:return response(413,{'error':'Submission too large'})
        data=json.loads(raw,parse_float=Decimal)
        if not isinstance(data,dict):return response(400,{'error':'Expected an object'})
        if any(isinstance(v,str) and len(v)>2000 for v in data.values()):return response(400,{'error':'Answer is too long'})
        if data.get('website'):return response(400,{'error':'Invalid submission'})
        if kind=='interest':return save_interest(bid,data)
        if kind=='checkout':
            if not invitation:return response(403,{'error':'Use your private invitation link to choose a plan.'})
            return checkout(bid,business,invitation)
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
        if not invitation:return response(403,{'error':'Use your private invitation link to submit.'})
        if kind=='requests' and not business.get('is_demo'):return response(403,{'error':'Live customer requests are not enabled for this business.'})
        errors=validate(kind,data)
        if errors:return response(422,{'error':'Please complete the highlighted details.','fields':errors})
        idem=str(data.pop('submission_id',''))
        if not re.fullmatch(r'[a-f0-9-]{36}',idem):return response(400,{'error':'A valid submission ID is required.'})
        rid='WEL-'+idem[:8].upper()
        token=digest(bid+':'+kind+':'+idem) # random UUID is the bearer capability; returned only to submitter
        checklist=['Review owner answers','Confirm website editing route','Approve implementation scope'] if kind=='onboarding' else ['Staff review availability and price','Confirm the request with the customer']
        if kind=='onboarding':
            checklist.append('Send updated setup proposal by '+str(data.get('proposal_update_channel','email'))+' after review')
            for k in ['lead_time','delivery_area','minimum','rules']:
                if not data.get(k) or data.get(k)=='Not sure':checklist.append('Confirm '+k.replace('_',' '))
        now=datetime.now(timezone.utc).isoformat()
        item={'pk':'RECEIPT#'+digest(token),'reference':rid,'business_id':bid,'kind':kind,'answers':data,'status':'Needs review' if kind=='onboarding' else 'Request received — awaiting confirmation','is_demo':bool(business.get('is_demo')),'created_at':now,'notification':'Your request has been saved for review.','checklist':checklist}
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
    except (urllib.error.URLError,TimeoutError):return response(503,{'error':'Checkout is temporarily unavailable. Please try again later.'})
    except (ValueError,TypeError):return response(400,{'error':'Invalid request'})
    except ClientError:
        LOG.exception('AWS request failed')
        return response(503,{'error':'Could not save the request. Retry with the same submission ID.'})
