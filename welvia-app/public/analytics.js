/* Welvia GA4: all pages, explicit interaction events, no form values or URL tokens. */
(() => {
  if (window.welviaAnalytics) return;
  const id = 'G-N5KBXBFBPD';
  const business = new URLSearchParams(location.search).get('business');
  const validBusiness = business && /^[a-z0-9][a-z0-9-]{0,79}$/.test(business) ? business : '';
  const cleanUrl = location.origin + location.pathname + (validBusiness ? '?business=' + validBusiness : '');
  let referrer = '';
  try { referrer = new URL(document.referrer).origin + '/'; } catch {}
  window.dataLayer = window.dataLayer || [];
  const gtag = (...args) => window.dataLayer.push(args);
  window.gtag = gtag;
  const context = {page_location: cleanUrl, page_referrer: referrer,
    page_title: validBusiness ? 'Welvia business proposal' : document.title,
    ...(validBusiness ? {business_id: validBusiness} : {})};
  gtag('js', new Date());
  gtag('set', context);
  gtag('config', id, {...context, cookie_domain: location.hostname,
    allow_google_signals: false, allow_ad_personalization_signals: false});
  const allowed = new Set(['form_start','form_submit_attempt','form_submit_success','form_submit_error','qa_request','qa_response','checkout_start','business_page_ready','button_click','link_click']);
  window.welviaAnalytics = {track(name, detail = {}) {
    if (!allowed.has(name)) return;
    const params = {...context};
    if (['onboarding','request','qa','feedback'].includes(detail.form_type)) params.form_type = detail.form_type;
    if (typeof detail.destination === 'string') {
      try {
        const url = new URL(detail.destination, location.origin);
        if (['http:','https:'].includes(url.protocol)) params.link_domain = url.hostname;
      } catch {}
    }
    gtag('event', name, params);
  }};
  document.addEventListener('click', e => {
    const el = e.target.closest?.('a,button');
    if (!el) return;
    window.welviaAnalytics.track(el.tagName === 'A' ? 'link_click' : 'button_click',
      {destination: el.tagName === 'A' ? el.href : ''});
  }, {capture:true});
  window.addEventListener('welvia:campaign-ready', () => window.welviaAnalytics.track('business_page_ready'));
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + id;
  document.head.appendChild(script);
})();
