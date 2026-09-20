// Test de confidentialité : génère une fiche à partir d'un formulaire rempli de données vendeur factices
// et vérifie qu'aucune n'apparaît dans le HTML final (FR + versions EN/PT/ES) ni dans le contexte chatbot.
// Usage : cd tests && npm install && npm test
const fs = require('fs'), path = require('path'), assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.join(__dirname, '..');

const SECRETS = {
  proprio_prenom: 'Zephyrine', proprio_nom: 'Quarantecinq', tel_mobile: '06 12 34 56 78', tel_fixe: '01 98 76 54 32',
  email_proprio: 'zephyrine.quarantecinq@exemple-secret.test', ref_mandat: 'MANDAT-SECRET-98765',
  raison_vente: 'divorce-douloureux-secret', prix_achat: '187654', annee_achat: '1999', capital_restant: '43210',
  dette_montant: '65432', banque: 'BanqueSecreteXYZ', nb_offres: '7777', prix_offres: 'offre-refusee-secrete-231',
  scenario_reponse: 'plancher-negociation-scenario-secret', scenario_montant: '211111',
  q1: 'note-privee-q1-secrete', q2: 'note-privee-q2-secrete', q3: 'note-privee-q3-secrete', q4: 'note-privee-q4-secrete',
  q5: 'note-privee-q5-secrete', notes_libres: 'notes-libres-agent-secrete', prochaines_etapes: 'prochaines-etapes-secretes',
  cles_chez: 'cles-chez-gardien-secret', agences: 'concurrent-agence-secrete', reloge_budget: '333222',
  bien_fourchette_milieu: '245678'   // « marge de négociation / prix plancher » côté formulaire
};

async function main() {
  const vc = new VirtualConsole(); vc.on('jsdomError', e => console.log('[jsdom]', String(e.message).slice(0,150)));
  const dom = await JSDOM.fromFile(path.join(root, 'app.html'), { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, url: 'http://localhost/app.html', beforeParse(w) {
    w.fetch = () => Promise.resolve({ ok: false, status: 503, json: async () => ({}), text: async () => '' });
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null }), upsert: async () => ({}), then: (f) => f({ data: [] }) };
    const client = { auth: { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => q };
    w.supabase = { createClient: () => client };
    w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, addEventListener() {} }));
    w.scrollTo = () => {};
  } });
  const w = dom.window, doc = w.document;
  await new Promise(r => setTimeout(r, 300));
  const set = (id, v) => { const el = doc.getElementById(id); assert(el, 'champ introuvable : ' + id); el.value = v; };
  Object.keys(SECRETS).forEach(k => set(k, SECRETS[k]));
  set('adresse', '12 rue des Lilas 91000 Evry'); set('surface_hab', '65'); set('prix_vente', '250000');
  set('taxe_fonciere', '1234'); set('annee_construction', '1985');
  set('bien_fort1', 'Lumineux'); set('bien_vig1', 'Toiture à surveiller');
  // nb : le champ « prix plancher » saisi dans les notes libres et le scénario est couvert ci-dessus

  const d = w.collectBienData();
  w._bienData = d;
  const ctx = w.buildChatContext(d);
  w._chatCtx = ctx;
  const tmpl = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dEn = w.buildBienDataLang(d, { fort1: 'Bright' });   // même chemin que la génération multilingue
  const dPt = w.buildBienDataLang(d, { fort1: 'Luminoso' });
  const out = w.injectData(tmpl, d, dEn, { pt: dPt, es: null });
  const priv = w.privateFicheData(d);

  // 1. Aucune donnée privée dans le HTML final ni dans le contexte chatbot
  const values = Object.values(SECRETS);
  const bad = [];
  values.forEach(v => { if (out.includes(v)) bad.push('HTML: ' + v); if (ctx.includes(v)) bad.push('CHATBOT: ' + v); });
  assert.deepStrictEqual(bad, [], 'Données privées trouvées :\n' + bad.join('\n'));
  // variantes de formatage possibles (téléphone sans espaces, prix formaté)
  ['0612345678', '187 654', '187654', '211 111', '211111', '245 678'].forEach(v => {
    assert(!out.includes(v), 'HTML contient ' + v); assert(!ctx.includes(v), 'contexte chatbot contient ' + v);
  });
  assert(!/_rawState":{(?!"photos")/.test(out), 'bloc _rawState (formulaire) présent dans le HTML');
  assert(!/"proprio_nom"|"raison_vente"|"prix_achat"|"notes_libres"/.test(out), 'clés de formulaire présentes dans le HTML');

  // 2. La fiche reste fonctionnelle : données publiques présentes
  assert(out.includes('12 rue des Lilas'), 'adresse absente');
  assert(/id="expertimo-data"/.test(out) && /id="expertimo-data-en"/.test(out), 'blocs de données absents');
  assert(out.includes('"agentEmail"'), 'agentEmail attendu dans le bloc public');

  // 3. La partie privée est bien récupérée côté agent (pour « Modifier »)
  assert.strictEqual(priv.ref, SECRETS.ref_mandat);
  assert.strictEqual(priv._rawState.proprio_nom, SECRETS.proprio_nom);
  assert.strictEqual(priv._rawState.notes_libres, SECRETS.notes_libres);
  assert.strictEqual(priv._rawState.prix_achat, SECRETS.prix_achat);
  assert(!('photos' in priv._rawState), 'les photos ne vont pas dans la partie privée');
  console.log('OK — aucune donnée vendeur dans le HTML (' + out.length + ' octets) ni dans le contexte chatbot (' + ctx.length + ' car.) ; partie privée complète côté agent.');
  dom.window.close();
}
main().catch(e => { console.error('ÉCHEC :', e.stack || e.message); process.exit(1); });
