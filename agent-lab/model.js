/* Controlled fixture only. No network, customer data, payments or persistence. */
(function (root) {
  'use strict';
  const FIXTURE = Object.freeze({ contact: 'Alex Example · alex@example.test', service: 'office', area: 'DEMO-NORTH', size: 'small', timing: 'next-week' });
  const labels = Object.freeze({ service: { office: 'Office cleaning', window: 'Window cleaning' }, area: { 'DEMO-NORTH': 'Demo North (in area)', 'DEMO-SOUTH': 'Demo South (outside area)' }, size: { small: 'Up to 2,000 sq ft', large: '2,001–5,000 sq ft' }, timing: { 'next-week': 'Next week', 'next-month': 'Next month' } });
  function validate(input) {
    const errors = [];
    for (const key of Object.keys(labels)) if (!Object.hasOwn(labels[key], input[key] || '')) errors.push({ field: key, text: `Choose ${key === 'timing' ? 'a preferred time' : 'a valid ' + key}.` });
    if (input.area === 'DEMO-SOUTH') errors.push({ field: 'area', text: 'This fictional service covers Demo North only. Choose Demo North to continue the fixture task.' });
    return errors;
  }
  function normalized(input) { return Object.fromEntries(Object.keys(labels).map(key => [key, input[key]])); }
  function digest(value) { let n = 2166136261; for (const char of value) n = Math.imul(n ^ char.charCodeAt(0), 16777619); return (n >>> 0).toString(16).padStart(8, '0'); }
  function createRun(variant) {
    if (!['before', 'after'].includes(variant)) throw new Error('Unknown variant');
    let receipt = null;
    return {
      submit(input) {
        const errors = validate(input);
        if (errors.length) return { ok: false, errors };
        const details = normalized(input);
        const fingerprint = JSON.stringify(details);
        if (receipt && receipt.fingerprint === fingerprint) return { ok: true, receipt, duplicate: true };
        receipt = Object.freeze({ id: `LOCAL-${digest(variant + fingerprint)}`, variant, contact: FIXTURE.contact, details, fingerprint, transport: 'Browser memory only. Not delivered to a business.', createdAt: new Date().toISOString() });
        return { ok: true, receipt, duplicate: false };
      },
      reset() { receipt = null; },
      getReceipt() { return receipt; }
    };
  }
  const api = { FIXTURE, labels, validate, createRun };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.QuoteLab = api;
})(typeof window !== 'undefined' ? window : globalThis);
