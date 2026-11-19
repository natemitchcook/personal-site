"""One public navigation/footer for every generated Welvia HTML page."""
from pathlib import Path
import re,json
D=Path(__file__).resolve().parents[1]/'dist'
nav='<header class="welvia-global-header"><nav aria-label="Main navigation"><a class="welvia-wordmark" href="/"><img src="/brand/current.svg" width="28" height="28" alt=""> welvia</a><div><a href="/#how">How it works</a><a href="/smb">Small businesses</a><a href="/blog/">Blog</a><a href="/brand.html">Our identity</a><a href="/#plan">Free review</a></div></nav></header>'
footer='<footer class="welvia-global-footer"><a class="welvia-wordmark" href="/"><img src="/brand/current.svg" width="28" height="28" alt=""> welvia</a><p>Findable. Understandable. Actionable.</p><nav aria-label="Footer navigation"><a href="/smb">Small businesses</a><a href="/blog/">Blog</a><a href="/brand.html">Our identity</a><a href="/privacy.html">Privacy</a><a href="/service.html">Service scope</a></nav><small>© 2026 Welvia</small></footer>'
for f in D.rglob('*'):
 if not f.is_file():continue
 try:s=f.read_text()
 except UnicodeError:continue
 if '<main' not in s and f.name!='pitch-template.html':continue
 if '<html' not in s and f.name!='pitch-template.html':continue
 s=re.sub(r'<div class="top">.*?</div></div></div>',nav,s,count=1,flags=re.S)
 if 'welvia-global-header' not in s:
  # Preserve care's account context, but replace other top-level editorial headers.
  if 'care-demo' not in str(f):s=re.sub(r'<header>.*?</header>',nav,s,count=1,flags=re.S)
  if 'welvia-global-header' not in s:s=re.sub(r'(<body[^>]*>)',lambda m:m[0]+nav,s,count=1)
 s=re.sub(r'<footer\b[^>]*>.*?</footer>',footer,s,count=1,flags=re.S)
 if 'welvia-global-footer' not in s:s=s.replace('</body>',footer+'</body>')
 if '</head>' in s:s=s.replace('</head>','<link rel="stylesheet" href="/navigation.css"></head>')
 f.write_text(s)
# Old shared URLs remain usable even before the edge redirects are attached.
for old,new in [('new','smb'),('new.html','smb.html')]:
 (D/old).write_text((D/new).read_text())
for old in ['journal','journal.html']:
 (D/old).write_text((D/'blog/index.html').read_text())
# Inventory public assets separately from privately parameterized business records.
routes=['/','/smb','/blog/','/brand.html','/privacy.html','/service.html','/care-demo/','/email-preview.html','/business?business=<stable-id>']
routes+=['/blog/'+p['slug'] for p in json.loads((D.parent/'content/posts.json').read_text())]
(D/'route-manifest.json').write_text(json.dumps({'origin':'https://welvia.app','pages':routes,'compatibility':['/new','/new.html','/journal','/journal.html'],'note':'Business IDs come from existing private records, not a public customer directory. Email preview requires authorization; care demo is synthetic.'},indent=2)+'\n')
print('Applied shared navigation/footer and retained legacy landing pages')
