const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../public/email-preview.js'),'utf8');
function fixture(){
 const nodes=new Map(),blobs=new Map(),revoked=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,checked:false,src:'',textContent:'',dataset:{},addEventListener(){},setAttribute(){},removeAttribute(k){delete this[k];},replaceChildren(){},classList:{toggle(){}}});return nodes.get(id);};
 const context=vm.createContext({document:{getElementById:node,querySelectorAll:()=>[]},URLSearchParams,location:{hash:''},sessionStorage:{getItem:()=>'',removeItem(){}},history:{},Blob,URL:{createObjectURL(blob){const key='blob:test-'+blobs.size;blobs.set(key,blob);return key;},revokeObjectURL(url){revoked.push(url);}},Date,setTimeout,fetch(){throw Error('Unexpected network request');}});
 vm.runInContext(source,context);
 const mail={from:'Welvia',to:['preview@example.com'],subject:'Review',text:'Example review',html:'<!doctype html><html><head><title>Example</title></head><body style="color:green">Visible email</body></html>'};
 context.fixtureData={outreach:mail,review:mail,warnings:[],file:{text:'# Example',prepared_at:1,mode:'homepage'}};
 vm.runInContext('current=fixtureData;render();',context);
 return {context,node,blobs,revoked};
}
test('HTML uses an allowed blob document and retains restrictive sandbox',async()=>{
 const f=fixture();const frame=f.node('email');assert.equal(frame.hidden,false);assert.match(frame.src,/^blob:/);
 const html=await f.blobs.get(frame.src).text();assert.match(html,/Visible email/);assert.match(html,/default-src 'none'/);
 const shell=fs.readFileSync(path.join(__dirname,'../public/email-preview.html'),'utf8');assert.match(shell,/frame-src blob:/);assert.match(shell,/sandbox=""/);assert.doesNotMatch(shell,/allow-scripts|allow-same-origin/);
});
test('plain text toggle restores HTML and releases old preview documents',()=>{
 const f=fixture(),first=f.node('email').src;f.node('plain').checked=true;vm.runInContext('render()',f.context);assert.equal(f.node('email').hidden,true);assert.equal(f.node('text').textContent,'Example review');
 f.node('plain').checked=false;vm.runInContext('render()',f.context);assert.equal(f.node('email').hidden,false);assert.ok(f.revoked.includes(first));
 vm.runInContext('clear()',f.context);assert.equal(f.node('details').hidden,true);assert.equal(f.node('email').src,undefined);
});
