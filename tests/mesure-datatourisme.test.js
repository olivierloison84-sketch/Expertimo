// Route temporaire api/mesure-datatourisme.js : accès réservé, clé jamais renvoyée, filtre par commune vérifié,
// pagination, classement par catégorie, événements à venir, réponses inattendues rapportées telles quelles.
// Usage : cd tests && node mesure-datatourisme.test.js
const path = require('path'), assert = require('assert');
const Module = require('module'); const _load = Module._load;
Module._load = function(r, ...x) { return r === '@supabase/supabase-js' ? { createClient: () => { throw new Error('non utilisé : vérification injectée'); } } : _load.call(this, r, ...x); };
const route = require(path.join(__dirname, '..', 'api', 'mesure-datatourisme.js'));
const KEY = 'cle-secrete-123456';
const ADMIN = { id: '79e4e432-2232-4d2c-b41d-8c7c907c4dec' };
function res() { const r = { code: 0, body: null, headers: {} }; r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; }; r.setHeader = (k, v) => { r.headers[k] = v; }; return r; }
const req = (auth = 'Bearer jwt') => ({ method: 'GET', headers: { authorization: auth } });
const obj = (insee, type, label, extra = {}) => ({ uuid: 'u' + Math.random(), type: [type, 'PointOfInterest'], label: { fr: label }, isLocatedAt: [{ address: [{ hasAddressCity: { insee } }] }], ...extra });

(async () => {
  // ── accès
  let r = res(); await route.handler(req(''), r, {}); assert.strictEqual(r.code, 401, 'sans jeton');
  r = res(); await route.handler(req(), r, { verifier: async () => null }); assert.strictEqual(r.code, 401, 'jeton invalide');
  r = res(); await route.handler(req(), r, { verifier: async () => ({ id: 'autre' }) }); assert.strictEqual(r.code, 403, 'agent non administrateur');
  r = res(); await route.handler(req(), r, { verifier: async () => ADMIN, env: {} }); assert.strictEqual(r.code, 500); assert(/DATATOURISME_API_KEY/.test(r.body.error), 'clé absente signalée');
  r = res(); await route.handler({ method: 'POST', headers: {} }, r, {}); assert.strictEqual(r.code, 405, 'lecture seule');

  // ── API simulée : l'alias « insee » est ignoré (renvoie tout le pays), le filtre explicite fonctionne
  const appels = [];
  const DATA = {
    '91345': [obj('91345', 'Church', 'Église Saint-Martin'), obj('91345', 'Restaurant', 'Le Bistrot'), obj('91345', 'Hotel', 'Hôtel du Pont'),
      obj('91345', 'CulturalEvent', 'Fête de la musique', { takesPlaceAt: [{ startDate: '2026-06-21', endDate: '2026-06-21' }] }),
      obj('91345', 'CulturalEvent', 'Salon d\'automne', { takesPlaceAt: [{ startDate: '2026-11-02', endDate: '2026-11-03' }] }),
      obj('91345', 'SocialEvent', 'Brocante'), obj('91345', 'Museum', 'Musée'), obj('91345', 'ParkAndGarden', 'Parc Nativelle'),
      obj('91345', 'TouristInformationCenter', 'Office de tourisme'), obj('91345', 'Bizarre', 'Objet inconnu')],
    '91161': Array.from({ length: 150 }, (_, i) => obj('91161', 'Restaurant', 'Resto ' + i)),
    '91689': []
  };
  const fakeFetch = async (url, opt) => {
    appels.push({ url, key: opt.headers['X-API-Key'] });
    const u = new URL(url), p = u.searchParams, page = +p.get('page'), size = +p.get('page_size');
    let liste;
    if (p.get('insee')) liste = DATA['91345'].concat(DATA['91161']).map(o => ({ ...o, isLocatedAt: [{ address: [{ hasAddressCity: { insee: '75056' } }] }] }));   // filtre ignoré
    else { const m = /insee\[eq\]=(\d+)/.exec(p.get('filters') || ''); liste = m ? DATA[m[1]] || [] : []; }
    const objects = liste.slice((page - 1) * size, page * size);
    return { status: 200, text: async () => JSON.stringify({ objects, meta: { total: liste.length, page, page_size: size, total_pages: Math.ceil(liste.length / size) } }) };
  };
  r = res(); await route.handler(req(), r, { verifier: async () => ADMIN, env: { DATATOURISME_API_KEY: KEY }, fetch: fakeFetch, now: () => new Date('2026-10-11T10:00:00Z') });
  assert.strictEqual(r.code, 200, JSON.stringify(r.body));
  assert(!JSON.stringify(r.body).includes(KEY), 'clé jamais dans la réponse');
  assert(appels.every(a => a.key === KEY) && appels.every(a => !a.url.includes(KEY)), 'clé seulement dans l\'en-tête X-API-Key');
  assert(appels.every(a => a.url.startsWith('https://api.datatourisme.fr/v1/catalog?')), 'uniquement l\'API DATAtourisme');
  const [lj, cm, wi] = r.body.communes;
  assert.strictEqual(lj.essais[0].filtre, 'alias insee'); assert.strictEqual(lj.essais[0].objets_page1_dans_commune, 0, 'alias ignoré détecté (objets hors commune)');
  assert.strictEqual(lj.filtre_retenu, 'filtre isLocatedAt.address.hasAddressCity.insee');
  const c = lj.cases;
  assert.deepStrictEqual([c.patrimoine.nombre, c.restauration.nombre, c.hebergements.nombre, c.evenements.nombre, c.culture.nombre, c.loisirs.nombre, c.equipements.nombre, c.autres.nombre], [1, 1, 1, 3, 1, 1, 1, 1], JSON.stringify(c));
  assert.deepStrictEqual(c.patrimoine.exemples, ['Église Saint-Martin']);
  assert.strictEqual(c.evenements_a_venir.nombre, 1); assert.deepStrictEqual(c.evenements_a_venir.exemples, ['Salon d\'automne']); assert.strictEqual(c.evenements_a_venir.sans_date, 1, 'brocante sans date');
  assert(lj.repartition_types.some(([t, n]) => t === 'PointOfInterest' && n === 10), 'répartition brute des types');
  assert.strictEqual(cm.total_annonce, 150); assert.strictEqual(cm.objets_lus, 150, 'pagination (2 pages)'); assert.strictEqual(cm.cases.restauration.nombre, 150); assert.strictEqual(cm.cases.restauration.exemples.length, 2);
  assert.strictEqual(wi.total_annonce, 0, 'commune sans données : 0, pas d\'erreur'); assert.strictEqual(wi.cases.patrimoine.nombre, 0);

  // ── réponse inattendue (forme différente) : rapportée, aucun chiffre inventé
  r = res(); await route.handler(req(), r, { verifier: async () => ADMIN, env: { DATATOURISME_API_KEY: KEY }, now: () => new Date('2026-10-11'),
    fetch: async () => ({ status: 403, text: async () => '<html>Forbidden</html>' }) });
  assert.strictEqual(r.code, 200);
  r.body.communes.forEach(x => { assert(!x.cases && /Aucune forme de filtre/.test(x.erreur), 'erreur explicite'); assert(x.essais.every(e => e.statut === 403 && /Forbidden/.test(e.extrait_si_non_json)), 'statut et extrait rapportés'); });
  r = res(); await route.handler(req(), r, { verifier: async () => ADMIN, env: { DATATOURISME_API_KEY: KEY }, now: () => new Date('2026-10-11'),
    fetch: async () => ({ status: 200, text: async () => JSON.stringify({ results: [{ a: 1 }], count: 1 }) }) });
  assert(r.body.communes.every(x => !x.cases && x.essais[0].cles_reponse.join() === 'results,count'), 'forme JSON inattendue : clés rapportées, pas de comptage');
  r = res(); await route.handler(req(), r, { verifier: async () => ADMIN, env: { DATATOURISME_API_KEY: KEY }, now: () => new Date('2026-10-11'), fetch: async () => { throw new Error('ECONNRESET'); } });
  assert(r.body.communes.every(x => x.essais.every(e => e.statut === 0 && /ECONNRESET/.test(e.extrait_si_non_json))), 'erreur réseau rapportée');
  // ── page de lecture : tableau commune × catégorie, contrôles, réservée à l'administrateur
  {
    const fs = require('fs'), { JSDOM, VirtualConsole } = require('jsdom');
    let corps = null;
    { const rr = res(); await route.handler(req(), rr, { verifier: async () => ADMIN, env: { DATATOURISME_API_KEY: KEY }, fetch: fakeFetch, now: () => new Date('2026-10-11') }); corps = rr.body; }
    const ouvrir = async (uid) => { const dom = new JSDOM(fs.readFileSync(path.join(__dirname, '..', 'mesure-datatourisme.html'), 'utf8').replace(/<script src="https:[^"]+"><\/script>/, ''), { runScripts: 'dangerously', url: 'https://app.privency.fr/mesure-datatourisme.html', virtualConsole: new VirtualConsole(), beforeParse(w) {
        const session = { access_token: 'tok', user: { id: uid, email: 'x@y.fr' } };
        w.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), getUser: async () => ({ data: { user: session.user } }) }, from: () => ({}) }) };
        w.fetch = async (u, o) => { assert(/^\/api\/mesure-datatourisme$/.test(u) && o.headers.Authorization === 'Bearer tok'); return { ok: true, status: 200, json: async () => corps }; };
        w.eval(fs.readFileSync(path.join(__dirname, '..', 'auth-client.js'), 'utf8'));
      } });
      await new Promise(t => setTimeout(t, 200)); return dom.window.document; };
    let doc = await ouvrir(ADMIN.id);
    const tab = doc.querySelector('#resultat table'); assert(tab, 'tableau affiché');
    const lignes = [...tab.querySelectorAll('tr')].map(tr => tr.textContent);
    assert(/Longjumeau/.test(lignes[1]) && /Église Saint-Martin/.test(lignes[1]) && /Salon d'automne/.test(lignes[1]), lignes[1]);
    assert(/Chilly-Mazarin/.test(lignes[2]) && /150/.test(lignes[2]), 'Chilly : 150 restaurants');
    assert(/total annoncé par l'API : 150/.test(doc.getElementById('resultat').textContent) && /statut 200/.test(doc.getElementById('resultat').textContent), 'contrôles affichés');
    assert(!doc.body.innerHTML.includes(KEY));
    doc = await ouvrir('autre'); assert(/réservée au compte administrateur/.test(doc.getElementById('statut').textContent) && !doc.querySelector('#resultat table'), 'non-administrateur : rien');
  }
  console.log('OK mesure DATAtourisme : accès, clé protégée, filtre vérifié, pagination, catégories, réponses inattendues');
})().catch(e => { console.error(e); process.exit(1); });
