// Crush immobilier : calcul du score (fonction pure extraite du gabarit index.html) et intégration dans la fiche.
// Usage : cd tests && node crush.test.js
const fs = require('fs'), path = require('path'), assert = require('assert'), vm = require('vm');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const m = html.match(/<script id="crush-calc">([\s\S]*?)<\/script>/);
assert(m, 'bloc <script id="crush-calc"> introuvable dans index.html');
const ctx = {}; vm.runInNewContext(m[1], ctx);
// Résultats recopiés en JSON : les tableaux créés dans le contexte vm ne sont pas « strictement égaux » à ceux du test.
const plain = f => (...args) => JSON.parse(JSON.stringify(f(...args)));
const C = { QUESTIONS: ctx.PrivencyCrush.QUESTIONS.slice(), score: plain(ctx.PrivencyCrush.score), duo: plain(ctx.PrivencyCrush.duo) };
const Q = C.QUESTIONS;
assert.strictEqual(Q.length, 8, '8 questions');
const all = a => Object.fromEntries(Q.map(q => [q, a]));
const note = (r, q) => r.criteres.find(c => c.q === q).note;

// Bien « idéal » pour un profil tout A : tout correspond fortement.
const ideal = {
  type: 'maison', surface: 120, terrain: 600, pieces: 6, etage: '', ext: { Jardin: 400, 'Terrasse': 30 },
  expo: ['Sud'], sonore: 'Calme', transports: ['Bus'], parking: 2, annexes: ['Cave', 'Grenier'],
  dpe: 'B', chauffage: ['PAC'], equip: ['Photovoltaïque'], scores: { etat: 9, prest: 9, secteur: 9, qp: 8 },
  vigilances: [], poi: { transport: 3, commerce: 8, vert: 2 }, dvf: { n: 6, prixm2: 3000, mediane: 3050 }
};
// Bien « à l'opposé » du même profil tout A : tout correspond faiblement.
const oppose = {
  type: 'appart', surface: 30, pieces: 1, etage: 'RDC', ext: {}, expo: ['Nord'], sonore: 'Bruyant', parking: 0,
  annexes: [], dpe: 'G', scores: { etat: 3, prest: 3, secteur: 4, qp: 3 },
  vigilances: ['Travaux importants à prévoir'], poi: { transport: 0, commerce: 0, vert: 0 }, dvf: { n: 1, prixm2: 6000, mediane: 3000 }
};

// 1. Données complètes : 8 critères utilisés, plafond 98 %, 3 raisons, aucun point à vérifier.
let r = C.score(all('A'), ideal);
assert.strictEqual(r.nbUtilises, 8, 'données complètes : 8 critères');
Q.forEach(q => assert.strictEqual(note(r, q), 100, 'note forte attendue : ' + q));
assert.strictEqual(r.score, 98, 'plafond 98 %');
assert.strictEqual(r.top.length, 3, '3 raisons');
assert.deepStrictEqual(r.aVerifier, [], 'aucun point à vérifier');
r.criteres.forEach(c => assert(c.data.length, 'donnée comparée affichée : ' + c.q));

// 2. Plancher : tout faible → 60 %, jamais moins ; au plus 2 points à vérifier, sans doublon.
r = C.score(all('A'), oppose);
assert.strictEqual(r.nbUtilises, 8);
Q.forEach(q => assert.strictEqual(note(r, q), 40, 'note faible attendue : ' + q));
assert.strictEqual(r.score, 60, 'plancher 60 %');
assert.strictEqual(r.top.length, 0, 'aucune raison inventée quand rien ne correspond');
assert(r.aVerifier.length === 2 && r.aVerifier[0].k !== r.aVerifier[1].k, 'au plus 2 points à vérifier, distincts');

// 3. Échelle : moyenne 70 → 79 % ; arrondi et bornes.
const moyen = { surface: 60, pieces: 3, sonore: 'Normal', dpe: 'D', scores: { etat: 7, secteur: 7 } };
r = C.score({ weekend: 'B', interieur: 'B', energie: 'A', travaux: 'A', avenir: 'A' }, moyen);
['weekend', 'interieur', 'energie', 'travaux', 'avenir'].forEach(q => assert.strictEqual(note(r, q), 70, 'partielle : ' + q));
assert.strictEqual(r.score, 79, 'moyenne 70 → 79 %');

// 4. Données manquantes : critère ignoré, jamais de valeur inventée.
r = C.score(all('A'), {});
assert.strictEqual(r.nbUtilises, 0); assert.strictEqual(r.score, null, 'aucune donnée → pas de score');
assert.deepStrictEqual(r.top, []); assert.deepStrictEqual(r.aVerifier, []);
r.criteres.forEach(c => { assert.strictEqual(c.note, null); assert.deepStrictEqual(c.data, []); });
// Points d'intérêt indisponibles : « tout à pied » s'appuie sur les transports saisis, sinon ignoré (jamais « rien à proximité »).
r = C.score(all('A'), { transports: ['RER B'] });
assert.strictEqual(note(r, 'quotidien'), 70); assert.strictEqual(r.nbUtilises, 1);
r = C.score(all('A'), { surface: 70 });
assert.strictEqual(note(r, 'quotidien'), null, 'pas de POI ni de transports : ignoré');
assert.strictEqual(note(r, 'weekend'), null, 'pas d\'extérieur renseigné : ignoré (pas compté comme absent)');
assert.strictEqual(note(r, 'rangement'), 70);
assert.strictEqual(r.nbUtilises, 1, 'une seule donnée → un seul critère');
// Parking vide ≠ zéro place.
assert.strictEqual(note(C.score(all('B'), { parking: '' }), 'quotidien'), null);
assert.strictEqual(note(C.score(all('B'), { parking: 0 }), 'quotidien'), 40);
// L'énergie « peu importe » ne compte pas comme raison de coup de cœur.
r = C.score(all('B'), { dpe: 'C' });
assert.strictEqual(note(r, 'energie'), 100); assert.strictEqual(r.top.length, 0);

// 5. Contradiction : calme recherché + exposition sonore « bruyant » → note faible et point à vérifier explicite.
r = C.score(Object.assign(all('A'), { interieur: 'B', quartier: 'B' }), Object.assign({}, ideal, { sonore: 'Bruyant' }));
assert.strictEqual(note(r, 'interieur'), 40); assert.strictEqual(note(r, 'quartier'), 40);
assert.deepStrictEqual(r.aVerifier.map(w => w.k), ['bruit'], 'un seul point « bruit », sans doublon');
assert(r.score < 98 && r.score >= 60);
// Vigilance cochée par l'agent (sans exposition sonore) : même contradiction.
r = C.score({ interieur: 'B' }, { vigilances: ['Nuisances sonores'] });
assert.strictEqual(note(r, 'interieur'), 40); assert.strictEqual(r.aVerifier[0].k, 'bruit');
// Travaux signalés + « clés en main » : point à vérifier même si l'état est bien noté.
r = C.score({ travaux: 'A' }, { scores: { etat: 9 }, vigilances: ['Toit / toiture à refaire'] });
assert.strictEqual(note(r, 'travaux'), 40); assert.strictEqual(r.aVerifier[0].k, 'travaux');
assert.deepStrictEqual(r.aVerifier[0].v.list, ['Toit / toiture à refaire']);
// … mais c'est un atout pour qui aime personnaliser.
r = C.score({ travaux: 'B' }, { scores: { etat: 9 }, vigilances: ['Toit / toiture à refaire'] });
assert.strictEqual(note(r, 'travaux'), 100); assert.deepStrictEqual(r.aVerifier, []);
// DPE G + logement sobre recherché.
r = C.score({ energie: 'A' }, { dpe: 'G' });
assert.strictEqual(note(r, 'energie'), 40); assert.strictEqual(r.aVerifier[0].k, 'dpe');

// 6. À deux : scores individuels, score en commun, accords, sujets à discuter.
const a1 = all('A'), a2 = Object.assign(all('A'), { weekend: 'B', avenir: 'B' });
const d = C.duo(a1, a2, ideal);
assert.strictEqual(d.accord, 6); assert.strictEqual(d.total, 8);
assert.deepStrictEqual(d.discuter.map(x => x.q), ['weekend', 'avenir']);
assert.strictEqual(d.s1, 98);
assert(d.commun >= Math.min(d.s1, d.s2) && d.commun <= Math.max(d.s1, d.s2), 'score en commun entre les deux');
assert(d.reunit.length <= 3 && d.reunit.every(c => a1[c.q] === a2[c.q]), 'ce qui réunit = réponses communes');

// 7. Les prix n'influencent jamais le score (aucun jugement sur le prix) ; aucun montant ni taux dans le module.
const cher = JSON.parse(JSON.stringify(ideal)); cher.dvf = { n: 6, prixm2: 99999, mediane: 1000 }; cher.prix = 9999999;
assert.deepStrictEqual(C.score(all('B'), cher), C.score(all('B'), ideal), 'le prix ne change rien au score');
assert(!C.score(all('B'), cher).aVerifier.length, 'aucun point « prix »');
assert(!/taux|mensualit|emprunt|crédit|€/i.test(m[1].replace(/^\s*\/\/.*$/gm, '')), 'aucun calcul d\'argent');

// 8. Intégration dans le gabarit : onglet, sommaire à 9 étapes, données, traductions.
assert(/<button data-tab="crush"[^>]*>/.test(html), 'bouton du rail');
assert(html.indexOf('data-tab="crush"') > html.indexOf('data-tab="bien"') && html.indexOf('data-tab="crush"') < html.indexOf('data-tab="marche"'), 'juste après « Le Bien »');
assert(/<section id="crush" class="tab">/.test(html), 'section');
assert(/var SEQ=\['bien','crush',/.test(html), 'sommaire : crush en 2e');
assert(/<script id="crush-data" type="application\/json">\{/.test(html), 'données de démonstration');
JSON.parse(html.match(/<script id="crush-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
assert.strictEqual((html.match(/['"]tab-crush['"]\s*:/g) || []).length, 4, 'libellé de l\'onglet dans les 4 langues');
assert(!/\/ 8 sec|10 sections/.test(html), 'compteurs à 9');
assert(/body\.pv4\.pv-home \.rail\{grid-template-columns:repeat\(3,1fr\);\}/.test(html), 'tuiles : 3 colonnes sur ordinateur (3 × 3)');

// 9. Génération dans l'app : données publiques uniquement, champs vides = null, aucun prix.
(async () => {
  const { JSDOM, VirtualConsole } = require('jsdom');
  const dom = await JSDOM.fromFile(path.join(root, 'app.html'), { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: new VirtualConsole(), url: 'http://localhost/app.html', beforeParse(w) {
    w.fetch = () => Promise.resolve({ ok: false, status: 503, json: async () => ({}), text: async () => '' });
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null }), upsert: async () => ({}), then: (f) => f({ data: [] }) };
    const client = { auth: { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => q };
    w.supabase = { createClient: () => client };
    w.eval(fs.readFileSync(path.join(root, 'auth-client.js'), 'utf8')); w.sessionStorage.setItem('privency_active_uid', 'test-uid');
    w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, addEventListener() {} })); w.scrollTo = () => {};
  } });
  const w = dom.window, doc = w.document;
  await new Promise(r => setTimeout(r, 300));
  w.goToStep(2); // construit les grilles de l'étape 2, comme quand l'agent ouvre l'étape
  const set = (id, v) => { const el = doc.getElementById(id); assert(el, 'champ ' + id); el.value = v; };
  const oui = (grid, label, m2) => { const it = [...doc.querySelectorAll('#' + grid + ' .defaut-item')].find(x => x.querySelector('span').textContent.trim() === label); assert(it, grid + ' ' + label); it.querySelector('input[value="oui"]').checked = true; if (m2) it.querySelector('input[type=number]').value = m2; };
  set('adresse', '3 rue du Test 91000 Evry'); set('surface_hab', '64'); set('prix_vente', '312000'); set('nb_pieces', '3');
  set('proprio_nom', 'Vendeursecret'); set('tel_mobile', '06 11 22 33 44'); set('bien_fourchette_milieu', '287654');
  set('bien_score_etat', '7'); set('bien_score_secteur', '8'); set('parking_int', '1');
  oui('exterieur_grid', 'Terrasse', '18'); oui('pieces_utiles_grid', 'Cave'); oui('vigilances_grid', 'Nuisances sonores');
  doc.querySelector('#exposition_group input[value="Sud"]').checked = true;
  doc.querySelector('input[name="expo_sonore"][value="Normal"]').checked = true;
  const d = w.collectBienData(); w._bienData = d; w._chatCtx = w.buildChatContext(d);
  const out = w.injectData(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), d, null, {});
  const cd = JSON.parse(out.match(/<script id="crush-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.strictEqual(cd.surface, 64); assert.strictEqual(cd.pieces, 3); assert.strictEqual(cd.parking, 1);
  assert.deepStrictEqual(cd.ext, { Terrasse: 18 }); assert.deepStrictEqual(cd.expo, ['Sud']); assert.strictEqual(cd.sonore, 'Normal');
  assert.deepStrictEqual(cd.annexes, ['Cave']); assert.deepStrictEqual(cd.vigilances, ['Nuisances sonores']);
  assert.strictEqual(cd.scores.etat, 7); assert.strictEqual(cd.scores.secteur, 8); assert.strictEqual(cd.scores.prest, null, 'champ vide → null');
  assert.notStrictEqual(cd.dpe, 'D', 'pas de valeur de démonstration reprise du gabarit');
  const blob = JSON.stringify(cd);
  ['Vendeursecret', '06 11 22 33 44', '287654', '312000', '312 000'].forEach(v => assert(!blob.includes(v), 'donnée privée ou prix dans crush-data : ' + v));
  const r = C.score(all('A'), cd);
  assert(r.score >= 60 && r.score <= 98);
  assert.strictEqual(note(r, 'quotidien'), null, 'aucun point d\'intérêt ni transport saisi : ignoré');
  dom.window.close();

  // 10. « Mes stats » : le signal s'affiche « Test crush terminé (87 %) », jamais le code brut.
  const rows = [
    { id: 'x1', client_nom: 'Marie', bien_adresse: '1 rue A', evenement: 'fiche_ouverte', created_at: '2026-10-10T10:00:00Z' },
    { id: 'x2', client_nom: 'Marie', bien_adresse: '1 rue A', evenement: 'crush_termine:' + JSON.stringify({ v: 1, m: 'solo', s: 87, c: ['weekend'], w: [], a: 'AAAAAAAA', n: 'Marie' }), created_at: '2026-10-10T10:05:00Z' }
  ];
  const sdom = await JSDOM.fromFile(path.join(root, 'app.html'), { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: new VirtualConsole(), url: 'http://localhost/app.html', beforeParse(w2) {
    w2.scrollTo = () => {};
    w2.fetch = async (url) => ({ ok: true, status: 200, json: async () => (String(url).includes('fiche_views') && !/offset=[1-9]/.test(url) ? rows : []) });
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null }), then: f => f({ data: [] }) };
    w2.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => q }) };
    w2.eval(fs.readFileSync(path.join(root, 'auth-client.js'), 'utf8')); w2.sessionStorage.setItem('privency_active_uid', 'test-uid');
  } });
  await new Promise(r => setTimeout(r, 300));
  sdom.window.privencyAuth = { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } };
  await sdom.window.loadAnalytics();
  const txt = sdom.window.document.getElementById('analytics-tbody').textContent;
  assert(/Test crush terminé \(87 %\) ×1/.test(txt), 'signal affiché dans Mes stats : ' + txt.slice(0, 300));
  assert(!/crush_termine|"s":87/.test(txt), 'code brut jamais affiché');
  sdom.window.close();
  console.log('OK crush : calcul (complet, manquant, contradiction, plancher, plafond, duo), gabarit, génération et Mes stats');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
