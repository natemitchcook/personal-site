(async function(){
const slug=new URLSearchParams(location.search).get('business');if(slug===null)return;
const fail=()=>{document.documentElement.classList.remove('pitch-loading');const p=document.createElement('p');p.setAttribute('role','alert');p.textContent='This business proposal could not be loaded. Check the link or try again shortly.';p.style.cssText='padding:18px 5%;margin:0;background:#e8e1c8';document.body.prepend(p);};
if(!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)){fail();return;}
let invite=new URLSearchParams(location.hash.slice(1)).get('invite');
if(invite){sessionStorage.setItem('welvia-invite:'+slug,invite);history.replaceState(null,'',location.pathname+location.search);}
invite=invite||sessionStorage.getItem('welvia-invite:'+slug)||'';
try{
 const [record,template]=await Promise.all([fetch('/api/businesses/'+encodeURIComponent(slug),{cache:'no-store',headers:invite?{'Authorization':'Bearer '+invite}:{}}),fetch('/pitch-template.html',{cache:'no-store'})]);if(!record.ok||!template.ok)throw Error('Unavailable');
 const business=await record.json();const data=business.campaign;if(data.slug!==slug||!data.business_name||!Array.isArray(data.benefits)||!Array.isArray(data.scenarios))throw Error('Invalid record');
 const scope=new DOMParser().parseFromString(await template.text(),'text/html').body;
 scope.querySelectorAll('[data-field]').forEach(e=>{const v=data[e.dataset.field];if(typeof v!=='string')throw Error('Missing content');e.textContent=v;});
 data.benefits.forEach((item,i)=>{const f=scope.querySelector('#benefit-template').content.cloneNode(true);f.querySelector('.number').textContent=String(i+1).padStart(2,'0');f.querySelector('h3').textContent=item.title;f.querySelector('p').textContent=item.description;scope.querySelector('#pitch-benefits').append(f);});
 data.scenarios.forEach(item=>{const f=scope.querySelector('#scenario-template').content.cloneNode(true);f.querySelector('.tag').textContent=item.title;f.querySelector('.chat').textContent=item.prompt;f.querySelector('h3').textContent=item.title;f.querySelector('p').textContent=item.note;item.fields.forEach(value=>{const li=document.createElement('li');li.textContent=value;f.querySelector('ul').append(li);});scope.querySelector('#pitch-scenarios').append(f);});
 const canonical=document.querySelector('link[rel="canonical"]');if(canonical)canonical.href=location.origin+'/business?business='+slug;
 document.body.replaceChildren(...Array.from(scope.childNodes));document.title='Welvia for '+data.business_name;window.welviaBusiness=business;window.dispatchEvent(new Event('welvia:campaign-ready'));document.documentElement.classList.remove('pitch-loading');
 if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');observer.unobserve(e.target);}}),{threshold:.12});document.querySelectorAll('.reveal').forEach(e=>observer.observe(e));}else{document.querySelectorAll('.reveal').forEach(e=>e.classList.add('visible'));}
 if(location.hash){const el=document.getElementById(location.hash.slice(1));if(el)el.scrollIntoView();}
}catch(error){fail();}
})();
