import sys, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from import_workbook import merge
class ImportSafety(unittest.TestCase):
 def setUp(self):
  self.old={'pk':'PAGE#business','revision':2,'source':{'library_file_id':'file','version':2,'sha256':'old'},'fields':{'headline':'Original','content_approval':'Needs review'},'imported_fields_snapshot':{'headline':'Original','content_approval':'Needs review'},'public_enabled':False,'manual_notes':'Keep'}
  self.new={'pk':'PAGE#business','revision':1,'source':{'library_file_id':'file','version':3,'sha256':'new'},'fields':{'headline':'Research','content_approval':'Needs review'},'imported_fields_snapshot':{'headline':'Research','content_approval':'Needs review'}}
 def test_preserve_manual_edits(self):
  self.old['fields']['headline']='Owner copy';m,c=merge(self.old,self.new);self.assertEqual('Owner copy',m['fields']['headline']);self.assertEqual('Keep',m['manual_notes']);self.assertIn('headline',c);self.assertEqual(3,m['revision'])
 def test_approved_copy_requires_review(self):
  self.old['fields']['content_approval']='Approved';m,c=merge(self.old,self.new);self.assertEqual(self.old['fields'],m['fields']);self.assertEqual('Research',m['proposed_fields']['headline']);self.assertIn('approved_page_content',c)
 def test_stale_source_rejected(self):
  self.new['source']['version']=1
  with self.assertRaises(ValueError):merge(self.old,self.new)
 def test_changed_workbook_rejected(self):
  self.new['source']['library_file_id']='other'
  with self.assertRaises(ValueError):merge(self.old,self.new)
 def test_same_source_is_idempotent(self):
  self.new['source']['sha256']='old';m,c=merge(self.old,self.new);self.assertEqual(self.old,m);self.assertEqual([],c)
