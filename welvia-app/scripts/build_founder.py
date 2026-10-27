"""Create the founder-led variant from the current branded homepage."""
from pathlib import Path
import re
root = Path(__file__).resolve().parents[1]
page = (root / 'dist/index.html').read_text()
hero = (root / 'content/founder/hero.html').read_text()
page, count = re.subn(r'<div class="wrap hero">.*?(?=<section class="wrap block" id="how">)', lambda _: hero, page, count=1, flags=re.S)
assert count == 1, 'Homepage hero boundary changed'
page = page.replace('</head>', '<link rel="stylesheet" href="/founder.css"><script src="/founder.js" defer></script></head>')
page = page.replace('Welvia | Make your business discoverable and actionable', 'Nate Cook | Small business is personal | Welvia')
page = page.replace('Help compatible AI agents understand your business and prepare useful requests. Clear information, approved actions and measurable checks.', 'Raised in a restaurant family. Built a career in technology. Helping small businesses prepare for AI agents, starting with a free website review.')
page = page.replace('https://welvia.natemitchcook.com/"', 'https://welvia.natemitchcook.com/new"')
(root / 'dist/new').write_text(page)
(root / 'dist/new.html').write_text(page)
print('Rendered founder-led /new homepage')
