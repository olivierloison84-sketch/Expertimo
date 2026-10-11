// Participation acheteur : génération des listes (points de visite, coups de cœur, phrases du vendeur),
// comportement des 5 blocs dans la fiche (événements, limites, langues) et affichage dans « Mes stats ».
// Usage : cd tests && node participation.test.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.join(__dirname, '..');
const plain = x => JSON.parse(JSON.stringify(x));

function appDom(extra) {
  return JSDOM.fromFile(path.join(root, 'app.html'), { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: new VirtualConsole(), url: 'http://localhost/app.html', beforeParse(w) {
    w.fetch = (extra && extra.fetch) || (() => Promise.resolve({ ok: false, status: 503, json: async () => ({}), text: async () => '' }));
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null }), upsert: async () => ({}), then: (f) => f({ data: [] }) };
    w.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => q }) };
    w.eval(fs.readFileSync(path.join(root, 'auth-client.js'), 'utf8')); w.sessionStorage.setItem('privency_active_uid', 'test-uid');
    w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, addEventListener() {} })); w.scrollTo = () => {};
  } });
}

(async () => {
  const dom = await appDom(); const w = dom.window, doc = w.document;
  await new Promise(r => setTimeout(r, 300));
  const V = s => plain(w.visitePointsFrom(s)), K = s => V(s).map(p => p.k);

  // 1. Points à vérifier pendant la visite
  assert.deepStrictEqual(K({}), ['lumiere', 'rangements', 'etat_general', 'environnement'], 'fiche vide : points universels seulement');
  assert.deepStrictEqual(K({ sonore: 'Bruyant' }).slice(0, 1), ['bruit']);
  assert.deepStrictEqual(K({ sonore: 'Calme', vigilances: ['Nuisances sonores'] }).slice(0, 1), ['bruit'], 'vigilance cochée = bruit');
  assert(!K({ sonore: 'Calme' }).includes('bruit'), 'calme : pas de point bruit');
  assert(K({ copro: true, charges: 180 }).includes('charges') && !K({ copro: false, charges: 180 }).includes('charges') && !K({ copro: true, charges: 0 }).includes('charges'), 'charges : copropriété avec charges seulement');
  assert(K({ travauxAg: 'oui' }).includes('travaux_ag') && !K({ travauxAg: 'non' }).includes('travaux_ag'));
  assert(K({ toitEtat: 'À rénover' }).includes('toiture') && K({ vigilances: ['Toit / toiture à refaire'] }).includes('toiture') && !K({ toitEtat: 'Soigné' }).includes('toiture'));
  assert(K({ vigilances: ['Vis-à-vis direct'] }).includes('voisinage') && K({ voisinage: 'Voisins discrets' }).includes('voisinage'));
  assert(K({ defauts: ['Moisissures'] }).includes('humidite'));
  assert(K({ diags: [{ key: 'electricite', status: 'defavorable' }] }).includes('electricite') && !K({ diags: [{ key: 'electricite', status: 'favorable' }] }).includes('electricite'));
  assert.deepStrictEqual(V({ dpe: 'F' })[0], { k: 'dpe', v: { l: 'F' } }); assert(!K({ dpe: 'C' }).includes('dpe'));
  let r = V({ vigTxt: { fr: ['Chaudière ancienne', '', 'Ascenseur en panne'], en: ['Old boiler', '', ''] } });
  assert.deepStrictEqual(r.filter(p => p.k === 'vig').map(p => p.v), [{ fr: 'Chaudière ancienne', en: 'Old boiler' }, { fr: 'Ascenseur en panne' }], 'vigilances de l\'agent avec leurs traductions');
  const tout = { sonore: 'Bruyant', copro: true, charges: 200, travauxAg: 'oui', toitEtat: 'Moyen', vigilances: ['Vis-à-vis direct', 'Humidité récurrente', 'Travaux importants à prévoir', 'Fenêtres à changer', 'Chauffage vétuste'], dpe: 'G', vigTxt: { fr: ['A', 'B', 'C'] } };
  r = K(tout);
  assert.strictEqual(r.length, 8, 'au plus 8 points tirés de la fiche'); assert(!r.some(k => ['lumiere', 'rangements'].includes(k)), 'pas de points universels quand la fiche en fournit assez');
  assert.strictEqual(new Set(r).size, r.length, 'aucun doublon');
  assert.strictEqual(K({ sonore: 'Bruyant', copro: true, charges: 10 }).length, 5, 'complété jusqu\'à 5 propositions');

  // 2. Coups de cœur du carnet, adaptés au bien
  const C = s => plain(w.carnetChipsFrom(s));
  assert.deepStrictEqual(C({}), ['lumiere', 'volumes', 'cuisine', 'salle_bain', 'calme', 'etat', 'quartier']);
  assert(!C({ sonore: 'Bruyant' }).includes('calme') && !C({ vigilances: ['Nuisances sonores'] }).includes('calme'), 'pas de « calme » si bruit signalé');
  assert(C({ ext: { Jardin: 300, Terrasse: 20 } }).includes('jardin') && !C({ ext: { Jardin: 300 } }).includes('exterieur'));
  assert(C({ ext: { 'Balcon(s)': 6 } }).includes('exterieur') && C({ ext: { Vue: true } }).includes('vue') && C({ annexes: ['Cave'] }).includes('rangements'));
  assert(!C({ ext: { Vue: true } }).includes('exterieur'), 'une vue n\'est pas un extérieur');

  // 3. Phrases du vendeur
  const M = (f, l) => plain(w.motVendeurPhrases(f, l));
  assert.deepStrictEqual(M(['Superbe terrasse de 50 m².', 'Calme absolu', 'DPE B'], 'fr'),
    ['Ce que nous avons le plus aimé ici : superbe terrasse de 50 m².', 'Ce qui va le plus nous manquer : calme absolu.', 'Notre petit plus préféré : DPE B.']);
  assert.deepStrictEqual(M(['', 'Le jardin'], 'fr'), ['', 'Ce qui va le plus nous manquer : le jardin.'], 'point fort vide : pas de phrase');
  assert.deepStrictEqual(M(['A sunny terrace'], 'en'), ['What we loved most here: a sunny terrace.']);
  assert(/^O que mais gostámos aqui/.test(M(['Jardim'], 'pt')[0]) && /^Lo que más nos ha gustado/.test(M(['Jardín'], 'es')[0]));
  assert.deepStrictEqual(M(['x', 'y', 'z', 'w'], 'fr').length, 3, '3 phrases au plus');

  // 4. Génération : étape 2 (phrases proposées, modifiables, décochables) → bloc #participation-data de la fiche
  w.goToStep(2);
  const set = (id, v) => { const el = doc.getElementById(id); assert(el, 'champ ' + id); el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
  const oui = (grid, label) => { const it = [...doc.querySelectorAll('#' + grid + ' .defaut-item')].find(x => x.querySelector('span').textContent.trim() === label); it.querySelector('input[value="oui"]').checked = true; };
  set('adresse', '3 rue du Test 91000 Evry'); set('surface_hab', '64'); set('prix_vente', '312000'); set('charges_copro', '150');
  set('proprio_nom', 'Vendeursecret'); set('tel_mobile', '06 11 22 33 44');
  set('bien_fort1', 'Terrasse plein sud'); set('bien_fort2', 'Calme absolu'); set('bien_fort3', 'Cuisine neuve'); set('bien_vig1', 'Chaudière ancienne');
  assert.strictEqual(doc.getElementById('mv_txt_1').value, 'Ce que nous avons le plus aimé ici : terrasse plein sud.', 'phrase proposée automatiquement');
  assert.notStrictEqual(doc.getElementById('mv_row_1').style.display, 'none');
  set('mv_txt_2', 'Les levers de soleil sur le parc vont nous manquer.');   // modifiée par l'agent
  assert.strictEqual(doc.getElementById('mv_txt_3').value, 'Notre petit plus préféré : cuisine neuve.', 'chaque point fort a sa propre tournure');
  doc.getElementById('mv_on_3').checked = false;                              // décochée
  set('bien_fort2', 'Silence');                                               // la phrase modifiée n'est plus écrasée
  assert.strictEqual(doc.getElementById('mv_txt_2').value, 'Les levers de soleil sur le parc vont nous manquer.');
  set('mv_libre', 'Dix belles années ici.');
  doc.querySelector('input[name="copro_statut"][value="oui"]').checked = true;
  doc.querySelector('input[name="expo_sonore"][value="Bruyant"]').checked = true;
  doc.querySelector('input[name="travaux_ag"][value="oui"]').checked = true;
  oui('exterieur_grid', 'Jardin'); oui('vigilances_grid', 'Vis-à-vis direct');
  const d = w.collectBienData(); w._bienData = d; w._chatCtx = w.buildChatContext(d);
  const dEn = w.buildBienDataLang(d, { fort1: 'South-facing terrace', vig1: 'Old boiler' });
  const out = w.injectData(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), d, dEn, {});
  { // phrase 3 cochée : sa tournure propre, en français et dans la langue traduite
    doc.getElementById('mv_on_3').checked = true;
    const d3 = w.collectBienData(); const o3 = w.injectData(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), d3, w.buildBienDataLang(d3, { fort3: 'New kitchen' }), {});
    const p3 = JSON.parse(o3.match(/<script id="participation-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
    assert.strictEqual(p3.mot.fr[2], 'Notre petit plus préféré : cuisine neuve.'); assert.strictEqual(p3.mot.en[2], 'Our favourite little extra: new kitchen.');
    doc.getElementById('mv_on_3').checked = false;
  }
  const pd = JSON.parse(out.match(/<script id="participation-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.deepStrictEqual(pd.mot.fr, ['Ce que nous avons le plus aimé ici : terrasse plein sud.', 'Les levers de soleil sur le parc vont nous manquer.'], 'phrases cochées, modifiée conservée');
  assert.deepStrictEqual(pd.mot.en, ['What we loved most here: south-facing terrace.', 'Les levers de soleil sur le parc vont nous manquer.'], 'phrase non modifiée régénérée dans la langue avec le point fort traduit');
  assert.deepStrictEqual(pd.mot.pt, [], 'langue absente de la fiche : rien');
  assert.strictEqual(pd.mot.libre, 'Dix belles années ici.');
  const pk = pd.points.map(p => p.k);
  ['bruit', 'charges', 'travaux_ag', 'voisinage', 'vig'].forEach(k => assert(pk.includes(k), 'point attendu : ' + k));
  assert.deepStrictEqual(pd.points.find(p => p.k === 'vig').v, { fr: 'Chaudière ancienne', en: 'Old boiler' });
  assert(pd.chips.includes('jardin') && !pd.chips.includes('calme'), 'coups de cœur adaptés (jardin, pas de calme)');
  ['Vendeursecret', '06 11 22 33 44', '312000', '312 000'].forEach(v => assert(!JSON.stringify(pd).includes(v), 'donnée privée ou prix : ' + v));
  // Rien de coché : bloc vide (masqué dans la fiche)
  [1, 2, 3].forEach(n => { doc.getElementById('mv_on_' + n).checked = false; }); set('mv_libre', '');
  const d2 = w.collectBienData(); const out2 = w.injectData(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), d2, null, {});
  const pd2 = JSON.parse(out2.match(/<script id="participation-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.deepStrictEqual([pd2.mot.fr, pd2.mot.libre], [[], ''], 'aucune phrase choisie');
  dom.window.close();

  // 5. Fiche : les 5 blocs, événements et limites, dans les 4 langues
  const tpl = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const allPoints = ['bruit', 'charges', 'travaux_ag', 'toiture', 'voisinage', 'humidite', 'travaux', 'fenetres', 'chauffage', 'electricite', 'gaz', 'amiante', 'parties_communes', 'facade', 'lumiere', 'rangements', 'etat_general', 'environnement'].map(k => ({ k })).concat([{ k: 'dpe', v: { l: 'F' } }, { k: 'vig', v: { fr: 'Texte agent' } }]);
  const allChips = ['lumiere', 'volumes', 'cuisine', 'salle_bain', 'calme', 'jardin', 'exterieur', 'vue', 'rangements', 'etat', 'quartier'];
  const data = { points: allPoints, chips: allChips, mot: { fr: ['Phrase FR.'], en: ['Phrase EN.'], pt: [], es: [], libre: 'Mot libre.' } };
  const html = tpl.replace(/(<script id="participation-data" type="application\/json">)[\s\S]*?(<\/script>)/, (m, a, b) => a + JSON.stringify(data) + b);
  const events = [];
  const fd = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://espace.privency.fr/fiches/x.html?client=Marie&prenom=Marie&s=abc123', virtualConsole: new VirtualConsole(), beforeParse(fw) {
    fw.scrollTo = () => {}; fw.matchMedia = fw.matchMedia || (() => ({ matches: false, addListener() {}, addEventListener() {} }));
    fw.fetch = async (url, opt) => { if (String(url).includes('/rest/v1/fiche_views')) events.push(JSON.parse(opt.body).evenement); return { ok: true, status: 201, json: async () => ({}) }; };
    fw.open = () => {};
  } });
  const fw = fd.window, fdoc = fw.document;
  await new Promise(r => setTimeout(r, 200));
  assert(events.includes('ouverture_partage:{"s":"abc123"}'), 'ouverture via lien partagé : ' + events.join(' | '));
  const click = sel => { const el = fdoc.querySelector(sel); assert(el, 'élément ' + sel); el.click(); };
  for (const l of ['fr', 'en', 'pt', 'es']) {
    fw.applyLang(l);
    const txt = ['pv-visite', 'pv-carnet', 'pv-critere', 'pv-mot'].map(id => fdoc.getElementById(id).textContent).join(' ');
    assert(!/\b[a-z]+_[a-z_]+\b/.test(txt), l + ' : code brut affiché');
    fdoc.querySelectorAll('#pv-visite .pv-opt, #pv-carnet .pv-chip, #pv-critere .pv-chip').forEach(bt => {
      const lbl = bt.textContent.replace(/^♥\s*/, '').trim(), id = bt.getAttribute('data-id');
      assert(lbl && lbl !== id, l + ' : libellé manquant pour « ' + id + ' »');
    });
    assert(!/undefined|\{l\}/.test(txt), l + ' : texte manquant');
    assert.strictEqual(fdoc.querySelectorAll('#pv-visite .pv-opt').length, allPoints.length);
    assert.strictEqual(fdoc.querySelectorAll('#pv-carnet .pv-chip').length, allChips.length);
    assert.strictEqual(fdoc.querySelectorAll('#pv-critere .pv-chip').length, 6);
  }
  fw.applyLang('fr');
  assert(/Phrase FR\./.test(fdoc.getElementById('pv-mot').textContent)); fw.applyLang('en'); assert(/Phrase EN\./.test(fdoc.getElementById('pv-mot').textContent));
  fw.applyLang('pt'); assert(/Phrase FR\./.test(fdoc.getElementById('pv-mot').textContent), 'langue sans traduction : repli sur le français'); fw.applyLang('fr');
  // Ma visite : 3 points au maximum
  const opts = () => [...fdoc.querySelectorAll('#pv-visite .pv-opt')];
  opts()[0].click(); opts()[1].click(); opts()[2].click(); opts()[3].click();
  assert.strictEqual(fdoc.querySelectorAll('#pv-visite .pv-opt.on').length, 3, '3 points au maximum');
  click('#pv-visite [data-pv="vis-send"]');
  assert(events.includes('visite_points:{"k":["bruit","charges","travaux_ag"]}'), events.join(' | '));
  assert.strictEqual(fdoc.querySelectorAll('#pv-visite .pv-check li').length, 3, 'liste de rappel affichée');
  // Carnet : rien n'est envoyé avant « Partager avec mon agent » ; les coups de cœur pré-remplissent le retour de visite
  const before = events.length;
  click('#pv-carnet [data-id="lumiere"]'); click('#pv-carnet [data-id="calme"]');
  const ta = fdoc.getElementById('pv-notes'); ta.value = 'Belle cuisine'; ta.dispatchEvent(new fw.Event('input'));
  assert.strictEqual(events.length, before, 'carnet : rien n\'est envoyé sans clic sur Partager');
  click('#pv-carnet [data-pv="car-share"]');
  assert(events.includes('carnet_partage:{"c":["lumiere","calme"],"ph":0,"n":"Belle cuisine"}'), events.join(' | '));
  const pressed = [...fdoc.querySelectorAll('#vr-chips .vr-chip[aria-pressed="true"]')].map(b => b.getAttribute('data-code'));
  assert.deepStrictEqual(pressed.sort(), ['agencement', 'coup_coeur', 'quartier'], 'retour de visite pré-rempli : ' + pressed);
  // Critère déterminant (onglet Le Bien) : un seul choix, pas de doublon d'événement
  click('#pv-critere [data-id="calme"]'); click('#pv-critere [data-id="calme"]'); click('#pv-critere [data-id="lumiere"]');
  assert.deepStrictEqual(events.filter(e => e.startsWith('critere_choisi')), ['critere_choisi:{"k":"calme"}', 'critere_choisi:{"k":"lumiere"}']);
  assert.strictEqual(fdoc.querySelectorAll('#pv-critere .pv-chip.on').length, 1, 'un seul critère');
  // Mot du vendeur : « Ça me parle » compté une seule fois
  click('#pv-mot [data-pv="mot-like"]'); click('#pv-mot [data-pv="mot-like"]');
  assert.strictEqual(events.filter(e => e === 'mot_vendeur_coeur').length, 1);
  // Partage : lien de la fiche + ?s=, jamais le prénom d'accueil ; lien duo du test si le test a été fait
  click('#pv-share-top');
  assert(fdoc.getElementById('pv-share-sheet').classList.contains('open'));
  let msg = fdoc.getElementById('pv-share-txt').value;
  assert(/fiches\/x\.html\?client=Marie&s=[a-z0-9]{6}$/.test(msg.split('\n').pop()) && !/prenom=/.test(msg), 'lien partagé : ' + msg);
  click('#pv-share-sheet [data-c="whatsapp"]');
  assert(events.some(e => /^fiche_partagee:\{"c":"whatsapp","s":"[a-z0-9]{6}","t":0\}$/.test(e)), events.join(' | '));
  fw.localStorage.setItem('pv_crush_/fiches/x.html', JSON.stringify({ a: 'ABABABAB', n: 'Marie' }));
  click('#pv-share-top'); msg = fdoc.getElementById('pv-share-txt').value;
  assert(/#crush=1\.ABABABAB\.Marie\.$/.test(msg) && /test/.test(msg), 'test fait : le lien ouvre le mode à deux');
  // Fin du test crush : critère pré-sélectionné d'après les réponses + bouton de partage
  click('#main-nav button[data-tab="crush"]'); click('#crush [data-act="solo"]');
  for (let i = 0; i < 8; i++) click('#crush [data-act="pick"][data-a="A"]');
  assert(fdoc.querySelector('#crush .cr-extra .pv-chip') && fdoc.querySelector('#crush .cr-extra [data-pv="share"]'), 'critère et partage en fin de test');
  fd.window.close();

  // 6. « Mes stats » : signaux lisibles, jamais de code brut
  const rows = [['visite_points:{"k":["bruit","charges","vig2"]}'], ['carnet_partage:{"c":["lumiere","calme"],"ph":1}'], ['fiche_partagee:{"c":"whatsapp","s":"abc123","t":1}'],
    ['ouverture_partage:{"s":"abc123"}'], ['critere_choisi:{"k":"calme"}'], ['mot_vendeur_coeur']].map(([e], i) => ({ id: 'r' + i, client_nom: 'Marie', bien_adresse: '1 rue A', evenement: e, created_at: '2026-10-10T10:0' + i + ':00Z' }));
  const sdom = await appDom({ fetch: async (url) => ({ ok: true, status: 200, json: async () => (String(url).includes('fiche_views') && !/offset=[1-9]/.test(url) ? rows : []) }) });
  await new Promise(r => setTimeout(r, 300));
  sdom.window.privencyAuth = { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } };
  await sdom.window.loadAnalytics();
  const txt = sdom.window.document.getElementById('analytics-tbody').textContent;
  ['Points de visite : bruit, charges, point signalé ×1', 'Carnet de visite partagé (2 coups de cœur) ×1', 'Fiche partagée (WhatsApp) ×1', 'Ouverture via lien partagé ×1', 'Critère déterminant : le calme ×1', '« Ça me parle » (mot du vendeur) ×1']
    .forEach(l => assert(txt.includes(l), 'Mes stats : « ' + l + ' » absent de : ' + txt.slice(0, 400)));
  assert(!/visite_points|carnet_partage|fiche_partagee|ouverture_partage|critere_choisi|mot_vendeur_coeur|\{"/.test(txt), 'code brut affiché');
  sdom.window.close();
  console.log('OK participation : listes générées (visite, carnet, mot du vendeur), 5 blocs × 4 langues, événements et Mes stats');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
