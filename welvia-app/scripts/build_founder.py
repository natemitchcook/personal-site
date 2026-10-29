"""Create the founder-led variant from the current branded homepage."""
from pathlib import Path
import re, json
root = Path(__file__).resolve().parents[1]
page = (root / 'dist/index.html').read_text()
hero = (root / 'content/founder/hero.html').read_text()
page, count = re.subn(r'<div class="wrap hero">.*?(?=<section class="wrap block" id="how">)', lambda _: hero, page, count=1, flags=re.S)
assert count == 1, 'Homepage hero boundary changed'
page = page.replace('Welvia | Make your business discoverable and actionable', 'Nate Cook | Small business is personal | Welvia')
page = page.replace('Help compatible AI agents understand your business and prepare useful requests. Clear information, approved actions and measurable checks.', 'Raised in a restaurant family. Built a career in technology. Helping small businesses prepare for AI agents, starting with a free website review.')
page = page.replace('rel="canonical" href="https://welvia.app/"', 'rel="canonical" href="https://welvia.app/smb"')
page = page.replace('property="og:url" content="https://welvia.app/"', 'property="og:url" content="https://welvia.app/smb"')
def update_schema(match):
    schema = json.loads(match.group(1))
    schema['url'] = 'https://welvia.app/smb'
    return '<script type="application/ld+json">' + json.dumps(schema).replace('<', chr(92)+'u003c') + '</script>'
page = re.sub(r'<script type="application/ld\+json">(.*?)</script>', update_schema, page, flags=re.S)
(root / 'dist/smb').write_text(page)
(root / 'dist/smb.html').write_text(page)
print('Rendered founder-led /smb homepage')
