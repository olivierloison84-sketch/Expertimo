#!/usr/bin/env node
// Met à jour les fiches publiées :
//   - « Envoyé ! » honnête : le match du test et le carnet de visite ne s'affichent comme envoyés que si le serveur
//     confirme l'enregistrement (sinon message d'erreur, bouton actif, nouvelle tentative sans doublon) ;
//   - ancien design, téléphone : pictogrammes de « Crush ou crash ? » à 14 px minimum dans la barre du bas.
//
// Usage : node scripts/migrer-envoi-confirme.js fiches/*.html [--out DIR] [--rapport rapport.json]
//   - sans --out : réécrit les fiches sur place ; avec --out : écrit des copies dans DIR.
//
// Principes (même méthode que scripts/migrer-crush-ou-crash.js) :
//   - Chaque bloc doit être retrouvé À L'IDENTIQUE (gabarit d'avant ce changement, réduit aux langues de la fiche),
//     exactement une fois ; il est remplacé par le bloc du gabarit actuel. Rien d'autre n'est touché.
//   - Contrôle : toutes les opérations sont défaites dans l'ordre inverse et le résultat doit être identique,
//     octet pour octet, à la fiche d'origine. Sinon la fiche est en échec et n'est pas écrite.
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
// Gabarit d'avant ce changement (dernier état publié dans les fiches, PR #139) et gabarit actuel
const AVANT_COMMIT = 'f7367072849c68c5d8f68d41e4c7858ea26fb626';
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
  return {
    css: between(TPL, '/* ═════════ CRUSH IMMOBILIER (onglet « Le test »)', '@media(max-width:700px){body.pv4 .header .pv-share-top{display:flex;margin:10px auto 6px;}}\n', true, true),
    crushUi: between(TPL, '<script id="crush-ui">\n', '</script>\n', false, false),
    partUi: between(TPL, '<script id="participation-js">\n', '</script>\n', false, false),
    track: between(TPL, '  function track(evenement) {\n', "/rest/v1/fiche_views', {", true, true),
    expose: between(TPL, '  window.privencyTrack = track;\n', '  // Documents souhaités', true, false)
  };
}
const O = blocs(OLD), N = blocs(NEW);
for (const k of Object.keys(O)) {
  if (!O[k] || !N[k]) throw new Error('gabarit : bloc ' + k + ' introuvable');
  if (O[k] === N[k]) throw new Error('gabarit : bloc ' + k + ' inchangé ?');
}

// Langues : ne garder que celles de la fiche dans les dictionnaires (comme les migrations précédentes)
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
  if (!orig.includes('Crush ou crash')) throw new Echec('fiche sans « Crush ou crash ? » (migration précédente absente)');
  if (orig.includes('window.privencyEnvoi')) throw new Echec('fiche déjà mise à jour');
  const nouveau = orig.includes('<script id="pv-skin-js">');
  const L = (orig.match(/var LANGS = \[([^\]]*)\]/) || [])[1];
  const langs = L ? L.split(',').map(x => x.replace(/['"\s]/g, '')) : (/function applyLang/.test(orig) ? ['fr', 'en'] : ['fr']);

  remplacer(O.css, N.css, 'styles');
  remplacer(O.track, N.track, 'envoi des statistiques');
  remplacer(O.expose, N.expose, 'envoi confirmé');
  remplacer(garderLangues(O.crushUi, 'intro1:', '\n  };\n  T.fr.lex =', langs), garderLangues(N.crushUi, 'intro1:', '\n  };\n  T.fr.lex =', langs), 'script du test');
  remplacer(garderLangues(O.partUi, 'visTitle:', '\n  };\n  function L()', langs), garderLangues(N.partUi, 'visTitle:', '\n  };\n  function L()', langs), 'script de participation');

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
