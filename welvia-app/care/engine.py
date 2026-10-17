"""Welvia Care: deterministic, side-effect-free maintenance assessment.
No external requests, billing, or production writes. Python 3.11+.
"""
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from urllib.parse import urlparse
import hashlib
import json

CHECKS = ("website_reachable", "https", "business_facts", "structured_data", "agent_endpoint", "action_route")

def assessment(business, observations, *, now=None):
    """Only supplied observations are evaluated; unknown never becomes passed."""
    now = now or datetime.now(timezone.utc).isoformat()
    business_id = business["business_id"]
    results = []
    for key in CHECKS:
        obs = observations.get(key)
        if obs is None:
            status, evidence, action = "not_tested", None, "Schedule verification"
        elif obs.get("status") in ("passed", "failed", "needs_review"):
            status = obs["status"]
            evidence = obs.get("evidence")
            action = obs.get("recommended_action")
            if status == "passed" and not evidence:
                status, action = "needs_review", "Attach verifiable evidence"
        else:
            status, evidence, action = "needs_review", None, "Review invalid observation"
        results.append({"check":key,"status":status,"evidence":evidence,"recommended_action":action})
    summary = {s:sum(x["status"]==s for x in results) for s in ("passed","failed","needs_review","not_tested")}
    snapshot = {"business_id":business_id,"checked_at":now,"results":results,"summary":summary,
                "disclaimer":"Controlled checks do not prove placement or recommendations by third-party AI assistants."}
    canonical = json.dumps(snapshot,sort_keys=True,separators=(",",":"))
    snapshot["assessment_id"] = hashlib.sha256(canonical.encode()).hexdigest()[:24]
    return snapshot

def maintenance_plan(snapshot):
    """Plan changes; never silently publish them."""
    return [{"check":r["check"],"status":"awaiting_approval",
             "suggestion":r["recommended_action"] or "Investigate failure"}
            for r in snapshot["results"] if r["status"] in ("failed","needs_review")]

def monthly_report(snapshot, completed=()):
    """Customer-facing factual report, no fabricated conversions or traffic."""
    return {"business_id":snapshot["business_id"],"checked_at":snapshot["checked_at"],
            "checks":snapshot["summary"],"completed_changes":list(completed),
            "open_items":maintenance_plan(snapshot),
            "note":snapshot["disclaimer"]}
