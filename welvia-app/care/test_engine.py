import unittest
from engine import assessment, maintenance_plan, monthly_report

class CareTests(unittest.TestCase):
    def setUp(self):
        self.business = {"business_id":"test-kitchen"}
        self.when = "2026-10-16T12:00:00+00:00"
    def test_unknown_is_not_success(self):
        report=assessment(self.business,{},now=self.when)
        self.assertEqual(report["summary"]["passed"],0)
        self.assertEqual(report["summary"]["not_tested"],6)
    def test_evidence_required_for_pass(self):
        report=assessment(self.business,{"https":{"status":"passed"}},now=self.when)
        self.assertEqual(report["summary"]["needs_review"],1)
    def test_approval_required(self):
        report=assessment(self.business,{"action_route":{"status":"failed","evidence":"404","recommended_action":"Repair route"}},now=self.when)
        self.assertEqual(maintenance_plan(report)[0]["status"],"awaiting_approval")
    def test_report_no_invented_revenue(self):
        report=monthly_report(assessment(self.business,{},now=self.when))
        self.assertNotIn("revenue",report)
        self.assertNotIn("conversions",report)
    def test_deterministic(self):
        a=assessment(self.business,{},now=self.when)
        b=assessment(self.business,{},now=self.when)
        self.assertEqual(a["assessment_id"],b["assessment_id"])

if __name__=="__main__":
    unittest.main()
