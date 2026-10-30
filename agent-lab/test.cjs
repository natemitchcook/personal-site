const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { FIXTURE, validate, createRun, labels } = require('./model.js');
for (const variant of ['before', 'after']) {
 test(`${variant}: valid synthetic request creates exactly one stable local receipt`, () => {
  const run = createRun(variant), a = run.submit(FIXTURE), b = run.submit(FIXTURE);
  assert.equal(a.ok, true); assert.equal(b.duplicate, true); assert.strictEqual(a.receipt,b.receipt);
  assert.equal(a.receipt.contact,'Alex Example · alex@example.test'); assert.match(a.receipt.transport,/Not delivered/);
 });
 test(`${variant}: missing, invalid and out-of-area requests never create a receipt`, () => {
  const run=createRun(variant); for (const input of [{}, {...FIXTURE,area:'DEMO-SOUTH'}, {...FIXTURE,service:'real customer text'}, {...FIXTURE,timing:'today'}]) assert.equal(run.submit(input).ok,false);
  assert.equal(run.getReceipt(),null);
 });
 test(`${variant}: recovery and reset preserve explicit boundaries`, () => {
  const run=createRun(variant); assert.equal(run.submit({...FIXTURE,area:'DEMO-SOUTH'}).ok,false);
  assert.equal(run.submit(FIXTURE).ok,true); run.reset(); assert.equal(run.getReceipt(),null);
 });
 test(`${variant}: extra contact fields are ignored, never copied into receipt`, () => {
  const result=createRun(variant).submit({...FIXTURE,email:'real@example.com',notes:'private',contact:'actual person'});
  assert.ok(!JSON.stringify(result).includes('real@example.com')); assert.ok(!JSON.stringify(result).includes('actual person'));
 });
}
test('same rule matrix applies to both variants', () => {
 for (const service of Object.keys(labels.service)) for(const area of Object.keys(labels.area)) for(const size of Object.keys(labels.size)) for(const timing of Object.keys(labels.timing)) {
  const input={service,area,size,timing}; assert.equal(createRun('before').submit(input).ok,createRun('after').submit(input).ok);
 }
});
test('HTML uses fixed synthetic identity and no free-text input, external submission or tracking',()=> {
 const html=fs.readFileSync(__dirname+'/index.html','utf8'), js=fs.readFileSync(__dirname+'/lab.js','utf8');
 assert.ok(!/<input|<textarea|action=|https?:\/\/[^"']+\.js/.test(html));
 assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|document.cookie/.test(js));
 for(const anchor of ['task','report','changes','retest']) assert.ok(html.includes(`id="${anchor}"`));
 assert.match(html,/browser tab/); assert.match(html,/Not yet measured/); assert.match(js,/event.preventDefault\(\)/);
});
test('accessible improved controls, review focus and reduced motion are implemented',()=>{
 const js=fs.readFileSync(__dirname+'/lab.js','utf8'), css=fs.readFileSync(__dirname+'/lab.css','utf8');
 assert.match(js,/label.htmlFor = key/); assert.match(js,/aria-invalid/); assert.match(js,/\$\('review'\).focus/);
 assert.match(css,/prefers-reduced-motion/); assert.match(css,/focus-visible/);
});
