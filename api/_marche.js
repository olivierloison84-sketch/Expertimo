// Calculs de l'« estimation comparée » et du « bassin d'acheteurs » de l'espace vendeur.
// Fonctions pures (aucune requête réseau ici) : testées sur de vraies données DVF / Insee dans tests/marche.test.js.
// Sources : DVF géolocalisé (data.gouv.fr, Etalab) et Insee Filosofi 2021 (niveau de vie par commune).

// ---- CSV ---------------------------------------------------------------------------------------------------------
function parseCsvLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

// Ne garde que les ventes « propres » : une seule vente d'un appartement ou d'une maison (les lots multiples, terrains,
// ventes en bloc et locaux d'activité faussent le prix au m²).
function parseDvf(csvText) {
  const lines = String(csvText || '').split(/\r?\n/);
  if (lines.length < 2) return [];
  const head = parseCsvLine(lines[0]), ix = {};
  head.forEach((h, i) => { ix[h] = i; });
  for (const k of ['id_mutation', 'date_mutation', 'nature_mutation', 'valeur_fonciere', 'type_local', 'surface_reelle_bati']) if (!(k in ix)) return [];
  const byMut = new Map();
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const c = parseCsvLine(lines[i]);
    const id = c[ix.id_mutation]; if (!id) continue;
    let m = byMut.get(id); if (!m) { m = { date: c[ix.date_mutation], nature: c[ix.nature_mutation], valeur: new Set(), locaux: [] }; byMut.set(id, m); }
    m.valeur.add(c[ix.valeur_fonciere]);
    const t = c[ix.type_local];
    if (t === 'Appartement' || t === 'Maison') m.locaux.push({ type: t, surface: parseFloat(c[ix.surface_reelle_bati]), pieces: parseInt(c[ix.nombre_pieces_principales], 10) });
  }
  const ventes = [];
  byMut.forEach((m) => {
    if (m.nature !== 'Vente' || m.valeur.size !== 1 || m.locaux.length !== 1) return;
    const v = parseFloat(Array.from(m.valeur)[0]), l = m.locaux[0];
    if (!(v > 20000) || !(l.surface >= 9 && l.surface <= 400)) return;
    const ppm = v / l.surface;
    if (ppm < 500 || ppm > 30000) return;
    ventes.push({ date: m.date, type: l.type, surface: Math.round(l.surface), prix: Math.round(v), ppm: Math.round(ppm) });
  });
  return ventes;
}

// ---- Statistiques -----------------------------------------------------------------------------------------------
function quantile(sorted, p) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * p, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
function trimOutliers(ventes) {
  if (ventes.length < 8) return ventes;
  const s = ventes.map((v) => v.ppm).sort((a, b) => a - b), q1 = quantile(s, 0.25), q3 = quantile(s, 0.75), iqr = q3 - q1;
  return ventes.filter((v) => v.ppm >= q1 - 1.5 * iqr && v.ppm <= q3 + 1.5 * iqr);
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
function moisFr(iso) { const p = String(iso).split('-'); return MOIS[(+p[1] || 1) - 1] + ' ' + p[0]; }

// Estimation comparée : le prix au m² médian des ventes comparables (même type, surface proche) appliqué à la surface du bien.
function estimer(ventes, type, surface, prix) {
  const t = type === 'maison' ? 'Maison' : 'Appartement';
  const memeType = trimOutliers(ventes.filter((v) => v.type === t));
  let comp = memeType.filter((v) => v.surface >= surface * 0.7 && v.surface <= surface * 1.3), ecart = 30;
  if (comp.length < 6) { comp = memeType.filter((v) => v.surface >= surface * 0.5 && v.surface <= surface * 1.5); ecart = 50; }
  if (comp.length < 6) { comp = memeType; ecart = null; }
  if (comp.length < 3) return { ok: false, raison: 'peu_de_ventes', n: comp.length };
  const s = comp.map((v) => v.ppm).sort((a, b) => a - b);
  const med = quantile(s, 0.5), p25 = quantile(s, 0.25), p75 = quantile(s, 0.75);
  const dates = comp.map((v) => v.date).sort();
  const r = {
    ok: true, n: comp.length, ecart_surface: ecart, du: dates[0], au: dates[dates.length - 1],
    confiance: comp.length >= 15 ? 'bonne' : comp.length >= 6 ? 'moyenne' : 'faible',
    ppm_median: Math.round(med), ppm_bas: Math.round(p25), ppm_haut: Math.round(p75),
    estimation: Math.round(med * surface / 1000) * 1000, fourchette_basse: Math.round(p25 * surface / 1000) * 1000, fourchette_haute: Math.round(p75 * surface / 1000) * 1000,
    ventes: comp.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6).map((v) => ({ mois: moisFr(v.date), surface: v.surface, prix: Math.round(v.prix / 1000) * 1000, ppm: v.ppm }))
  };
  if (prix > 0) {
    r.prix = prix; r.ppm_prix = Math.round(prix / surface);
    r.ecart_pct = Math.round((prix - r.estimation) / r.estimation * 1000) / 10;
    r.position = prix < r.fourchette_basse ? 'sous' : prix > r.fourchette_haute ? 'au_dessus' : 'dans';
  }
  return r;
}

// ---- Bassin d'acheteurs -----------------------------------------------------------------------------------------
// Hypothèses (affichées au vendeur) : apport de 10 % du prix, frais de notaire 8 %, crédit sur 25 ans à 3,9 % assurance
// comprise, 35 % d'endettement maximum, ménage acheteur de 1,5 unité de consommation.
const HYP = { apport: 0.10, notaire: 0.08, taux: 0.039, annees: 25, endettement: 0.35, uc: 1.5 };

function cdf(x) { // loi normale centrée réduite (Abramowitz & Stegun 26.2.17, erreur < 1e-7)
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}
function mensualite(emprunt, tauxAnnuel, annees) {
  const r = tauxAnnuel / 12, n = annees * 12;
  return emprunt * r / (1 - Math.pow(1 + r, -n));
}
// ligne Insee = [ménages fiscaux, niveau de vie médian €/an/UC, 1er décile, 9e décile]
function bassin(prix, ligne, commune) {
  if (!(prix > 0) || !ligne) return { ok: false };
  const emprunt = prix * (1 + HYP.notaire) - prix * HYP.apport;
  const revenuMensuel = mensualite(emprunt, HYP.taux, HYP.annees) / HYP.endettement;
  const nbMen = ligne[0], med = ligne[1], d1 = ligne[2], d9 = ligne[3];
  const sigma = Math.log(d9 / d1) / (2 * 1.2816);
  const parUc = revenuMensuel * 12 / HYP.uc;
  const part = 1 - cdf((Math.log(parUc) - Math.log(med)) / sigma);
  return {
    ok: true, commune: commune || null, hyp: HYP,
    revenu_mensuel: Math.round(revenuMensuel / 10) * 10, mensualite: Math.round(revenuMensuel * HYP.endettement / 10) * 10,
    mediane_mensuelle_uc: Math.round(med / 12 / 10) * 10,
    part_pct: Math.round(part * 1000) / 10, menages: Math.round(nbMen * part / 10) * 10, menages_total: nbMen
  };
}

// Code commune du DVF : Paris, Lyon et Marseille sont découpées en arrondissements.
function codeDvf(citycode, cp) {
  cp = String(cp || '');
  if (citycode === '75056' && /^750(0[1-9]|1\d|20)$/.test(cp)) return '751' + cp.slice(3);
  if (citycode === '69123' && /^6900[1-9]$/.test(cp)) return '6938' + cp.slice(4);
  if (citycode === '13055' && /^130(0[1-9]|1[0-6])$/.test(cp)) return '132' + cp.slice(3);
  return citycode;
}

module.exports = { parseCsvLine, parseDvf, quantile, trimOutliers, estimer, bassin, cdf, mensualite, codeDvf, moisFr, HYP };
