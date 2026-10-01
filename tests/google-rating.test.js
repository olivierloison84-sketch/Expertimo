// api/google-rating : origine, authentification, validation, appels Google (mockés), aucune clé en clair.
const assert = require('assert'), path = require('path');
const Module = require('module'); const sb = {};
let userOk = true;
const _load = Module._load; Module._load = function(r) { return r === '@supabase/supabase-js' ? sb : _load.apply(this, arguments); };
sb.createClient = () => ({ auth: { getUser: async () => userOk ? { data: { user: { id: 'u1' } }, error: null } : { data: null, error: { message: 'x' } } } });
const handler = require(path.join(__dirname, '..', 'api', 'google-rating.js'));
const calls = [];
global.fetch = async (url, opt) => { calls.push({ url, opt });
  if (String(url).includes('places:searchText')) return { ok: true, status: 200, json: async () => ({ places: [{ id: 'ChIJabcdefghij', displayName: { text: 'Expertimo Olivier' }, formattedAddress: '1 rue X', rating: 4.9, userRatingCount: 37 }] }) };
  if (String(url).includes('ChIJmissing00')) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => ({ id: 'ChIJabcdefghij', displayName: { text: 'Expertimo Olivier' }, rating: 4.86, userRatingCount: 40 }) }; };
function run(o) { return new Promise(resolve => { const res = { h: {}, code: 200, setHeader(k, v) { this.h[k] = v; }, status(c) { this.code = c; return this; }, json(b) { resolve({ code: this.code, body: b, h: this.h }); }, end() { resolve({ code: this.code, h: this.h }); } };
  handler(Object.assign({ method: 'POST', headers: { origin: 'https://app.privency.fr', authorization: 'Bearer tok' }, body: {} }, o), res); }); }
(async () => {
  process.env.SUPABASE_SECRET_KEY = 's'; process.env.GOOGLE_PLACES_API_KEY = 'KEYTEST';
  assert.strictEqual((await run({ headers: { origin: 'https://evil.example', authorization: 'Bearer t' } })).code, 403, 'origine refusée');
  assert.strictEqual((await run({ headers: { origin: 'https://app.privency.fr' } })).code, 401, 'sans jeton');
  assert.strictEqual((await run({ method: 'GET' })).code, 405);
  userOk = false; assert.strictEqual((await run({ body: { q: 'abc def' } })).code, 401, 'jeton invalide'); userOk = true;
  assert.strictEqual(calls.length, 0, 'aucun appel Google avant authentification');
  assert.strictEqual((await run({ body: { q: 'ab' } })).code, 400, 'recherche trop courte');
  assert.strictEqual((await run({ body: { place_id: '../etc/passwd' } })).code, 400, 'place_id invalide');
  const s = await run({ body: { q: 'Expertimo Brétigny' } });
  assert.strictEqual(s.code, 200); assert.deepStrictEqual(s.body.candidats[0], { place_id: 'ChIJabcdefghij', nom: 'Expertimo Olivier', adresse: '1 rue X', note: 4.9, nb: 37 });
  assert.strictEqual(calls[0].opt.headers['X-Goog-FieldMask'].includes('rating'), true);
  const d = await run({ body: { place_id: 'ChIJabcdefghij' } }); assert.strictEqual(d.body.note, 4.86);
  assert.strictEqual((await run({ body: { place_id: 'ChIJmissing00' } })).code, 404);
  delete process.env.GOOGLE_PLACES_API_KEY; assert.strictEqual((await run({ body: { q: 'abcdef' } })).code, 503, 'clé absente -> 503 clair');
  assert(!require('fs').readFileSync(path.join(__dirname, '..', 'api', 'google-rating.js'), 'utf8').match(/AIza/), 'pas de clé en clair');
  console.log('OK google-rating'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
