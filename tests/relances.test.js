// Relances « Mes stats » : angles de message (suggestion, intro, variables), partage jamais cité,
// message Financement sans taux ni durée, score et badge avec les signaux de participation.
// Usage : cd tests && node relances.test.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.join(__dirname, '..');
const NOW = Date.now(), iso = (minAgo) => new Date(NOW - minAgo * 60000).toISOString();

// Une ligne d'événement par acquéreur (bien « 12 rue des Lilas »). minAgo : ancienneté en minutes.
let n = 0;
const row = (client, evenement, minAgo, payload) => ({ id: 'r' + (++n), client_nom: client, bien_adresse: '12 rue des Lilas, 91300 Massy · Espace Acheteur Privé · Expertimo',
  evenement: payload ? evenement + ':' + JSON.stringify(payload) : evenement, created_at: iso(minAgo) });
const ouvre = (c, m) => row(c, 'fiche_ouverte', m || 120);
const rows = [
  ouvre('Alice Match'), row('Alice Match', 'crush_termine', 10, { v: 1, m: 'solo', s: 91, c: ['weekend'], w: [], a: 'AAAAAAAA' }),
  ouvre('Bruno Moyen'), row('Bruno Moyen', 'crush_termine', 10, { v: 1, m: 'solo', s: 74, c: [], w: [], a: 'ABABABAB' }),
  ouvre('Carla Point'), row('Carla Point', 'crush_termine', 10, { v: 1, m: 'solo', s: 92, c: [], w: ['bruit'], a: 'AAAAAAAA' }),
  ouvre('Denis Duo'), row('Denis Duo', 'crush_termine', 10, { v: 1, m: 'duo', s: 88, s1: 90, s2: 86, acc: 6, c: [], w: [], a: 'AAAAAAAA', a2: 'AAAAAABB' }),
  ouvre('Emma Critere'), row('Emma Critere', 'critere_choisi', 10, { k: 'calme' }),
  ouvre('Fanny Visite'), row('Fanny Visite', 'visite_points', 10, { k: ['bruit', 'charges', 'vig3'] }),
  ouvre('Gaspard Carnet'), row('Gaspard Carnet', 'carnet_partage', 10, { c: ['lumiere', 'salle_bain', 'jardin'], ph: 0, n: 'Très belle cuisine' }),
  ouvre('Hugo Coeur'), row('Hugo Coeur', 'mot_vendeur_coeur', 10),
  ouvre('Inès Partage'), row('Inès Partage', 'fiche_partagee', 10, { c: 'whatsapp', s: 'abc123', t: 0 }),
  ouvre('Jules Ouvert'), row('Jules Ouvert', 'ouverture_partage', 10, { s: 'abc123' }),
  // le plus récent gagne : critère (5 min) après carnet (30 min)
  ouvre('Karim Recent'), row('Karim Recent', 'carnet_partage', 30, { c: ['vue'], ph: 0 }), row('Karim Recent', 'critere_choisi', 5, { k: 'lumiere' }),
  // à date égale : l'ordre de la liste départage (carnet avant critère)
  ouvre('Lina Egalite'), row('Lina Egalite', 'critere_choisi', 15, { k: 'quartier' }), row('Lina Egalite', 'carnet_partage', 15, { c: ['calme'], ph: 0 }),
  // partage plus récent que le test : c'est l'angle « Visite à plusieurs » qui ressort, sans jamais citer le partage
  ouvre('Malo Partage'), row('Malo Partage', 'crush_termine', 60, { v: 1, m: 'solo', s: 95, c: [], w: [], a: 'AAAAAAAA' }), row('Malo Partage', 'ouverture_partage', 3, { s: 'x' }), row('Malo Partage', 'fiche_partagee', 4, { c: 'sms', s: 'x', t: 1 }),
  // variables vides : la phrase reste correcte
  ouvre('Nora Vide'), row('Nora Vide', 'carnet_partage', 10, { c: [], ph: 1, n: 'Juste des notes' }),
  ouvre('Oscar Vide'), row('Oscar Vide', 'visite_points', 10, { k: [] }),
  ouvre('Pia Vigs'), row('Pia Vigs', 'visite_points', 10, { k: ['vig0', 'toiture', 'vig2'] }),
  ouvre('Paul Rien'),
  // les retours de visite, l'offre et les documents restent prioritaires
  ouvre('Rose Offre'), row('Rose Offre', 'offre_soumise', 200), row('Rose Offre', 'crush_termine', 5, { v: 1, m: 'solo', s: 95, c: [], w: [], a: 'AAAAAAAA' }),
  // score : 1 visite (2) + test 3 + carnet 3 + points 2 + cœur 1 + critère 1 = 12 → « Intéressé » ; partage et ouverture : 0
  ouvre('Sam Score', 30), row('Sam Score', 'crush_termine', 20, { v: 1, m: 'solo', s: 87, c: [], w: [], a: 'AAAAAAAA' }), row('Sam Score', 'carnet_partage', 19, { c: ['vue'], ph: 0 }),
  row('Sam Score', 'visite_points', 18, { k: ['bruit'] }), row('Sam Score', 'mot_vendeur_coeur', 17), row('Sam Score', 'critere_choisi', 16, { k: 'calme' }),
  row('Sam Score', 'fiche_partagee', 15, { c: 'whatsapp', s: 'q', t: 0 }), row('Sam Score', 'ouverture_partage', 14, { s: 'q' }),
  // + 2 visites de plus (2 × 2) → 16 → « Très chaud »
  ouvre('Tom Chaud', 40), ouvre('Tom Chaud', 35), ouvre('Tom Chaud', 30), row('Tom Chaud', 'crush_termine', 20, { v: 1, m: 'solo', s: 80, c: [], w: [], a: 'AAAAAAAA' }), row('Tom Chaud', 'carnet_partage', 19, { c: ['vue'], ph: 0 }),
  row('Tom Chaud', 'visite_points', 18, { k: ['bruit'] }), row('Tom Chaud', 'mot_vendeur_coeur', 17), row('Tom Chaud', 'critere_choisi', 16, { k: 'calme' }),
  // partage seul + visites : le partage ne fait pas monter le score
  ouvre('Ugo Partage', 30), ouvre('Ugo Partage', 25), ouvre('Ugo Partage', 20), row('Ugo Partage', 'fiche_partagee', 10, { c: 'email', s: 'z', t: 0 }), row('Ugo Partage', 'ouverture_partage', 9, { s: 'z' })
];
// Retour de visite « prix » (table fiche_retours) : prioritaire sur un test plus récent
const retours = [{ id: 'rt1', client_nom: 'Vera Prix', bien_adresse: rows[0].bien_adresse, reponses: ['prix'], created_at: iso(300) }];
rows.push(ouvre('Vera Prix'), row('Vera Prix', 'crush_termine', 5, { v: 1, m: 'solo', s: 99, c: [], w: [], a: 'AAAAAAAA' }));
rows.sort((a, b) => b.created_at.localeCompare(a.created_at));

(async () => {
  const dom = await JSDOM.fromFile(path.join(root, 'app.html'), { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: new VirtualConsole(), url: 'http://localhost/app.html', beforeParse(w) {
    w.scrollTo = () => {};
    w.fetch = async (url) => ({ ok: true, status: 200, json: async () => (/offset=[1-9]/.test(url) ? [] : String(url).includes('fiche_views') ? rows : String(url).includes('fiche_retours') ? retours : []) });
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null }), then: f => f({ data: [] }) };
    w.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => q }) };
    w.eval(fs.readFileSync(path.join(root, 'auth-client.js'), 'utf8')); w.sessionStorage.setItem('privency_active_uid', 'test-uid');
  } });
  const w = dom.window, d = w.document;
  await new Promise(r => setTimeout(r, 300));
  w.PrivencyAuth.lsSet('_agent_profile', JSON.stringify({ prenom: 'Olivier' }));
  w.privencyAuth = { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } };
  await w.loadAnalytics();
  const G = name => { const g = w._analyticsGroups.find(x => x.client === name); assert(g, 'groupe ' + name); return g; };
  const msg = (name, angle) => w.clBuildMessage(G(name), false, angle);
  const BIEN = '12 rue des Lilas';
  const INTRO_TEST = 'Merci d’avoir pris le temps de faire le test « Crush ou crash ? » sur le bien ' + BIEN + '.';
  const INTRO_RETOURS = 'Merci pour vos retours sur le bien ' + BIEN + '.';
  const INTRO_DEFAUT = 'Avez-vous pu avancer dans votre réflexion sur le bien ' + BIEN + ' ?';
  const FIN = '\n\nN’hésitez pas à me répondre par message ou à m’appeler quand cela vous arrange.\n\nBien cordialement,\nOlivier';

  // 1. Chaque angle : suggestion, intro, texte complet, variables remplacées
  const cas = [
    ['Alice Match', 'crush_match', INTRO_TEST, 'Votre résultat est très encourageant : le bien correspond à ce que vous recherchez sur l’essentiel. Le mieux est de le vérifier sur place. Je peux vous proposer une visite cette semaine, et nous regarderons ensemble les quelques points à vérifier qui sont ressortis du test.'],
    ['Bruno Moyen', 'crush_verifier', INTRO_TEST, 'Le test fait ressortir quelques points à vérifier. Je préfère vous en parler franchement plutôt que de vous laisser avec un doute : je peux vous donner des éléments précis sur chacun d’eux. Et si ce bien ne correspond pas assez à vos critères, je vous proposerai d’autres biens plus proches de ce que vous cherchez.'],
    ['Carla Point', 'crush_verifier', INTRO_TEST, null],
    ['Denis Duo', 'crush_duo', INTRO_TEST, 'Le test fait à deux montre que vous êtes d’accord sur l’essentiel, avec quelques points à en discuter. Je vous propose une visite à deux, pour que chacun se fasse son avis sur place, et je prépare des éléments sur les points où vos avis diffèrent.'],
    ['Emma Critere', 'critere', INTRO_RETOURS, 'Vous avez indiqué que le calme compte avant tout pour vous. C’est ce que je regarderai en priorité avec vous : je peux vous donner les éléments précis sur ce point et, si ce bien ne vous convient pas sur ce critère, vous proposer d’autres biens qui y répondent mieux.'],
    ['Fanny Visite', 'visite_points', INTRO_RETOURS, 'Vous avez noté des points que vous souhaitez vérifier lors de la visite : bruit, charges et un point signalé dans la fiche. Je les prépare : vous aurez les réponses et les documents correspondants, et nous les passerons en revue sur place.'],
    ['Gaspard Carnet', 'carnet', INTRO_RETOURS, 'Vos retours de visite sont précieux. Ce qui vous a plu (lumière, salle de bains et jardin) est un bon signe. Je vous propose une seconde visite pour revoir ces points et regarder à tête reposée ceux qui vous posent question.'],
    ['Hugo Coeur', 'coeur', INTRO_RETOURS, 'Les propriétaires tiennent à ce bien, et le mot qu’ils ont laissé semble vous avoir parlé. Je serais ravi de vous le faire visiter pour que vous puissiez juger par vous-même si vous vous y projetez.'],
    ['Inès Partage', 'partage', INTRO_DEFAUT, 'Si vous souhaitez venir à plusieurs, ou avec un proche, n’hésitez pas : je peux caler la visite sur les disponibilités de chacun, y compris en fin de journée ou le week-end.'],
    ['Jules Ouvert', 'partage', INTRO_DEFAUT, null],
    ['Karim Recent', 'critere', INTRO_RETOURS, null],
    ['Lina Egalite', 'carnet', INTRO_RETOURS, null],
    ['Malo Partage', 'partage', INTRO_DEFAUT, null],
    ['Paul Rien', 'aucun', INTRO_DEFAUT, null],
    ['Rose Offre', 'offre', 'Merci pour votre intérêt pour le bien ' + BIEN + '.', null],
    ['Vera Prix', 'prix', INTRO_DEFAUT, null]
  ];
  cas.forEach(([name, angle, intro, corps]) => {
    assert.strictEqual(w.clSuggestAngle(G(name)), angle, name + ' : angle suggéré');
    const m = msg(name);
    const prenom = name.split(' ')[0];
    assert(m.startsWith('Bonjour ' + prenom + ', c’est Olivier. ' + intro + '\n\n'), name + ' : intro\n' + m);
    if (corps) assert.strictEqual(m, 'Bonjour ' + prenom + ', c’est Olivier. ' + intro + '\n\n' + corps + FIN, name + ' : texte complet');
    assert(!/[{}]/.test(m), name + ' : variable non remplacée');
  });
  // Variables vides : phrase correcte, sans parenthèse vide ni deux-points orphelin
  assert(msg('Nora Vide').includes('Vos retours de visite sont précieux. Ce qui vous a plu est un bon signe.'), msg('Nora Vide'));
  assert(!/Merci pour vos retours de visite/.test(w.clBuildMessage(G('Gaspard Carnet'), false, 'carnet')), 'carnet : plus de double remerciement');
  assert(msg('Oscar Vide').includes('vérifier lors de la visite. Je les prépare'), msg('Oscar Vide'));
  assert(msg('Pia Vigs').includes('lors de la visite : des points signalés dans la fiche et toiture. Je les prépare'), msg('Pia Vigs'));
  assert(!/point signalé\b(?! dans)/.test(msg('Fanny Visite')), 'plus de « point signalé » seul');
  assert(w.clBuildMessage(G('Paul Rien'), false, 'critere').includes('Vous avez indiqué que ce critère compte avant tout pour vous.'));
  // Tous les nouveaux angles sont dans la liste déroulante (avec leurs libellés)
  const LBL = { crush_match: 'Test : bon match, proposer une visite', crush_verifier: 'Test : lever les points à vérifier', crush_duo: 'Test à deux : préparer la visite', critere: 'Critère déterminant : adapter la suite',
    visite_points: 'Visite préparée : points à vérifier', carnet: 'Carnet partagé : seconde visite', coeur: 'Ça me parle : poursuivre', partage: 'Visite à plusieurs' };
  w.clMessageDialog(G('Alice Match').key, false);
  const opts = [...d.querySelectorAll('#cl-angle option')].map(o => [o.value, o.textContent]);
  Object.keys(LBL).forEach(k => assert(opts.some(([v, t]) => v === k && t === LBL[k]), 'option ' + k));
  ['visite', 'documents'].forEach(k => assert(opts.some(([v]) => v === k), 'angle manuel conservé : ' + k));
  assert.strictEqual(d.getElementById('cl-angle').value, 'crush_match');
  assert(d.getElementById('cl-text').value.includes('Votre résultat est très encourageant'));
  d.getElementById('cl-overlay').remove();

  // 2. Partage et ouverture via lien partagé : jamais cités, quel que soit l'angle choisi
  ['Inès Partage', 'Jules Ouvert', 'Malo Partage', 'Sam Score', 'Ugo Partage'].forEach(name => {
    Object.keys(w._CL_ANGLES).forEach(k => {
      const m = w.clBuildMessage(G(name), false, k);
      assert(!/partag|ouvert|\blien\b/i.test(m), name + ' / ' + k + ' : le partage est cité\n' + m);
    });
    assert(!/partag|ouvert|\blien\b/i.test(w.clBuildMessage(G(name), true)), name + ' : message de silence');
    assert(!w._clStats(G(name), NOW).reasons.some(r => /partag|ouvert|lien/i.test(r) && !/carnet/.test(r)), name + ' : raison citant le partage');
  });

  // 3. Financement : ni taux, ni durée, ni courtier
  const fin = w._CL_ANGLES.budget[1];
  assert(!/taux|durée|courtier/i.test(fin) && /budget total/.test(fin), 'Financement : ' + fin);
  assert.strictEqual(fin, 'Si le financement fait partie de votre réflexion, je peux vous aider à chiffrer l’ensemble du projet (apport, frais de notaire, éventuels travaux) pour que vous sachiez précisément quel budget total prévoir. C’est sans engagement, et cela permet d’y voir beaucoup plus clair avant de prendre une décision.');

  // 4. Score, badge et raisons
  const st = w._clStats(G('Sam Score'), NOW);
  assert.strictEqual(Math.round(st.score * 100) / 100, 12, 'score Sam : ' + st.score);
  ['a fait le test « Crush ou crash ? » (87 %)', 'a choisi comme critère déterminant le calme', 'a noté des points à vérifier en visite', 'a partagé son carnet de visite', 'a trouvé que le mot du vendeur lui parle']
    .forEach(r => assert(st.reasons.includes(r), 'raison « ' + r + ' » : ' + st.reasons.join(' | ')));
  assert.strictEqual(w._clBadge(G('Sam Score'), NOW).label, 'Intéressé · à rappeler');
  assert.strictEqual(w._clStats(G('Tom Chaud'), NOW).score, 16); assert.strictEqual(w._clBadge(G('Tom Chaud'), NOW).label, 'Très chaud · à rappeler', 'seuil très chaud inchangé (14)');
  assert.strictEqual(w._clStats(G('Ugo Partage'), NOW).score, 6, 'partage et ouverture : aucun point'); assert.strictEqual(w._clBadge(G('Ugo Partage'), NOW), null);
  // la ligne d'explication (visible par l'agent) reprend les raisons
  w.renderAnalytics();
  const txt = d.getElementById('analytics-tbody').textContent;
  assert(/Intéressé : actif aujourd’hui : .*a fait le test « Crush ou crash \? » \(87 %\)/.test(txt), 'ligne d\'explication');

  dom.window.close();
  console.log('OK relances : ' + cas.length + ' cas d\'angle, partage jamais cité, Financement sans taux ni durée, score et badge');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
