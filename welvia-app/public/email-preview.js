'use strict';
const $=id=>document.getElementById(id);
let token=new URLSearchParams(location.hash.slice(1)).get('access')||sessionStorage.getItem('welvia-preview-access')||'';
if(location.hash){history.replaceState(null,'',location.pathname);if(token)sessionStorage.setItem('welvia-preview-access',token);}
let businesses=[],current=null,tab='outreach',requestNumber=0,frameUrl=null;
function clearFrame(){ $('email').removeAttribute('src'); if(frameUrl){URL.revokeObjectURL(frameUrl);frameUrl=null;} }
async function api(path){const r=await fetch('/api/email-preview'+path,{headers:{Authorization:'Bearer '+token},cache:'no-store',credentials:'omit'});const body=await r.json();if(!r.ok)throw new Error(body.error||'Could not load this preview.');return body;}
function clear(){current=null;$('details').hidden=true;$('landing').hidden=true;clearFrame();$('text').textContent='';}
function status(text){$('status').textContent=text;}
function download(name,body,type){const url=URL.createObjectURL(new Blob([body],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function render(){if(!current)return;document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===tab)));
const file=tab==='file',mail=file?null:current[tab];$('metadata').hidden=file||!mail;$('filebar').hidden=!file||!current.file;$('email').hidden=file||!mail||$('plain').checked;$('text').hidden=!(file||!mail||$('plain').checked);
$('notice').textContent=tab==='outreach'?current.warnings.join(' '):'This is the saved review file and the same email template used for requested delivery. The recipient will be the address entered in the request form.';
if(file){$('text').textContent=current.file?.text||'No file is prepared for this business yet.';$('file-info').textContent=current.file?(current.file.mode==='public_research'?'Based on prior public research. Owner verification needed.':'Based on live homepage content.')+' Prepared '+new Date(Number(current.file.prepared_at)*1000).toLocaleDateString()+'.':'';}
else if(mail){$('from').textContent=mail.from;$('to').textContent=tab==='review'?'The person who requests the review':mail.to.join(', ');$('subject').textContent=mail.subject;$('text').textContent=mail.text;
// Use an explicitly allowed blob document instead of srcdoc, whose opaque sandbox origin can fail frame-src self.
// Keep the empty sandbox: no scripts, forms, popups, same-origin access or top navigation.
const policy='<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src https://welvia.natemitchcook.com/brand/; base-uri \'none\'; form-action \'none\'"><meta name="referrer" content="no-referrer">';
clearFrame();
frameUrl=URL.createObjectURL(new Blob([mail.html.replace(/<head>/i,'<head>'+policy)],{type:'text/html;charset=utf-8'}));
$('email').src=frameUrl;}
else{$('text').textContent='No review file is prepared yet. Opening this preview will not crawl the website or send an email.';clearFrame();}}
async function select(){const id=$('business').value,n=++requestNumber;clear();if(!id){status('No matching businesses.');return;}status('Loading preview…');try{const data=await api('/'+encodeURIComponent(id));if(n!==requestNumber)return;current=data;$('details').hidden=false;$('landing').href=data.landing_url;$('landing').hidden=false;status('Preview ready. Nothing has been sent.');render();}catch(e){if(n===requestNumber)status(e.message);}}
function filter(){const previous=$('business').value,query=$('search').value.toLowerCase();const rows=businesses.filter(b=>b.name.toLowerCase().includes(query));$('business').replaceChildren(...rows.map(b=>new Option(b.name,b.id)));if(rows.some(b=>b.id===previous))$('business').value=previous;$('count').textContent='('+rows.length+' of '+businesses.length+')';select();}
$('business').addEventListener('change',select);$('search').addEventListener('input',filter);$('plain').addEventListener('change',render);
$('tabs').addEventListener('click',e=>{if(e.target.dataset.tab){tab=e.target.dataset.tab;render();}});
$('widths').addEventListener('click',e=>{if(!e.target.dataset.width)return;const mobile=e.target.dataset.width==='mobile';$('canvas').classList.toggle('mobile',mobile);document.querySelectorAll('[data-width]').forEach(b=>b.setAttribute('aria-pressed',String(b===e.target)));});
$('download-file').addEventListener('click',()=>{if(current?.file)download('llms.txt',current.file.text,'text/plain;charset=utf-8');});
$('download-email').addEventListener('click',()=>{if(current?.[tab])download(current.business.id+'-'+tab+'.html',current[tab].html,'text/html;charset=utf-8');});
$('lock').addEventListener('click',()=>{++requestNumber;token='';businesses=[];sessionStorage.removeItem('welvia-preview-access');clear();$('business').replaceChildren();$('workspace').hidden=true;status('Preview locked. Reopen your private link to continue.');});
(async()=>{if(!token){status('Open the private preview link Nate received to view the emails.');return;}try{const data=await api('');if(!token)return;businesses=data.businesses;$('workspace').hidden=false;filter();}catch(e){status(e.message);}})();
