// Chantier 3 : estimation comparée (DVF) + bassin d'acheteurs (Insee) — logique, API et page vendeur.
const fs = require('fs'), path = require('path'), assert = require('assert');
const M = require(path.join(__dirname, '..', 'api', '_marche.js'));
const handler = require(path.join(__dirname, '..', 'api', 'marche-secteur.js'));
const { JSDOM, VirtualConsole } = require('jsdom');

const HEAD = 'id_mutation,date_mutation,numero_disposition,nature_mutation,valeur_fonciere,adresse_numero,adresse_nom_voie,code_postal,code_commune,nom_commune,type_local,surface_reelle_bati,nombre_pieces_principales';
const row = (id, date, nature, val, type, surf) => [id, date, '000001', nature, val, '1', '"Rue, de ""Test"""', '91160', '91345', 'Longjumeau', type, surf, '3'].join(',');
function csv(rows) { return HEAD + '\n' + rows.join('\n') + '\n'; }

// --- parseDvf : ne garde que les ventes propres ---
{
  const t = csv([
    row('A1', '2025-03-10', 'Vente', '300000', 'Maison', '100'),                       // ok : 3000 €/m²
    row('A2', '2025-03-11', 'Vente', '200000', 'Appartement', '50'),                   // ok : 4000 €/m²
    row('A2', '2025-03-11', 'Vente', '200000', '', ''),                                // terrain de la même vente : ignoré
    row('B1', '2025-03-12', 'Vente', '500000', 'Maison', '100'), row('B1', '2025-03-12', 'Vente', '500000', 'Maison', '90'), // 2 maisons : exclu
    row('C1', '2025-03-13', 'Echange', '300000', 'Maison', '100'),                     // pas une vente
    row('D1', '2025-03-14', 'Vente', '1000', 'Maison', '100'),                         // prix aberrant
    row('E1', '2025-03-15', 'Vente', '300000', 'Local industriel. commercial ou assimilé', '100'), // local d'activité
    row('F1', '2025-03-16', 'Vente', '300000', 'Maison', '3')                          // surface aberrante
  ]);
  const v = M.parseDvf(t);
  assert.strictEqual(v.length, 2, 'ventes retenues : ' + JSON.stringify(v));
  assert.deepStrictEqual(v.map(x => x.ppm).sort(), [3000, 4000]);
  assert.deepStrictEqual(M.parseDvf('n’importe quoi'), []); assert.deepStrictEqual(M.parseDvf(''), []);
  assert.deepStrictEqual(M.parseCsvLine('a,"b,c","d ""x"""'), ['a', 'b,c', 'd "x"']);
}

// --- estimer ---
function jeu(n, base, type, surfs) { return Array.from({ length: n }, (_, i) => ({ date: '2025-0' + (1 + i % 9) + '-15', type: type || 'Maison', surface: surfs ? surfs[i % surfs.length] : 90 + (i % 5), prix: 0, ppm: base + (i % 7) * 50 - 150 })); }
{
  const e = M.estimer(jeu(20, 3000), 'maison', 90, 272000);
  assert(e.ok && e.n === 20 && e.confiance === 'bonne' && e.ecart_surface === 30, JSON.stringify(e));
  assert(e.ppm_median >= 2900 && e.ppm_median <= 3100 && Math.abs(e.estimation - e.ppm_median * 90) <= 1000, 'estimation = médiane × surface');
  assert(e.fourchette_basse <= e.estimation && e.estimation <= e.fourchette_haute, 'fourchette');
  assert.strictEqual(e.position, 'dans'); assert(Math.abs(e.ecart_pct) < 15);
  assert.strictEqual(M.estimer(jeu(20, 3000), 'maison', 90, 450000).position, 'au_dessus');
  assert.strictEqual(M.estimer(jeu(20, 3000), 'maison', 90, 200000).position, 'sous');
  assert.strictEqual(M.estimer(jeu(20, 3000), 'appartement', 90, 300000).ok, false, 'pas de ventes du bon type');
  assert.strictEqual(M.estimer(jeu(2, 3000), 'maison', 90, 0).ok, false, 'moins de 3 ventes');
  assert.strictEqual(M.estimer(jeu(20, 3000), 'maison', 90, 0).position, undefined, 'sans prix : pas de position');
  const f = M.estimer(jeu(20, 3000, 'Maison', [200]).concat(jeu(4, 3000, 'Maison', [90])), 'maison', 90, 0);
  assert(f.ok && f.ecart_surface === null && f.n === 24 || f.n === 4, 'élargissement progressif : ' + JSON.stringify([f.ecart_surface, f.n]));
  const out = M.estimer(jeu(12, 3000).concat([{ date: '2025-01-01', type: 'Maison', surface: 90, prix: 0, ppm: 25000 }]), 'maison', 90, 0);
  assert(out.n === 12 && out.ppm_median < 3200, 'valeur aberrante écartée');
  assert(e.ventes.length === 6 && e.ventes[0].mois && !('adresse' in e.ventes[0]), 'liste de ventes sans adresse');
}

// --- bassin : calcul vérifié à la main (Longjumeau 2021 : 8 469 ménages, médiane 23 320 €/UC, D1 11 760, D9 40 260) ---
{
  const b = M.bassin(380000, [8469, 23320, 11760, 40260], 'Longjumeau');
  const emprunt = 380000 * 1.08 - 38000, r = 0.039 / 12, mens = emprunt * r / (1 - Math.pow(1 + r, -300));
  assert(b.ok && Math.abs(b.mensualite - mens) < 6 && Math.abs(b.revenu_mensuel - mens / 0.35) < 6, JSON.stringify(b));
  assert(b.part_pct > 5 && b.part_pct < 14 && b.menages > 400 && b.menages < 1200, 'ordre de grandeur : ' + b.part_pct);
  assert(M.bassin(200000, [8469, 23320, 11760, 40260]).part_pct > b.part_pct, 'plus cher = moins de foyers');
  assert(Math.abs(M.cdf(0) - 0.5) < 1e-6 && Math.abs(M.cdf(1.2816) - 0.9) < 1e-3 && Math.abs(M.cdf(-1.96) - 0.025) < 1e-3, 'loi normale');
  assert.strictEqual(M.bassin(0, [1, 2, 3, 4]).ok, false); assert.strictEqual(M.bassin(300000, undefined).ok, false);
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'revenus-communes.json'), 'utf8'));
  assert(d['91345'] && d['91345'][1] === 23320 && Object.keys(d).length > 5000, 'fichier Insee');
  assert(Object.values(d).every(l => l.length === 4 && l[3] > l[2] && l[1] > 0), 'lignes Insee cohérentes');
  assert.strictEqual(M.codeDvf('75056', '75011'), '75111'); assert.strictEqual(M.codeDvf('69123', '69003'), '69383');
  assert.strictEqual(M.codeDvf('13055', '13008'), '13208'); assert.strictEqual(M.codeDvf('91345', '91160'), '91345');
}

// --- API (réseau simulé) ---
const dvfCsv = csv(Array.from({ length: 30 }, (_, i) => row('M' + i, '2025-0' + (1 + i % 9) + '-10', 'Vente', String(280000 + i * 2000), 'Maison', String(90 + i % 5))));
let calls = [];
global.fetch = async (u) => {
  u = String(u); calls.push(u);
  if (/geopf/.test(u)) return { ok: true, json: async () => ({ features: [{ properties: { citycode: '91345', city: 'Longjumeau', postcode: '91160', score: 0.95 } }] }) };
  if (/geo-dvf/.test(u)) return /\/2025\//.test(u) ? { ok: true, text: async () => dvfCsv } : { ok: false, text: async () => '' };
  throw new Error('URL inattendue ' + u);
};
const call = (body, origin, method) => new Promise(resolve => { const res = { code: 200, h: {}, setHeader(k, v) { this.h[k] = v; }, status(c) { this.code = c; return this; }, json(b) { resolve({ code: this.code, b, h: this.h }); }, end() { resolve({ code: this.code, h: this.h }); } };
  handler({ method: method || 'POST', headers: { origin: origin === undefined ? 'https://espace.privency.fr' : origin }, body }, res); });

(async () => {
  let r = await call({ adresse: '41 rue du four à pain 91160 longjumeau', type: 'maison', surface: 92, prix: 340000 });
  assert(r.code === 200 && r.b.ok && r.b.commune.nom === 'Longjumeau' && r.b.estimation.ok && r.b.estimation.n === 30 && r.b.bassin.ok, JSON.stringify(r.b).slice(0, 400));
  assert(r.h['Access-Control-Allow-Origin'] === 'https://espace.privency.fr' && /no-store/.test(r.h['Cache-Control']), 'CORS + pas de cache');
  const geo = calls.find(u => /geopf/.test(u));
  assert(!/four/.test(decodeURIComponent(geo)) && /91160/.test(geo), 'la rue n’est pas envoyée au géocodeur (code postal + commune seulement) : ' + decodeURIComponent(geo));
  assert(calls.filter(u => /geo-dvf/.test(u)).length === 4 && calls.some(u => /\/communes\/91\/91345\.csv$/.test(u)), 'quatre années DVF, bon département');
  r = await call({ adresse: 'x', type: 'maison', surface: 92 }); assert.strictEqual(r.code, 400, 'adresse trop courte');
  r = await call({ adresse: '91160 longjumeau', type: 'maison', surface: 5 }); assert.strictEqual(r.code, 400, 'surface invalide');
  r = await call({ adresse: '91160 longjumeau', type: 'maison', surface: 90, prix: 5 }); assert.strictEqual(r.code, 400, 'prix invalide');
  r = await call({ adresse: '91160 longjumeau', type: 'maison', surface: 90 }, 'https://evil.example'); assert.strictEqual(r.code, 403, 'origine refusée');
  r = await call({ adresse: '91160 longjumeau', type: 'maison', surface: 90 }, 'https://espace.privency.fr.evil.example'); assert.strictEqual(r.code, 403, 'préfixe d’origine refusé');
  r = await call({}, 'https://espace.privency.fr', 'GET'); assert.strictEqual(r.code, 405);
  r = await call({ adresse: '91160 longjumeau', type: 'maison', surface: 90 }); assert(r.b.ok && r.b.bassin.ok === false, 'sans prix : pas de bassin');
  const keep = global.fetch; global.fetch = async () => { throw new Error('réseau'); };
  r = await call({ adresse: '91160 longjumeau', type: 'maison', surface: 90 }); assert(r.code === 200 && r.b.ok === false && r.b.error === 'indisponible', 'panne réseau : message propre');
  global.fetch = keep;

  // --- page vendeur ---
  const html = fs.readFileSync(path.join(__dirname, '..', 'vendeur.html'), 'utf8');
  assert(!/innerHTML/.test(html));
  const TOK = 'b'.repeat(96), apiCalls = [];
  const rap = { ok: true, bien: '<b>41 rue du Four 91160 Longjumeau</b>', agent: {}, totaux: {}, semaine: {}, courbe: [], genere_le: '2026-10-01T10:00:00Z' };
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://app.privency.fr/vendeur.html#' + TOK, virtualConsole: new VirtualConsole(), beforeParse(w) {
    w.fetch = async (u, o) => { u = String(u);
      if (/marche-secteur/.test(u)) { apiCalls.push(JSON.parse(o.body)); return { ok: true, json: async () => ({ ok: true, commune: { nom: 'Longjumeau' }, estimation: { ok: true, n: 30, confiance: 'bonne', ecart_surface: 30, du: '2023-01-09', au: '2025-12-23', ppm_median: 3604, ppm_bas: 3000, ppm_haut: 4100, estimation: 324000, fourchette_basse: 275000, fourchette_haute: 370000, prix: 380000, ppm_prix: 4222, ecart_pct: 17.3, position: 'au_dessus', ventes: [{ mois: '<img src=x onerror=window.__xss=1>', surface: 81, prix: 271000, ppm: 3342 }] }, bassin: { ok: true, revenu_mensuel: 5560, mensualite: 1950, part_pct: 8.9, menages: 760, menages_total: 8469, hyp: { apport: 0.1, notaire: 0.08, taux: 0.039, annees: 25, endettement: 0.35 } } }) }; }
      return { ok: true, json: async () => (/vendeur_rapport/.test(u) ? rap : false) }; };
  } });
  await new Promise(r => setTimeout(r, 80));
  const d = dom.window.document, w = dom.window, set = (id, v) => { d.getElementById(id).value = v; d.getElementById(id).dispatchEvent(new w.Event('input')); };
  d.getElementById('m-go').click(); await new Promise(r => setTimeout(r, 20));
  assert(/surface habitable/.test(d.getElementById('m-out').textContent) && !apiCalls.length, 'surface obligatoire');
  set('m-surface', '92'); set('m-prix', '380000'); d.getElementById('m-type').value = 'maison';
  assert.strictEqual(d.getElementById('c-prix').value, '380000', 'le prix est repris dans « coût de l’attente »');
  d.getElementById('m-go').click(); await new Promise(r => setTimeout(r, 40));
  assert.strictEqual(apiCalls.length, 1); assert(apiCalls[0].adresse.includes('Longjumeau') && apiCalls[0].type === 'maison' && apiCalls[0].surface === 92 && apiCalls[0].prix === 380000, JSON.stringify(apiCalls[0]));
  const o = d.getElementById('m-out').textContent.replace(/ | /g, ' ');
  assert(/3 604 €\/m²/.test(o) && /324 000 €/.test(o) && /\+17,3 %/.test(o) && /au-dessus de la fourchette/.test(o), 'estimation affichée : ' + o.slice(0, 300));
  assert(/8,9 % des foyers/.test(o) && /760 foyers sur 8 469/.test(o) && /5 560 €\/mois/.test(o) && /apport de 10 %/.test(o) && /ne remplace pas l'avis de valeur/.test(o), 'bassin affiché');
  assert(!w.__xss && !d.querySelector('img[src="x"]'), 'aucune injection HTML depuis la réponse');
  console.log('OK marche (estimation + bassin)'); process.exit(0);
})().catch(e => { console.error('ÉCHEC', e); process.exit(1); });
