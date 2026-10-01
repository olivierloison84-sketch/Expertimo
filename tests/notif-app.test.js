// Lot 6 (app) : e-mail du vendeur + accord (point hebdomadaire) et case « alertes » dans Mes stats.
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
  const tick = () => new Promise(r => setTimeout(r, 30));
  const TOK = 'b'.repeat(96); const updates = []; let digestCols = true; let prefs = null; const upserts = [];
  const sess = { data: { session: { user: { id: 'u1' }, access_token: 't' } } };
  function chain(table, cols) {
    const b = { eq: () => b, is: () => b, limit: () => b, maybeSingle: async () => ({ data: prefs, error: table === 'agent_notif_prefs' && prefs === 'absent' ? { message: 'relation does not exist' } : null }),
      then: res => Promise.resolve(table === 'vendeur_liens' ? (/digest_email/.test(cols) && !digestCols ? { error: { message: 'column digest_email does not exist' } } : { data: [Object.assign({ token: TOK, note: null, note_at: null, revoked_at: null }, /digest_email/.test(cols) ? { digest_email: null } : {})], error: null }) : { data: [], error: null }).then(res) };
    return b;
  }
  w.privencyAuth = { auth: { getSession: async () => sess },
    from: t => ({ select: c => chain(t, c), insert: async () => ({ error: null }), upsert: async r => { upserts.push([t, r]); return { error: null }; },
      update: p => { updates.push(p); const u = { eq: async () => ({ error: null }) }; return u; } }) };
  // ── dialogue vendeur
  await w.vendeurDialog('a.html'); await tick();
  const em = d.getElementById('vendeur-email'), ok = d.getElementById('vendeur-accord'); assert(em && ok && !ok.checked, 'champ e-mail + case d\'accord');
  const save = () => { d.getElementById('vendeur-save').click(); return tick(); };
  em.value = 'pas-un-email'; ok.checked = true; await save(); assert(!updates.length, 'e-mail invalide refusé');
  em.value = 'vendeur@x.fr'; ok.checked = false; await save(); assert(!updates.length, 'sans accord coché : refusé');
  ok.checked = true; await save(); const u = updates[0]; assert(u && u.digest_email === 'vendeur@x.fr' && u.digest_consent_at && 'note' in u, 'enregistré avec l\'accord : ' + JSON.stringify(u));
  assert(!('digest_last_at' in u), 'l\'app n\'écrit jamais digest_last_at');
  em.value = ''; await save(); const u2 = updates[1]; assert(u2.digest_email === null && u2.digest_consent_at === null, 'e-mail vidé = arrêt du point');
  d.getElementById('vendeur-overlay').remove();
  digestCols = false; await w.vendeurDialog('a.html'); await tick();
  assert(!d.getElementById('vendeur-email') && d.getElementById('vendeur-url'), 'colonnes du lot 6 absentes : le dialogue fonctionne sans le champ e-mail'); d.getElementById('vendeur-overlay').remove();
  // ── alertes
  assert.strictEqual(d.getElementById('alerte-prefs').style.display, 'none', 'case masquée par défaut');
  prefs = 'absent'; await w.loadAlertePref(); assert.strictEqual(d.getElementById('alerte-prefs').style.display, 'none', 'table absente : case masquée');
  prefs = { alertes_actives: true }; await w.loadAlertePref(); assert(d.getElementById('alerte-prefs').style.display === 'flex' && d.getElementById('alerte-cb').checked, 'alertes actives affichées cochées');
  prefs = null; await w.loadAlertePref(); assert(!d.getElementById('alerte-cb').checked, 'pas de préférence = désactivé');
  await w.setAlertePref(true); const up = upserts.find(x => x[0] === 'agent_notif_prefs'); assert(up && up[1].user_id === 'u1' && up[1].alertes_actives === true, 'préférence enregistrée pour l\'agent connecté');
  console.log('OK notifications (app)'); process.exit(0);
})().catch(e => { console.error('ÉCHEC :', e.stack || e.message); process.exit(1); });
