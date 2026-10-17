"""Generate safe, owner-reviewed agent-facing content from approved business facts."""
import json
from html import escape
from urllib.parse import urlparse

def valid_url(value):
    u=urlparse(value)
    return u.scheme=="https" and bool(u.netloc) and not u.username and not u.password

def build_assets(facts):
    required=("name","website","description","address","telephone")
    if any(not isinstance(facts.get(k),str) or not facts[k].strip() for k in required):
        raise ValueError("Approved business facts are incomplete")
    if not valid_url(facts["website"]):
        raise ValueError("Website must be an HTTPS URL")
    if not facts.get("owner_approved"):
        raise PermissionError("Owner approval is required")
    schema={"@context":"https://schema.org","@type":"Restaurant","name":facts["name"],
            "url":facts["website"],"description":facts["description"],
            "address":{"@type":"PostalAddress","streetAddress":facts["address"]},
            "telephone":facts["telephone"]}
    if facts.get("menu_url"):
        if not valid_url(facts["menu_url"]): raise ValueError("Menu must be HTTPS")
        schema["hasMenu"]=facts["menu_url"]
    if facts.get("serves_cuisine"): schema["servesCuisine"]=facts["serves_cuisine"]
    lines=["# "+facts["name"],"",facts["description"],"",
           "Official website: "+facts["website"],
           "Address: "+facts["address"],
           "Telephone: "+facts["telephone"],"",
           "This file is informational. Confirm current details on the official website."]
    if facts.get("menu_url"): lines.insert(-2,"Menu: "+facts["menu_url"])
    return {"structured_data":schema,"json_ld":json.dumps(schema,ensure_ascii=False,indent=2),
            "llms_txt":"\n".join(lines)+"\n"}

JUNIPER={"name":"Juniper Table","website":"https://junipertable.example",
         "description":"Fictional restaurant offering catering and private events.",
         "address":"123 Example Street, Demo City, CA","telephone":"+1-555-0100",
         "serves_cuisine":"Seasonal American","owner_approved":True}
