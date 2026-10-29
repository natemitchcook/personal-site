const test = require('node:test');
const assert = require('node:assert/strict');
const {SOURCES, VALUES, KEY, sanitize, capture} = require('../referral.cjs');

function memory(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)};
}

test('known public campaign labels survive, arbitrary values never do', () => {
  assert.deepEqual(sanitize({ref:'helen-guo',utm_source:'smb-deal-hunter',utm_medium:'newsletter',utm_campaign:'free-review',utm_content:'founder-story'}),
    {ref:'helen-guo',utm_source:'smb-deal-hunter',utm_medium:'newsletter',utm_campaign:'free-review',utm_content:'founder-story'});
  for (const value of [null,undefined,[],false,'ica',42]) assert.deepEqual(sanitize(value), {});
  for (const secret of ['owner@example.com','https://example.com/private','<script>alert(1)</script>','OWNER NAME','ica\n','a'.repeat(10000),{ref:'ica'},['ica'],true]) {
    assert.deepEqual(sanitize({ref:secret,utm_source:secret,utm_medium:secret,utm_campaign:secret,utm_content:secret}), {});
  }
  assert.deepEqual(sanitize({ref:'ica',email:'private@example.com',token:'SECRET',utm_term:'PRIVATE',utm_content:'person-name'}), {ref:'ica'});
});

test('finite source vocabulary and supported UTM values are bounded strings', () => {
  assert.equal(new Set(SOURCES).size, SOURCES.length);
  assert.ok(SOURCES.includes('helen-guo'));
  assert.ok(SOURCES.includes('ica'));
  assert.deepEqual(Object.keys(VALUES), ['ref','utm_source','utm_medium','utm_campaign','utm_content']);
  for (const options of Object.values(VALUES)) for (const value of options) assert.match(value,/^[a-z][a-z0-9-]{0,63}$/);
});

test('URL capture ignores unrelated parameters, invitation tokens and duplicate keys', () => {
  assert.deepEqual(capture('?ref=ica&token=SECRET&email=owner%40example.com&utm_campaign=free-review',memory()), {ref:'ica',utm_campaign:'free-review'});
  assert.deepEqual(capture('?ref=ica&ref=helen-guo',memory()), {});
  assert.deepEqual(capture('?ref=ica&ref=ica',memory()), {});
  assert.deepEqual(capture('?ref=ica&utm_medium=newsletter&utm_medium=social',memory()), {ref:'ica'});
  assert.deepEqual(capture('?ref=owner%40example.com&utm_source=%3Cscript%3E',memory()), {});
});

test('orphan medium/campaign tags do not invent a source', () => {
  assert.deepEqual(capture('?utm_medium=newsletter&utm_campaign=free-review',memory()), {});
  assert.deepEqual(sanitize({utm_content:'founder-story'}), {});
  assert.deepEqual(capture('?utm_source=jobber&utm_medium=community',memory()), {utm_source:'jobber',utm_medium:'community'});
});

test('same-tab navigation retains last valid explicit referral; new referral replaces it', () => {
  const storage=memory();
  assert.deepEqual(capture('?ref=helen-guo&utm_medium=newsletter',storage), {ref:'helen-guo',utm_medium:'newsletter'});
  assert.deepEqual(capture('',storage), {ref:'helen-guo',utm_medium:'newsletter'});
  assert.deepEqual(capture('?business=avalon',storage), {ref:'helen-guo',utm_medium:'newsletter'});
  assert.deepEqual(capture('?ref=ica',storage), {ref:'ica'});
  assert.deepEqual(capture('',storage), {ref:'ica'});
  assert.deepEqual(JSON.parse(storage.getItem(KEY)), {ref:'ica'});
  assert.deepEqual(capture('',memory()), {}); // A different tab starts unattributed.
});

test('invalid incoming tags never overwrite valid saved attribution', () => {
  const storage=memory();
  capture('?ref=ica',storage);
  assert.deepEqual(capture('?ref=unknown-owner-email&utm_medium=social',storage), {ref:'ica'});
  assert.deepEqual(capture('?ref=ica&ref=jobber',storage), {ref:'ica'});
});

test('storage failure, malformed JSON and tampered saved data fail safely', () => {
  const broken={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}};
  assert.deepEqual(capture('?ref=ica',broken), {ref:'ica'});
  assert.deepEqual(capture('',broken), {});
  assert.deepEqual(capture('?ref=ica'), {ref:'ica'});
  assert.deepEqual(capture(''), {});
  assert.deepEqual(capture('',memory({[KEY]:'not json'})), {});
  assert.deepEqual(capture('',memory({[KEY]:JSON.stringify({ref:'ica',email:'PRIVATE',utm_medium:'private@example.com'})})), {ref:'ica'});
  assert.deepEqual(capture('',memory({[KEY]:JSON.stringify({ref:'private@example.com'})})), {});
});

test('returned attribution does not share mutable state with persistence', () => {
  const storage=memory();
  const result=capture('?ref=ica',storage);
  result.ref='jobber'; result.email='PRIVATE';
  assert.deepEqual(capture('',storage), {ref:'ica'});
});

function analytics(attribution) {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const window = {welviaReferral: {get: () => attribution}, addEventListener(){}};
  const document = {title:'Welvia', referrer:'https://newsletter.example/path?email=private@example.com#SECRET',
    addEventListener(){},createElement(){return {}},head:{appendChild(){}}};
  const location = {origin:'https://welvia.com',hostname:'welvia.com',pathname:'/new',
    search:'?ref=ica&email=private@example.com&token=SECRET&utm_campaign=private',hash:'#SECRET'};
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/analytics.js'),'utf8'), {window,document,location,URL,URLSearchParams});
  window.welviaAnalytics.track('form_submit_success', {form_type:'interest',email:'private@example.com',token:'SECRET'});
  return JSON.parse(JSON.stringify(window.dataLayer.map(args => Array.from(args))));
}

test('analytics keeps finite campaign labels and strips URL, referrer and form PII', () => {
  const events = analytics({ref:'ica',utm_medium:'newsletter',utm_campaign:'free-review',email:'private@example.com'});
  const event = events.find(args => args[0] === 'event')[2];
  assert.equal(event.referral_source, 'ica');
  assert.equal(event.referral_medium, 'newsletter');
  assert.equal(event.referral_campaign, 'free-review');
  assert.equal(event.form_type, 'interest');
  for (const args of events.filter(args => ['set','config','event'].includes(args[0]))) {
    const params = args[args.length - 1];
    assert.equal(params.page_location, 'https://welvia.com/new');
    assert.equal(params.page_referrer, 'https://newsletter.example/');
  }
  assert.doesNotMatch(JSON.stringify(events), /private@example|SECRET/);
});

test('analytics rejects malicious and unknown campaign labels even if global state is tampered with', () => {
  for (const bad of ['private@example.com','SECRET','<script>','a'.repeat(10000),{},['ica'],null]) {
    const events = analytics({ref:bad,utm_source:bad,utm_medium:bad,utm_campaign:bad});
    const event = events.find(args => args[0] === 'event')[2];
    assert.equal(event.referral_source, undefined);
    assert.equal(event.referral_medium, undefined);
    assert.equal(event.referral_campaign, undefined);
    assert.doesNotMatch(JSON.stringify(events), /private@example|SECRET|<script>/);
  }
});

test('review and marketing choices stay separate and optional checkbox is unchecked', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(require('node:path').join(__dirname,'../src.jsx'),'utf8');
  const review = source.match(/<input name="consent"[^>]*>/)?.[0];
  const marketing = source.match(/<input name="marketing_consent"[^>]*>/)?.[0];
  assert.ok(review); assert.ok(marketing);
  assert.match(review,/\brequired\b/);
  assert.doesNotMatch(marketing,/\brequired\b|\bchecked\b|\bdefaultChecked\b/);
  assert.ok(source.includes('Email me my free website review and related updates about this request.'));
  assert.ok(source.includes('Also email me Welvia tips, product updates and offers. I can unsubscribe anytime.'));
  assert.ok(source.includes("marketing_consent:data.marketing_consent==='on'"));
});
