// Profil agent : liaison Google (recherche -> choix -> sauvegarde -> retrait), échappement HTML, jamais de note sans liaison.
const path = require('path'), assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');
(async () => {
  const calls = [], upserts = [];
  const dom = await JSDOM.fromFile(path.join(__dirname, '..', 'app.html'), { runScripts: 'dangerously', url: 'https://app.privency.fr/app.html', virtualConsole: new VirtualConsole(), beforeParse(w) {
    w.scrollTo = () => {};
    w.fetch = async (url, opt) => { calls.push({ url: String(url), body: opt && opt.body });
      if (String(url).includes('/api/google-rating')) return { ok: true, status: 200, json: async () => ({ candidats: [{ place_id: 'ChIJabcdefghij', nom: 'Agence <img src=x onerror=alert(1)>', adresse: '1 rue X', note: 4.9, nb: 37 }] }) };
      return { ok: true, status: 200, json: async () => [] }; };
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null }), upsert: async r => { upserts.push(r); return { error: null }; }, then: f => f({ data: [] }) };
    w.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }), getUser: async () => ({ data: { user: { id: 'u1' } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => q }) };
    w.eval(require('fs').readFileSync(path.join(__dirname, '..', 'auth-client.js'), 'utf8')); w.sessionStorage.setItem('privency_active_uid', 'test-uid');
  } });
  const w = dom.window, d = w.document; await new Promise(r => setTimeout(r, 300));
  w.privencyAuth = { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }), getUser: async () => ({ data: { user: { id: 'u1' } } }) }, from: () => ({ upsert: async r => { upserts.push(r); return { error: null }; } }) };
  assert(/Aucune fiche Google/.test((w.renderGoogleStatus(), d.getElementById('google-status').textContent)), 'état initial sans liaison');
  d.getElementById('agent-google-q').value = 'Agence test Massy';
  await w.googleSearch();
  const c = calls.find(x => x.url.includes('/api/google-rating')); assert(c && JSON.parse(c.body).q === 'Agence test Massy', 'requête envoyée');
  assert(!d.querySelector('#google-results img'), 'nom Google échappé (pas d\'injection HTML)');
  w.googlePick(0);
  await new Promise(r => setTimeout(r, 100));
  assert(/4,9\/5 · 37 avis/.test(d.getElementById('google-status').textContent), 'note affichée : ' + d.getElementById('google-status').textContent);
  const prof = JSON.parse(w.PrivencyAuth.lsGet('_agent_profile')); assert.strictEqual(prof.google.place_id, 'ChIJabcdefghij'); assert.strictEqual(prof.google.note, 4.9);
  assert(upserts.some(r => r.google_rating === 4.9 && r.google_reviews === 37), 'upsert Supabase avec les colonnes Google');
  w.googleClear(); await new Promise(r => setTimeout(r, 100));
  assert.strictEqual(JSON.parse(w.PrivencyAuth.lsGet('_agent_profile')).google, null, 'retrait');
  assert(upserts[upserts.length - 1].google_rating === null, 'retrait propagé en base');
  console.log('OK profil Google'); process.exit(0);
})().catch(e => { console.error('ÉCHEC :', e.stack || e.message); process.exit(1); });
