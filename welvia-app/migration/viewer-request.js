// CloudFront Function, viewer-request on the static default behavior only.
// Leave /api/* behavior untouched: never redirect a form POST across origins.
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var host = request.headers.host.value;
  var target = uri;
  if (/^\/new(?:\.html)?\/?$/.test(uri)) target = '/smb';
  if (/^\/journal(?:\.html|\/index\.html)?\/?$/.test(uri)) target = '/blog/';
  if (uri.indexOf('/journal/') === 0 && target === uri) target = '/blog/' + uri.slice(9);
  if (uri === '/blog' || uri === '/blog/index.html') target = '/blog/';
  var oldHost = host === 'welvia.natemitchcook.com';
  if (oldHost || target !== uri) {
    var pairs = [];
    Object.keys(request.querystring || {}).forEach(function(key) {
      var item = request.querystring[key];
      (item.multiValue || [item]).forEach(function(v) { pairs.push(key + '=' + v.value); });
    });
    return {statusCode: 308, statusDescription: 'Permanent Redirect', headers: {
      location: {value: 'https://welvia.app' + target + (pairs.length ? '?' + pairs.join('&') : '')},
      'cache-control': {value: 'public, max-age=300'}
    }};
  }
  if (uri === '/blog/') request.uri = '/blog/index.html';
  if (uri === '/care-demo' || uri === '/care-demo/') request.uri = '/care-demo/index.html';
  return request;
}
