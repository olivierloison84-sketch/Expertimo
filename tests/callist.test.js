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
  assert(!d.getElementById('callist-block'), 'plus de seconde partie : une seule liste');
  const rows = Array.from(d.querySelectorAll('#analytics-tbody tr')), names = rows.map(r => r.querySelector('.cl-toggle span:nth-of-type(2)').textContent);
  assert.deepStrictEqual(names.slice(0, 2), ['Marie Dupont', 'Paul Martin'], 'actifs puis silence en tête : ' + names);
  const rowOf = n => rows[names.indexOf(n)], tx = n => rowOf(n).textContent;
  assert(/Très chaud/.test(tx('Marie Dupont')) && /a simulé son financement/.test(tx('Marie Dupont')) && /est revenu 3 fois/.test(tx('Marie Dupont')), 'Marie à rappeler : ' + tx('Marie Dupont').slice(0, 300));
  assert(/consulte plutôt le soir/.test(tx('Marie Dupont')), 'créneau de consultation');
  const pt = tx('Paul Martin');
  assert(/Silence/.test(pt) && /sans ouverture depuis (9|10) jours/.test(pt) && !/Espace Acheteur/.test(pt) && /retour de visite : le prix, les travaux à prévoir/.test(pt), 'Paul en silence avec son retour : ' + pt);
  assert(!rowOf('Léa Petit').querySelector('.cl-badge, span[style*="border-radius:12px;font-size:11px"]') || !/à rappeler|Silence/.test(tx('Léa Petit')), 'faible engagement : pas de badge');
  assert(!rowOf('inconnu').querySelector('.cl-msg'), 'visiteur anonyme : pas de message adapté');
  // dépliant : fermé au départ, s'ouvre au clic sur le nom, stats complètes à l'intérieur
  const mr = rowOf('Marie Dupont'), det = mr.querySelector('.cl-detail'), tg = mr.querySelector('.cl-toggle');
  assert(det.hidden, 'fermé au départ'); tg.click(); assert(!det.hidden && tg.getAttribute('aria-expanded') === 'true', 'ouvert au clic');
  assert(/Visites de la fiche/.test(det.textContent) && /Temps passé/.test(det.textContent) && /15 min/.test(det.textContent) && /Oui ×1/.test(det.textContent) && /Simulation de financement/.test(det.textContent), 'stats complètes : ' + det.textContent);
  tg.click(); assert(det.hidden, 'refermé');
  // message adapté
  const mk = k => w.clBuildMessage(w._analyticsGroups.find(g => g.client === k), false);
  const mm = mk('Marie Dupont'); assert(/^Bonjour Marie, c.est Olivier\. Avez-vous pu avancer dans votre réflexion sur le bien 12 rue des Lilas \?/.test(mm) && !/91300|Espace|Expertimo|,\s\?/.test(mm) && mm.length > 350 && /Bien cordialement,\nOlivier$/.test(mm), 'adresse propre : ' + mm);
assert(/à votre disposition/.test(mm), 'sans retour de visite : aucun angle (rien ne trahit les rubriques lues) : ' + mm);
assert(w._analyticsGroups.find(g => g.client === 'Marie Dupont').onglets.budget > 0 && !/courtier|financement/.test(mm), 'rubrique la plus lue (budget) non utilisée');
assert(w._clAddr('Longjumeau (91160) · Espace Acheteur Privé · Expertimo') === 'Longjumeau' && w._clAddr('3 rue X 91000 Évry') === '3 rue X', 'nettoyage des adresses');
  assert(!/(consulté|lu |regardé|simulé|vu que)/i.test(mm), 'le message ne dit pas ce que l\'acquéreur a consulté');
  const ms = w.clBuildMessage(w._analyticsGroups.find(g => g.client === 'Paul Martin'), true); assert(/dernière fois/.test(ms) && /toujours d.actualité/.test(ms) && ms.length > 350, 'message de silence');
  const mp = mk('Paul Martin'); assert(/prix/.test(mp), 'message selon le retour (prix) : ' + mp);
  w.clMessageDialog(w._analyticsGroups.find(g => g.client === 'Marie Dupont').key, false);
  assert(d.getElementById('cl-angle').value === 'aucun' && d.getElementById('cl-copy') && d.getElementById('cl-sms'), 'fenêtre du message');
  assert(d.getElementById('cl-reset'), 'bouton texte d\'origine'); d.getElementById('cl-text').value = 'Mon texte à moi'; d.getElementById('cl-reset').click(); assert(/Bonjour Marie/.test(d.getElementById('cl-text').value), 'réinitialisation'); d.getElementById('cl-text').value = 'Mon texte à moi'; assert(d.getElementById('cl-text').readOnly === false && d.getElementById('cl-text').value === 'Mon texte à moi', 'texte librement modifiable');
  d.getElementById('cl-angle').value = 'budget'; d.getElementById('cl-angle').onchange(); assert(/courtier/.test(d.getElementById('cl-text').value), 'angle choisi par l\'agent');
  d.getElementById('cl-overlay').remove();
  // stats : retour affiché ; suppression et purge incluent fiche_retours
  const tb = d.getElementById('analytics-tbody').textContent; assert(/Retour de visite/.test(tb) && /Le prix, Les travaux à prévoir/.test(tb), 'retour affiché dans le tableau');
  await w.deleteAnalyticsGroups([w._analyticsGroups.find(g => g.client === 'Paul Martin').key]);
  assert(deleted.some(u => u.includes('fiche_retours?id=in.(r1)')), 'suppression des retours du groupe : ' + deleted.join('\n'));
  assert(/fiche_retours/.test(require('fs').readFileSync(path.join(__dirname, '..', 'app.html'), 'utf8').match(/fiche_retours\?created_at=lt/)[0]), 'purge des retours');
  // messages : angle offre / documents suggérés d'après ce que l'acquéreur a envoyé lui-même ; aucun message ne trahit le suivi
  const gM = Object.assign({}, w._analyticsGroups.find(g => g.client === 'Marie Dupont'));
  assert.strictEqual(w.clSuggestAngle(Object.assign({}, gM, { events: { offre_soumise: 1 } })), 'offre');
  assert.strictEqual(w.clSuggestAngle(Object.assign({}, gM, { demandes: [{ docs: ['DPE'], at: iso(0) }] })), 'docs_demandes');
  Object.keys(w._CL_ANGLES).forEach(k => { const m = w.clBuildMessage(gM, false, k); assert(m.length > 350 && !/(consulté|regardé|simulé|vu que|\blu\b)/i.test(m), 'message ' + k); });
  console.log('OK liste à rappeler'); process.exit(0);
})().catch(e => { console.error('ÉCHEC :', e.stack || e.message); process.exit(1); });
