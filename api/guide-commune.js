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
// Accès : agent connecté (jeton Supabase vérifié). Modèle : GUIDE_COMMUNE_MODEL, sinon claude-sonnet-5-5.
// Fidélité : rédaction extractive, puis contrôle en code phrase par phrase (verifierPhrase) : toute phrase dont un nom propre,
// un nombre, une date, une périodicité ou une relation n'est pas dans la source de sa rubrique est supprimée.
// Format : 3 ou 4 phrases courtes par rubrique, 450 caractères au plus. Vérifiabilité : chaque rubrique enregistre dans le
// cache l'extrait exact de la source (phrases de Wikipédia, noms DATAtourisme) sur lequel reposent ses phrases.
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hhqcumnatnslfjpsrmgb.supabase.co';
const MODELE_DEFAUT = 'claude-sonnet-5-5';
const UA = 'PrivencyGuideCommune/1.0 (https://app.privency.fr)';
const DT_BASE = 'https://api.datatourisme.fr/v1';
const LICENCE_WP = 'CC BY-SA 4.0';

// Rubriques, dans l'ordre d'affichage. Les titres de section Wikipédia sont comparés sans accents ni majuscules.
const RUBRIQUES = [
  { cle: 'presentation', titre: 'La commune' },
  { cle: 'transports', titre: 'Transports', re: /transport|voies de communication|desserte|acces|reseau routier|circulation/ },
  { cle: 'equipements', titre: 'Écoles, commerces et équipements', re: /enseignement|education|ecoles?\b|scolaire|college|lycee|commerces de proximite|vie quotidienne|sante|equipements|services publics|(^|[^a-z])sports?\b/ },
  { cle: 'parcs', titre: 'Parcs et espaces verts', re: /parcs?\b|espaces? verts?|jardins?|patrimoine naturel|environnement|bois et forets|espaces naturels/ },
  { cle: 'patrimoine', titre: 'Patrimoine', re: /patrimoine(?! naturel)|lieux et monuments|monuments|architecture|edifices/ },
  { cle: 'culture', titre: 'Culture et loisirs', re: /culture|culturel|manifestations|festivites|evenements|vie associative|associations|loisirs|vie locale/ },
  { cle: 'economie', titre: 'Économie', re: /economie|emploi|entreprises|commerces?|activites economiques|zones d'activite/ }
];
const ORDRE_CORRESPONDANCE = ['parcs', 'patrimoine', 'equipements', 'culture', 'transports', 'economie'];
const MAX_CAR_RUBRIQUE = 3500, MAX_CAR_PRESENTATION = 2500;
const MAX_CAR_TEXTE = 450, MAX_PHRASES = 4, MAX_CAR_EXTRAIT = 1500;

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
    for (let j = i + 1; j < sections.length && sections[j].niveau > s.niveau; j++) bloc += '\n' + sections[j].titre + '\n' + texte(sections[j]);   // titre seul sur sa ligne : l'extrait reste recopiable tel quel
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
// Catégorie lisible d'un lieu DATAtourisme, d'après son type (classe de l'ontologie) ; à défaut, le nom de la classe
const DT_CATEGORIES = [[/Church|Chapel|ReligiousSite/i, 'édifice religieux'], [/Castle|Chateau/i, 'château'], [/Museum/i, 'musée'], [/Theater|Theatre/i, 'théâtre'],
  [/Cinema/i, 'cinéma'], [/Library/i, 'bibliothèque'], [/ParkAndGarden|Garden|Park\b/i, 'parc ou jardin'], [/NaturalHeritage/i, 'site naturel'], [/Monument|RemarkableBuilding/i, 'monument'],
  [/SportsAndLeisurePlace|Leisure/i, 'lieu de sport et de loisirs'], [/SwimmingPool/i, 'piscine'], [/CulturalSite/i, 'site culturel']];
function categorieDt(types) {
  for (const [re, l] of DT_CATEGORIES) if (types.some(t => re.test(t))) return l;
  return types.filter(t => !/^(PointOfInterest|PlaceOfInterest|Thing)$/.test(t))[0] || '';
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
      if (r) {
        // Seuls le nom et la catégorie renvoyés par l'API sont gardés : aucune description, aucun horaire
        const l = (parRubrique[r[0]] = parRubrique[r[0]] || []), cat = categorieDt(ty);
        if (l.length < 25 && !l.some(x => x.nom === nom)) l.push({ nom: nom.slice(0, 120), categorie: cat });
      }
    }
    evenements.sort((a, b) => String(a.debut || a.fin).localeCompare(String(b.debut || b.fin)));
    return { parRubrique, evenements: evenements.slice(0, 8) };
  }
  return null;
}

// ── Rédaction IA ──
const SYSTEME = [
  'Tu rédiges, en français, le guide « Vivre à [commune] » d\'une fiche immobilière destinée à des acheteurs.',
  'Tu reçois un objet JSON : la commune et, pour chaque rubrique, un extrait de Wikipédia et/ou une liste de lieux DATAtourisme (nom et catégorie seulement).',
  'Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour ni balises : {"rubriques": {"<clé>": "<texte>", ...}}, avec exactement les clés reçues.',
  '',
  'Travail EXTRACTIF et strict :',
  '- Chaque phrase reprend un fait écrit dans la source fournie POUR CETTE RUBRIQUE, avec les mêmes noms propres. Reformule peu ; en cas de doute, reprends les mots de la source.',
  '- Interdit : tout nom propre, date, année, siècle, chiffre, distance, horaire ou périodicité (« chaque mois de mai », « le mercredi ») qui ne figure pas mot pour mot dans la source de la rubrique.',
  '- Interdit : toute relation qui n\'est pas écrite dans la source (« abrite », « installé dans », « près de », « traverse », « dessert », « accueille »…). Ne déduis jamais une relation entre deux lieux.',
  '- Ne fusionne jamais deux faits pour en créer un troisième. Si deux passages se contredisent, garde le mieux documenté ou n\'écris rien sur ce point.',
  '- N\'utilise pas tes connaissances générales sur la commune, même si tu crois les connaître.',
  '- Pour les lieux DATAtourisme, tu ne peux citer que leur nom et leur catégorie, sans aucun détail.',
  '- N\'écris pas les faits qui vieillissent : services publics susceptibles d\'être réorganisés (tribunal, commissariat, gendarmerie, trésorerie), horaires, marchés, événements ponctuels ou annuels.',
  '- Aucun chiffre daté : population, habitants, revenus, budgets, montants, taux, classements, statistiques.',
  '- Interdit aussi : effectifs (salariés, employés, élèves, agriculteurs), nombres d\'exploitations ou d\'établissements, capacités de salles (places, sièges), rattachement administratif (académie, canton, arrondissement, circonscription), noms d\'entreprises, de marques et sièges sociaux.',
  '',
  'Ce qui compte pour un acheteur qui va habiter là, en priorité : transports (gare, lignes, routes), écoles (écoles, collège, lycée), commerces et équipements du quotidien, parcs, patrimoine.',
  '- Chaque rubrique : 3 ou 4 phrases courtes (une idée par phrase), 3 ou 4 faits utiles à l\'acheteur, 450 caractères au plus. Choisis les faits les plus utiles pour habiter, pas les plus anecdotiques.',
  '- Ton classique et sobre, sans formule lyrique ni publicitaire.',
  '- Si la source d\'une rubrique ne permet pas d\'écrire au moins une phrase fidèle, renvoie une chaîne vide "".',
  '- Pas de titre, pas de liste à puces, pas de mention de source (elles sont ajoutées à part).'
].join('\n');

// ── Contrôle de fidélité, en code ──
// Une phrase n'est gardée que si chacun de ses noms propres, nombres, années, siècles, mots de périodicité et mots de
// relation se retrouve dans la source de SA rubrique, et si l'essentiel de ses mots porteurs de sens y figure aussi.
const norm = s => ' ' + sansAccent(s).replace(/[’'`]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
const DEBUTS = new Set('le la les l un une des du de d il elle ils elles on ce cette ces cet son sa ses leur leurs plusieurs au aux en a depuis dans sur par pour avec outre enfin ainsi entre apres avant chaque tous toutes tout la commune ville elle on situee situe construite construit proche cote parmi'.split(' '));
const VIDES = new Set('dans pour avec sans sous entre leurs cette celle celui ceux elles sont etait etaient avait avaient aussi ainsi plus moins tres trop bien comme dont mais donc puis encore deja toute toutes tous plusieurs autres autre notamment egalement commune ville situee situe partie nombreux nombreuses compte comptent possede possedent dispose disposent propose proposent trouve trouvent quelques certains certaines depuis apres avant pendant aupres chacun chacune dont lequel laquelle lesquels lesquelles leur leurs notre votre celui-ci celle-ci figure figurent parmi lieux trouve trouvent comprend comprennent citons recense recensent culturel culturels culturelle culturelles loisirs sportifs sportives equipements espaces patrimoine'.split(' '));
const RELATIONS = ['abrit', 'install', 'accueil', 'heberg', 'pres de', 'a proximite', 'proche de', 'travers', 'longe', 'borde', 'contourn', 'evite', 'dessert', 'desserv', 'relie', 'reliee', 'jouxt', 'au coeur', 'au nord', 'au sud', 'a l est', 'a l ouest', 'situe', 'traverse'];
const PERIODES = ['chaque', 'tous les', 'toutes les', 'hebdomadaire', 'mensuel', 'annuel', 'quotidien', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche',
  'janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre', 'matin', 'soir', 'week end'];
const NOMBRES = ['deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'quinze', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'cent', 'cents', 'mille', 'dizaine', 'douzaine', 'centaine', 'premier', 'premiere', 'second', 'seconde'];
// Faits qui vieillissent : jamais écrits, même s'ils sont dans la source
const PERISSABLE = /tribunal|commissariat|gendarmerie|tresorerie|perception|sous prefecture|bureau de poste|horaire|ouvert(e|s)? (du|le|les|de|tous)|\bmarches?\b|festival|brocante|\bfetes?\b|\bsalons?\b|\bfoire|edition|carnaval|kermesse/;
// Jamais écrits non plus : effectifs, nombres d'exploitations, capacités de salles, rattachement administratif, entreprises
const NB = '(\\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|quinze|vingt|trente|cent|cents|mille|\\w+aine|plusieurs|nombreux|nombreuses)';
const INTERDIT = [
  [/\b(effectifs?|salaries?|employes?|emplois?|agriculteurs?|actifs)\b/, 'effectif'],
  [new RegExp('\\b' + NB + ' (eleves|etudiants|inscrits|enfants|licencies|adherents)\\b'), 'effectif'],
  [/\bexploitations?\b/, 'nombre d\'exploitations'],
  [new RegExp('\\b' + NB + ' (etablissements|commerces|entreprises|societes)\\b'), 'nombre d\'établissements'],
  [/\b(\d+ places|places assises|sieges|capacite|jauge|spectateurs)\b/, 'capacité de salle'],
  [/\b(academie|canton|cantonal|arrondissement|circonscription|chef lieu|rattachee?s?)\b/, 'rattachement administratif'],
  [/\b(siege|sieges sociaux|groupe(?! scolaire)|filiales?|usines?|enseignes?|multinationale|marques?)\b/, 'entreprise']
];
// Écoles, commerces, économie : un nom propre doit désigner un lieu (« collège Paul-Langevin », « zone des Champs »), pas une marque
const LIEU_AVANT = /^(ecole|ecoles|scolaire|college|lycee|creche|gymnase|stade|piscine|mediatheque|bibliotheque|conservatoire|centre|hopital|clinique|maison|gare|place|rue|avenue|boulevard|quartier|zone|zac|zi|za|parc|halle|salle|espace|complexe|cite|residence)$/;
const COMMERCE_AVANT = /^(commercial|commerciale|hypermarche|supermarche|magasin|magasins|boutique|galerie|enseigne|marque)$/;
function nomDeMarque(phrase, source, commune) {
  const mots = phrase.replace(/[«»"(),;:]/g, ' ').split(/\s+/).filter(Boolean), nC = norm(commune);
  for (let i = 0; i < mots.length; i++) {
    const brut = mots[i].replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, ''), n = norm(brut).trim();
    if (!/^\p{Lu}/u.test(brut) || !n || nC.indexOf(' ' + n + ' ') !== -1) continue;
    if (i === 0 && (DEBUTS.has(n) || VIDES.has(n) || new RegExp('(^|[^\\p{L}])' + brut.toLowerCase() + '([^\\p{L}]|$)', 'u').test(source))) continue;   // mot courant en tête de phrase
    if (i > 0 && /^\p{Lu}/u.test(mots[i - 1].replace(/^[^\p{L}]+/u, '')) && i - 1 > 0) continue;   // suite d'un nom déjà examiné (« Paul Langevin »)
    const avant = mots.slice(Math.max(0, i - 4), i).map(m => norm(m).trim());
    if (avant.some(m => COMMERCE_AVANT.test(m))) return brut;
    if (avant.some(m => LIEU_AVANT.test(m))) continue;
    return brut;
  }
  return null;
}
function verifierPhrase(phrase, source, cle, commune) {
  const nS = norm(source), nP = norm(phrase), dans = m => nS.indexOf(' ' + m.trim() + ' ') !== -1;
  if (PERISSABLE.test(nP)) return { ok: false, motif: 'fait qui vieillit' };
  for (const [re, motif] of INTERDIT) if (re.test(nP)) return { ok: false, motif };
  if (cle === 'equipements' || cle === 'economie') { const m = nomDeMarque(phrase, source, commune || ''); if (m) return { ok: false, motif: 'nom d\'entreprise ou de marque : ' + m }; }
  // nombres et années (chiffres)
  const chiffres = (phrase.match(/\d[\d  .,]*\d|\d/g) || []).map(x => x.replace(/[^\d]/g, ''));
  const chiffresSource = new Set((source.match(/\d[\d  .,]*\d|\d/g) || []).map(x => x.replace(/[^\d]/g, '')));
  for (const c of chiffres) if (!chiffresSource.has(c)) return { ok: false, motif: 'nombre absent de la source : ' + c };
  // siècles en chiffres romains (XIIIe, XVIIIe…)
  for (const m of phrase.match(/\b[IVX]{1,5}(?=(e|er|ème|eme)\b)/g) || []) if (!new RegExp('\\b' + m + '(e|er|ème|eme)\\b').test(source)) return { ok: false, motif: 'siècle absent de la source : ' + m };   // siècles I à XXI
  // nombres en lettres, périodicité, relations
  for (const w of NOMBRES) if (dans(w) === false && nP.indexOf(' ' + w + ' ') !== -1) return { ok: false, motif: 'nombre en lettres absent : ' + w };
  for (const w of PERIODES) if (nP.indexOf(' ' + w + ' ') !== -1 && !dans(w)) return { ok: false, motif: 'périodicité absente : ' + w };
  for (const w of RELATIONS) if (nP.indexOf(' ' + w) !== -1 && nS.indexOf(' ' + w) === -1) return { ok: false, motif: 'relation absente de la source : ' + w };
  // noms propres (mots à majuscule, sigles, A6 / RN20…)
  const mots = phrase.replace(/[«»"()]/g, ' ').split(/\s+/).filter(Boolean);
  for (let i = 0; i < mots.length; i++) {
    const brut = mots[i].replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, '');
    if (!/^\p{Lu}/u.test(brut) && !/^\p{L}+\d+$/u.test(brut)) continue;
    const parts = norm(brut).trim().split(' ').filter(x => x.length > 1 && !DEBUTS.has(x));   // « La », « Le »… en tête de phrase ignorés
    for (const x of parts) if (!dans(x)) return { ok: false, motif: 'nom propre absent de la source : ' + brut };
  }
  // mots porteurs de sens : l'essentiel doit venir de la source (racines de 5 lettres)
  const racinesSource = new Set(nS.trim().split(' ').filter(x => x.length >= 5).map(x => x.slice(0, 5)));
  const pleins = nP.trim().split(' ').filter(x => x.length >= 5 && !VIDES.has(x));
  if (pleins.length) {
    const absents = pleins.filter(x => !racinesSource.has(x.slice(0, 5)));
    if (absents.length / pleins.length > 0.25) return { ok: false, motif: 'mots absents de la source : ' + absents.join(', ') };
  }
  return { ok: true };
}
function textesSource(entree) {
  return [entree.wikipedia || ''].concat((entree.datatourisme || []).map(x => x.nom + ' ' + (x.categorie || ''))).join('\n');
}
const decouper = t => (String(t || '').replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]*/g) || []).map(x => x.trim()).filter(Boolean);
// Garde les seules phrases fidèles ; renvoie le texte, les phrases gardées et les phrases retirées (avec le motif)
function filtrerFidele(texte, source, commune, cle) {
  const src = String(source || '') + '\n' + (commune || '');
  const gardees = [], retirees = [];
  for (const p of decouper(texte)) { const v = verifierPhrase(p, src, cle, commune); if (v.ok) gardees.push(p); else retirees.push({ phrase: p, motif: v.motif }); }
  return { texte: gardees.join(' ').trim(), gardees, retirees };
}
// Format : MAX_PHRASES phrases au plus, MAX_CAR_TEXTE caractères au plus, en phrases entières
function formater(phrases) {
  const out = []; let n = 0;
  for (const p of phrases) {
    if (out.length >= MAX_PHRASES || n + (n ? 1 : 0) + p.length > MAX_CAR_TEXTE) break;
    out.push(p); n += (n ? 1 : 0) + p.length;
  }
  return out;
}
// Extrait exact de la source : pour chaque phrase gardée, la phrase de Wikipédia qui la porte le plus (recopiée telle
// quelle) et les lieux DATAtourisme qu'elle cite (« nom (catégorie) »). Sert à l'agent pour contrôler le texte.
function extraitSource(phrases, entree) {
  const racines = t => new Set(norm(t).trim().split(' ').filter(x => x.length >= 4 && !VIDES.has(x)).map(x => x.slice(0, 5)));
  const candidates = [];
  String(entree.wikipedia || '').split(/\n+/).forEach(par => decouper(par).forEach(ph => { if (ph.length > 15 && /[.!?]$/.test(ph)) candidates.push(ph); }));
  const morceaux = [];
  for (const p of phrases) {
    const rp = racines(p); let meilleure = null, score = 0;
    for (const c of candidates) { let k = 0; for (const r of racines(c)) if (rp.has(r)) k++; if (k > score) { score = k; meilleure = c; } }
    if (meilleure && score >= 2 && morceaux.indexOf(meilleure) === -1) morceaux.push(meilleure);
    const nP = norm(p);
    for (const x of entree.datatourisme || []) {
      const l = x.nom + (x.categorie ? ' (' + x.categorie + ')' : '');
      if (nP.indexOf(norm(x.nom)) !== -1 && morceaux.indexOf(l) === -1) morceaux.push(l);
    }
  }
  let ex = morceaux.map(m => '« ' + m + ' »').join('\n');
  if (ex.length > MAX_CAR_EXTRAIT) ex = ex.slice(0, MAX_CAR_EXTRAIT - 1).replace(/\s+\S*$/, '') + '…';
  return ex;
}

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
    body: JSON.stringify({ model: modele, max_tokens: 4000, output_config: { effort: 'medium' }, system: SYSTEME,
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
    t = t.split(/(?<=[.!?])\s+/).filter(p => !LYRIQUE.test(p)).join(' ').trim();   // phrases lyriques retirées
    const phrases = formater(filtrerFidele(t, textesSource(entrees[cle]), commune, cle).gardees);   // phrases non sourcées retirées
    t = phrases.join(' ');
    if (t.length < 30) return;   // rubrique vide : elle n'apparaît pas
    const sources = [];
    if (entrees[cle].wikipedia) sources.push({ type: 'wikipedia', titre: 'Wikipédia — ' + wp.titre, url: wp.url, licence: LICENCE_WP });
    if (entrees[cle].datatourisme) sources.push({ type: 'datatourisme', titre: 'DATAtourisme', url: 'https://www.datatourisme.fr' });
    rubriques.push({ cle, titre, texte: t, sources, extrait: extraitSource(phrases, entrees[cle]) });
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
module.exports._interne = { sectionsWikipedia, sansChiffreDate, construireGuide, wikipedia, datatourisme, RUBRIQUES, MODELE_DEFAUT, verifierPhrase, filtrerFidele, formater, extraitSource, SYSTEME, MAX_CAR_TEXTE };
