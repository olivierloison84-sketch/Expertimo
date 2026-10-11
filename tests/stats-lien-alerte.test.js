// Lien des e-mails d'alerte (app.html?vue=stats&acq=…&bien=…) : ouvre Mes stats et le message adapté de l'acquéreur identifié.
const fs = require('fs'), path = require('path'), assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.join(__dirname, '..');
const ADR = '42 Boulevard du Docteur Cathelin 91160 Longjumeau · Espace Acheteur Privé · Expertimo';
const now = Date.now(), at = m => new Date(now - m * 60000).toISOString();
const rows = [
  { id: 'r1', client_nom: 'Olivier Loison', bien_adresse: ADR, evenement: 'fiche_ouverte', created_at: at(10) },
  { id: 'r2', client_nom: 'Olivier Loison', bien_adresse: ADR, evenement: 'crush_termine:{"v":1,"m":"solo","s":89,"c":["quotidien","interieur","travaux"],"w":["dpe"],"a":"AAAABBAA","n":"Olivier"}', created_at: at(5) },
  { id: 'r3', client_nom: 'inconnu', bien_adresse: ADR, evenement: 'crush_termine:{"v":1,"m":"solo","s":93,"c":["quotidien"],"w":[],"a":"BBABABBB"}', created_at: at(8) },
  { id: 'r4', client_nom: 'Marie', bien_adresse: ADR, evenement: 'fiche_ouverte', created_at: at(20) }
];
async function open(query) {
  const dom = await JSDOM.fromFile(path.join(root, 'app.html'), { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: new VirtualConsole(), url: 'http://localhost/app.html' + query, beforeParse(w) {
    w.scrollTo = () => {};
    w.fetch = async (url) => ({ ok: true, status: 200, text: async () => '', json: async () => (/offset=[1-9]/.test(url) ? [] : String(url).includes('fiche_views') ? rows : []) });
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null }), then: f => f({ data: [] }) };
    w.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => q }) };
    w.eval(fs.readFileSync(path.join(root, 'auth-client.js'), 'utf8')); w.sessionStorage.setItem('privency_active_uid', 'test-uid');
  } });
  const w = dom.window;
  w.privencyAuth = w.privencyAuth || { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } };
  for (let i = 0; i < 40 && !(w._analyticsGroups && w._analyticsGroups.length); i++) await new Promise(r => setTimeout(r, 50));
  await new Promise(r => setTimeout(r, 50));
  return w;
}
(async () => {
  // acquéreur identifié : Mes stats ouvert, message adapté prêt, paramètres retirés de l'adresse
  let w = await open('?vue=stats&acq=' + encodeURIComponent('Olivier Loison') + '&bien=' + encodeURIComponent(ADR));
  assert(w.document.getElementById('page-5').classList.contains('active'), 'Mes stats ouvert');
  assert.strictEqual(w.location.search, '', 'paramètres retirés de l\'adresse');
  const ov = w.document.getElementById('cl-overlay');
  assert(ov && /Message pour Olivier Loison/.test(ov.textContent), 'message adapté ouvert pour l\'acquéreur');
  assert(/89|test/i.test(w.document.getElementById('cl-text').value), 'le message part du test : ' + w.document.getElementById('cl-text').value.slice(0, 200));
  // acquéreur anonyme : Mes stats ouvert, pas de message adapté (comme dans la liste)
  w = await open('?vue=stats&acq=inconnu&bien=' + encodeURIComponent(ADR));
  assert(w.document.getElementById('page-5').classList.contains('active') && !w.document.getElementById('cl-overlay'), 'anonyme : Mes stats sans message adapté');
  // acquéreur inconnu de la liste ou paramètre forgé : rien d'autre que Mes stats
  w = await open('?vue=stats&acq=' + encodeURIComponent('<img src=x onerror=alert(1)>') + '&bien=x');
  assert(w.document.getElementById('page-5').classList.contains('active') && !w.document.getElementById('cl-overlay'), 'acquéreur absent : Mes stats seul');
  // sans paramètre : comportement habituel
  w = await open('');
  assert(!w.document.getElementById('page-5').classList.contains('active') && !w.document.getElementById('cl-overlay'), 'sans lien : page habituelle');
  console.log('OK lien Mes stats depuis les alertes');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
