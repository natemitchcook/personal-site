// Public campaign identifiers only. Never accept arbitrary user-supplied labels.
const SOURCES = ['helen-guo','smb-deal-hunter','eric-cacciatore','restaurant-unstoppable','adam-sylvester','melinda-emerson','smallbizlady','ramon-ray','donald-burns','paul-jamison','ica','main-street','jobber','nsfva','barista-exchange','shopify','manhattan-chamber','restaurant-owners-managers','alignable','skool'];
const VALUES = {ref:SOURCES,utm_source:SOURCES,utm_medium:['newsletter','community','email','social','podcast','referral'],utm_campaign:['free-review'],utm_content:['founder-story','free-review']};
const KEY = 'welvia-referral:v1';
function sanitize(value) {
  const result = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  for (const [key, allowed] of Object.entries(VALUES)) {
    if (typeof value[key] === 'string' && allowed.includes(value[key])) result[key] = value[key];
  }
  // Medium/campaign alone cannot identify a referral; don't retain orphan tags.
  return result.ref || result.utm_source ? result : {};
}
function capture(search, storage) {
  const params = new URLSearchParams(search);
  const candidate = {};
  for (const key of Object.keys(VALUES)) {
    const values = params.getAll(key);
    if (values.length === 1) candidate[key] = values[0];
  }
  const current = sanitize(candidate);
  // Last explicit valid referral in this tab wins. Direct navigation preserves it.
  if (Object.keys(current).length) {
    try { storage?.setItem(KEY, JSON.stringify(current)); } catch {}
    return current;
  }
  try { return sanitize(JSON.parse(storage?.getItem(KEY) || '{}')); } catch { return {}; }
}
module.exports = {SOURCES, VALUES, KEY, sanitize, capture};
