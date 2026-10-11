#!/usr/bin/env node
// Met à jour les fiches publiées : onglet « Le test » renommé « Crush ou crash ? » (pictogrammes cœur / cœur brisé),
// message et lien de partage à un proche corrigés (jamais client=, code de suivi s= seulement).
//
// Usage : node scripts/migrer-crush-ou-crash.js fiches/*.html [--out DIR] [--rapport rapport.json]
//   - sans --out : réécrit les fiches sur place ; avec --out : écrit des copies dans DIR.
//
// Principes (même méthode que scripts/migrer-crush-participation.js) :
//   - Chaque bloc ajouté par la migration précédente doit être retrouvé À L'IDENTIQUE (gabarit d'avant ce changement,
//     réduit aux langues de la fiche), exactement une fois ; il est remplacé par le bloc du gabarit actuel.
//   - Rien d'autre n'est touché (design, photos, adresse, textes, langues, suivi des statistiques).
//   - Contrôle : toutes les opérations sont défaites dans l'ordre inverse et le résultat doit être identique,
//     octet pour octet, à la fiche d'origine. Sinon la fiche est en échec et n'est pas écrite.
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
// Gabarit d'avant ce changement (dernier état publié dans les fiches) et gabarit actuel
const AVANT_COMMIT = 'a801b5bff2ac9415e8cb9348c37442c0dc6e2f16';
const OLD = execFileSync('git', ['show', AVANT_COMMIT + ':index.html'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
const NEW = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

class Echec extends Error {}
function count(s, x) { let n = 0, i = 0; while ((i = s.indexOf(x, i)) !== -1) { n++; i += x.length; } return n; }
function between(s, a, b, inclA, inclB) {
  const i = s.indexOf(a); if (i < 0 || count(s, a) !== 1) throw new Error('gabarit : repère introuvable ou multiple : ' + a.slice(0, 60));
  const j = s.indexOf(b, i + a.length); if (j < 0) throw new Error('gabarit : fin introuvable : ' + b.slice(0, 60));
  return s.slice(inclA ? i : i + a.length, inclB ? j + b.length : j);
}
function blocs(TPL) {
  const T = {};
  T.css = between(TPL, '/* ═════════ CRUSH IMMOBILIER (onglet « Le test »)', '@media(max-width:700px){body.pv4 .header .pv-share-top{display:flex;margin:10px auto 6px;}}\n', true, true);
  T.railBtn = (TPL.match(/  <button data-tab="crush" onclick="showTab\('crush',this\)">[^\n]*<\/button>\n/) || [])[0];
  T.titre = (TPL.match(/    <div class="lbl[^"]*" data-i18n="[a-z-]*crush">[^<]*<\/div>\n/) || [])[0];
  T.crushUi = between(TPL, '<script id="crush-ui">\n', '</script>\n', false, false);
  T.partUi = between(TPL, '<script id="participation-js">\n', '</script>\n', false, false);
  return T;
}
const O = blocs(OLD), N = blocs(NEW);
// Traductions : une par langue, dans l'ordre fr, en, pt, es des dictionnaires
function i18nDe(TPL) {
  const fr = (TPL.match(/    'tab-crush': '[^']*',\n(?:    'lbl-crush': '[^']*',\n)?/g) || []);
  const pt = (TPL.match(/    "tab-crush": "[^"]*",\n(?:    "lbl-crush": "[^"]*",\n)?/g) || []);
  if (fr.length !== 2 || pt.length !== 2) throw new Error('gabarit : traductions de l\'onglet introuvables');
  return { fr: fr[0], en: fr[1], pt: pt[0], es: pt[1] };
}
O.i18n = i18nDe(OLD); N.i18n = i18nDe(NEW);
if (!/lbl-crush/.test(O.i18n.fr) || /lbl-crush/.test(N.i18n.fr) || !/Crush ou crash/.test(N.i18n.fr)) throw new Error('gabarit : traductions inattendues');
for (const k of ['css', 'railBtn', 'titre', 'crushUi', 'partUi']) {
  if (!O[k] || !N[k]) throw new Error('gabarit : bloc ' + k + ' introuvable');
  if (O[k] === N[k]) throw new Error('gabarit : bloc ' + k + ' inchangé ?');
}

// Langues : ne garder que celles de la fiche dans les dictionnaires (comme la migration précédente)
function garderLangues(code, debutCle, finMarqueur, langs) {
  const premier = ['en', 'pt', 'es'].find(l => !langs.includes(l));
  if (!premier) return code;
  if (premier === 'en' && langs.length > 1) throw new Echec('combinaison de langues inattendue : ' + langs);
  if (premier === 'pt' && langs.includes('es')) throw new Echec('combinaison de langues inattendue : ' + langs);
  const a = code.indexOf('\n    ' + premier + ': {\n      ' + debutCle), b = code.indexOf(finMarqueur);
  if (a < 0 || b < 0 || b < a || count(code, finMarqueur) !== 1) throw new Echec('dictionnaire de langues introuvable');
  return code.slice(0, a) + code.slice(b);
}

function migrer(orig) {
  let s = orig; const ops = [];
  function remplacer(a, b, quoi) {
    const c = count(s, a); if (c !== 1) throw new Echec(quoi + ' : ' + c + ' occurrence(s) du bloc attendu, au lieu de 1');
    if (count(s, b) !== 0) throw new Echec(quoi + ' : nouveau bloc déjà présent (déjà mise à jour ?)');
    s = s.split(a).join(b); ops.push([a, b]);
  }
  if (!orig.includes('<section id="crush" class="tab">') || !orig.includes('<script id="participation-js">')) throw new Echec('fiche sans onglet du test (migration précédente absente)');
  if (orig.includes('Crush ou crash')) throw new Echec('fiche déjà mise à jour');
  const nouveau = orig.includes('<script id="pv-skin-js">');
  const L = (orig.match(/var LANGS = \[([^\]]*)\]/) || [])[1];
  const langs = L ? L.split(',').map(x => x.replace(/['"\s]/g, '')) : (/function applyLang/.test(orig) ? ['fr', 'en'] : ['fr']);

  remplacer(O.css, N.css, 'styles');
  remplacer(O.railBtn, N.railBtn, 'barre de navigation');
  remplacer(O.titre, N.titre, 'titre de l\'onglet');
  remplacer(garderLangues(O.crushUi, 'intro1:', '\n  };\n  T.fr.lex =', langs), garderLangues(N.crushUi, 'intro1:', '\n  };\n  T.fr.lex =', langs), 'script du test');
  remplacer(garderLangues(O.partUi, 'visTitle:', '\n  };\n  function L()', langs), garderLangues(N.partUi, 'visTitle:', '\n  };\n  function L()', langs), 'script de participation');
  if (langs.length > 1) langs.forEach(l => remplacer(O.i18n[l], N.i18n[l], 'traduction ' + l));
  else if (/['"]tab-crush['"]\s*:/.test(s)) throw new Echec('fiche en français seul avec des traductions de l\'onglet : inattendu');

  // Plus aucune trace de l'ancien nom ni de client= dans le lien partagé
  if (/data-i18n="tab-crush">Le test<|['"]tab-crush['"]: ['"](Le test|The test|O teste|El test)['"]|lbl-crush/.test(s)) throw new Echec('ancien nom de l\'onglet restant');
  if (/out\.set\('client'/.test(s)) throw new Echec('client= encore ajouté au lien partagé');

  // ── Contrôle : tout défaire dans l'ordre inverse doit redonner la fiche d'origine, octet pour octet ──
  let u = s;
  for (const [a, b] of ops.slice().reverse()) { if (count(u, b) !== 1) throw new Echec('contrôle inverse'); u = u.split(b).join(a); }
  if (u !== orig) throw new Echec('contrôle inverse : la fiche diffère en dehors des remplacements prévus');
  return { html: s, design: nouveau ? 'nouveau' : 'ancien', langs, operations: ops.length };
}

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
      rapport.push({ fiche: path.basename(f), ok: true, design: r.design, langs: r.langs, operations: r.operations });
      console.log('OK', path.basename(f), '·', r.design, '·', r.langs.join('/'), '·', r.operations, 'remplacements');
    } catch (e) {
      echecs++; rapport.push({ fiche: path.basename(f), ok: false, erreur: e.message });
      console.log('ECHEC', path.basename(f), '—', e.message);
      if (!(e instanceof Echec)) console.log(e.stack);
    }
  }
  if (rap) fs.writeFileSync(rap, JSON.stringify(rapport, null, 1));
  process.exit(echecs ? 1 : 0);
}
module.exports = { migrer };
