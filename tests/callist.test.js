// Lot 5 (app) : « À rappeler aujourd'hui », silence, message adapté, retours de visite dans les stats, suppression / purge.
const path = require('path'), assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');
(async () => {
  const DAY = 86400000, now = Date.now(), iso = d => new Date(now - d * DAY).toISOString();
  const V = (id, c, ev, d, adr = '12 rue des Lilas, 91300 Massy · Espace Acheteur Privé · Expertimo') => ({ id, client_nom: c, bien_adresse: adr, evenement: ev, created_at: iso(d) });
  const views = [
    V('1', 'Marie Dupont', 'fiche_ouverte', 0), V('2', 'Marie Dupont', 'fiche_ouverte', 1), V('3', 'Marie Dupont', 'fiche_ouverte', 2), V('4', 'Marie Dupont', 'credit_simule', 1),
    V('5', 'Paul Martin', 'fiche_ouverte', 9), V('6', 'Paul Martin', 'fiche_ouverte', 10), V('7', 'Paul Martin', 'fiche_ouverte', 11),   // silence
    V('8', 'Léa Petit', 'fiche_ouverte', 1),                                                                                              // trop peu engagée
    V('9', 'inconnu', 'fiche_ouverte', 0), V('10', 'inconnu', 'fiche_ouverte', 0), V('11', 'inconnu', 'fiche_ouverte', 0), V('12', 'inconnu', 'fiche_ouverte', 0)
  ];
  const sessions = [
    { session_id: 's1', client_nom: 'Marie Dupont', bien_adresse: '12 rue des Lilas, 91300 Massy · Espace Acheteur Privé · Expertimo', duree_sec: 600, onglets: { budget: 400, bien: 100 }, started_at: new Date(Date.UTC(2026, 8, 29, 17, 0)).toISOString() },
    { session_id: 's2', client_nom: 'Marie Dupont', bien_adresse: '12 rue des Lilas, 91300 Massy · Espace Acheteur Privé · Expertimo', duree_sec: 300, onglets: { budget: 200 }, started_at: new Date(Date.UTC(2026, 8, 28, 18, 30)).toISOString() },
    { session_id: 's3', client_nom: 'Paul Martin', bien_adresse: '12 rue des Lilas, 91300 Massy · Espace Acheteur Privé · Expertimo', duree_sec: 480, onglets: { diagnostics: 300 }, started_at: iso(9) }
  ];
  const retours = [{ id: 'r1', client_nom: 'Paul Martin', bien_adresse: '12 rue des Lilas, 91300 Massy · Espace Acheteur Privé · Expertimo', reponses: ['prix', 'travaux'], created_at: iso(10) }];
  const calls = [], deleted = [];
  const dom = await JSDOM.fromFile(path.join(__dirname, '..', 'app.html'), { runScripts: 'dangerously', virtualConsole: new VirtualConsole(), url: 'http://localhost/app.html', pretendToBeVisual: true, beforeParse(w) {
    w.scrollTo = () => {}; w.confirm = () => true;
    w.fetch = async (url, opt) => {
      url = String(url); calls.push((opt && opt.method || 'GET') + ' ' + url);
      if (opt && opt.method === 'DELETE') { deleted.push(url); return { ok: true, status: 200, json: async () => [] }; }
      const t = url.includes('fiche_sessions') ? sessions : url.includes('fiche_retours') ? retours : url.includes('fiche_views') ? views : [];
      const off = +(url.match(/offset=(\d+)/) || [0, 0])[1]; return { ok: true, status: 200, json: async () => t.slice(off, off + 1000) };
    };
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null }), then: f => f({ data: [] }) };
    w.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => q }) };
    w.eval(require('fs').readFileSync(path.join(__dirname, '..', 'auth-client.js'), 'utf8')); w.sessionStorage.setItem('privency_active_uid', 'test-uid');
  } });
  const w = dom.window, d = w.document; await new Promise(r => setTimeout(r, 300));
  w.privencyAuth = { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } };
  w.PrivencyAuth.lsSet('_agent_profile', JSON.stringify({ prenom: 'Olivier' }));
  await w.loadAnalytics();
  const box = d.getElementById('callist-block'), tx = box.textContent;
  assert.strictEqual(box.style.display, 'block', 'liste visible');
  assert(/À rappeler aujourd.hui/.test(tx) && /Marie Dupont/.test(tx) && /a simulé son financement/.test(tx) && /est revenu 3 fois/.test(tx), 'Marie à rappeler : ' + tx.slice(0, 300));
  assert(/consulte plutôt le soir/.test(tx), 'créneau de consultation : ' + tx);
  assert(/Silence/.test(tx) && /Paul Martin/.test(tx) && /Sans ouverture depuis (9|10) jours/.test(tx) && !/Espace Acheteur/.test(tx) && !/Espace Acheteur/.test(tx) && /retour de visite : le prix, les travaux à prévoir/.test(tx), 'Paul en silence avec son retour : ' + tx);
  assert(!/Léa Petit/.test(tx) && !/inconnu/i.test(tx), 'faible engagement et visiteurs anonymes exclus');
  assert(box.textContent.indexOf('Marie Dupont') < box.textContent.indexOf('Paul Martin'), 'actifs avant silence');
  // message adapté
  const mk = k => w.clBuildMessage(w._analyticsGroups.find(g => g.client === k), false);
  const mm = mk('Marie Dupont'); assert(/^Bonjour Marie, c.est Olivier\. Avez-vous pu avancer dans votre réflexion sur le bien 12 rue des Lilas \?/.test(mm) && !/91300|Espace|Expertimo|,\s\?/.test(mm), 'adresse propre : ' + mm);
assert(/disponible pour répondre/.test(mm), 'sans retour de visite : aucun angle (rien ne trahit les rubriques lues) : ' + mm);
assert(w._analyticsGroups.find(g => g.client === 'Marie Dupont').onglets.budget > 0 && !/courtier|financement/.test(mm), 'rubrique la plus lue (budget) non utilisée');
assert(w._clAddr('Longjumeau (91160) · Espace Acheteur Privé · Expertimo') === 'Longjumeau' && w._clAddr('3 rue X 91000 Évry') === '3 rue X', 'nettoyage des adresses');
  assert(!/(consulté|lu |regardé|simulé|vu que)/i.test(mm), 'le message ne dit pas ce que l\'acquéreur a consulté');
  const ms = w.clBuildMessage(w._analyticsGroups.find(g => g.client === 'Paul Martin'), true); assert(/dernière relance/.test(ms) && /toujours d.actualité/.test(ms), 'message de silence');
  const mp = mk('Paul Martin'); assert(/prix/.test(mp), 'message selon le retour (prix) : ' + mp);
  w.clMessageDialog(w._analyticsGroups.find(g => g.client === 'Marie Dupont').key, false);
  assert(d.getElementById('cl-angle').value === 'aucun' && d.getElementById('cl-copy') && d.getElementById('cl-sms'), 'fenêtre du message');
  d.getElementById('cl-angle').value = 'budget'; d.getElementById('cl-angle').onchange(); assert(/courtier/.test(d.getElementById('cl-text').value), 'angle choisi par l\'agent');
  d.getElementById('cl-overlay').remove();
  // stats : retour affiché ; suppression et purge incluent fiche_retours
  const tb = d.getElementById('analytics-tbody').textContent; assert(/Retour de visite/.test(tb) && /Le prix, Les travaux à prévoir/.test(tb), 'retour affiché dans le tableau');
  await w.deleteAnalyticsGroups([w._analyticsGroups.find(g => g.client === 'Paul Martin').key]);
  assert(deleted.some(u => u.includes('fiche_retours?id=in.(r1)')), 'suppression des retours du groupe : ' + deleted.join('\n'));
  assert(/fiche_retours/.test(require('fs').readFileSync(path.join(__dirname, '..', 'app.html'), 'utf8').match(/fiche_retours\?created_at=lt/)[0]), 'purge des retours');
  console.log('OK liste à rappeler'); process.exit(0);
})().catch(e => { console.error('ÉCHEC :', e.stack || e.message); process.exit(1); });
