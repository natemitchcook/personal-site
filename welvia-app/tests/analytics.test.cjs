const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const code = fs.readFileSync('public/analytics.js','utf8');
test('all pages load GA once; business events omit tokens, referrer paths and form values',()=>{
 const scripts=[],listeners={};
 const location=new URL('https://welvia.app/?business=test-kitchen&token=SECRET#invite=SECRET');
 const document={title:'Welvia',referrer:'https://example.com/private?email=SECRET',
 head:{appendChild:s=>scripts.push(s)},createElement:()=>({}),addEventListener:(n,f)=>listeners[n]=f};
 const window={addEventListener:(n,f)=>listeners[n]=f};
 const ctx={window,document,location,URL,URLSearchParams,Date,Set};
 vm.runInNewContext(code,ctx);vm.runInNewContext(code,ctx);
 assert.equal(scripts.length,1);
 assert.match(scripts[0].src,/G-N5KBXBFBPD$/);
 assert.equal(window.dataLayer.filter(x=>x[0]==='config').length,1);
 window.welviaAnalytics.track('form_submit_success',{form_type:'onboarding',answers:'SECRET'});
 window.welviaAnalytics.track('unknown',{answers:'SECRET'});
 assert.equal(window.dataLayer.at(-1)[1],'form_submit_success');
 assert.equal(window.dataLayer.at(-1)[2].business_id,'test-kitchen');
 assert.equal(window.dataLayer.at(-1)[2].page_referrer,'https://example.com/');
 assert.ok(!JSON.stringify(window.dataLayer).includes('SECRET'));
});
test('every generated full page includes shared analytics exactly once',()=>{
 for(const file of ['dist/index.html','dist/brand.html',...fs.readdirSync('dist/blog').filter(x=>x.endsWith('.html')).map(x=>'dist/blog/'+x)]) {
  assert.equal((fs.readFileSync(file,'utf8').match(/src="\/analytics.js"/g)||[]).length,1,file);
 }
});
