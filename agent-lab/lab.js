(() => {
  'use strict';
  const { FIXTURE, labels, validate, createRun } = window.QuoteLab;
  const $ = id => document.getElementById(id);
  let variant = 'before', pending = null;
  const runs = { before: createRun('before'), after: createRun('after') };
  const values = { before: {}, after: {} };
  const names = { service: 'Which service do you need?', area: 'Where is the fictional office?', size: 'How large is the office?', timing: 'When would you prefer service?' };
  const short = { office: 'OFF', window: 'WIN', 'DEMO-NORTH': 'N', 'DEMO-SOUTH': 'S', small: 'S', large: 'L', 'next-week': 'W+1', 'next-month': 'M+1' };
  function details(node, input) {
    node.replaceChildren();
    for (const key of Object.keys(labels)) {
      const dt = document.createElement('dt'); dt.textContent = names[key];
      const dd = document.createElement('dd'); dd.textContent = labels[key][input[key]];
      node.append(dt, dd);
    }
    const dt = document.createElement('dt'); dt.textContent = 'Synthetic contact';
    const dd = document.createElement('dd'); dd.textContent = FIXTURE.contact; node.append(dt, dd);
  }
  function render() {
    pending = null;
    $('fields').replaceChildren();
    Object.entries(labels).forEach(([key, options], index) => {
      const wrapper = document.createElement('div'); wrapper.className = 'field';
      const label = document.createElement('label'); label.htmlFor = key;
      label.textContent = variant === 'after' ? names[key] : `Option ${index + 1}`;
      const select = document.createElement('select'); select.id = key; select.name = key; select.required = true;
      const empty = document.createElement('option'); empty.value = ''; empty.textContent = variant === 'after' ? 'Choose an option' : 'Select'; select.append(empty);
      for (const [value, text] of Object.entries(options)) { const option = document.createElement('option'); option.value = value; option.textContent = variant === 'after' ? text : short[value]; select.append(option); }
      select.value = values[variant][key] || '';
      select.addEventListener('change', () => { values[variant][key] = select.value; });
      wrapper.append(label, select);
      if (key === 'area' && variant === 'after') { const help = document.createElement('p'); help.id = 'area-help'; help.className = 'small'; help.textContent = 'This fictional company serves Demo North only.'; select.setAttribute('aria-describedby', help.id); wrapper.append(help); }
      $('fields').append(wrapper);
    });
    document.querySelectorAll('[data-variant]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.variant === variant)));
    $('variant-label').textContent = variant === 'after' ? 'Improved interface · same task and rules' : 'Intentionally seeded baseline';
    $('form-title').textContent = variant === 'after' ? 'Request an office-cleaning quote' : 'Make an enquiry';
    $('variant-description').textContent = variant === 'after' ? 'Explicit choices, helpful recovery, and a review before a local-only confirmation.' : 'This baseline intentionally uses abbreviations and generic instructions. It still supports the task; failure is not assumed.';
    $('review-button').textContent = variant === 'after' ? 'Review synthetic request' : 'Continue';
    $('quote-form').hidden = false; $('review').hidden = true; $('receipt').hidden = true; $('errors').hidden = true;
    $('status').textContent = runs[variant].getReceipt() ? 'This version has a local receipt. Resubmitting identical choices reuses it.' : 'No receipt created.';
  }
  document.querySelectorAll('[data-variant]').forEach(button => button.addEventListener('click', () => { variant = button.dataset.variant; render(); }));
  $('load-fixture').addEventListener('click', () => { values[variant] = Object.fromEntries(Object.keys(labels).map(key => [key, FIXTURE[key]])); render(); $('status').textContent = 'Synthetic task values filled. Auto-fill is not an agent test.'; $('service').focus(); });
  $('quote-form').addEventListener('submit', event => {
    event.preventDefault();
    const input = Object.fromEntries(Object.keys(labels).map(key => [key, $(key).value]));
    values[variant] = input;
    Object.keys(labels).forEach(key => $(key).removeAttribute('aria-invalid'));
    const errors = validate(input);
    if (errors.length) {
      $('errors').replaceChildren();
      const heading = document.createElement('h3'); heading.textContent = variant === 'after' ? 'Update these choices' : 'Check your choices'; $('errors').append(heading);
      if (variant === 'after') { const ul = document.createElement('ul'); errors.forEach(error => { const li = document.createElement('li'); const a = document.createElement('a'); a.href = '#' + error.field; a.textContent = error.text; a.addEventListener('click', e => { e.preventDefault(); $(error.field).focus(); }); li.append(a); ul.append(li); $(error.field).setAttribute('aria-invalid', 'true'); }); $('errors').append(ul); }
      $('errors').hidden = false; $('errors').focus(); $('status').textContent = 'No receipt created for these invalid choices.'; return;
    }
    pending = input; details($('summary'), input); $('quote-form').hidden = true; $('review').hidden = false; $('receipt').hidden = true; $('review').focus();
  });
  $('edit').addEventListener('click', () => { $('review').hidden = true; $('quote-form').hidden = false; pending = null; $('service').focus(); });
  $('confirm').addEventListener('click', () => {
    if (!pending) return;
    const result = runs[variant].submit(pending);
    if (!result.ok) return;
    $('receipt-id').textContent = `${result.receipt.id} · ${result.receipt.createdAt}`; details($('receipt-details'), result.receipt.details);
    $('review').hidden = true; $('receipt').hidden = false; $('receipt').focus(); $('status').textContent = result.duplicate ? 'Existing local receipt reused. No second request created.' : 'One local receipt created. Nothing sent.';
  });
  $('download').addEventListener('click', () => {
    const receipt = runs[variant].getReceipt(); if (!receipt) return;
    const report = { kind: 'controlled-browser-local-fixture', recordedAt: new Date().toISOString(), receipt, boundaries: ['Synthetic choices only', 'No server delivery', 'No payment or booking', 'Not an independent agent benchmark'], agentPerformance: 'Not measured by this receipt' };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `welvia-${variant}-${receipt.id}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('reset').addEventListener('click', () => { runs[variant].reset(); values[variant] = {}; render(); $('service').focus(); });
  render();
})();
