"""Shared business template regression checks for all prospect pages."""
from html.parser import HTMLParser
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class TemplateParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()
        self.links = []

    def handle_starttag(self, tag, attrs):
        data = dict(attrs)
        if 'id' in data:
            self.ids.add(data['id'])
        if tag == 'a':
            self.links.append(data.get('href', ''))


class BusinessTemplateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.template = (ROOT / 'public/pitch-template.html').read_text()
        cls.campaign = (ROOT / 'public/campaign.js').read_text()
        cls.shell = (ROOT / 'public/index.html').read_text()

    def test_no_findings_or_pilot_sections_on_any_business_page(self):
        parser = TemplateParser()
        parser.feed(self.template)
        for removed_id in ('findings', 'reviewed-date', 'pitch-findings', 'pilot', 'pitch-steps', 'pitch-website'):
            self.assertNotIn(removed_id, parser.ids)
        for dead_link in ('#findings', '#pilot'):
            self.assertNotIn(dead_link, parser.links)
        self.assertNotIn('What we found.', self.template)
        self.assertNotIn('Your proposed pilot', self.template)

    def test_business_name_is_dynamic_and_no_status_annotation(self):
        self.assertIn('We can help <span data-field="business_name"></span> be easier for your prospective customer', self.template)
        self.assertIn('AI Agents', self.template)
        self.assertNotIn('data-field="status"', self.template)
        self.assertNotIn('Avalon', self.template)

    def test_rendering_does_not_require_removed_sections_or_pilot_data(self):
        for removed in ('pitch-findings', 'pitch-steps', 'pitch-website', 'reviewed-date', 'pilot_steps', 'business.findings'):
            self.assertNotIn(removed, self.campaign)
        self.assertIn('scope.querySelector(\'#pitch-benefits\')', self.campaign)
        self.assertIn('scope.querySelector(\'#pitch-scenarios\')', self.campaign)

    def test_remains_navigable_and_keeps_review_form(self):
        parser = TemplateParser()
        parser.feed(self.template)
        for section in ('how', 'example', 'pricing', 'onboarding'):
            self.assertIn(section, parser.ids)
        for link in ('#how', '#example', '#pricing', '#onboarding'):
            self.assertIn(link, parser.links)
        self.assertIn('id="business-forms"', self.template)

    def test_section_spacing_is_45_pixels_on_desktop_and_mobile(self):
        rule = 'section.block{padding-top:45px;padding-bottom:45px}'
        self.assertEqual(2, self.shell.count(rule))
        self.assertNotIn('section.block{padding-top:115px', self.shell)
        self.assertNotIn('section.block{padding-top:75px', self.shell)


if __name__ == '__main__':
    unittest.main()
