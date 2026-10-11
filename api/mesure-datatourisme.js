// TEMPORAIRE — mesure de couverture DATAtourisme pour le guide « Vivre à [ville] » (Longjumeau, Chilly-Mazarin, Wissous).
// Lecture seule : aucune écriture en base. La clé (variable Vercel DATATOURISME_API_KEY) n'est envoyée qu'à l'API
// DATAtourisme, dans l'en-tête X-API-Key, et n'apparaît jamais dans la réponse.
// Accès : compte administrateur connecté uniquement (jeton Supabase vérifié côté serveur, comme api/admin-stats.js).
// Page de lecture : /mesure-datatourisme.html. À supprimer une fois la mesure faite.
//
// Rien n'est supposé sur la forme exacte de l'API au-delà de ce qui est documenté publiquement
// (GET /v1/catalog, en-tête X-API-Key, page_size ≤ 100, réponse { objects: [], meta: { total, total_pages } }) :
// le filtre par commune est essayé sous plusieurs formes, et chaque tentative est rapportée telle quelle (statut, total,
// part des résultats réellement situés dans la commune). Les catégories sont déduites des types renvoyés, dont la
// répartition brute est aussi rendue pour vérification.
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hhqcumnatnslfjpsrmgb.supabase.co';
const ADMIN_USER_ID = '79e4e432-2232-4d2c-b41d-8c7c907c4dec';
const BASE = 'https://api.datatourisme.fr/v1';
const COMMUNES = [
  { nom: 'Longjumeau', insee: '91345' },
  { nom: 'Chilly-Mazarin', insee: '91161' },
  { nom: 'Wissous', insee: '91689' }
];
const PAGE_SIZE = 100, MAX_PAGES = 8;
// Formes de filtre par commune essayées dans l'ordre (la première qui renvoie des objets de la commune est retenue)
const FILTRES = [
  { nom: 'alias insee', params: insee => ({ insee }) },
  { nom: 'filtre isLocatedAt.address.hasAddressCity.insee', params: insee => ({ filters: 'isLocatedAt.address.hasAddressCity.insee[eq]=' + insee }) }
];
const CATEGORIES = [
  ['evenements', 'Événements', /Event|EntertainmentAndEvent|Festival|Exhibition|Show\b|Market|Fair|Concert|Competition/i],
  ['hebergements', 'Hébergements', /Accommodation|Hotel|Camping|Gite|Guesthouse|BedAndBreakfast|Hostel|HolidayResort|Lodging|ResidenceHotel|CollectiveAccommodation/i],
  ['restauration', 'Restauration', /FoodEstablishment|Restaurant|BarOrPub|Bar\b|Cafe|Brasserie|Bistro|Pizzeria|FastFood|Creperie|Tasting/i],
  ['patrimoine', 'Patrimoine', /ReligiousSite|Church|Chapel|Cathedral|Abbey|Castle|Chateau|Monument|RemarkableBuilding|ArcheologicalSite|CityHeritage|MilitaryCulturalSite|TechnicalHeritage|Heritage|Mansion|Bridge|Fort\b|Mill/i],
  ['culture', 'Culture', /Museum|Theater|Theatre|Cinema|Library|Gallery|InterpretationCentre|CulturalCentre|ConcertHall|Auditorium|CulturalSite/i],
  ['loisirs', 'Loisirs', /SportsAndLeisurePlace|Leisure|Park|Garden|NaturalHeritage|Tour\b|WalkingTour|CyclingTour|Golf|SwimmingPool|Sport|Playground|ThemePark|Zoo|Equestrian|Fitness|Bowling|Nautical/i],
  ['equipements', 'Services et équipements', /ServiceProvider|PracticalInformation|Store|Shop|TouristInformationCenter|TouristOffice|Parking|Toilet|Hospital|Pharmacy|PublicService|Transport|Station|Library/i]
];

function nomCourt(t) { return String(t || '').replace(/^.*[#/:]/, '').trim(); }
function typesDe(o) {
  const t = o && (o.type || o['@type'] || o.types || o.class || o.classes);
  return (Array.isArray(t) ? t : t ? [t] : []).map(x => nomCourt(typeof x === 'object' && x ? (x['@id'] || x.id || x.label || '') : x)).filter(Boolean);
}
function libelle(o) {
  const cands = [o && o.label, o && o['rdfs:label'], o && o.name, o && o['schema:name']];
  for (let l of cands) {
    if (Array.isArray(l)) l = l[0];
    if (typeof l === 'string' && l.trim()) return l.trim();
    if (l && typeof l === 'object') {
      const v = l.fr || l['@fr'] || l['fr-FR'] || l['@value'] || Object.values(l)[0];
      if (typeof v === 'string' && v.trim()) return v.trim();
      if (Array.isArray(v) && typeof v[0] === 'string') return v[0].trim();
    }
  }
  return (o && (o.uuid || o['@id'] || o.uri)) ? '(sans nom) ' + String(o.uuid || o['@id'] || o.uri).slice(-12) : '(sans nom)';
}
// Dates de l'objet (clés contenant startDate / endDate, à toute profondeur)
function dates(o) {
  const out = { debut: [], fin: [] };
  (function walk(x, d) {
    if (!x || typeof x !== 'object' || d > 6) return;
    for (const [k, v] of Object.entries(x)) {
      const vals = (Array.isArray(v) ? v : [v]).filter(s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s));
      if (/endDate/i.test(k)) out.fin.push(...vals); else if (/startDate/i.test(k)) out.debut.push(...vals);
      if (v && typeof v === 'object') walk(v, d + 1);
    }
  })(o, 0);
  return out;
}
function categorie(types) {
  for (const [k, , re] of CATEGORIES) if (types.some(t => re.test(t))) return k;
  return 'autres';
}

async function appel(fetchFn, key, chemin, params) {
  const qs = new URLSearchParams(params).toString();
  const debut = Date.now();
  try {
    const r = await fetchFn(BASE + chemin + '?' + qs, { headers: { 'X-API-Key': key, 'Accept': 'application/json' } });
    const texte = await r.text();
    let json = null; try { json = JSON.parse(texte); } catch (e) {}
    return { status: r.status, json, extrait: json ? null : texte.slice(0, 300), ms: Date.now() - debut, requete: chemin + '?' + qs };
  } catch (e) {
    return { status: 0, json: null, extrait: 'Erreur réseau : ' + String(e && e.message || e).slice(0, 200), ms: Date.now() - debut, requete: chemin + '?' + qs };
  }
}
function objetsDe(json) { return json && Array.isArray(json.objects) ? json.objects : null; }

async function mesurerCommune(fetchFn, key, c, aujourdhui) {
  const essais = [];
  let retenu = null;
  for (const f of FILTRES) {
    const r = await appel(fetchFn, key, '/catalog', { ...f.params(c.insee), page_size: PAGE_SIZE, page: 1 });
    const objs = objetsDe(r.json), meta = (r.json && r.json.meta) || null;
    const dansCommune = objs ? objs.filter(o => JSON.stringify(o).includes('"' + c.insee + '"')).length : 0;
    const essai = { filtre: f.nom, requete: r.requete, statut: r.status, ms: r.ms, total: meta && typeof meta.total === 'number' ? meta.total : null,
      total_pages: meta && typeof meta.total_pages === 'number' ? meta.total_pages : null, objets_page1: objs ? objs.length : null,
      objets_page1_dans_commune: objs ? dansCommune : null, cles_reponse: r.json && typeof r.json === 'object' ? Object.keys(r.json).slice(0, 20) : null,
      cles_premier_objet: objs && objs[0] ? Object.keys(objs[0]).slice(0, 40) : null, extrait_si_non_json: r.extrait };
    essais.push(essai);
    // Retenu si la réponse a la forme documentée et que les objets renvoyés sont bien dans la commune (filtre appliqué)
    if (r.status === 200 && objs && (objs.length === 0 ? essai.total === 0 : dansCommune / objs.length >= 0.9)) { retenu = { f, premiere: r, meta }; break; }
  }
  const res = { commune: c.nom, insee: c.insee, essais, filtre_retenu: retenu ? retenu.f.nom : null };
  if (!retenu) { res.erreur = 'Aucune forme de filtre par commune n\'a renvoyé des objets de la commune : voir « essais ».'; return res; }

  let objets = objetsDe(retenu.premiere.json).slice();
  const pages = retenu.meta && retenu.meta.total_pages ? retenu.meta.total_pages : 1;
  for (let p = 2; p <= Math.min(pages, MAX_PAGES); p++) {
    const r = await appel(fetchFn, key, '/catalog', { ...retenu.f.params(c.insee), page_size: PAGE_SIZE, page: p });
    const objs = objetsDe(r.json);
    if (r.status !== 200 || !objs) { res.erreur_pagination = { page: p, statut: r.status, extrait: r.extrait }; break; }
    objets = objets.concat(objs);
  }
  res.total_annonce = retenu.meta && typeof retenu.meta.total === 'number' ? retenu.meta.total : null;
  res.objets_lus = objets.length;
  res.tronque = pages > MAX_PAGES;
  const horsCommune = objets.filter(o => !JSON.stringify(o).includes('"' + c.insee + '"')).length;
  res.objets_sans_code_insee = horsCommune;

  const cases = {}; CATEGORIES.forEach(([k, l]) => { cases[k] = { libelle: l, nombre: 0, exemples: [] }; }); cases.autres = { libelle: 'Autres types', nombre: 0, exemples: [] };
  cases.evenements_a_venir = { libelle: 'Événements à venir (fin ou début ≥ ' + aujourdhui + ')', nombre: 0, exemples: [], sans_date: 0 };
  const repartition = {};
  for (const o of objets) {
    const ty = typesDe(o);
    ty.forEach(t => { repartition[t] = (repartition[t] || 0) + 1; });
    const k = categorie(ty);
    cases[k].nombre++; if (cases[k].exemples.length < 2) cases[k].exemples.push(libelle(o));
    if (k === 'evenements') {
      const d = dates(o), ref = d.fin.length ? d.fin : d.debut;
      if (!ref.length) cases.evenements_a_venir.sans_date++;
      else if (ref.some(x => x.slice(0, 10) >= aujourdhui)) { cases.evenements_a_venir.nombre++; if (cases.evenements_a_venir.exemples.length < 2) cases.evenements_a_venir.exemples.push(libelle(o)); }
    }
  }
  res.cases = cases;
  res.repartition_types = Object.entries(repartition).sort((a, b) => b[1] - a[1]).slice(0, 40);
  res.objets_sans_type = objets.filter(o => !typesDe(o).length).length;
  return res;
}

async function mesurer(fetchFn, key, aujourdhui) {
  const communes = await Promise.all(COMMUNES.map(c => mesurerCommune(fetchFn, key, c, aujourdhui)));
  return { source: 'API DATAtourisme ' + BASE + '/catalog', date: aujourdhui, page_size: PAGE_SIZE, pages_max: MAX_PAGES,
    categories: CATEGORIES.map(([k, l]) => ({ cle: k, libelle: l })).concat([{ cle: 'evenements_a_venir', libelle: 'Événements à venir' }, { cle: 'autres', libelle: 'Autres types' }]), communes };
}

async function handler(req, res, deps) {
  deps = deps || {};
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');
  const auth = req.headers.authorization || '';
  const jwt = auth.indexOf('Bearer ') === 0 ? auth.slice(7).trim() : '';
  if (!jwt) return res.status(401).json({ error: 'Authentification requise' });
  const verifier = deps.verifier || (async t => {
    if (!process.env.SUPABASE_SECRET_KEY) throw new Error('config');
    const { data, error } = await createClient(SUPABASE_URL, process.env.SUPABASE_SECRET_KEY).auth.getUser(t);
    return error || !data || !data.user ? null : data.user;
  });
  let user = null;
  try { user = await verifier(jwt); } catch (e) { return res.status(500).json({ error: 'Configuration serveur incomplète' }); }
  if (!user) return res.status(401).json({ error: 'Session invalide ou expirée' });
  if (user.id !== ADMIN_USER_ID) return res.status(403).json({ error: 'Accès réservé au compte administrateur' });
  const key = (deps.env || process.env).DATATOURISME_API_KEY;
  if (!key) return res.status(500).json({ error: 'Variable DATATOURISME_API_KEY absente de cet environnement Vercel' });
  const aujourdhui = (deps.now ? deps.now() : new Date()).toISOString().slice(0, 10);
  const out = await mesurer(deps.fetch || fetch, key, aujourdhui);
  // Garde-fou : la clé ne doit jamais apparaître dans la réponse
  const texte = JSON.stringify(out);
  if (key.length >= 6 && texte.includes(key)) return res.status(500).json({ error: 'Réponse retenue : elle contenait la clé' });
  return res.status(200).json(out);
}

module.exports = (req, res) => handler(req, res);
module.exports.handler = handler;
module.exports._interne = { mesurer, typesDe, libelle, dates, categorie };
