// Test E2E avec les VRAIES API (translate-fiche, chat, geoapify). Fiche de test « TEST-… » générée en mémoire,
// JAMAIS écrite dans fiches/ ni publiée. Usage : node tests/live-e2e.js [gen|chat|all]  (résultats : $TEMP/live/*.json)
const fs = require('fs'), path = require('path'), os = require('os');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.join(__dirname, '..'), OUT = path.join(process.env.TEMP || os.tmpdir(), 'live');
const ORIGIN = 'https://app.privency.fr';
const realFetch = globalThis.fetch;
const netFetch = (u, o) => { o = Object.assign({}, o); delete o.signal; o.headers = Object.assign({ Origin: ORIGIN }, o.headers || {}); return realFetch(u, o); };
const SECRETS = { proprio_prenom: 'Zephyrine', proprio_nom: 'Quarantecinq', tel_mobile: '06 12 34 56 78', email_proprio: 'zephyrine.q@exemple-secret.test',
  ref_mandat: 'MANDAT-SECRET-98765', raison_vente: 'divorce-douloureux-secret', prix_achat: '187654', notes_libres: 'notes-libres-agent-secrete',
  scenario_reponse: 'plancher-negociation-scenario-secret', scenario_montant: '211111', q1: 'note-privee-q1-secrete', prix_offres: 'offre-refusee-secrete-231', banque: 'BanqueSecreteXYZ' };
const PUBLIC = { adresse: 'TEST-12 rue des Lilas, 91000 Évry-Courcouronnes', quartier: 'Centre-ville, proche du Parc des Coquibus', surface_hab: '65', nb_pieces: '3', etage: '3ème étage',
  annee_construction: '1985', prix_vente: '250000', charges_copro: '180', taxe_fonciere: '1234', bien_mediane: '3900', bien_tension: 'Forte : les biens partent vite', bien_delai: '45 jours en moyenne',
  bien_fort1: 'Appartement lumineux orienté sud-ouest', bien_fort2: 'Cave et place de parking en sous-sol', bien_fort3: 'Proche du RER D et des commerces',
  bien_vig1: 'Ravalement de façade voté en assemblée générale', bien_vig2: 'Chaudière collective à remplacer à moyen terme',
  historique_libre: '2019 — Rénovation complète de la cuisine\n2022 — Remplacement des fenêtres en double vitrage',
  renov_annee_1: '2019', renov_montant_1: '12000', renov_desc_1: 'Cuisine refaite à neuf avec plan de travail en quartz',
  diag_electricite_status: 'favorable', diag_electricite_result: 'Installation intérieure sans anomalie.', diag_amiante_status: 'non-soumis', diag_amiante_result: 'Non soumis — bâtiment après 1997.',
  dpe_valeur: '210', ges_valeur: '12', services_prox: 'Écoles, commerces et médecins à moins de 10 minutes à pied', voisinage: 'Résidentiel calme' };
async function makeApp(failLang) {
  const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
  const dom = await JSDOM.fromFile(path.join(root, 'app.html'), { runScripts: 'dangerously', virtualConsole: vc, url: 'http://localhost/app.html', pretendToBeVisual: true, beforeParse(w) {
    w.scrollTo = () => {}; w.URL.createObjectURL = () => 'blob:test'; w.matchMedia = () => ({ matches: false, addListener() {}, addEventListener() {} });
    w.localStorage.setItem('_agent_profile:test-uid', JSON.stringify({ prenom: 'Olivier', nom: 'TEST-Agent', tel: '06 00 00 00 00', email: 'agent-test@exemple.test', reseau: 'Expertimo' }));
    w.fetch = async (u, o) => {
      u = String(u);
      if (/index\.html/.test(u)) return { ok: true, status: 200, text: async () => fs.readFileSync(path.join(root, 'index.html'), 'utf8') };
      if (/translate-fiche/.test(u)) {
        const lang = JSON.parse(o.body).lang;
        if (failLang === lang) return { ok: false, status: 500, json: async () => ({ error: 'panne simulée ' + lang }) };
        return netFetch(u, o);
      }
      return { ok: false, status: 503, json: async () => ({}), text: async () => '' };
    };
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null }), then: f => f({ data: [] }) };
    w.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => q }) };
    w.eval(require('fs').readFileSync(require('path').join(__dirname, '..', 'auth-client.js'), 'utf8')); w.sessionStorage.setItem('privency_active_uid', 'test-uid');
  } });
  const w = dom.window, d = w.document;
  await new Promise(r => setTimeout(r, 300));
  w.goToStep(2); await new Promise(r => setTimeout(r, 300));   // initialise le formulaire de l'étape 2 (boutons DPE…)
  const set = (id, v) => { const el = d.getElementById(id); if (!el) throw new Error('champ ' + id); el.value = v; };
  Object.entries(Object.assign({}, PUBLIC, SECRETS)).forEach(([k, v]) => set(k, v));
  const dpe = d.querySelector('#page-2 .dpe-btn[data-group="dpe"][data-letter="D"]'); if (dpe) dpe.click();
  w._geoLat = 48.6297; w._geoLng = 2.4408;
  d.getElementById('chk-bilingue').checked = true;
  return { dom, w, d };
}
async function generate(failLang) {
  const { dom, w } = await makeApp(failLang);
  w._lastGeneratedHTML = '';
  w.generatePreview();
  for (let i = 0; i < 120 && !w._lastGeneratedHTML; i++) await new Promise(r => setTimeout(r, 500));
  const html = w._lastGeneratedHTML, status = w.document.getElementById('step3-status').textContent;
  dom.window.close();
  return { html, status };
}
module.exports = { generate, netFetch, OUT, ORIGIN, SECRETS, PUBLIC };
if (require.main === module) (async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const ok = await generate(null);
  fs.writeFileSync(path.join(OUT, 'TEST-fiche-ok.html'), ok.html); console.log('génération complète :', ok.status, '|', ok.html.length, 'octets');
  const ko = await generate('pt');
  fs.writeFileSync(path.join(OUT, 'TEST-fiche-pt-en-panne.html'), ko.html); console.log('PT en panne :', ko.status, '|', ko.html.length, 'octets');
})();
