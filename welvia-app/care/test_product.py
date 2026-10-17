import unittest
from profile import build_assets,JUNIPER
from telemetry import aggregate
from costs import estimate
class ProductTests(unittest.TestCase):
    def test_generated_assets(self):
        a=build_assets(JUNIPER)
        self.assertEqual(a["structured_data"]["@type"],"Restaurant")
        self.assertIn("Juniper Table",a["llms_txt"])
    def test_approval_required(self):
        with self.assertRaises(PermissionError): build_assets({**JUNIPER,"owner_approved":False})
    def test_telemetry_dedupe_and_tenant(self):
        events=[{"event_id":"1","business_id":"juniper","event_type":"http_request","source":"origin","agent_confidence":"heuristic"},
                {"event_id":"1","business_id":"juniper","event_type":"http_request","source":"origin"},
                {"event_id":"2","business_id":"other","event_type":"action_completed","source":"welvia_api"}]
        a=aggregate(events,"juniper")
        self.assertEqual(a["observed_requests"],1)
        self.assertEqual(a["completed_actions"],0)
    def test_costs_with_labor(self):
        c=estimate(evaluation_runs=24,input_tokens_per_run=1000,output_tokens_per_run=300,
        input_usd_per_million=1,output_usd_per_million=4,fixed_variable_usd=.35,
        labor_minutes=30,labor_hourly_usd=40)
        self.assertTrue(float(c["total_usd"])>20)
    def test_negative_costs(self):
        with self.assertRaises(ValueError): estimate(evaluation_runs=-1,input_tokens_per_run=0,output_tokens_per_run=0,input_usd_per_million=0,output_usd_per_million=0,fixed_variable_usd=0)
if __name__=="__main__":unittest.main()
