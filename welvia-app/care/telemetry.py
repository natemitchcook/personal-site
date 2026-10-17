"""Privacy-preserving analytics aggregation from verified first-party event feeds."""
from collections import Counter
from datetime import datetime, timezone

KINDS={"http_request","action_attempt","action_completed"}
def aggregate(events,business_id):
    totals=Counter()
    seen=set()
    for event in events:
        if event.get("business_id")!=business_id: continue
        eid=event.get("event_id")
        if not eid or eid in seen: continue
        seen.add(eid)
        kind=event.get("event_type")
        if kind not in KINDS: continue
        if event.get("source") not in ("cloudfront","origin","welvia_api"): continue
        totals[kind]+=1
        if kind=="http_request" and event.get("agent_confidence")=="verified":
            totals["verified_agent_requests"]+=1
        elif kind=="http_request" and event.get("agent_confidence")=="heuristic":
            totals["possible_agent_requests"]+=1
    return {"business_id":business_id,"observed_requests":totals["http_request"],
            "verified_agent_requests":totals["verified_agent_requests"],
            "possible_agent_requests":totals["possible_agent_requests"],
            "action_attempts":totals["action_attempt"],
            "completed_actions":totals["action_completed"],
            "source_note":"Only instrumented first-party endpoints. Classification is not proof of a customer session."}
