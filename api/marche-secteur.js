// Estimation comparée + bassin d'acheteurs pour l'espace vendeur (vendeur.html).
// POST { adresse, type: 'appartement'|'maison', surface, prix } -> { ok, commune, estimation, bassin }
// Données publiques uniquement (DVF géolocalisé, Insee Filosofi) : aucun accès à la base Privency, aucune donnée personnelle.
const M = require('./_marche.js');
let REVENUS = null;
try { REVENUS = require('../data/revenus-communes.json'); } catch (e) { REVENUS = {}; }

const ORIGINS = ['https://espace.privency.fr', 'https://app.privency.fr', 'https://expertimo-phi.vercel.app', 'https://olivierloison84-sketch.github.io'];
const DVF_BASE = 'https://files.data.gouv.fr/geo-dvf/latest/csv/';

function timeout(ms) { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); if (t.unref) t.unref(); return c.signal; }

// Garde-fous (par instance de fonction, au mieux) : ventes déjà analysées gardées 10 min par commune, et 40 appels / 10 min / IP.
const CACHE = new Map(), HITS = new Map(), TTL = 10 * 60 * 1000;
function limite(ip) {
  const now = Date.now(); let h = (HITS.get(ip) || []).filter((t) => now - t < TTL);
  h.push(now); HITS.set(ip, h);
  if (HITS.size > 2000) HITS.forEach((v, k) => { if (!v.length || now - v[v.length - 1] >= TTL) HITS.delete(k); });
  return h.length <= 40;
}

// « 41 rue du four à pain 91160 longjumeau » -> commune (code Insee, nom, code postal) via la Géoplateforme (IGN)
async function geocoder(adresse) {
  const m = adresse.match(/\b(\d{5})\b\s*(.*)$/);
  if (!m) return null; // sans code postal on ne devine pas la commune (et la rue ne part jamais chez le géocodeur)
  const q = (m[1] + ' ' + (m[2] || '')).trim();
  const r = await fetch('https://data.geopf.fr/geocodage/search?type=municipality&limit=1&q=' + encodeURIComponent(q), { signal: timeout(8000) });
  if (!r.ok) return null;
  const j = await r.json();
  const p = j && j.features && j.features[0] && j.features[0].properties;
  if (!p || !p.citycode || !(p.score > 0.5)) return null;
  const cp = m[1];
  return { code: M.codeDvf(p.citycode, cp), codeInsee: p.citycode, nom: p.city || p.name, cp };
}

async function ventesCommune(code) {
  const hit = CACHE.get(code);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  const v = await chargerVentes(code);
  if (v.fichiers) { CACHE.set(code, { t: Date.now(), v }); if (CACHE.size > 60) CACHE.delete(CACHE.keys().next().value); }
  return v;
}
async function chargerVentes(code) {
  const dep = code.slice(0, 2) === '97' ? code.slice(0, 3) : code.slice(0, 2);
  const an = new Date().getFullYear();
  const annees = [an, an - 1, an - 2, an - 3];
  const res = await Promise.all(annees.map((y) => fetch(DVF_BASE + y + '/communes/' + dep + '/' + code + '.csv', { signal: timeout(15000) })
    .then((r) => (r.ok ? r.text() : '')).catch(() => '')));
  const dates = [];
  let ventes = [];
  const fichiers = res.filter(Boolean).length;
  res.forEach((t) => { if (t) ventes = ventes.concat(M.parseDvf(t)); });
  // les 3 dernières années de données réellement publiées
  ventes.forEach((v) => dates.push(v.date));
  dates.sort();
  if (dates.length) { const fin = dates[dates.length - 1], lim = (parseInt(fin.slice(0, 4), 10) - 3) + fin.slice(4); ventes = ventes.filter((v) => v.date > lim); }
  return { ventes, fichiers };
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '';
  const allowed = ORIGINS.indexOf(origin) !== -1 || /^http:\/\/localhost(:\d+)?$/.test(origin);
  if (!allowed) return res.status(403).json({ ok: false, error: 'origin' });
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method' });

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'inconnue';
  if (!limite(ip)) return res.status(429).json({ ok: false, error: 'limite' });
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const adresse = String(b.adresse || '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 200);
  const type = b.type === 'maison' ? 'maison' : 'appartement';
  const surface = Number(b.surface), prix = Number(b.prix) || 0;
  if (adresse.length < 4 || !(surface >= 9 && surface <= 400) || (prix && !(prix >= 20000 && prix <= 20000000))) {
    return res.status(400).json({ ok: false, error: 'entree' });
  }
  try {
    const com = await geocoder(adresse);
    if (!com) return res.status(200).json({ ok: false, error: 'commune' });
    const dv = await ventesCommune(com.code);
    const estimation = dv.fichiers ? M.estimer(dv.ventes, type, surface, prix) : { ok: false, raison: 'dvf_indisponible' };
    const bassin = M.bassin(prix, REVENUS[com.code] || REVENUS[com.codeInsee], com.nom);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({ ok: true, commune: { nom: com.nom, cp: com.cp }, estimation, bassin });
  } catch (e) {
    console.error('[api/marche-secteur]', e && e.message);
    return res.status(200).json({ ok: false, error: 'indisponible' });
  }
};
