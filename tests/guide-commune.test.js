// Guide « Vivre à [ville] » : route serveur (collecte, rédaction une seule fois, cache, sources, filtres) avec des
// réponses simulées pour Longjumeau, Chilly-Mazarin et Wissous ; détection de commune dans l'app ; modification et
// masquage par l'agent ; rendu dans la fiche.
// Usage : cd tests && node guide-commune.test.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const Module = require('module'); const _load = Module._load;
Module._load = function(r, ...x) { return r === '@supabase/supabase-js' ? { createClient: () => { throw new Error('non utilisé : base injectée'); } } : _load.call(this, r, ...x); };
const route = require(path.join(__dirname, '..', 'api', 'guide-commune.js'));
const root = path.join(__dirname, '..');

const KEY_IA = 'sk-ant-test-ia-123456', KEY_DT = 'dt-test-cle-987654';
const COMMUNES = {
  '91345': { nom: 'Longjumeau', q: 'Q1', titre: 'Longjumeau', extrait: [
    'Longjumeau est une commune française située dans le département de l\'Essonne, au sud de Paris, traversée par l\'Yvette.',
    '== Géographie ==', 'Texte de géographie.', '=== Transports ===', 'La commune est desservie par la ligne de tram-train T12 (gares de Longjumeau et de Chilly-Mazarin) et par plusieurs lignes de bus. La route nationale 20 la traverse.',
    '== Histoire ==', 'Histoire ancienne.',
    '== Population et société ==', '=== Démographie ===', 'En 2021, la commune comptait 21 000 habitants.', '=== Enseignement ===', 'La commune compte plusieurs écoles maternelles et élémentaires, deux collèges et un lycée.', '=== Santé ===', 'Le centre hospitalier de Longjumeau accueille les urgences du secteur.',
    '== Économie ==', 'Le revenu fiscal médian par ménage était de 24 000 euros en 2019. Plusieurs zones d\'activités accueillent des entreprises.',
    '== Culture locale et patrimoine ==', '=== Lieux et monuments ===', 'L\'église Saint-Martin, classée monument historique en 1910, date du XIIIe siècle. Le pont des Templiers enjambe l\'Yvette.',
    '== Voir aussi ==', 'Liens.'].join('\n') },
  '91161': { nom: 'Chilly-Mazarin', q: 'Q2', titre: 'Chilly-Mazarin', extrait: [
    'Chilly-Mazarin est une commune française de l\'Essonne, proche de l\'aéroport d\'Orly.',
    '== Transports ==', 'La gare de Chilly-Mazarin, sur la ligne de tram-train T12, a ouvert en décembre 2023. Des bus relient Massy et Juvisy.',
    '== Patrimoine ==', 'Le château, ancienne demeure du maréchal d\'Effiat, abrite aujourd\'hui l\'hôtel de ville. L\'église Saint-Étienne date du XIIIe siècle.'].join('\n') },
  '91689': { nom: 'Wissous', q: 'Q3', titre: 'Wissous', extrait: [
    'Wissous est une commune française de l\'Essonne, à proximité de l\'aéroport d\'Orly.',
    '== Transports ==', 'La commune ne compte pas de gare de voyageurs ; elle est reliée aux autoroutes A6 et A10.',
    '== Économie ==', 'La commune accueille une importante zone d\'activités logistiques liée au pôle d\'Orly.'].join('\n') }
};
// DATAtourisme simulé : répond seulement pour Longjumeau (filtre explicite) ; Chilly : 500 ; Wissous : forme inattendue
const DT = { '91345': [
  { type: ['Church', 'CulturalSite'], label: { fr: 'Église Saint-Martin' }, isLocatedAt: [{ address: [{ hasAddressCity: { insee: '91345' } }] }] },
  { type: ['ParkAndGarden'], label: { fr: 'Parc Nativelle' }, isLocatedAt: [{ address: [{ hasAddressCity: { insee: '91345' } }] }] },
  { type: ['CulturalEvent'], label: { fr: 'Salon d\'automne' }, takesPlaceAt: [{ startDate: '2026-11-02', endDate: '2026-11-03' }], isLocatedAt: [{ address: [{ hasAddressCity: { insee: '91345' } }] }] },
  { type: ['CulturalEvent'], label: { fr: 'Fête passée' }, takesPlaceAt: [{ startDate: '2026-06-21', endDate: '2026-06-21' }], isLocatedAt: [{ address: [{ hasAddressCity: { insee: '91345' } }] }] }] };

function monde(opts = {}) {
  const appels = [], table = opts.table || new Map();
  const reponse = (status, obj) => ({ ok: status >= 200 && status < 300, status, json: async () => obj, text: async () => JSON.stringify(obj) });
  const fetchFn = async (url, init) => {
    const u = new URL(url); appels.push({ hote: u.host, url, init });
    if (u.host === 'www.wikidata.org' && u.searchParams.get('list') === 'search') {
      const insee = /P374=(\w+)/.exec(u.searchParams.get('srsearch'))[1];
      if (opts.wikidataAmbigu) return reponse(200, { query: { search: [{ title: 'Q1' }, { title: 'Q9' }] } });
      return reponse(200, { query: { search: COMMUNES[insee] ? [{ title: COMMUNES[insee].q }] : [] } });
    }
    if (u.host === 'www.wikidata.org') { const q = u.searchParams.get('ids'), c = Object.values(COMMUNES).find(x => x.q === q); return reponse(200, { entities: { [q]: { sitelinks: { frwiki: { title: c.titre } } } } }); }
    if (u.host === 'fr.wikipedia.org') { const t = u.searchParams.get('titles'), c = Object.values(COMMUNES).find(x => x.titre === t); return reponse(200, { query: { pages: [{ title: c.titre, fullurl: 'https://fr.wikipedia.org/wiki/' + c.titre, extract: c.extrait }] } }); }
    if (u.host === 'api.datatourisme.fr') {
      if (opts.dtPanne) throw new Error('ECONNRESET');
      const p = u.searchParams; const m = /insee\[eq\]=(\d+)/.exec(p.get('filters') || '');
      if (p.get('insee')) return reponse(200, { objects: [{ type: ['Restaurant'], label: { fr: 'Ailleurs' }, isLocatedAt: [{ address: [{ hasAddressCity: { insee: '75056' } }] }] }], meta: { total: 1, total_pages: 1 } });   // alias ignoré
      if (m && m[1] === '91161') return reponse(500, {});
      if (m && m[1] === '91689') return reponse(200, { results: [] });
      return reponse(200, { objects: DT[m && m[1]] || [], meta: { total: 0, total_pages: 1 } });
    }
    if (u.host === 'api.anthropic.com') {
      const corps = JSON.parse(init.body), entree = JSON.parse(corps.messages[0].content);
      const out = {};
      // IA simulée : une phrase reprise de la source (fidèle) + des pièges qui doivent être retirés
      const PIEGES = { transports: ' L\'autoroute A6 traverse la commune. Un cadre de vie idyllique.', patrimoine: ' Le pont des Templiers date de 1438.',
        parcs: ' Ce dernier abrite une ludothèque installée dans l\'ancien château Nativelle.', equipements: ' La commune accueille un tribunal d\'instance.',
        economie: ' La commune comptait 21 000 habitants en 2021. Le siège français d\'Intersport s\'y trouve.', culture: ' Un festival de jazz a lieu chaque mois de mai.' };
      Object.keys(entree.rubriques).forEach(k => {
        const wpTxt = entree.rubriques[k].wikipedia || '';
        const fidele = (wpTxt.match(/[^.!?\n]+[.!?]/g) || []).map(x => x.trim()).find(x => !/habitants|revenu|euros/.test(x)) || '';
        const dt = (entree.rubriques[k].datatourisme || []).map(x => x.nom + ' figure parmi les lieux.').join(' ');
        out[k] = (fidele + ' ' + dt).trim() + (PIEGES[k] || '');
      });
      out.economie_inventee = 'Ne doit pas apparaître.';
      if (!entree.rubriques.parcs) out.parcs = 'Rubrique inventée sans donnée.';
      return reponse(200, { content: [{ type: 'text', text: JSON.stringify({ rubriques: out }) }], stop_reason: 'end_turn' });
    }
    throw new Error('hôte inattendu ' + u.host);
  };
  const db = { from: () => ({
    select: () => ({ eq: (k, v) => ({ maybeSingle: async () => ({ data: table.get(v) || null, error: null }) }) }),
    upsert: async (row, o) => { if (!table.has(row.insee)) table.set(row.insee, row); return { error: null }; } }) };
  return { appels, table, deps: { fetch: fetchFn, db, verifier: async t => t === 'jwt' ? { id: 'agent' } : null, env: { ANTHROPIC_API_KEY: KEY_IA, DATATOURISME_API_KEY: KEY_DT, ...(opts.env || {}) }, now: () => new Date('2026-10-11T10:00:00Z') } };
}
function res() { const r = { code: 0, body: null }; r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; }; r.end = () => r; r.setHeader = () => {}; return r; }
const appel = async (w, insee, commune, auth = 'Bearer jwt') => { const r = res(); await route.handler({ method: 'POST', headers: { authorization: auth }, body: { insee, commune } }, r, w.deps); return r; };

(async () => {
  // ── accès et entrées
  let w = monde();
  assert.strictEqual((await appel(w, '91345', 'Longjumeau', '')).code, 401, 'sans session');
  assert.strictEqual((await appel(w, '91345', 'Longjumeau', 'Bearer autre')).code, 401, 'session invalide');
  assert.strictEqual((await appel(w, '9134', 'Longjumeau')).code, 400, 'code INSEE invalide');
  assert.strictEqual((await appel(w, '91345', '')).code, 400, 'commune manquante');
  assert.strictEqual(w.appels.length, 0, 'aucun appel externe pour une requête refusée');

  // ── Longjumeau : Wikipédia + DATAtourisme, rédaction, cache
  let r = await appel(w, '91345', 'Longjumeau');
  assert.strictEqual(r.code, 200, JSON.stringify(r.body));
  const g = r.body.guide, cles = g.rubriques.map(x => x.cle);
  assert.deepStrictEqual(cles, ['presentation', 'transports', 'equipements', 'parcs', 'patrimoine', 'economie'], 'rubriques avec données (transports, écoles et commerces d\'abord) : ' + cles);
  assert(!cles.includes('culture'), 'rubrique sans donnée (culture) : non écrite');
  assert(!g.rubriques.some(x => /inventée|Ne doit pas/.test(x.texte)), 'rubrique inventée par l\'IA écartée');
  const eco = g.rubriques.find(x => x.cle === 'economie'), tr = g.rubriques.find(x => x.cle === 'transports');
  assert(!/habitants|21 000|euros|revenu/.test(eco.texte), 'aucun chiffre daté : ' + eco.texte);
  assert(!/idyllique/.test(tr.texte) && /T12/.test(tr.texte), 'phrase lyrique retirée, fait conservé : ' + tr.texte);
  const wp = tr.sources.find(s => s.type === 'wikipedia');
  assert(wp && wp.url === 'https://fr.wikipedia.org/wiki/Longjumeau' && wp.licence === 'CC BY-SA 4.0' && /Wikipédia/.test(wp.titre), 'source Wikipédia citée (CC BY-SA, lien)');
  const pat = g.rubriques.find(x => x.cle === 'patrimoine'), parcs = g.rubriques.find(x => x.cle === 'parcs');
  assert(pat.sources.some(s => s.type === 'datatourisme' && s.url === 'https://www.datatourisme.fr') && parcs.sources.length === 1 && parcs.sources[0].type === 'datatourisme', 'source DATAtourisme citée par rubrique');
  assert.deepStrictEqual(r.body.evenements.liste, [{ nom: 'Salon d\'automne', debut: '2026-11-02', fin: '2026-11-03' }], 'événements à venir seulement, sans IA');
  assert.strictEqual(r.body.cache, false);
  const ia = w.appels.filter(a => a.hote === 'api.anthropic.com');
  assert.strictEqual(ia.length, 1, 'une seule rédaction');
  const corpsIa = JSON.parse(ia[0].init.body);
  assert.strictEqual(corpsIa.model, 'claude-sonnet-5-5', 'modèle par défaut : Sonnet 5.5');
  assert(!JSON.stringify(corpsIa.messages).includes('Salon d\'automne'), 'les événements ne passent pas par l\'IA');
  assert(!/Démographie|21 000 habitants/.test(corpsIa.messages[0].content), 'section Démographie jamais transmise');
  assert(ia[0].init.headers['x-api-key'] === KEY_IA && w.appels.filter(a => a.hote === 'api.datatourisme.fr').every(a => a.init.headers['X-API-Key'] === KEY_DT), 'clés en en-tête uniquement');
  assert(!JSON.stringify(r.body).includes(KEY_IA) && !JSON.stringify(r.body).includes(KEY_DT), 'clés jamais renvoyées');
  assert(w.appels.every(a => !a.url.includes(KEY_IA) && !a.url.includes(KEY_DT)), 'clés jamais dans une URL');
  assert(w.table.has('91345'), 'guide mis en cache');
  assert(!JSON.stringify(w.table.get('91345')).includes('Salon d\'automne'), 'événements jamais mis en cache');

  // ── cache réutilisé : 2e fiche de la même commune, aucune nouvelle rédaction ni lecture de Wikipédia
  const avant = w.appels.length;
  r = await appel(w, '91345', 'Longjumeau');
  const nouveaux = w.appels.slice(avant);
  assert.strictEqual(r.body.cache, true, 'servi depuis le cache');
  assert(!nouveaux.some(a => a.hote === 'api.anthropic.com' || a.hote === 'fr.wikipedia.org' || a.hote === 'www.wikidata.org'), 'ni IA ni Wikipédia : ' + nouveaux.map(a => a.hote));
  assert.deepStrictEqual(r.body.guide.rubriques, g.rubriques, 'même texte pour toutes les fiches de la commune');
  assert(r.body.evenements && r.body.evenements.liste.length === 1, 'événements récupérés à part, à chaque fois');

  // ── Chilly-Mazarin : DATAtourisme en erreur → sans DATAtourisme, sans erreur visible
  r = await appel(w, '91161', 'Chilly-Mazarin');
  assert.strictEqual(r.code, 200); assert.deepStrictEqual(r.body.guide.rubriques.map(x => x.cle), ['presentation', 'transports', 'patrimoine']);
  assert(r.body.guide.rubriques.every(x => x.sources.every(s => s.type === 'wikipedia')) && r.body.evenements === null, 'Chilly : Wikipédia seul');
  // ── Wissous : réponse DATAtourisme de forme inattendue → ignorée
  r = await appel(w, '91689', 'Wissous');
  assert.strictEqual(r.code, 200); assert.deepStrictEqual(r.body.guide.rubriques.map(x => x.cle), ['presentation', 'transports', 'economie']);
  assert(!/gare de voyageurs ; elle/.test('') && r.body.evenements === null);

  // ── clé DATAtourisme absente, réseau DATAtourisme en panne : on continue
  let w2 = monde({ env: { DATATOURISME_API_KEY: '' } }); r = await appel(w2, '91345', 'Longjumeau');
  assert(r.body.guide && !w2.appels.some(a => a.hote === 'api.datatourisme.fr') && !r.body.guide.rubriques.some(x => x.cle === 'parcs'), 'sans clé DATAtourisme : Wikipédia seul');
  w2 = monde({ dtPanne: true }); r = await appel(w2, '91345', 'Longjumeau'); assert(r.code === 200 && r.body.guide, 'DATAtourisme en panne : sans erreur');
  // ── modèle configurable
  w2 = monde({ env: { GUIDE_COMMUNE_MODEL: 'claude-haiku-5-5' } }); await appel(w2, '91345', 'Longjumeau');
  assert.strictEqual(JSON.parse(w2.appels.find(a => a.hote === 'api.anthropic.com').init.body).model, 'claude-haiku-5-5', 'GUIDE_COMMUNE_MODEL change le modèle');
  // ── code INSEE ambigu sur Wikidata, commune inconnue : rien n'est inventé, aucun appel IA
  w2 = monde({ wikidataAmbigu: true, env: { DATATOURISME_API_KEY: '' } }); r = await appel(w2, '91345', 'Longjumeau');
  assert(r.body.guide === null && !w2.appels.some(a => a.hote === 'api.anthropic.com') && !w2.table.size, 'ambigu : pas de guide, pas d\'IA, pas de cache');
  w2 = monde({ env: { DATATOURISME_API_KEY: '' } }); r = await appel(w2, '99999', 'Nulle-Part');
  assert(r.body.guide === null && !w2.appels.some(a => a.hote === 'api.anthropic.com'), 'commune sans donnée : pas de guide');
  // ── clé IA absente : pas de guide, pas d'erreur
  w2 = monde({ env: { ANTHROPIC_API_KEY: '' } }); r = await appel(w2, '91345', 'Longjumeau'); assert(r.code === 200 && r.body.guide === null);
  // ── pièges retirés du guide de Longjumeau (fidélité, en code)
  {
    const tout = g.rubriques.map(x => x.texte).join(' ');
    ['A6', 'Templiers', 'ludothèque', 'tribunal', 'Intersport', 'habitants', 'idyllique'].forEach(m => assert(!tout.includes(m), 'piège retiré : ' + m + ' dans « ' + tout + ' »'));
    assert(/T12/.test(tr.texte) && /Nativelle figure parmi les lieux/.test(parcs.texte) && /Saint-Martin/.test(pat.texte), 'faits sourcés conservés');
  }
  // ── fidélité : source simulée avec pièges (nom propre absent, date absente, « traverse » quand la source dit « évite »)
  {
    const { filtrerFidele, verifierPhrase, SYSTEME } = route._interne;
    const source = 'L\'autoroute A6 évite Longjumeau par le nord. La RN20 contourne le centre par l\'ouest. L\'église Saint-Martin date du XIIIe siècle. Le vieux pont de Balizy, du XIIIe siècle, est un monument historique. Le château Nativelle accueille l\'hôtel de ville.';
    const texte = 'L\'autoroute A6 traverse partiellement la commune. La RN20 contourne le centre par l\'ouest. Le théâtre Adolphe Adam accueille des spectacles. L\'église Saint-Martin est classée depuis 1910. Le vieux pont de Balizy, du XIIIe siècle, est un monument historique. Une ludothèque est installée dans le château Nativelle. Un marché se tient le mercredi. L\'église Saint-Martin date du XIVe siècle.';
    const r2 = filtrerFidele(texte, source, 'Longjumeau');
    assert.strictEqual(r2.texte, 'La RN20 contourne le centre par l\'ouest. Le vieux pont de Balizy, du XIIIe siècle, est un monument historique.', 'seules les phrases sourcées restent : ' + r2.texte);
    const motifs = r2.retirees.map(x => x.motif).join(' | ');
    assert(/relation absente de la source : travers/.test(motifs), '« traverse » alors que la source dit « évite » : ' + motifs);
    assert(/nom propre absent de la source : Adolphe/.test(motifs), 'nom propre absent');
    assert(/nombre absent de la source : 1910/.test(motifs), 'date absente');
    assert(/relation absente de la source : install/.test(motifs), 'relation « installé dans » absente');
    assert(/fait qui vieillit|périodicité absente/.test(motifs), 'marché / mercredi');
    assert(/siècle absent de la source : XIV/.test(motifs), 'siècle absent');
    assert.strictEqual(r2.retirees.length, 6);
    // phrases non sourcées supprimées, rubrique vide
    assert.strictEqual(filtrerFidele('Un festival de jazz a lieu chaque mois de mai. Le stade Frédéric-Langrenay accueille les clubs.', 'La commune possède un théâtre.', 'Longjumeau').texte, '', 'rien de sourcé : rubrique vide');
    assert(verifierPhrase('Longjumeau est desservie par le tram-train T12.', 'La commune est desservie par la ligne de tram-train T12.\nLongjumeau').ok, 'reformulation fidèle gardée');
    assert(!verifierPhrase('La commune accueille un commissariat de police.', 'La commune accueille un commissariat de police.').ok, 'service public réorganisable : jamais écrit');
    assert(/EXTRACTIF/.test(SYSTEME) && /installé dans/.test(SYSTEME) && /chaque mois de mai/.test(SYSTEME) && /fusionne/.test(SYSTEME), 'consignes extractives');
    // rubrique entièrement non sourcée par l'IA : elle n'apparaît pas
    const w3 = monde({ env: { DATATOURISME_API_KEY: '' } });
    const f0 = w3.deps.fetch;
    w3.deps.fetch = async (u, i) => /anthropic/.test(u) ? { ok: true, status: 200, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ rubriques: { presentation: 'Longjumeau est une commune française située dans le département de l\'Essonne, au sud de Paris, traversée par l\'Yvette.', transports: 'L\'autoroute A6 traverse la ville. La gare TGV relie Paris en dix minutes.', economie: 'Le siège d\'Intersport est installé ici.' } }) }] }) } : f0(u, i);
    const r3 = await appel(w3, '91345', 'Longjumeau');
    assert.deepStrictEqual(r3.body.guide.rubriques.map(x => x.cle), ['presentation'], 'rubriques sans phrase sourcée : absentes');
  }
  // ── format : 3 ou 4 phrases courtes, 450 caractères au plus par rubrique
  {
    const { formater, MAX_CAR_TEXTE, SYSTEME } = route._interne;
    assert.strictEqual(MAX_CAR_TEXTE, 450);
    g.rubriques.forEach(x => { assert(x.texte.length <= 450, x.cle + ' : ' + x.texte.length + ' caractères'); assert((x.texte.match(/[.!?](\s|$)/g) || []).length <= 4, x.cle + ' : plus de 4 phrases'); });
    const six = ['Phrase un assez longue pour compter dans le total de la rubrique, avec des mots.', 'Phrase deux.', 'Phrase trois.', 'Phrase quatre.', 'Phrase cinq.', 'Phrase six.'];
    assert.deepStrictEqual(formater(six), six.slice(0, 4), '4 phrases au plus');
    const longues = Array.from({ length: 4 }, (_, i) => 'Phrase ' + i + ' ' + 'x'.repeat(140) + '.');
    const f = formater(longues); assert(f.length === 2 && f.join(' ').length <= 450, 'coupé en phrases entières sous 450 caractères');
    assert(/450 caractères/.test(SYSTEME) && /3 ou 4 phrases courtes/.test(SYSTEME) && /écoles \(écoles, collège, lycée\)/.test(SYSTEME) && /transports/.test(SYSTEME), 'consignes de format et de priorité');
    assert(/effectifs/.test(SYSTEME) && /capacités de salles/.test(SYSTEME) && /académie, canton/.test(SYSTEME) && /noms d'entreprises/.test(SYSTEME) && /sièges sociaux/.test(SYSTEME), 'nouveaux interdits dans la consigne');
    // l'IA renvoie 6 phrases fidèles et longues : la rubrique est ramenée à 4 phrases / 450 caractères
    const src6 = 'La commune est desservie par la ligne de tram-train T12 (gares de Longjumeau et de Chilly-Mazarin) et par plusieurs lignes de bus. La route nationale 20 la traverse.';
    const w4 = monde({ env: { DATATOURISME_API_KEY: '' } }), f4 = w4.deps.fetch;
    w4.deps.fetch = async (u, i) => /anthropic/.test(u) ? { ok: true, status: 200, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ rubriques: { transports: Array(6).fill(src6.split('. ')[0] + '.').map((x, k) => k % 2 ? 'La route nationale 20 la traverse.' : x).join(' ') } }) }] }) } : f4(u, i);
    const r4 = await appel(w4, '91345', 'Longjumeau'), t4 = r4.body.guide.rubriques.find(x => x.cle === 'transports').texte;
    assert(t4.length <= 450 && (t4.match(/\./g) || []).length <= 4, 'rubrique tronquée en phrases entières : ' + t4.length);
  }
  // ── interdits : effectifs, exploitations, capacités, rattachement administratif, entreprises — même présents dans la source
  {
    const { verifierPhrase } = route._interne;
    const S = 'L\'usine Safran emploie 1 200 salariés. La commune compte 12 exploitations agricoles. Le théâtre Adolphe-Adam dispose d\'une salle de 400 places. La commune est rattachée à l\'académie de Versailles et au canton de Longjumeau. Le siège social de Safran est à Massy. Un magasin Intersport est implanté dans la zone. Le centre commercial Carrefour est au nord. Le collège Paul-Langevin et le lycée Jacques-Prévert accueillent les élèves. La zone d\'activités de la Croix-Blanche regroupe des commerces. Le collège compte 600 élèves.';
    const cas = [
      ['L\'usine Safran emploie 1 200 salariés.', 'economie', /effectif|entreprise/],
      ['La commune compte 12 exploitations agricoles.', 'economie', /exploitations/],
      ['Le théâtre Adolphe-Adam dispose d\'une salle de 400 places.', 'culture', /capacité/],
      ['La commune est rattachée à l\'académie de Versailles et au canton de Longjumeau.', 'presentation', /rattachement administratif/],
      ['Le siège social de Safran est à Massy.', 'economie', /entreprise/],
      ['Un magasin Intersport est implanté dans la zone.', 'equipements', /marque : Intersport/],
      ['Le centre commercial Carrefour est au nord.', 'economie', /marque : Carrefour/],
      ['Le collège compte 600 élèves.', 'equipements', /effectif/]
    ];
    for (const [p, cle, motif] of cas) { const v = verifierPhrase(p, S, cle, 'Longjumeau'); assert(!v.ok && motif.test(v.motif), p + ' → ' + JSON.stringify(v)); }
    assert(verifierPhrase('Le collège Paul-Langevin et le lycée Jacques-Prévert accueillent les élèves.', S, 'equipements', 'Longjumeau').ok, 'noms d\'établissements scolaires gardés');
    assert(verifierPhrase('La zone d\'activités de la Croix-Blanche regroupe des commerces.', S, 'economie', 'Longjumeau').ok, 'nom de zone gardé');
  }
  // ── vérifiabilité : extrait exact de la source enregistré par rubrique (et dans le cache)
  {
    const wpTexte = COMMUNES['91345'].extrait;
    g.rubriques.forEach(x => {
      assert(typeof x.extrait === 'string' && x.extrait.length > 0, x.cle + ' : extrait présent');
      (x.extrait.match(/« ([^»]+) »/g) || []).map(m => m.slice(2, -2)).forEach(m => assert(wpTexte.includes(m) || /^(Église Saint-Martin|Parc Nativelle) \(/.test(m), x.cle + ' : extrait recopié tel quel de la source : ' + m));
    });
    assert.strictEqual(tr.extrait, '« La commune est desservie par la ligne de tram-train T12 (gares de Longjumeau et de Chilly-Mazarin) et par plusieurs lignes de bus. »', 'extrait transports : ' + tr.extrait);
    assert(/« Parc Nativelle \(parc ou jardin\) »/.test(parcs.extrait), 'extrait DATAtourisme : nom et catégorie');
    assert.deepStrictEqual(w.table.get('91345').rubriques.map(x => x.extrait), g.rubriques.map(x => x.extrait), 'extraits enregistrés dans le cache');
    assert(!/A6|Intersport|1438/.test(g.rubriques.map(x => x.extrait).join(' ')), 'pas d\'extrait pour une phrase retirée');
  }
  // ── corrections après lecture des extraits de Longjumeau
  {
    const { verifierPhrase, passagesPour, valeursNombres, filtrerFidele } = route._interne;
    const ok = (p, src, cle) => verifierPhrase(p, src + '\nLongjumeau', cle, 'Longjumeau');
    // 1. distance en kilomètres vers Paris : en lettres ou en chiffres, si elle est dans la source
    const PRES = 'Longjumeau (prononcé [lɔ̃ʒymo] ; ) est une commune française située à dix-neuf kilomètres au sud de Paris dans le département de l’Essonne, en région Île-de-France.';
    assert(valeursNombres('à dix-neuf kilomètres').has('19') && valeursNombres('quatre-vingt-dix').has('90') && valeursNombres('vingt et un').has('21') && valeursNombres('1 200 m').has('1200'), 'nombres en lettres');
    assert(ok('Longjumeau est située à dix-neuf kilomètres au sud de Paris.', PRES, 'presentation').ok, 'distance en lettres gardée');
    assert(ok('Longjumeau est à 19 km au sud de Paris.', PRES, 'presentation').ok, 'distance en chiffres gardée');
    assert(/nombre absent de la source : 25/.test(ok('Longjumeau est à 25 km de Paris.', PRES, 'presentation').motif), 'distance inventée retirée');
    assert(/dix-neuf kilomètres au sud de Paris/.test(route._interne.SYSTEME), 'consigne : distance autorisée');
    // 4. formulation d'acheteur
    const TR = 'Deux axes majeurs de la région font office de frontières pour la commune, la route nationale 20 à l’ouest et l’autoroute A6 au nord-est (mais seule la route nationale pénètre dans le territoire communal).';
    assert(/encyclopédie/.test(ok('La route nationale 20 et l\'autoroute A6 font office de frontières pour la commune.', TR, 'transports').motif), '« font office de frontières » retiré');
    assert(ok('La route nationale 20 et l\'autoroute A6 contournent la commune.', TR, 'transports').ok, '« contournent la commune » quand la source parle de frontières');
    assert(!ok('L\'autoroute A6 traverse la commune.', TR, 'transports').ok, '« traverse » toujours refusé');
    const PAT = 'Le monument d’importance est l’église Saint-Martin, construite aux XIIIe et XIVe siècles et classée le 1er avril 1910.\nFerme pédagogique Le P\'tit brin d\'Paille lieu de sport et de loisirs';
    assert(/encyclopédie/.test(ok('Le monument d\'importance est l\'église Saint-Martin.', PAT, 'patrimoine').motif), '« le monument d\'importance est » retiré');
    assert(ok('L\'église Saint-Martin, des XIIIe et XIVe siècles, est classée depuis 1910.', PAT, 'patrimoine').ok, 'reformulation simple gardée');
    assert(/loisirs hors du patrimoine/.test(ok('Parmi les lieux de loisirs, on trouve la Ferme pédagogique Le P\'tit brin d\'Paille.', PAT, 'patrimoine').motif + ok('La Ferme pédagogique Le P\'tit brin d\'Paille est un lieu de loisirs.', PAT, 'patrimoine').motif), 'loisirs jamais dans le patrimoine');
    assert(/font office de/.test(route._interne.SYSTEME) && /contournent la commune/.test(route._interne.SYSTEME) && /Patrimoine : uniquement/.test(route._interne.SYSTEME), 'consignes de formulation');
    // 5. écoles : primaires, collège, lycée gardés ; ni effectifs ni académie
    const EC = 'La commune est rattachée à l’académie de Versailles. Elle dispose de six écoles maternelles et de six écoles élémentaires. La plupart des élèves poursuivent leur scolarité au collège Louis-Pasteur puis dans l’un des lycées de la commune : Jacques-Prévert pour les sections générales et technologiques, Jean-Perrin pour certaines sections professionnelles. Le collège compte 600 élèves.';
    const fe = filtrerFidele('La commune compte six écoles maternelles et six écoles élémentaires. Les élèves poursuivent leur scolarité au collège Louis-Pasteur. Les lycées Jacques-Prévert (sections générales et technologiques) et Jean-Perrin (sections professionnelles) sont dans la commune. Les écoles dépendent de l\'académie de Versailles. Le collège compte 600 élèves.', EC, 'Longjumeau', 'equipements', [...EC.match(/[^.]+\./g)].map(x => x.trim()));
    assert.strictEqual(fe.gardees.length, 3, 'écoles primaires, collège et lycées gardés : ' + JSON.stringify(fe.retirees));
    assert.deepStrictEqual(fe.retirees.map(x => x.motif), ['rattachement administratif', 'effectif']);
    assert(/écoles maternelles et élémentaires \(primaires\), le collège et le lycée/.test(route._interne.SYSTEME));
    // 3. chaque phrase a son passage ; sinon elle est retirée
    const C = ['Le territoire communal est traversé par les trams-trains de la ligne 12 du tramway d\'Île-de-France.', 'Longjumeau dispose des gares de Longjumeau et de Gravigny-Balizy.', 'La commune est desservie par les lignes de bus 199 et 297 du réseau Massy-Juvisy.', 'La gare de Massy-Palaiseau est desservie par le RER B.'];
    assert.deepStrictEqual(passagesPour('Les lignes de bus 199 et 297 du réseau Massy-Juvisy desservent la commune.', C, C.join('\n'), 'Longjumeau'), [C[2]], 'passage exact retrouvé');
    assert.strictEqual(passagesPour('Les lignes 199 et 297 du réseau Massy-Juvisy relient la commune à Évry.', C, C.join('\n') + ' Évry', 'Longjumeau'), null, 'élément sans passage (Évry) : pas de passage');
    const f3 = filtrerFidele('Les lignes de bus 199 et 297 du réseau Massy-Juvisy desservent la commune. Les gares de Gravigny-Balizy et de Massy-Palaiseau, la ligne 12 et les lignes de bus 199 et 297 desservent Longjumeau.', C.join('\n'), 'Longjumeau', 'transports', C);
    assert.deepStrictEqual(f3.retirees.map(x => x.motif), ['aucun passage correspondant dans la source'], 'phrase sans passage dans l\'extrait : retirée');
  }
  // ── 2 et 3 : route complète — parcs DATAtourisme seuls, loisirs hors patrimoine, extrait complet (sans coupure)
  {
    const sauve = DT['91345'];
    const lieu = (type, nom) => ({ type, label: { fr: nom }, isLocatedAt: [{ address: [{ hasAddressCity: { insee: '91345' } }] }] });
    DT['91345'] = [lieu(['ParkAndGarden'], 'Arboretum de Longjumeau'), lieu(['NaturalHeritage'], 'Plaine de Balizy'), lieu(['ParkAndGarden'], 'Parc Nativelle'),
      lieu(['SportsAndLeisurePlace', 'CulturalHeritage'], 'Ferme pédagogique Le P\'tit brin d\'Paille'), lieu(['Church', 'CulturalSite'], 'Église Saint-Martin')];
    const longues = Array.from({ length: 4 }, (_, k) => 'La ligne de bus ' + (100 + k) + ' du réseau Massy-Juvisy dessert la gare' + ', avec des arrêts et des correspondances détaillés'.repeat(14) + '.');
    const COM = COMMUNES['91345'], ancien = COM.extrait;
    COM.extrait = ancien.replace('=== Transports ===\n', '=== Transports ===\n' + longues.join(' ') + '\n');
    const w5 = monde(), f5 = w5.deps.fetch;
    let entreeIa = null;
    w5.deps.fetch = async (u, i) => {
      if (!/anthropic/.test(u)) return f5(u, i);
      entreeIa = JSON.parse(JSON.parse(i.body).messages[0].content).rubriques;
      return { ok: true, status: 200, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ rubriques: {
        transports: 'La ligne de bus 103 du réseau Massy-Juvisy dessert la gare. La ligne de bus 100 du réseau Massy-Juvisy dessert la gare.',
        parcs: 'La commune compte trois espaces verts remarquables.',
        patrimoine: 'Le monument d\'importance est l\'Église Saint-Martin. Parmi les lieux de loisirs, on trouve la Ferme pédagogique Le P\'tit brin d\'Paille.',
        culture: 'Ferme pédagogique Le P\'tit brin d\'Paille figure parmi les lieux de sport et de loisirs.' } }) }] }) };
    };
    const r5 = await appel(w5, '91345', 'Longjumeau');
    DT['91345'] = sauve; COM.extrait = ancien;
    assert(entreeIa.culture.datatourisme.some(x => /Ferme/.test(x.nom)) && !entreeIa.patrimoine.datatourisme.some(x => /Ferme/.test(x.nom)), 'ferme pédagogique classée en culture et loisirs, pas en patrimoine');
    const rb = k => r5.body.guide.rubriques.find(x => x.cle === k);
    assert(rb('parcs'), 'rubrique Parcs et espaces verts présente');
    assert.strictEqual(rb('parcs').texte, 'Pour se promener : Arboretum de Longjumeau, Plaine de Balizy et Parc Nativelle.', 'parcs : ' + rb('parcs').texte);
    assert.strictEqual(rb('parcs').extrait, '« Arboretum de Longjumeau (parc ou jardin) »\n« Plaine de Balizy (site naturel) »\n« Parc Nativelle (parc ou jardin) »');
    assert(!rb('patrimoine') || !/Ferme|importance/.test(rb('patrimoine').texte), 'patrimoine sans loisirs ni « d\'importance »');
    const t5 = rb('transports');
    assert(/103/.test(t5.texte) && /100/.test(t5.texte), 'deux phrases de transport publiées : ' + t5.texte);
    assert(t5.extrait.includes(longues[3]) && t5.extrait.includes(longues[0]) && t5.extrait.length > 1500, 'extrait complet, tous les passages, sans coupure (' + t5.extrait.length + ' car.)');
    // chaque phrase publiée a son passage dans l'extrait enregistré
    for (const x of r5.body.guide.rubriques) {
      const passages = (x.extrait.match(/« ([^»]+) »/g) || []).map(m => m.slice(2, -2));
      for (const ph of x.texte.match(/[^.!?]+[.!?]/g)) assert(route._interne.passagesPour(ph.trim(), passages, passages.join('\n') + '\nLongjumeau', 'Longjumeau'), x.cle + ' : phrase sans passage dans l\'extrait : ' + ph);
    }
  }
  // ── DATAtourisme : seuls le nom et la catégorie sont transmis à l'IA
  {
    const entreeDt = JSON.parse(JSON.parse(ia[0].init.body).messages[0].content).rubriques.parcs.datatourisme;
    assert.deepStrictEqual(entreeDt, [{ nom: 'Parc Nativelle', categorie: 'parc ou jardin' }], 'nom + catégorie : ' + JSON.stringify(entreeDt));
  }
  // ── découpage Wikipédia et filtre des chiffres datés
  const sec = route._interne.sectionsWikipedia(COMMUNES['91345'].extrait);
  assert(!sec.culture && /T12/.test(sec.transports) && /centre hospitalier/.test(sec.equipements) && !/21 000/.test(JSON.stringify(sec)), 'sections associées aux rubriques, démographie exclue');
  assert.strictEqual(route._interne.sansChiffreDate('Le marché a lieu le samedi. Le budget communal est de 30 M€. Elle compte 21 000 habitants.'), 'Le marché a lieu le samedi.');

  // ── App : détection de commune, éditeur (modifier, masquer, rétablir), rendu dans la fiche
  const { JSDOM, VirtualConsole } = require('jsdom');
  const apiAppels = [];
  const dom = await JSDOM.fromFile(path.join(root, 'app.html'), { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: new VirtualConsole(), url: 'http://localhost/app.html', beforeParse(win) {
    win.fetch = async (u, o) => { apiAppels.push(String(u)); if (/guide-commune/.test(u)) { const rr = res(); await route.handler({ method: 'POST', headers: { authorization: 'Bearer jwt' }, body: JSON.parse(o.body) }, rr, w.deps); return { ok: rr.code === 200, status: rr.code, json: async () => rr.body }; } return { ok: false, status: 503, json: async () => ({}), text: async () => '' }; };
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null }), upsert: async () => ({}), then: f => f({ data: [] }) };
    win.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'jwt', user: { id: 'agent' } } } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => q }) };
    win.eval(fs.readFileSync(path.join(root, 'auth-client.js'), 'utf8')); win.sessionStorage.setItem('privency_active_uid', 'test-uid');
    win.matchMedia = win.matchMedia || (() => ({ matches: false, addListener() {}, addEventListener() {} })); win.scrollTo = () => {};
  } });
  const win = dom.window, doc = win.document;
  await new Promise(t => setTimeout(t, 300));
  win.privencyAuth = win.privencyAuth || { auth: { getSession: async () => ({ data: { session: { access_token: 'jwt' } } }) } };
  const feat = (props) => ({ properties: Object.assign({ citycode: '91345', city: 'Longjumeau', postcode: '91160', score: 0.92 }, props) });
  const cf = win.communeFiable;
  assert.deepStrictEqual(JSON.parse(JSON.stringify(cf(feat({}), '12 rue Basse 91160 Longjumeau'))), { insee: '91345', nom: 'Longjumeau' }, 'commune fiable');
  assert.strictEqual(cf(feat({ score: 0.42 }), '12 rue Basse 91160 Longjumeau'), null, 'géocodage peu sûr : rien');
  assert.strictEqual(cf(feat({ postcode: '91380' }), '12 rue Basse 91160 Longjumeau'), null, 'code postal incohérent : rien');
  assert(cf(feat({}), '12 rue Basse, Longjumeau'), 'sans code postal, commune citée : fiable');
  assert.strictEqual(cf(feat({}), '12 rue Basse'), null, 'ni code postal ni commune : rien');
  assert.strictEqual(cf(feat({ citycode: '' }), '12 rue Basse 91160 Longjumeau'), null, 'pas de code INSEE : rien');
  assert.strictEqual(cf(null, 'x'), null);
  assert(cf(feat({ citycode: '2A004', city: 'Ajaccio', postcode: '20000' }), '1 cours Napoléon 20000 Ajaccio'), 'Corse (2A)');

  await win.guideCommuneDemander(cf(feat({}), '12 rue Basse 91160 Longjumeau'));
  let etat = win.guideEtat();
  assert(etat && etat.insee === '91345' && etat.rubriques.length === 6, 'guide chargé dans la fiche en cours');
  assert.strictEqual(doc.querySelectorAll('#guide-commune-editeur .gc-rub').length, 6, 'une zone par rubrique');
  assert.strictEqual((doc.querySelector('#guide-commune-editeur .gc-avertissement') || {}).textContent, 'Texte généré à partir de sources publiques. Relisez-le avant publication.', 'message à l\'agent au-dessus du guide');
  {
    const lien = doc.querySelectorAll('#guide-commune-editeur .gc-rub')[1].querySelector('.gc-voir-extrait'), boite = () => doc.querySelectorAll('#guide-commune-editeur .gc-rub')[1].querySelector('.gc-extrait');
    assert(lien && lien.textContent === 'Voir l\'extrait source' && boite().hidden, 'lien « Voir l\'extrait source » sous la rubrique, extrait replié');
    lien.click();
    assert(!boite().hidden && boite().textContent === tr.extrait, 'clic : l\'extrait source s\'affiche');
    assert.strictEqual(doc.querySelectorAll('#guide-commune-editeur .gc-rub')[1].querySelector('.gc-voir-extrait').textContent, 'Masquer l\'extrait source');
    doc.querySelectorAll('#guide-commune-editeur .gc-rub')[1].querySelector('.gc-voir-extrait').click(); assert(boite().hidden, 'second clic : replié');
    assert.strictEqual(doc.querySelectorAll('#guide-commune-editeur .gc-voir-extrait').length, 6, 'un lien par rubrique');
  }
  const nbApi = apiAppels.filter(u => /guide-commune/.test(u)).length;
  await win.guideCommuneDemander(cf(feat({}), '12 rue Basse 91160 Longjumeau'));
  assert.strictEqual(apiAppels.filter(u => /guide-commune/.test(u)).length, nbApi, 'même commune : pas de nouvel appel (modifications conservées)');
  // modifier une rubrique, en masquer une autre, puis rétablir
  const zones = () => doc.querySelectorAll('#guide-commune-editeur .gc-rub');
  const ta = zones()[1].querySelector('.gc-texte'); ta.value = 'Texte revu par l\'agent : tram-train T12.'; ta.dispatchEvent(new win.Event('input', { bubbles: true })); ta.dispatchEvent(new win.Event('change', { bubbles: true }));
  const cb = zones()[5].querySelector('.gc-masque'); cb.checked = true; cb.dispatchEvent(new win.Event('change', { bubbles: true }));
  etat = win.guideEtat();
  assert(etat.rubriques[1].texte === 'Texte revu par l\'agent : tram-train T12.' && etat.rubriques[5].masque === true, 'modification et masquage enregistrés dans la fiche');
  assert(zones()[1].querySelector('.gc-retablir'), 'bouton « Rétablir le texte d\'origine »');
  assert.strictEqual(w.table.get('91345').rubriques[1].texte, g.rubriques[1].texte, 'cache commun inchangé');
  assert.strictEqual(apiAppels.filter(u => /guide-commune/.test(u)).length, nbApi, 'aucun appel serveur pour une modification');
  const d = win.collectBienData();
  assert(d.guideCommune && d.guideCommune.rubriques[5].masque, 'données de la fiche : guide avec les choix de l\'agent');
  assert(d.guideCommune.rubriques.every(x => !('extrait' in x)) && win.guideEtat().rubriques[1].extrait, 'extraits gardés dans l\'éditeur, jamais publiés dans la fiche');
  assert(win.collectRawFormState().guide_commune_json, 'conservé dans le brouillon / « Modifier »');
  // rendu dans la fiche générée
  const tpl = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const out = win.injectData(tpl, d, null, {});
  const fdoc = new JSDOM(out).window.document, box = fdoc.getElementById('guide-commune');
  assert(box && box.style.display !== 'none', 'bloc affiché');
  assert.strictEqual(fdoc.getElementById('guide-commune-titre').textContent, 'Vivre à Longjumeau');
  const titres = [...box.querySelectorAll('.gc-t')].map(x => x.textContent);
  assert.deepStrictEqual(titres, ['La commune', 'Transports', 'Écoles, commerces et équipements', 'Parcs et espaces verts', 'Patrimoine', 'Événements à venir'], 'rubrique masquée absente, rubrique vide absente : ' + titres);
  assert(/Texte revu par l'agent/.test(box.textContent), 'texte modifié par l\'agent sur sa fiche');
  assert([...box.querySelectorAll('.gc-src a')].some(a => a.href === 'https://fr.wikipedia.org/wiki/Longjumeau') && /CC BY-SA 4\.0/.test(box.textContent) && /DATAtourisme/.test(box.textContent), 'sources citées');
  assert.strictEqual(box.querySelector('.gc-ev').getAttribute('data-fin'), '2026-11-03', 'événement à venir avec sa date de fin');
  // rubrique vidée par l'agent : n'apparaît pas ; tout masqué : bloc caché
  etat.rubriques[0].texte = '   '; etat.evenementsMasques = true; etat.rubriques.forEach((x, i) => { if (i > 0) x.masque = true; });
  const out2 = win.injectData(tpl, Object.assign({}, d, { guideCommune: etat }), null, {});
  assert.strictEqual(new JSDOM(out2).window.document.getElementById('guide-commune').style.display, 'none', 'aucune rubrique visible : bloc caché');
  // sans guide (commune non fiable) : bloc caché
  const out3 = win.injectData(tpl, Object.assign({}, d, { guideCommune: null }), null, {});
  assert.strictEqual(new JSDOM(out3).window.document.getElementById('guide-commune').style.display, 'none');
  // commune non fiable : rien n'est demandé
  win.guideEnregistrer(null); const n0 = apiAppels.length; await win.guideCommuneDemander(null);
  assert.strictEqual(apiAppels.length, n0, 'commune non fiable : aucun appel'); assert(/non identifiée/.test(doc.getElementById('guide-commune-statut').textContent));
  console.log('OK guide commune : collecte, rédaction unique, cache réutilisé, rubriques sans donnée, sources, détection, modification et masquage, rendu');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
