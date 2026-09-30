// Lot 4 (app) : fenêtre « Vendeur » — création, copie, mot, arrêt du lien.
const path = require('path'), assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');
(async () => {
  const dom = await JSDOM.fromFile(path.join(__dirname, '..', 'app.html'), { runScripts: 'dangerously', url: 'https://app.privency.fr/app.html', virtualConsole: new VirtualConsole(), beforeParse(w) {
    w.scrollTo = () => {}; w.fetch = async () => ({ ok: true, status: 200, json: async () => [] });
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null }), upsert: async () => ({ error: null }), then: f => f({ data: [] }) };
    w.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }), getUser: async () => ({ data: { user: { id: 'u1' } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => q }) };
    w.eval(require('fs').readFileSync(path.join(__dirname, '..', 'auth-client.js'), 'utf8')); w.sessionStorage.setItem('privency_active_uid', 'test-uid');
  } });
  const w = dom.window, d = w.document; await new Promise(r => setTimeout(r, 300));
  const rows = []; const log = []; const TOK = 'b'.repeat(96);
  function qb(op, payload) { const f = {}; const o = { op, payload, f };
    const b = { eq: (k, v) => { f[k] = v; return b; }, is: (k, v) => { f['is_' + k] = v; return b; }, limit: () => b, select: () => b,
      then: (res) => { log.push(o); let out = { data: null, error: null };
        if (op === 'select') { if (/\bid\b/.test(payload || '')) out.error = { message: 'column id does not exist' }; } if (op === 'select' && !out.error) out.data = rows.filter(r => !r.revoked_at && r.filename === f.filename).map(r => Object.assign({}, r));
        if (op === 'insert') rows.push({ token: TOK, note: null, revoked_at: null, filename: payload.filename });
        if (op === 'update') { const r = rows.find(x => x.token === f.token); Object.assign(r, payload); }
        return Promise.resolve(out).then(res); } };
    return b; }
  w.privencyAuth = { auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' }, access_token: 't' } } }) },
    from: t => { assert.strictEqual(t, 'vendeur_liens'); return { select: c => qb('select', c), insert: p => qb('insert', p), update: p => qb('update', p) }; } };
  const tick = () => new Promise(r => setTimeout(r, 30));
  await w.vendeurDialog('Maison <b>x</b>.html'); await tick();
  assert(/Créez un lien privé/.test(d.getElementById('vendeur-overlay').textContent), 'invite de création');
  assert(!d.querySelector('#vendeur-overlay b'), 'pas de HTML injecté');
  Array.from(d.querySelectorAll('#vendeur-overlay button')).find(b => /Créer le lien/.test(b.textContent)).click(); await tick(); await tick();
  const ins = log.find(x => x.op === 'insert'); assert(ins && ins.payload.agent_user_id === 'u1' && ins.payload.filename === 'Maison <b>x</b>.html', 'insertion');
  assert.strictEqual(d.getElementById('vendeur-url').value, 'https://app.privency.fr/vendeur.html#' + TOK, 'URL du lien (jeton dans le fragment)');
  d.getElementById('vendeur-note').value = 'Belle semaine'; d.getElementById('vendeur-save').click(); await tick();
  const up = log.find(x => x.op === 'update' && 'note' in x.payload); assert(up && up.payload.note === 'Belle semaine' && up.payload.note_at, 'mot enregistré');
  Array.from(d.querySelectorAll('#vendeur-overlay button')).find(b => /Arrêter/.test(b.textContent)).click(); await tick(); await tick();
  assert(log.some(x => x.op === 'update' && x.payload.revoked_at), 'révocation');
  assert(/Créez un lien privé/.test(d.getElementById('vendeur-overlay').textContent), 'retour à l\'invite après arrêt');
  assert(/Vendeur/.test(require('fs').readFileSync(path.join(__dirname, '..', 'app.html'), 'utf8').match(/vendeurDialog\(this[^]{0,120}/)[0]), 'bouton dans le tableau');
  console.log('OK app vendeur'); process.exit(0);
})().catch(e => { console.error('ÉCHEC :', e.stack || e.message); process.exit(1); });
