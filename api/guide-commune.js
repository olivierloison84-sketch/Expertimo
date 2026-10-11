// Guide « Vivre à [ville] » : pré-remplit la rubrique « Tout savoir sur ce bien » des fiches.
//
// Appelé par l'app quand l'adresse du bien donne une commune fiable (code INSEE).
//   1. Cache : table guide_commune (une ligne par code INSEE, voir supabase-guide-commune.sql). Si la commune y est,
//      le texte est renvoyé tel quel : il n'est jamais régénéré pour une autre fiche.
//   2. Sinon, collecte côté serveur : Wikipédia (article de la commune trouvé par son code INSEE via Wikidata, propriété P374)
//      et, si l'API répond, DATAtourisme (points d'intérêt de la commune).
//   3. Rédaction par IA, une seule fois par commune : texte court et factuel, rubrique par rubrique, uniquement à partir
//      des sources collectées ; une rubrique sans donnée n'est pas écrite ; aucun chiffre daté (filtré en plus après coup).
//   4. Événements à venir : DATAtourisme, récupérés à chaque appel, sans IA, jamais mis en cache.
// Clés : ANTHROPIC_API_KEY et DATATOURISME_API_KEY (variables Vercel), jamais renvoyées ni journalisées.
// Accès : agent connecté (jeton Supabase vérifié). Modèle : GUIDE_COMMUNE_MODEL, sinon claude-haiku-5-5.
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hhqcumnatnslfjpsrmgb.supabase.co';
const MODELE_DEFAUT = 'claude-haiku-5-5';
const UA = 'PrivencyGuideCommune/1.0 (https://app.privency.fr)';
const DT_BASE = 'https://api.datatourisme.fr/v1';
const LICENCE_WP = 'CC BY-SA 4.0';

// Rubriques, dans l'ordre d'affichage. Les titres de section Wikipédia sont comparés sans accents ni majuscules.
const RUBRIQUES = [
  { cle: 'presentation', titre: 'La commune' },
  { cle: 'transports', titre: 'Transports', re: /transport|voies de communication|desserte|acces|reseau routier|circulation/ },
  { cle: 'patrimoine', titre: 'Patrimoine', re: /patrimoine(?! naturel)|lieux et monuments|monuments|architecture|edifices/ },
  { cle: 'parcs', titre: 'Parcs et espaces verts', re: /parcs?\b|espaces? verts?|jardins?|patrimoine naturel|environnement|bois et forets|espaces naturels/ },
  { cle: 'culture', titre: 'Culture et loisirs', re: /culture|culturel|manifestations|festivites|evenements|vie associative|associations|loisirs|vie locale/ },
  { cle: 'equipements', titre: 'Équipements et services', re: /enseignement|education|sante|equipements|services publics|(^|[^a-z])sports?\b/ },
  { cle: 'economie', titre: 'Économie', re: /economie|emploi|entreprises|commerces?|activites economiques|zones d'activite/ }
];
const ORDRE_CORRESPONDANCE = ['parcs', 'patrimoine', 'equipements', 'culture', 'transports', 'economie'];
const MAX_CAR_RUBRIQUE = 3500, MAX_CAR_PRESENTATION = 2500;

// Types DATAtourisme utiles par rubrique (noms de classes de l'ontologie)
const DT_RUBRIQUE = [
  ['parcs', /ParkAndGarden|NaturalHeritage|Garden|Park\b/i],
  ['patrimoine', /ReligiousSite|Church|Chapel|Castle|Chateau|Monument|RemarkableBuilding|ArcheologicalSite|CityHeritage|MilitaryCulturalSite|TechnicalHeritage|Heritage/i],
  ['culture', /Museum|Theater|Theatre|Cinema|Library|Gallery|InterpretationCentre|CulturalCentre|ConcertHall|CulturalSite|SportsAndLeisurePlace|Leisure|SwimmingPool|ThemePark/i]
];
const DT_EVENEMENT = /Event|EntertainmentAndEvent|Festival|Exhibition|Show\b|Market|Fair|Concert/i;

const sansAccent = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const inseeValide = s => typeof s === 'string' && /^(\d{5}|2[AB]\d{3})$/.test(s);

// ── Wikipédia ──
// Découpe un extrait « explaintext » (titres == … ==) en présentation + sections ; associe les sections aux rubriques.
function sectionsWikipedia(extrait) {
  const lignes = String(extrait || '').split('\n'), sections = [];
  let cur = { niveau: 1, titre: '', lignes: [] };
  for (const l of lignes) {
    const m = /^(={2,6})\s*(.*?)\s*\1\s*$/.exec(l);
    if (m) { sections.push(cur); cur = { niveau: m[1].length, titre: m[2], lignes: [] }; } else cur.lignes.push(l);
  }
  sections.push(cur);
  const texte = s => s.lignes.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const out = { presentation: texte(sections[0]).slice(0, MAX_CAR_PRESENTATION) };
  for (let i = 1; i < sections.length; i++) {
    const s = sections[i], t = sansAccent(s.titre);
    if (/bibliographie|references|notes|liens externes|voir aussi|articles connexes|demographie|politique|administration|jumelage|personnalites/.test(t)) continue;
    const cle = ORDRE_CORRESPONDANCE.find(k => RUBRIQUES.find(r => r.cle === k).re.test(t));
    if (!cle) continue;
    // la section et ses sous-sections, jusqu'au prochain titre de même niveau ou supérieur
    let bloc = texte(s);
    for (let j = i + 1; j < sections.length && sections[j].niveau > s.niveau; j++) bloc += '\n' + sections[j].titre + ' : ' + texte(sections[j]);
    out[cle] = ((out[cle] ? out[cle] + '\n' : '') + bloc.trim()).slice(0, MAX_CAR_RUBRIQUE);
  }
  Object.keys(out).forEach(k => { if (!out[k] || out[k].replace(/\s/g, '').length < 40) delete out[k]; });
  return out;
}

async function jsonDe(fetchFn, url, init) {
  const r = await fetchFn(url, init);
  if (!r || !r.ok) throw new Error('HTTP ' + (r && r.status));
  return r.json();
}
async function wikipedia(fetchFn, insee) {
  const h = { headers: { 'User-Agent': UA, 'Accept': 'application/json' } };
  const s = await jsonDe(fetchFn, 'https://www.wikidata.org/w/api.php?action=query&list=search&format=json&srlimit=3&srsearch=' + encodeURIComponent('haswbstatement:P374=' + insee), h);
  const ids = ((s.query && s.query.search) || []).map(x => x.title).filter(t => /^Q\d+$/.test(t));
  if (ids.length !== 1) return null;   // aucune ou plusieurs entités pour ce code : pas fiable
  const e = await jsonDe(fetchFn, 'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=sitelinks/urls&sitefilter=frwiki&ids=' + ids[0], h);
  const lien = e.entities && e.entities[ids[0]] && e.entities[ids[0]].sitelinks && e.entities[ids[0]].sitelinks.frwiki;
  if (!lien || !lien.title) return null;
  const p = await jsonDe(fetchFn, 'https://fr.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&prop=extracts|info&inprop=url&explaintext=1&exsectionformat=wiki&redirects=1&titles=' + encodeURIComponent(lien.title), h);
  const page = p.query && p.query.pages && p.query.pages[0];
  if (!page || page.missing || !page.extract) return null;
  return { titre: page.title, url: page.fullurl || ('https://fr.wikipedia.org/wiki/' + encodeURIComponent(page.title.replace(/ /g, '_'))), sections: sectionsWikipedia(page.extract) };
}

// ── DATAtourisme (facultatif : toute erreur → sans DATAtourisme) ──
function libelleDt(o) {
  for (let l of [o && o.label, o && o['rdfs:label'], o && o.name]) {
    if (Array.isArray(l)) l = l[0];
    if (typeof l === 'string' && l.trim()) return l.trim();
    if (l && typeof l === 'object') { const v = l.fr || l['@fr'] || l['fr-FR'] || l['@value']; const w = Array.isArray(v) ? v[0] : v; if (typeof w === 'string' && w.trim()) return w.trim(); }
  }
  return '';
}
function typesDt(o) {
  const t = o && (o.type || o['@type'] || o.types);
  return (Array.isArray(t) ? t : t ? [t] : []).map(x => String(typeof x === 'object' && x ? (x['@id'] || x.id || '') : x).replace(/^.*[#/:]/, '')).filter(Boolean);
}
function datesDt(o) {
  const out = { debut: [], fin: [] };
  (function walk(x, d) {
    if (!x || typeof x !== 'object' || d > 6) return;
    for (const [k, v] of Object.entries(x)) {
      const vals = (Array.isArray(v) ? v : [v]).filter(s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s)).map(s => s.slice(0, 10));
      if (/endDate/i.test(k)) out.fin.push(...vals); else if (/startDate/i.test(k)) out.debut.push(...vals);
      if (v && typeof v === 'object') walk(v, d + 1);
    }
  })(o, 0);
  return out;
}
async function datatourisme(fetchFn, key, insee, aujourdhui) {
  if (!key) return null;
  const filtres = [{ insee }, { filters: 'isLocatedAt.address.hasAddressCity.insee[eq]=' + insee }];
  for (const f of filtres) {
    let objets = [];
    try {
      for (let page = 1; page <= 3; page++) {
        const qs = new URLSearchParams({ ...f, page_size: 100, page }).toString();
        const r = await fetchFn(DT_BASE + '/catalog?' + qs, { headers: { 'X-API-Key': key, 'Accept': 'application/json' } });
        if (!r || r.status !== 200) throw new Error('statut');
        const j = await r.json();
        if (!j || !Array.isArray(j.objects)) throw new Error('forme');
        objets = objets.concat(j.objects);
        const tp = j.meta && j.meta.total_pages; if (!tp || page >= tp) break;
      }
    } catch (e) { continue; }
    // Filtre retenu seulement si les objets sont bien dans la commune
    if (objets.length && objets.filter(o => JSON.stringify(o).includes('"' + insee + '"')).length / objets.length < 0.9) continue;
    const parRubrique = {}, evenements = [];
    for (const o of objets) {
      const ty = typesDt(o), nom = libelleDt(o); if (!nom) continue;
      if (ty.some(t => DT_EVENEMENT.test(t))) {
        const d = datesDt(o), fin = (d.fin.length ? d.fin : d.debut).sort().pop();
        if (fin && fin >= aujourdhui) evenements.push({ nom: nom.slice(0, 140), debut: (d.debut.sort()[0] || null), fin });
        continue;
      }
      const r = DT_RUBRIQUE.find(([, re]) => ty.some(t => re.test(t)));
      if (r) { (parRubrique[r[0]] = parRubrique[r[0]] || []); if (parRubrique[r[0]].length < 25 && parRubrique[r[0]].indexOf(nom) === -1) parRubrique[r[0]].push(nom.slice(0, 120)); }
    }
    evenements.sort((a, b) => String(a.debut || a.fin).localeCompare(String(b.debut || b.fin)));
    return { parRubrique, evenements: evenements.slice(0, 8) };
  }
  return null;
}

// ── Rédaction IA ──
const SYSTEME = [
  'Tu rédiges, en français, le guide « Vivre à [commune] » d\'une fiche immobilière destinée à des acheteurs.',
  'Tu reçois un objet JSON : la commune et, pour chaque rubrique, des extraits de Wikipédia et/ou une liste de lieux DATAtourisme.',
  'Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour ni balises : {"rubriques": {"<clé>": "<texte>", ...}}, avec exactement les clés reçues.',
  'Règles strictes :',
  '- Texte court, factuel, au ton classique et sobre : 2 à 4 phrases, 500 caractères au plus par rubrique.',
  '- Aucune formule lyrique ou publicitaire (pas de « charmant », « idéal », « havre de paix », « incontournable », etc.).',
  '- N\'utilise QUE les informations fournies pour la rubrique. N\'ajoute rien, ne devine rien.',
  '- Aucun chiffre daté : pas de population, de nombre d\'habitants, de revenus, de budgets, de montants, de taux, de classements ni de statistiques.',
  '- Les dates historiques (siècle, année de construction) sont permises pour le patrimoine.',
  '- Si les informations d\'une rubrique sont insuffisantes ou hors sujet, renvoie une chaîne vide "" pour cette rubrique.',
  '- N\'écris pas de titre, pas de liste à puces, pas de mention de source (elles sont ajoutées à part).'
].join('\n');

// Retire toute phrase porteuse d'un chiffre daté qui aurait échappé à la consigne.
function sansChiffreDate(texte) {
  const phrases = String(texte || '').replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]*/g) || [];
  return phrases.filter(p => !/\bhabitants?\b|\bpopulation\b|\brecensement|\brevenus?\b|\bbudget|\bsalaires?\b|ch[oô]mage|\btaux\b|€|\beuros?\b|\bmillions?\b|\bmilliards?\b|\b\d[\d  .,]*\s?(emplois|entreprises|élèves|logements|ménages|salariés|établissements)\b/i.test(p))
    .join(' ').replace(/\s+/g, ' ').trim();
}
const LYRIQUE = /\b(charmante?s?|idyllique|havre de paix|incontournables?|paradis|écrin|joyau|pittoresques?|enchanteur|enchanteresse|magnifiques?|exceptionnel(le)?s?)\b/i;

async function rediger(fetchFn, apiKey, modele, commune, entrees) {
  const r = await fetchFn('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: modele, max_tokens: 4000, output_config: { effort: 'low' }, system: SYSTEME,
      messages: [{ role: 'user', content: JSON.stringify({ commune, rubriques: entrees }) }] })
  });
  const data = await r.json().catch(() => null);
  if (!r.ok || !data || data.stop_reason === 'refusal') return null;
  const texte = (data.content || []).filter(b => b && b.type === 'text').map(b => b.text).join('').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  let j = null; try { j = JSON.parse(texte); } catch (e) { return null; }
  return j && j.rubriques && typeof j.rubriques === 'object' ? j.rubriques : null;
}

// Construit le guide d'une commune (sans le cache). Retourne null si rien d'exploitable.
async function construireGuide(deps, insee, commune, aujourdhui) {
  const wp = await wikipedia(deps.fetch, insee).catch(() => null);
  let dt = null; try { dt = await datatourisme(deps.fetch, deps.env.DATATOURISME_API_KEY, insee, aujourdhui); } catch (e) { dt = null; }
  const entrees = {};
  RUBRIQUES.forEach(({ cle }) => {
    const e = {};
    if (wp && wp.sections[cle]) e.wikipedia = wp.sections[cle];
    if (dt && dt.parRubrique[cle] && dt.parRubrique[cle].length) e.datatourisme = dt.parRubrique[cle];
    if (Object.keys(e).length) entrees[cle] = e;
  });
  if (!Object.keys(entrees).length) return { guide: null, dt };
  if (!deps.env.ANTHROPIC_API_KEY) return { guide: null, dt, erreur: 'cle_ia' };
  const modele = deps.env.GUIDE_COMMUNE_MODEL || MODELE_DEFAUT;
  const textes = await rediger(deps.fetch, deps.env.ANTHROPIC_API_KEY, modele, commune, entrees);
  if (!textes) return { guide: null, dt, erreur: 'ia' };
  const rubriques = [];
  RUBRIQUES.forEach(({ cle, titre }) => {
    if (!entrees[cle]) return;   // jamais de rubrique sans donnée, même si l'IA en renvoie une
    let t = typeof textes[cle] === 'string' ? sansChiffreDate(textes[cle]) : '';
    t = t.split(/(?<=[.!?])\s+/).filter(p => !LYRIQUE.test(p)).join(' ').trim().slice(0, 700);   // phrases lyriques retirées
    if (t.length < 30) return;
    const sources = [];
    if (entrees[cle].wikipedia) sources.push({ type: 'wikipedia', titre: 'Wikipédia — ' + wp.titre, url: wp.url, licence: LICENCE_WP });
    if (entrees[cle].datatourisme) sources.push({ type: 'datatourisme', titre: 'DATAtourisme', url: 'https://www.datatourisme.fr' });
    rubriques.push({ cle, titre, texte: t, sources });
  });
  if (!rubriques.length) return { guide: null, dt };
  return { guide: { insee, commune, rubriques, modele, genere_le: new Date(aujourdhui + 'T12:00:00Z').toISOString() }, dt };
}

function base(deps) {
  if (deps.db) return deps.db;
  if (!process.env.SUPABASE_SECRET_KEY) return null;
  return createClient(SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
}
async function lireCache(db, insee) {
  if (!db) return null;
  try { const { data, error } = await db.from('guide_commune').select('insee, commune, rubriques, modele, genere_le').eq('insee', insee).maybeSingle(); return error ? null : data; } catch (e) { return null; }
}
async function ecrireCache(db, g) {
  if (!db) return false;
  try {
    const { error } = await db.from('guide_commune').upsert({ insee: g.insee, commune: g.commune, rubriques: g.rubriques, modele: g.modele, genere_le: g.genere_le }, { onConflict: 'insee', ignoreDuplicates: true });
    return !error;
  } catch (e) { return false; }
}

async function handler(req, res, deps) {
  deps = Object.assign({ fetch: (u, i) => fetch(u, i), env: process.env, now: () => new Date() }, deps || {});
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');
  const auth = req.headers.authorization || '';
  const jwt = auth.indexOf('Bearer ') === 0 ? auth.slice(7).trim() : '';
  if (!jwt) return res.status(401).json({ error: 'Authentification requise' });
  const db = base(deps);
  const verifier = deps.verifier || (async t => { if (!db) return null; const { data, error } = await db.auth.getUser(t); return error || !data ? null : data.user; });
  let user = null; try { user = await verifier(jwt); } catch (e) { user = null; }
  if (!user) return res.status(401).json({ error: 'Session invalide ou expirée' });

  const body = req.body || {};
  const insee = String(body.insee || '').trim().toUpperCase();
  const commune = String(body.commune || '').replace(/[\r\n<>]/g, ' ').trim().slice(0, 80);
  if (!inseeValide(insee) || !commune) return res.status(400).json({ error: 'Commune non identifiée' });
  const aujourdhui = deps.now().toISOString().slice(0, 10);

  let guide = await lireCache(db, insee), cache = !!guide, dt = null;
  if (!guide) {
    const r = await construireGuide(deps, insee, commune, aujourdhui);
    guide = r.guide; dt = r.dt;
    if (guide) { await ecrireCache(db, guide); const relu = await lireCache(db, insee); if (relu) guide = relu; }   // en cas de génération concurrente, la première écrite fait foi
  } else {
    try { dt = await datatourisme(deps.fetch, deps.env.DATATOURISME_API_KEY, insee, aujourdhui); } catch (e) { dt = null; }
  }
  const evenements = dt && dt.evenements && dt.evenements.length ? { liste: dt.evenements, source: { type: 'datatourisme', titre: 'DATAtourisme', url: 'https://www.datatourisme.fr' } } : null;
  return res.status(200).json({ guide: guide || null, cache, evenements });
}

module.exports = (req, res) => handler(req, res);
module.exports.handler = handler;
module.exports._interne = { sectionsWikipedia, sansChiffreDate, construireGuide, wikipedia, datatourisme, RUBRIQUES, MODELE_DEFAUT };
