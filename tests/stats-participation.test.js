// Mes stats : « Ce qu'il a fait sur la fiche » (en toutes lettres, uniquement ce qui est rempli), encadré
// « À aborder dans la négociation » (reprise factuelle) et indicateur « A rempli : … » dans la liste.
// Usage : cd tests && node stats-participation.test.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');
(async () => {
  const DAY = 86400000, now = Date.now(), iso = d => new Date(now - d * DAY).toISOString();
  const ADR = '12 rue des Lilas, 91300 Massy · Espace Acheteur Privé · Expertimo';
  const V = (id, c, ev, d) => ({ id, client_nom: c, bien_adresse: ADR, evenement: ev, created_at: iso(d) });
  const NOTE = 'Cuisine superbe, très lumineuse le matin.\nLe prix me semble élevé pour le quartier, il faudra aussi refaire la salle de bains (travaux) et vérifier les charges de copropriété avant de faire une offre. Nous aimerions revenir avec un artisan pour chiffrer précisément. <script>alert(1)</script>';
  const views = [
    V('1', 'Claire Martin', 'carnet_partage:' + JSON.stringify({ c: ['lumiere', 'cuisine', 'quartier'], ph: 2, n: NOTE }), 1),
    V('2', 'Claire Martin', 'visite_points:' + JSON.stringify({ k: ['bruit', 'charges', 'vig4'] }), 2),
    V('3', 'Claire Martin', 'critere_choisi:' + JSON.stringify({ k: 'calme' }), 2),
    V('4', 'Claire Martin', 'crush_termine:' + JSON.stringify({ v: 1, m: 'solo', s: 87.4, c: ['interieur', 'quartier'], w: ['bruit'], a: 'ABAAABAB', n: 'Claire' }), 3),
    V('5', 'Claire Martin', 'mot_vendeur_coeur', 3),
    V('6', 'Claire Martin', 'fiche_partagee:' + JSON.stringify({ c: 'sms', s: 'abc', t: 1 }), 3),
    V('7', 'Hugo Bernard', 'fiche_ouverte', 1),
    V('8', 'Inès Roux', 'fiche_ouverte', 2), V('9', 'Inès Roux', 'carnet_partage:' + JSON.stringify({ c: [], ph: 0, n: 'Belle hauteur sous plafond.' }), 2)
  ];
  const retours = [
    { id: 'r1', client_nom: 'Claire Martin', bien_adresse: ADR, reponses: ['prix', 'quartier', 'charges'], created_at: iso(1) },
    { id: 'r2', client_nom: 'Inès Roux', bien_adresse: ADR, reponses: ['coup_coeur', 'agencement'], created_at: iso(2) }
  ];
  const dom = await JSDOM.fromFile(path.join(__dirname, '..', 'app.html'), { runScripts: 'dangerously', virtualConsole: new VirtualConsole(), url: 'http://localhost/app.html', pretendToBeVisual: true, beforeParse(w) {
    w.scrollTo = () => {}; w.confirm = () => true;
    w.fetch = async (url) => {
      url = String(url);
      const t = url.includes('fiche_retours') ? retours : url.includes('fiche_views') ? views : [];
      const off = +(url.match(/offset=(\d+)/) || [0, 0])[1]; return { ok: true, status: 200, json: async () => t.slice(off, off + 1000) };
    };
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null }), then: f => f({ data: [] }) };
    w.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => q }) };
    w.eval(fs.readFileSync(path.join(__dirname, '..', 'auth-client.js'), 'utf8')); w.sessionStorage.setItem('privency_active_uid', 'test-uid');
  } });
  const w = dom.window, d = w.document; await new Promise(r => setTimeout(r, 300));
  w.privencyAuth = { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } };
  await w.loadAnalytics();
  const rows = Array.from(d.querySelectorAll('#analytics-tbody tr'));
  const row = n => rows.find(r => r.querySelector('.cl-toggle span:nth-of-type(2)').textContent === n);
  const claire = row('Claire Martin'), hugo = row('Hugo Bernard'), ines = row('Inès Roux');

  // ── liste : indicateur discret de ce qui a été rempli
  assert.strictEqual(claire.querySelector('.cl-rempli').textContent, '✓ A rempli : le carnet · la visite · le retour · le critère · le test');
  assert.strictEqual(ines.querySelector('.cl-rempli').textContent, '✓ A rempli : le carnet · le retour');
  assert(!hugo.querySelector('.cl-rempli'), 'rien rempli : pas d\'indicateur');

  // ── un clic sur le nom : le bloc est visible, en toutes lettres
  const det = claire.querySelector('.cl-detail'); assert(det.hidden); claire.querySelector('.cl-toggle').click(); assert(!det.hidden, 'un seul clic');
  const fait = det.querySelector('.cl-fait'), ft = fait.textContent;
  assert(/Ce qu’il a fait sur la fiche/.test(ft));
  const titres = [...fait.querySelectorAll('.cl-fait-s')].map(s => s.firstChild.firstChild.textContent.trim());
  assert.deepStrictEqual(titres, ['Carnet de visite', 'Points à vérifier en visite', 'Retour de visite', 'Critère déterminant', 'Test « Crush ou crash ? »', 'Mot du vendeur'], 'sections : ' + titres);
  ['Le bruit, fenêtres ouvertes et fermées', 'Les charges de copropriété : ce qu’elles comprennent', 'Un point de vigilance signalé dans la fiche'].forEach(x => assert(ft.includes(x), 'point de visite en toutes lettres : ' + x));
  assert(ft.includes('Coups de cœur : Lumière, Cuisine, Quartier'), 'coups de cœur');
  assert(ft.includes(NOTE), 'notes du carnet en texte intégral, sans coupure');
  assert(!det.querySelector('script'), 'texte de l\'acheteur échappé');
  assert(ft.includes('2 photos dans son carnet (restées sur son téléphone, non transmises par la fiche)'), 'photos : nombre seulement, rien d\'inventé');
  assert(ft.includes('Le prix, Le quartier, Les charges'), 'réponses du retour de visite');
  assert(ft.includes('Le calme'), 'critère déterminant');
  assert(ft.includes('Résultat : 87 % de coup de cœur') && ft.includes('Ce qui lui plaît ici : À l’intérieur, Le quartier') && ft.includes('Points à vérifier selon le test : Le bruit (environnement signalé comme bruyant)'), 'résultat du test');
  assert(ft.includes('Ses réponses : Week-end idéal : Dehors · Au quotidien : La voiture sans stress · À l’intérieur : Lumineux et ouvert'), 'réponses du test');
  assert(ft.includes('A cliqué « Ça me parle »'), 'mot du vendeur');
  assert(!/partag|SMS|lien/i.test(ft.replace('A cliqué', '')), 'le partage de la fiche n\'apparaît jamais');

  // ── négociation : reprise factuelle de ce qu'il a coché ou écrit, rien d'autre
  const nego = det.querySelector('.cl-nego');
  assert(nego && /À aborder dans la négociation/.test(nego.textContent));
  const lignes = [...nego.querySelectorAll('li')].map(li => li.textContent);
  assert.deepStrictEqual(lignes, ['A écrit dans son carnet :' + NOTE, 'A coché : Le prix', 'A coché : Les charges'], 'lignes : ' + JSON.stringify(lignes));
  assert(!/budget|marge|€|euros|baisse|proposer/i.test(nego.textContent.replace(NOTE, '')), 'aucune interprétation, aucun budget');
  assert(det.firstElementChild && det.innerHTML.indexOf('cl-nego') < det.innerHTML.indexOf('cl-fait'), 'encadré négociation au-dessus du bloc');

  // ── Inès : retour sans prix / travaux / charges, note sans ces sujets : pas d'encadré ; sections vides absentes
  const di = ines.querySelector('.cl-detail');
  assert(!di.querySelector('.cl-nego'), 'rien à négocier : pas d\'encadré');
  const fi = di.querySelector('.cl-fait').textContent;
  assert(/Ses notes :Belle hauteur sous plafond\./.test(fi) && /Un coup de cœur, L['’]agencement/.test(fi), fi);
  assert(!/Coups de cœur :|photo|Points à vérifier|Critère|Crush|Mot du vendeur/.test(fi), 'aucun bloc vide ni inventé : ' + fi);
  // ── Hugo : rien rempli → aucun bloc
  assert(!hugo.querySelector('.cl-fait') && !hugo.querySelector('.cl-nego'), 'aucun bloc vide');

  // ── règles de score inchangées (retour 3 + test 3 + carnet 3 + points 2 + critère 1 + mot 1 ; le partage ne compte pas)
  const g = w._analyticsGroups.find(x => x.client === 'Claire Martin');
  assert.strictEqual(w._clStats(g, now).score, 13);
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.html'), 'utf8');
  assert(app.includes("+ (crush ? 3 : 0) + (carnet ? 3 : 0) + (vpts ? 2 : 0) + (coeur ? 1 : 0) + (crit ? 1 : 0);"), 'formule du score inchangée');
  console.log('OK Mes stats : ce que l\'acheteur a rempli, encadré négociation, indicateur dans la liste');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
