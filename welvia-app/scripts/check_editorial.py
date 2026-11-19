"""Validate generated links, metadata, public-only discovery and article parity."""
import json,re
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit,unquote
from xml.etree import ElementTree as ET
ROOT=Path(__file__).resolve().parents[1];D=ROOT/'dist';P=json.loads((ROOT/'content/posts.json').read_text());H='https://welvia.app'
class Page(HTMLParser):
 def __init__(self,text):
  super().__init__();self.tags=[];self.feed(text)
 def handle_starttag(self,tag,attrs):self.tags.append((tag,dict(attrs)))
files=[D/'index.html',D/'brand.html',D/'blog/index.html']+[D/'blog'/p['slug'] for p in P]+[D/'blog'/(p['slug']+'.html') for p in P]
for f in files:
 s=f.read_text();page=Page(s);metas=[a for t,a in page.tags if t=='meta'];links=[a for t,a in page.tags if t=='link']
 for name in ['description','robots','theme-color','twitter:card','twitter:image']:
  assert len([a for a in metas if a.get('name')==name and a.get('content')])==1,(f,name)
 assert len([a for a in links if a.get('rel')=='canonical'])==1
 for t,a in page.tags:
  value=a.get('href') if t in ['a','link'] else a.get('src')
  if not value:continue
  u=urlsplit(value)
  if u.scheme or u.netloc or not u.path:continue
  target=D/unquote(u.path).lstrip('/') if u.path.startswith('/') else f.parent/unquote(u.path)
  if target.is_dir():target=target/'index.html'
  assert target.exists(),(f,value)
 for raw in re.findall(r'<script type="application/ld\+json">(.*?)</script>',s,re.S):json.loads(raw)
 assert '✳' not in s,(f,'old star')
for p in P:
 page=(D/'blog'/p['slug']).read_text();md=(D/'blog'/(p['slug']+'.md')).read_text()
 assert 'index,follow,max-image-preview:large' in page
 assert p['title'] in md and p['takeaway'] in md
 assert 'BlogPosting' in page and 'href="'+H+'/blog/'+p['slug']+'"' in page
 assert page==(D/'blog'/(p['slug']+'.html')).read_text()
 assert 'href="/blog/'+p['slug']+'.md"' in page
 assert len(p['sources'])>=1
urls=[n.text for n in ET.parse(D/'sitemap.xml').iter() if n.tag.endswith('loc')]
assert len(urls)==len(P)+1 and all('/blog/' in u and '?' not in u for u in urls)
items=ET.parse(D/'blog/feed.xml').findall('./channel/item')
assert len(items)==len(P)
expected={H+'/blog/'+p['slug'] for p in P}
assert set(urls)==expected|{H+'/blog/'}
assert {item.findtext('link') for item in items}==expected
assert {item.findtext('guid') for item in items}==expected
assert 'noindex,nofollow' in (D/'index.html').read_text() and 'noindex,nofollow' in (D/'brand.html').read_text()
assert 'Allow: /blog/' in (D/'robots.txt').read_text()
assert all('invite=' not in f.read_text() for f in files)
print('Validated',len(P),'articles: metadata, internal assets/links, feed, sitemap, privacy and Markdown')
