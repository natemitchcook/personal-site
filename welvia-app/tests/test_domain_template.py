import copy, importlib.util, json, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('domain_template',ROOT/'migration/prepare_template.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class DomainTemplateTests(unittest.TestCase):
    def setUp(self): self.source=json.loads((ROOT/'infrastructure.json').read_text())
    def test_prepare_preserves_existing_resources_code_and_credentials(self):
        before=copy.deepcopy(self.source); out=module.prepare(self.source,'prepare','ZTEST123')
        self.assertEqual(before,self.source)
        self.assertEqual(out['Resources']['ApiFunction'],self.source['Resources']['ApiFunction'])
        self.assertNotIn('WelviaDomainRedirect',out['Resources'])
        self.assertNotIn('Default',out['Parameters']['MigrationCertificateArn'])
        self.assertEqual(['welvia.natemitchcook.com','welvia.app'],out['Resources']['CDN']['Properties']['DistributionConfig']['Aliases'])
    def test_cutover_changes_only_site_environment_not_sender_or_credentials(self):
        out=module.prepare(self.source,'cutover','ZTEST123')
        env=out['Resources']['ApiFunction']['Properties']['Environment']['Variables'].copy()
        self.assertEqual('https://welvia.app',env.pop('SITE_URL'))
        old=self.source['Resources']['ApiFunction']['Properties']['Environment']['Variables'].copy();old.pop('SITE_URL')
        self.assertEqual(old,env)
        self.assertTrue(out['Resources']['WelviaDomainRedirect']['Properties']['AutoPublish'])
    def test_conflicting_edge_associations_fail_closed(self):
        self.source['Resources']['CDN']['Properties']['DistributionConfig']['DefaultCacheBehavior']['FunctionAssociations']=[{'EventType':'viewer-request','FunctionARN':'other'}]
        with self.assertRaises(ValueError):module.prepare(self.source,'cutover','ZTEST123')
    def test_invalid_phase_or_zone_rejected(self):
        for phase,zone in [('delete','ZTEST123'),('prepare','/hostedzone/Z123')]:
            with self.assertRaises(ValueError):module.prepare(self.source,phase,zone)
