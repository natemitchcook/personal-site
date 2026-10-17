"""Private Welvia Care API, designed for API Gateway JWT authorizer.
Deployment is deliberately separate until identity provider and IAM are provisioned.
Expected env: CARE_TABLE_NAME. IAM may read/write only care records.
"""
import json,os,re,uuid
from datetime import datetime,timezone
import boto3
from botocore.exceptions import ClientError

def reply(code,body):
    return {"statusCode":code,"headers":{"Content-Type":"application/json","Cache-Control":"no-store",
            "X-Content-Type-Options":"nosniff"},"body":json.dumps(body)}

def handler(event,context):
    claims=((event.get("requestContext") or {}).get("authorizer") or {}).get("jwt",{}).get("claims") or {}
    subject=claims.get("sub")
    if not subject:return reply(401,{"error":"Sign in required"})
    bid=((event.get("pathParameters") or {}).get("businessId") or "").lower()
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,62}",bid):return reply(400,{"error":"Invalid business"})
    method=(event.get("requestContext") or {}).get("http",{}).get("method","GET")
    route=(event.get("routeKey") or "").split(" ")[-1]
    if not os.environ.get("CARE_TABLE_NAME"):return reply(503,{"error":"Care service not configured"})
    table=boto3.resource("dynamodb").Table(os.environ["CARE_TABLE_NAME"])
    # Membership record must be written by verified owner onboarding, not by this API.
    membership=table.get_item(Key={"pk":"MEMBER#"+subject,"sk":"BUSINESS#"+bid},
                              ConsistentRead=True).get("Item")
    if not membership or membership.get("role") not in ("owner","manager"):
        return reply(403,{"error":"Business access denied"})
    pk="CARE#"+bid
    if method=="GET" and route.endswith("/summary"):
        item=table.get_item(Key={"pk":pk,"sk":"SUMMARY"},ConsistentRead=True).get("Item")
        if not item:return reply(200,{"status":"not_tested","business_id":bid,"message":"Baseline has not run"})
        return reply(200,{"business_id":bid,"summary":item.get("public_summary",{}),
                          "checked_at":item.get("checked_at"),"status":item.get("status","not_tested")})
    if method=="POST" and route.endswith("/corrections"):
        try:data=json.loads(event.get("body") or "{}")
        except (TypeError,ValueError):return reply(400,{"error":"Invalid JSON"})
        field=data.get("field")
        suggestion=data.get("suggestion")
        if not isinstance(field,str) or field not in ("hours","services","delivery_area","lead_time","menu","contact","other"):
            return reply(422,{"error":"Unsupported field"})
        if not isinstance(suggestion,str) or not 2<=len(suggestion.strip())<=1000:
            return reply(422,{"error":"Suggestion must be 2 to 1000 characters"})
        request_id=str(uuid.uuid4())
        table.put_item(Item={"pk":pk,"sk":"CORRECTION#"+request_id,
                             "requested_by":subject,"field":field,"suggestion":suggestion.strip(),
                             "status":"awaiting_review","created_at":datetime.now(timezone.utc).isoformat(),
                             "request_id":request_id},
                       ConditionExpression="attribute_not_exists(pk)")
        return reply(202,{"request_id":request_id,"status":"awaiting_review"})
    return reply(404,{"error":"Route not found"})
