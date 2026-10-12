(()=>{
 const cards=[...document.querySelectorAll('.concept-stage')],button=document.getElementById('motion-toggle'),status=document.getElementById('motion-status');
 if(!button)return;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');let paused=false;
 function sync(){document.body.classList.toggle('motion-paused',paused||document.hidden||reduced.matches);button.disabled=reduced.matches;button.setAttribute('aria-pressed',String(paused));button.textContent=paused?'Play animations':'Pause animations';status.textContent=reduced.matches?'Motion is off to respect your device’s reduced-motion setting.':paused?'Animations paused. Static favicon samples remain below each concept.':'Visible concepts loop automatically; off-screen concepts pause.';}
 if('IntersectionObserver' in window){cards.forEach(c=>c.classList.add('motion-offscreen'));
 const observer=new IntersectionObserver(entries=>entries.forEach(e=>e.target.classList.toggle('motion-offscreen',!e.isIntersecting)),{threshold:.15});cards.forEach(c=>observer.observe(c));}
 button.addEventListener('click',()=>{paused=!paused;sync()});document.addEventListener('visibilitychange',sync);reduced.addEventListener('change',sync);sync();
})();
