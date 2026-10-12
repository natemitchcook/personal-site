"""Render public editorial HTML without exposing any business database records."""
import json,html,re,math
from brand_studies import SHAPES,CONCEPTS
from pathlib import Path
from datetime import date,datetime,timezone
from email.utils import format_datetime
from xml.etree.ElementTree import Element,SubElement,tostring
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'dist'; HOST='https://welvia.natemitchcook.com'; TODAY=date.today().isoformat()
E=lambda s:html.escape(str(s),quote=True)
POSTS=json.loads((ROOT/'content/posts.json').read_text())
assert len({p['slug'] for p in POSTS})==len(POSTS),'Duplicate article slug'
for p in POSTS:
 assert re.fullmatch('[a-z0-9]+(?:-[a-z0-9]+)*',p['slug'])
 assert p['date']<=TODAY and p['date']<=p['updated']<=TODAY
 assert all(s['url'].startswith('https://') for s in p['sources'])
POSTS.sort(key=lambda p:p['date'],reverse=True)
def svg(kind='flow',cls='brand-symbol'):
 shapes={'flow':'<path class="stroke" d="M10 17 L19 45 Q21 51 25 44 L32 28 L39 44 Q43 51 45 44 L54 17"/>', 'door':'<path class="stroke" d="M16 49 V29 A16 16 0 0 1 32 13 A16 16 0 0 1 48 29 V49 M26 49 V31 A6 6 0 0 1 38 31 V49"/>', 'link':'<path class="stroke" d="M27 20 L20 20 A12 12 0 0 0 20 44 H27 M37 20 H44 A12 12 0 0 1 44 44 H37 M24 32 H40"/>'}
 shapes.update(SHAPES)
 return f'<svg class="{cls} {kind}" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{shapes[kind]}</svg>'
def logo():return '<a class="brand-lockup" href="/" aria-label="Welvia home">'+svg()+'<span>welvia</span></a>'
def head(title,desc,path,index=True,article=None):
 url=HOST+path
 schema={'@context':'https://schema.org','@type':'Blog' if path=='/blog/index.html' else 'WebPage','name':title,'url':url,'description':desc,'publisher':{'@type':'Organization','name':'Welvia','url':HOST+'/','logo':HOST+'/brand/icon-512.png'}}
 extra=''
 if article:
  schema.update({'@type':'BlogPosting','headline':article['title'],'datePublished':article['date'],'dateModified':article['updated'],'author':{'@type':'Organization','name':'Welvia','url':HOST+'/'},'mainEntityOfPage':url,'image':HOST+'/brand/social-card.png','inLanguage':'en-US','citation':[s['url'] for s in article['sources']]})
  extra=f'<meta property="article:published_time" content="{article["date"]}T12:00:00Z"><meta property="article:modified_time" content="{article["updated"]}T12:00:00Z"><meta property="article:section" content="{E(article["category"])}"><link rel="alternate" type="text/markdown" href="{E(path[:-5]+".md")}">'
 return f'''<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{E(title)}</title><meta name="description" content="{E(desc)}"><meta name="robots" content="{'index,follow,max-image-preview:large' if index else 'noindex,nofollow'}"><meta name="theme-color" content="#18231f"><meta name="color-scheme" content="light"><meta name="referrer" content="strict-origin-when-cross-origin"><link rel="canonical" href="{url}"><link rel="icon" type="image/svg+xml" href="/brand/favicon.svg"><link rel="icon" type="image/png" sizes="32x32" href="/brand/favicon-32.png"><link rel="apple-touch-icon" sizes="180x180" href="/brand/apple-touch-icon.png"><link rel="manifest" href="/site.webmanifest"><meta property="og:type" content="{'article' if article else 'website'}"><meta property="og:site_name" content="Welvia"><meta property="og:locale" content="en_US"><meta property="og:title" content="{E(title)}"><meta property="og:description" content="{E(desc)}"><meta property="og:url" content="{url}"><meta property="og:image" content="{HOST}/brand/social-card.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Welvia — Small businesses. Ready for what comes next."><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{E(title)}"><meta name="twitter:description" content="{E(desc)}"><meta name="twitter:image" content="{HOST}/brand/social-card.png"><meta name="twitter:image:alt" content="Welvia — Small businesses. Ready for what comes next."><link rel="alternate" type="application/rss+xml" title="Welvia Journal" href="/blog/feed.xml"><link rel="describedby" href="/llms.txt" type="text/plain">{extra}<script type="application/ld+json">{json.dumps(schema).replace('<',chr(92)+'u003c')}</script>'''
def shell(title,desc,path,body,index=True,article=None):
 return '<!doctype html><html lang="en"><head>'+head(title,desc,path,index,article)+'<link rel="stylesheet" href="/brand/brand.css"><link rel="stylesheet" href="/blog/editorial.css"></head><body><a class="skip" href="#main">Skip to content</a><header><nav>'+logo()+'<div><a href="/blog/index.html">Journal</a><a class="button" href="/#how">Explore Welvia ↗</a></div></nav></header><main id="main">'+body+'</main><footer>'+logo()+'<p>Small businesses. Ready for what comes next.</p><a href="/blog/feed.xml">RSS feed ↗</a><span>© '+TODAY[:4]+' Welvia</span></footer></body></html>'
def card(p,i):return f'<a class="story-card" href="/blog/{p["slug"]}.html"><div class="card-art art-{i%3}" aria-hidden="true">{svg(["flow","door","link"][i%3],"art-symbol")}<span>{str(i+1).zfill(2)}</span></div><div class="card-copy"><span class="kicker">{E(p["category"])}</span><h2>{E(p["title"])}</h2><p>{E(p["description"])}</p><span class="read">Read the story ↗</span></div></a>'
(OUT/'blog').mkdir(parents=True,exist_ok=True)
for i,p in enumerate(POSTS):
 path='/blog/'+p['slug']+'.html'; words=sum(len(x.split()) for s in p['sections'] for x in s['paragraphs']); mins=max(2,math.ceil(words/200))
 body=f'<div class="article-head"><a class="back" href="/blog/index.html">← All stories</a><p class="kicker">{E(p["category"])}</p><h1>{E(p["title"])}</h1><p class="dek">{E(p["description"])}</p><p class="byline">Welvia · <time datetime="{p["date"]}">{date.fromisoformat(p["date"]).strftime("%B %d, %Y")}</time> · {mins} min read</p></div><article class="prose">'
 for s in p['sections']:body+='<section><h2>'+E(s['heading'])+'</h2>'+''.join('<p>'+E(x)+'</p>' for x in s['paragraphs'])+'</section>'
 body+='<aside class="takeaway"><span class="kicker">One thing to try</span><p>'+E(p['takeaway'])+'</p></aside><section class="sources"><h2>Sources & further reading</h2><ul>'+''.join('<li><a href="'+E(s['url'])+'">'+E(s['title'])+' ↗</a></li>' for s in p['sources'])+'</ul><p>Sources checked '+E(p['updated'])+'. Recommendations and examples reflect Welvia’s approach; they do not imply a partnership or guaranteed result.</p></section></article><section class="closing"><span class="kicker">Make the next step useful</span><h2>A clearer path to your business.</h2><p>Start with accurate information and one action your team can confidently support.</p><a class="button" href="/#how">See the Welvia approach ↗</a></section>'
 nextp=POSTS[(i+1)%len(POSTS)];body+=f'<p class="next-story">Read next: <a href="/blog/{nextp["slug"]}.html">{E(nextp["title"])} ↗</a></p>'
 (OUT/path.lstrip('/')).write_text(shell(p['title']+' | Welvia Journal',p['description'],path,body,article=p))
 md='# '+p['title']+'\n\n'+p['description']+'\n\nPublished '+p['date']+' · Welvia\n\n'
 for s in p['sections']:md+='## '+s['heading']+'\n\n'+'\n\n'.join(s['paragraphs'])+'\n\n'
 md+='## One thing to try\n\n'+p['takeaway']+'\n\n## Sources\n\n'+'\n'.join('- ['+s['title']+']('+s['url']+')' for s in p['sources'])+'\n'
 (OUT/'blog'/(p['slug']+'.md')).write_text(md)
body='<section class="journal-hero"><span class="kicker">The Welvia Journal / Ideas for the next web</span><h1>The future has<br>room for <em>local.</em></h1><div class="hero-bottom"><p>Agents are changing how people find things and get things done. Small businesses belong in that future. Here’s how we get there.</p><a href="/blog/feed.xml">Follow the journal ↗</a></div></section><div class="issue"><span>Discovery. Understanding. Action.</span><span>'+str(len(POSTS))+' stories · New perspectives weekly</span></div><section class="story-grid" aria-label="Latest articles">'+''.join(card(p,i) for i,p in enumerate(POSTS))+'</section>'
(OUT/'blog/index.html').write_text(shell('Welvia Journal | Small businesses in the agent era','Practical ideas, research and perspectives on making small businesses discoverable and actionable for AI agents.','/blog/index.html',body))
# Stable file URLs work with the existing private S3/CloudFront origin, without SPA rewrites.
rss=Element('rss',version='2.0');ch=SubElement(rss,'channel')
for k,v in [('title','Welvia Journal'),('link',HOST+'/blog/index.html'),('description','Small businesses in the agent era'),('language','en-us')]:SubElement(ch,k).text=v
for p in POSTS:
 item=SubElement(ch,'item')
 for k,v in [('title',p['title']),('link',HOST+'/blog/'+p['slug']+'.html'),('guid',HOST+'/blog/'+p['slug']+'.html'),('description',p['description']),('pubDate',format_datetime(datetime.fromisoformat(p['date']).replace(hour=12,tzinfo=timezone.utc)))]:SubElement(item,k).text=v
(OUT/'blog/feed.xml').write_bytes(tostring(rss,encoding='utf-8',xml_declaration=True))
sm=Element('urlset',xmlns='http://www.sitemaps.org/schemas/sitemap/0.9')
for path,d in [('/blog/index.html',max(p['updated'] for p in POSTS))]+[('/blog/'+p['slug']+'.html',p['updated']) for p in POSTS]:
 u=SubElement(sm,'url');SubElement(u,'loc').text=HOST+path;SubElement(u,'lastmod').text=d
(OUT/'sitemap.xml').write_bytes(tostring(sm,encoding='utf-8',xml_declaration=True))
# Preserve the homepage's existing noindex policy and private invitation flows.
f=OUT/'index.html';s=f.read_text();s=re.sub(r'<meta charset="utf-8">.*?<title>.*?</title>',head('Welvia | Make your business discoverable and actionable','Help compatible AI agents understand your business and prepare useful requests. Clear information, approved actions and measurable checks.','/',False),s,count=1,flags=re.S)
s=s.replace('</head>','<link rel="stylesheet" href="/brand/brand.css"></head>').replace('welvia<i>✳</i>','welvia'+svg()).replace('welvia✳','welvia').replace('✳','·')
s=s.replace('<a href="#growth">Why now</a>','<a href="/blog/index.html">Journal</a><a href="#growth">Why now</a>')
f.write_text(s)
f=OUT/'pitch-template.html';s=f.read_text().replace('welvia<i>✳</i>','welvia'+svg()).replace('welvia✳','welvia');f.write_text(s)
# Three live vector concepts: CSS motion stops for reduced-motion preferences.
concepts=[('flow','01 / Flow W','A continuous path from a question to a useful action. The strongest fit for a compact favicon.'),('door','02 / Open door','A welcoming entrance for the next kind of customer. Softer and more architectural.'),('link','03 / Connection','Two sides meeting through a shared interface. A direct expression of useful connections.')]
concepts += CONCEPTS
body='<section class="journal-hero"><span class="kicker">Welvia / Identity studies</span><h1>Make the<br>connection <em>visible.</em></h1><p class="dek">13 directions. One warm, confident palette. Each mark loops while it is on screen. Compare the movement with the still favicon below.</p><div class="motion-controls"><button type="button" id="motion-toggle" aria-pressed="false">Pause animations</button><span id="motion-status" role="status">Animations play automatically. Reduced-motion preferences are respected.</span></div></section><section class="concept-grid">'
for kind,title,desc in concepts:
 body+='<article class="concept" id="concept-'+kind+'"><div class="concept-stage" aria-label="Animated preview: '+E(title)+'">'+svg(kind,'concept-symbol')+'</div><p class="kicker">'+title+'</p><h2>'+title.split(' / ')[1]+'</h2><p>'+desc+'</p><div class="favicon-samples"><span>In a browser tab</span>'+svg(kind)+'<span>Welvia</span></div><a href="/brand/'+kind+'.svg" download>Download SVG ↗</a></article>'
body+='</section><section class="design-notes"><span class="kicker">What informed these studies</span><h2>Motion with a reason.</h2><p>Explore widely, keep the silhouette legible, and give each mark a behavior connected to Welvia: finding, connecting or taking a useful next step. These are original studies, not reproductions of another studio’s identity.</p><p>References: <a href="https://iteration.design/">Iteration — exploration and craft</a> · <a href="https://www.ordinaryfolk.co/process">Ordinary Folk — personality through motion</a> · <a href="https://animations.dev/">Emil Kowalski — animation craft</a> · <a href="https://www.designweek.co.uk/the-strongest-motion-identities-encode-behaviour-not-aesthetics/">Andrew Vucko — brand behavior</a></p></section><script src="/brand/studies.js" defer></script><section class="closing"><span class="kicker">Working direction / Flow W</span><h2>Simple enough to recognize.<br>Flexible enough to move.</h2><p>The Flow W is the current working mark. Each option is vector artwork, scales down to a favicon and has a reduced-motion state. These are original design concepts, not a trademark-clearance result.</p></section>'
(OUT/'brand.html').write_text(shell('Welvia | Logo exploration','Thirteen animated logo directions for Welvia, with looping previews and favicon studies.','/brand.html',body,index=False))
for kind,_,_ in concepts:
 (OUT/'brand'/(kind+'.svg')).write_text(svg(kind).replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" ').replace('currentColor','#18231f'))
# Agent-readable index links only public editorial content, never private business data.
f=OUT/'llms.txt';f.write_text(f.read_text()+'\n## Journal\n\n- [Welvia Journal]('+HOST+'/blog/index.html): Essays and practical guides.\n'+''.join('- ['+p['title']+']('+HOST+'/blog/'+p['slug']+'.md)\n' for p in POSTS))
print('Rendered',len(POSTS),'articles, RSS, sitemap, metadata and identity studies')
