#!/usr/bin/env node
// Migre les fiches publiées vers le gabarit actuel : onglet « Le test » (crush) + 5 blocs de participation.
//
// Usage : node scripts/migrer-crush-participation.js fiches/*.html [--out DIR] [--rapport rapport.json]
//   - sans --out : réécrit les fiches sur place ; avec --out : écrit des copies dans DIR.
//
// Principes :
//   - Les blocs (styles, onglet, scripts, traductions) sont repris À L'IDENTIQUE du gabarit index.html ;
//     les listes (points de visite, coups de cœur) sont générées par les fonctions de app.html.
//   - Les données du test et de la participation sont reconstruites UNIQUEMENT à partir de ce que la fiche
//     contient déjà (bloc expertimo-data et contexte de l'assistant). Rien n'est inventé, la base n'est pas lue.
//   - « Le mot du vendeur » reste masqué (aucune phrase choisie).
//   - Chaque fiche ne reçoit que ses langues (4, 2 ou français seul).
//   - Garde-fous : chaque opération doit trouver exactement le nombre d'occurrences prévu ; après migration,
//     toutes les opérations sont défaites dans l'ordre inverse et le résultat doit être identique, octet pour
//     octet, à la fiche d'origine. Sinon la fiche est en échec et n'est pas écrite.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const TPL = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'app.html'), 'utf8');

class Echec extends Error {}
function count(s, x) { let n = 0, i = 0; while ((i = s.indexOf(x, i)) !== -1) { n++; i += x.length; } return n; }
function between(s, a, b, inclA, inclB) {
  const i = s.indexOf(a); if (i < 0 || count(s, a) !== 1) throw new Error('gabarit : repère introuvable ou multiple : ' + a.slice(0, 60));
  const j = s.indexOf(b, i + a.length); if (j < 0) throw new Error('gabarit : fin introuvable : ' + b.slice(0, 60));
  return s.slice(inclA ? i : i + a.length, inclB ? j + b.length : j);
}

// ── Blocs du gabarit (repris à l'identique) ──
const T = {};
T.css = between(TPL, '/* ═════════ CRUSH IMMOBILIER (onglet « Le test »)', '@media(max-width:700px){body.pv4 .header .pv-share-top{display:flex;margin:10px auto 6px;}}\n', true, true);
T.cssAncien = '/* Ancien design : boutons et résultat du test aux couleurs de la fiche (encre et or) */\n'
  + 'body:not(.pv4) #crush .cr-btn,body:not(.pv4) .pv-btn,body:not(.pv4) .pv-chip.on{background:var(--dark,#14171F);color:var(--gold);border-color:var(--dark,#14171F);}\n'
  + 'body:not(.pv4) #crush .cr-btn.cr-sec,body:not(.pv4) .pv-btn.pv-sec{background:#fff;color:var(--ink);border-color:var(--border);}\n'
  + 'body:not(.pv4) #crush .cr-hero{background:var(--dark,#14171F);}\n'
  + 'body:not(.pv4) #crush .cr-ring-fg{stroke:var(--gold);}\n';
T.railBtn = (TPL.match(/  <button data-tab="crush" onclick="showTab\('crush',this\)">[^\n]*<\/button>\n/) || [])[0];
T.shareBtn = '      <button type="button" id="pv-share-top" class="pv-share-top" onclick="pvOpenShare()">Partager</button>\n';
T.section = between(TPL, '<!-- ═══════════ ONGLET : CRUSH IMMOBILIER (LE TEST) ═══════════ -->', '<!-- ═══════════ ONGLET 2 : ANALYSE ═══════════ -->', true, false);
T.sectionHead = T.section.slice(0, T.section.indexOf('<div><div class="cons-card">'));
T.sectionTail = '</div>\n</section>\n\n';
T.mot = '  <div class="card pv-card" id="pv-mot" style="display:none;"></div>\n';
T.critere = '\n  <div class="card pv-card" id="pv-critere"></div>';
T.visite = '  <div class="card pv-card" id="pv-visite"></div>\n  <div class="card pv-card" id="pv-carnet"></div>\n';
T.vrOld = "  document.addEventListener('DOMContentLoaded', render);\n  try { new MutationObserver(function() { render(); }).observe(document.documentElement, {attributes: true, attributeFilter: ['lang']}); } catch (e) {}\n";
T.vrNew = between(TPL, '  // Pré-sélection depuis le carnet de visite', T.vrOld, true, true);
T.langHook = "  if (typeof renderCrush === 'function') renderCrush();\n  if (typeof renderParticipation === 'function') renderParticipation();\n";
T.crushCalc = between(TPL, '<script id="crush-calc">\n', '</script>\n', false, false);
T.crushUi = between(TPL, '<script id="crush-ui">\n', '</script>\n', false, false);
T.partUi = between(TPL, '<script id="participation-js">\n', '</script>\n', false, false);
T.i18n = {
  fr: "    'tab-crush': 'Le test',\n    'lbl-crush': 'Crush immobilier',\n    'stitle-crush': 'Ce bien est-il fait pour vous ?',\n",
  en: "    'tab-crush': 'The test',\n    'lbl-crush': 'Property crush',\n    'stitle-crush': 'Is this property right for you?',\n",
  pt: '    "tab-crush": "O teste",\n    "lbl-crush": "Paixão imobiliária",\n    "stitle-crush": "Este imóvel é feito para si?",\n',
  es: '    "tab-crush": "El test",\n    "lbl-crush": "Flechazo inmobiliario",\n    "stitle-crush": "¿Es esta vivienda para usted?",\n'
};
for (const l of Object.keys(T.i18n)) if (!TPL.includes(T.i18n[l])) throw new Error('gabarit : traductions ' + l + ' différentes');
// Sommaire (nouveau design)
T.seqOld = "var SEQ=['bien','historique','quartier','marche','diagnostics','documents','assistant','offre'];";
T.seqNew = "var SEQ=['bien','crush','historique','quartier','marche','diagnostics','documents','assistant','offre'];";
T.descOld = "var DESC={bien:'Photos, score, points forts',";
T.descNew = "var DESC={bien:'Photos, score, points forts',crush:'8 questions : votre % de coup de cœur',";
T.icon = "    crush:'<path d=\"M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z\"/>',\n";
T.tilesOld = '@media(min-width:700px){body.pv4.pv-home .rail{grid-template-columns:repeat(4,1fr);}}';
T.tilesNew = '@media(min-width:700px){body.pv4.pv-home .rail{grid-template-columns:repeat(3,1fr);}}\n@media(max-width:699px){body.pv4.pv-home .rail button[data-tab="offre"]{grid-column:1/-1;}}';
[T.railBtn, T.seqNew, T.descNew, T.icon, T.tilesNew, T.vrNew, T.langHook].forEach((x, i) => { if (!x || !TPL.includes(x)) throw new Error('gabarit : bloc ' + i + ' introuvable'); });

// ── Fonctions de génération de app.html (mêmes listes qu'à la génération d'une nouvelle fiche) ──
const gen = {};
vm.runInNewContext(between(APP, 'var VISITE_GENERIQUES', '// « Le mot du vendeur »', true, false) + '\nthis.visitePointsFrom = visitePointsFrom; this.carnetChipsFrom = carnetChipsFrom;', gen);
const calc = {}; vm.runInNewContext(T.crushCalc, calc);

// ── Langues : ne garder que celles de la fiche dans les dictionnaires du test et de la participation ──
function garderLangues(code, debutCle, finMarqueur, langs) {
  const premier = ['en', 'pt', 'es'].find(l => !langs.includes(l));
  if (!premier) return code;
  if (premier === 'en' && langs.length > 1) throw new Echec('combinaison de langues inattendue : ' + langs);
  if (premier === 'pt' && langs.includes('es')) throw new Echec('combinaison de langues inattendue : ' + langs);
  const a = code.indexOf('\n    ' + premier + ': {\n      ' + debutCle), b = code.indexOf(finMarqueur);
  if (a < 0 || b < 0 || b < a || count(code, finMarqueur) !== 1) throw new Echec('dictionnaire de langues introuvable');
  return code.slice(0, a) + code.slice(b);
}

// ── Données de la fiche ──
function lireJson(s, id) {
  const m = s.match(new RegExp('<script id="' + id + '" type="application/json">([\\s\\S]*?)</script>'));
  return m ? JSON.parse(m[1]) : null;
}
function lireContexte(s) {
  const m = s.match(/var _chat_ctx = ("(?:[^"\\]|\\.)*");/);
  if (!m) return null;
  const ctx = JSON.parse(m[1]), out = {};
  ctx.split('\n').forEach(l => { const k = /^- ([^:\n]+?) : (.*)$/.exec(l); if (k) out[k[1].trim()] = k[2].trim(); });
  return out;
}
const num = x => { const n = parseFloat(String(x == null ? '' : x).replace(',', '.')); return isFinite(n) && n > 0 ? n : null; };
const entier = x => { const n = parseInt(x, 10); return isFinite(n) && n >= 0 ? n : null; };
const liste = v => (v ? String(v).split(/,\s*/).map(x => x.trim()).filter(Boolean) : []);
function grille(v) {   // « Cave, Grenier (12 m²) » → [{label, m2}]
  return liste(v).map(x => { const m = /^(.*?)\s*\((\d+(?:[.,]\d+)?) m²\)$/.exec(x); return m ? { label: m[1], m2: num(m[2]) } : { label: x, m2: null }; });
}
function sonore(v) { v = String(v || ''); return /bruyant/i.test(v) ? 'Bruyant' : /calme/i.test(v) ? 'Calme' : /normal/i.test(v) ? 'Normal' : null; }
function donnees(s, langs) {
  const d = lireJson(s, 'expertimo-data') || {}, c = lireContexte(s) || {};
  const ext = {}; grille(c['Extérieur']).forEach(x => { if (x.label && x.label !== 'Portail') ext[x.label] = x.m2 || true; });
  const pk = ['Parking — places intérieures', 'Parking — places extérieures', 'Parking — box fermés'].filter(k => k in c);
  const vigilances = grille(c['Autres points de vigilance cochés']).map(x => x.label);
  const dvfN = (Array.isArray(d.dvf) ? d.dvf : []).filter(r => r && ((parseFloat(r.prix) || 0) > 0 || (parseFloat(r.prixm2) || 0) > 0)).length;
  const crush = {
    type: d.type || null, surface: num(d.surface), terrain: num(c['Surface du terrain (m²)']),
    pieces: entier(d.pieces) || null, chambres: entier(c['Chambres']) || null, etage: d.etage || null,
    ext, expo: liste(c['Exposition']).filter(x => x !== 'Autre'), sonore: sonore(c['Exposition sonore']),
    transports: liste(c["Transports à proximité (saisis par l'agent)"]).filter(x => !/^Autre/.test(x)),
    parking: pk.length ? pk.reduce((n, k) => n + (entier(c[k]) || 0), 0) : null,
    annexes: grille(c['Pièces utiles / annexes']).map(x => x.label), dpe: d.dpe || null,
    chauffage: liste(c['Chauffage — énergie']), equip: grille(c['Équipements généraux']).map(x => x.label),
    scores: { etat: num(d.scoreEtat), prest: num(d.scorePrest), secteur: num(d.scoreSecteur) },
    vigilances, dvf: { n: dvfN || null }
  };
  const diagKey = n => /amiante/i.test(n) ? 'amiante' : /lectricit/i.test(n) ? 'electricite' : /^gaz/i.test(n) ? 'gaz' : null;
  const vigTxt = { fr: [d.vig1, d.vig2, d.vig3] };
  langs.filter(l => l !== 'fr').forEach(l => { const dl = lireJson(s, 'expertimo-data-' + l); if (dl) vigTxt[l] = [dl.vig1, dl.vig2, dl.vig3]; });
  const copro = d.copro === 'oui' || /^oui/i.test(c['Bien en copropriété'] || '');
  const points = JSON.parse(JSON.stringify(gen.visitePointsFrom({
    type: d.type, copro, sonore: crush.sonore, charges: d.chargesCopro, vigilances, defauts: grille(c['Défauts et risques constatés']).map(x => x.label),
    diags: (d.diags || []).map(x => ({ key: diagKey(x && x.name || ''), status: x && x.status })).filter(x => x.key),
    travauxAg: /^oui/i.test(c['Travaux votés en assemblée générale'] || '') ? 'oui' : null,
    toitEtat: c['Toit — état'] || null, facadeEtat: c['Façade — état'] || null, voisinage: c['Voisinage'] || '', dpe: d.dpe, vigTxt
  })));
  const chips = JSON.parse(JSON.stringify(gen.carnetChipsFrom({ ext, terrain: crush.terrain, sonore: crush.sonore, vigilances, annexes: crush.annexes })));
  const mot = { fr: [] }; langs.filter(l => l !== 'fr').forEach(l => { mot[l] = []; }); mot.libre = '';
  return { crush, participation: { points, chips, mot }, contexte: !!lireContexte(s) };
}
// Critères du test calculables avec ces données (une question compte si l'une de ses deux réponses peut être notée)
function criteres(crush) {
  const A = calc.PrivencyCrush.score(Object.fromEntries(calc.PrivencyCrush.QUESTIONS.map(q => [q, 'A'])), crush);
  const B = calc.PrivencyCrush.score(Object.fromEntries(calc.PrivencyCrush.QUESTIONS.map(q => [q, 'B'])), crush);
  return calc.PrivencyCrush.QUESTIONS.filter((q, i) => A.criteres[i].note != null || B.criteres[i].note != null);
}
const jsonScript = (id, o) => '<script id="' + id + '" type="application/json">' + JSON.stringify(o).replace(/</g, '\\u003c') + '</script>\n';

// ── Migration d'une fiche ──
function migrer(orig) {
  let s = orig; const ops = [];
  function apres(ancre, ajout, n) {
    if (count(s, ancre) !== (n || 1)) throw new Echec('repère « ' + ancre.slice(0, 50).replace(/\n/g, '⏎') + ' » : ' + count(s, ancre) + ' occurrence(s), attendu ' + (n || 1));
    if (s.includes(ancre + ajout)) throw new Echec('déjà migrée ?');
    s = s.split(ancre).join(ancre + ajout); ops.push(['apres', ancre, ajout]);
  }
  function avant(ancre, ajout) {
    if (count(s, ancre) !== 1) throw new Echec('repère « ' + ancre.slice(0, 50).replace(/\n/g, '⏎') + ' » : ' + count(s, ancre) + ' occurrence(s)');
    s = s.replace(ancre, () => ajout + ancre); ops.push(['avant', ancre, ajout]);
  }
  function remplacer(a, b, n) {
    const c = count(s, a); if (c !== n) throw new Echec('« ' + a.slice(0, 50) + ' » : ' + c + ' occurrence(s), attendu ' + n);
    if (n && count(s, b) !== 0) throw new Echec('remplacement ambigu : ' + b.slice(0, 50));
    s = s.split(a).join(b); ops.push(['remplacer', a, b]);
  }
  if (orig.includes('id="crush"') || orig.includes('participation-js')) throw new Echec('fiche déjà migrée');
  const nouveau = orig.includes('<script id="pv-skin-js">');
  const L = (orig.match(/var LANGS = \[([^\]]*)\]/) || [])[1];
  const langs = L ? L.split(',').map(x => x.replace(/['"\s]/g, '')) : (/function applyLang/.test(orig) ? ['fr', 'en'] : ['fr']);

  // 1. Styles : dans la dernière feuille de style de l'en-tête
  const head = s.slice(0, s.indexOf('</head>'));
  const finStyle = head.lastIndexOf('</style>');
  if (finStyle < 0) throw new Echec('feuille de style introuvable');
  const css = T.css + (nouveau ? '' : T.cssAncien);
  s = s.slice(0, finStyle) + css + s.slice(finStyle); ops.push(['pos', finStyle, css]);
  // 2. En-tête : bouton « Partager »
  const hsub = (s.match(/      <p class="hsub"[^\n]*<\/p>\n/g) || []);
  if (hsub.length !== 1) throw new Echec('sous-titre de l\'en-tête : ' + hsub.length);
  apres(hsub[0], T.shareBtn);
  // 3. Barre de navigation : « Le test » juste après « Le Bien »
  const btnBien = (s.match(/  <button class="active" data-tab="bien"[^\n]*<\/button>\n/g) || []);
  if (btnBien.length !== 1) throw new Echec('bouton « Le Bien » : ' + btnBien.length);
  apres(btnBien[0], T.railBtn);
  // 4. Onglet « Le test » après « Le Bien », avec la fiche conseiller de la fiche elle-même
  const iHist = s.indexOf('<!-- ═══════════ ONGLET : HISTORIQUE');
  const cons = s.slice(s.indexOf('<div><div class="cons-card">', iHist), s.indexOf('</div></div>\n', s.indexOf('<div><div class="cons-card">', iHist)) + '</div></div>\n'.length);
  if (!cons.startsWith('<div><div class="cons-card">')) throw new Echec('fiche conseiller introuvable');
  avant('<!-- ═══════════ ONGLET 2 : ANALYSE ═══════════ -->', T.sectionHead + cons + T.sectionTail);
  // 5. Le Bien : mot du vendeur (masqué) en tête, critère déterminant en fin de colonne
  apres('<section id="bien" class="tab active">\n<div class="pg">\n<div>\n', T.mot);
  const iBien = s.indexOf('<section id="bien" class="tab active">'), finCol = '\n</div>\n<div><div class="cons-card">';
  const k = s.indexOf(finCol, iBien);
  if (k < 0 || k > s.indexOf('</section>', iBien)) throw new Echec('fin de colonne de « Le Bien » introuvable');
  s = s.slice(0, k) + T.critere + s.slice(k); ops.push(['pos', k, T.critere]);
  // 6. Faire une offre : ma visite + carnet avant le retour de visite ; pré-sélection depuis le carnet
  avant('  <div class="card" id="vr-card">\n', T.visite);
  remplacer(T.vrOld, T.vrNew, 1);
  // 7. Compteurs « / 8 » → « / 9 »
  for (const [a, b] of [[' / 8 sections explorées', ' / 9 sections explorées'], [' / 8 sections explored', ' / 9 sections explored'], [' / 8 secções exploradas', ' / 9 secções exploradas'], [' / 8 secciones exploradas', ' / 9 secciones exploradas'],
    [' / 8 sections<', ' / 9 sections<'], ["' / 8 sections'", "' / 9 sections'"], ['" / 8 secções"', '" / 9 secções"'], ['" / 8 secciones"', '" / 9 secciones"']]) {
    const c = count(s, a); if (c) remplacer(a, b, c);
  }
  if (/\/ 8 (sections|secções|secciones)/.test(s)) throw new Echec('compteur « / 8 » restant');
  // 8. Traductions de l'onglet (langues de la fiche) et rafraîchissement au changement de langue
  const TAB = { fr: "'tab-bien': 'Le Bien',\n", en: "'tab-bien': 'The Property',\n", pt: '"tab-bien": "O Imóvel",\n', es: '"tab-bien": "La vivienda",\n' };
  if (langs.length > 1) {
    langs.forEach(l => apres('    ' + TAB[l], T.i18n[l]));
    apres("  if (typeof renderWelcomeParam === 'function') renderWelcomeParam(lang);\n", T.langHook);
  }
  // 9. Nouveau design : sommaire à 9 tuiles
  if (nouveau) {
    remplacer(T.seqOld, T.seqNew, 1);
    remplacer(T.descOld, T.descNew, 1);
    const bienIco = (s.match(/\n    bien:'<path[^\n]*\n/g) || []);
    if (bienIco.length !== 1) throw new Echec('icône « Le Bien » : ' + bienIco.length);
    apres(bienIco[0], T.icon);
    remplacer(T.tilesOld, T.tilesNew, 1);
    for (const [a, b] of [['SOMMAIRE DES 8 ONGLETS', 'SOMMAIRE DES 9 ONGLETS'], ['les 8 sections toutes visibles', 'les 9 sections toutes visibles'], ['titre · n/8 »', 'titre · n/9 »']]) { const c = count(s, a); if (c) remplacer(a, b, c); }
  }
  // 10. Données + scripts (test puis participation), avant le script du retour de visite
  const dn = donnees(orig, langs);
  const bloc = jsonScript('crush-data', dn.crush) + '<script id="crush-calc">\n' + T.crushCalc + '</script>\n'
    + '<script id="crush-ui">\n' + garderLangues(T.crushUi, 'intro1:', '\n  };\n  T.fr.lex =', langs) + '</script>\n'
    + jsonScript('participation-data', dn.participation)
    + '<script id="participation-js">\n' + garderLangues(T.partUi, 'visTitle:', '\n  };\n  function L()', langs) + '</script>\n';
  avant('<script>\n// Retour de visite en un clic', bloc);

  // ── Contrôle : tout défaire dans l'ordre inverse doit redonner la fiche d'origine, octet pour octet ──
  let u = s;
  for (const op of ops.slice().reverse()) {
    if (op[0] === 'apres') { if (!u.includes(op[1] + op[2])) throw new Echec('contrôle inverse (après)'); u = u.split(op[1] + op[2]).join(op[1]); }
    else if (op[0] === 'avant') { if (count(u, op[2] + op[1]) !== 1) throw new Echec('contrôle inverse (avant)'); u = u.replace(op[2] + op[1], () => op[1]); }
    else if (op[0] === 'remplacer') u = u.split(op[2]).join(op[1]);
    else { const at = op[1]; if (u.slice(at, at + op[2].length) !== op[2]) throw new Echec('contrôle inverse (position)'); u = u.slice(0, at) + u.slice(at + op[2].length); }
  }
  if (u !== orig) throw new Echec('contrôle inverse : la fiche diffère en dehors des ajouts prévus');
  return { html: s, design: nouveau ? 'nouveau' : 'ancien', langs, criteres: criteres(dn.crush), contexte: dn.contexte, points: dn.participation.points.length, chips: dn.participation.chips.length };
}

// ── Programme ──
if (require.main === module) {
  const args = process.argv.slice(2); let out = null, rap = null;
  const io = args.indexOf('--out'); if (io !== -1) { out = args[io + 1]; args.splice(io, 2); }
  const ir = args.indexOf('--rapport'); if (ir !== -1) { rap = args[ir + 1]; args.splice(ir, 2); }
  const rapport = []; let echecs = 0;
  for (const f of args) {
    const orig = fs.readFileSync(f, 'utf8');
    try {
      const r = migrer(orig);
      fs.writeFileSync(out ? path.join(out, path.basename(f)) : f, r.html);
      rapport.push({ fiche: path.basename(f), ok: true, design: r.design, langs: r.langs, criteres: r.criteres, contexte: r.contexte, points: r.points, chips: r.chips });
      console.log('OK', path.basename(f), '·', r.design, '·', r.langs.join('/'), '·', r.criteres.length, 'critère(s) du test');
    } catch (e) {
      echecs++; rapport.push({ fiche: path.basename(f), ok: false, erreur: e.message });
      console.log('ECHEC', path.basename(f), '—', e.message);
      if (!(e instanceof Echec)) console.log(e.stack);
    }
  }
  if (rap) fs.writeFileSync(rap, JSON.stringify(rapport, null, 1));
  process.exit(echecs ? 1 : 0);
}
module.exports = { migrer, donnees, criteres };
