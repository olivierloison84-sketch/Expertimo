// Migration des liens de fiches déjà publiées vers ville-type-code6.html (même logique que shortSlug() dans app.html).
// Usage : node scripts/migrer-liens-fiches.js --dry-run [--mapping chemin.json]
// Le dry run ne modifie rien dans le dépôt : il affiche le tableau ancien -> nouveau et peut écrire le mapping ailleurs.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const DIR = path.join(__dirname, '..', 'fiches');
const slugify = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 60);
const opaqueId = n => { const c = 'abcdefghijklmnopqrstuvwxyz0123456789', b = crypto.randomBytes(n); return Array.from(b, x => c[x % c.length]).join(''); };
const estEN = f => /-EN-FINAL\.html$|-EN\.html$/.test(f);

function analyser(file) {
  const h = fs.readFileSync(path.join(DIR, file), 'utf8');
  const title = (/<title>([^<]*)/.exec(h) || [])[1] || '';
  let m = /^(Appartement|Maison|Terrain) à ([^·]+?)\s*·/.exec(title);
  if (m) return { type: m[1].toLowerCase(), ville: m[2].trim(), typeConnu: true };
  m = /^([^(·]+?)\s*\(?\d{5}\)?\s*·/.exec(title);            // anciens titres « Ville (91160) · … » : pas de type
  return { type: 'bien', ville: m ? m[1].trim() : '', typeConnu: false };
}

const args = process.argv.slice(2);
if (!args.includes('--dry-run')) { console.error('Seul le mode --dry-run est disponible pour l\'instant.'); process.exit(1); }
const mapPath = args.includes('--mapping') ? args[args.indexOf('--mapping') + 1] : null;
const fichiers = fs.readdirSync(DIR).filter(f => f.endsWith('.html') && !estEN(f)).sort();
const pris = new Set(fs.readdirSync(DIR));
const lignes = fichiers.map(f => {
  const a = analyser(f);
  let neuf;
  do { neuf = (slugify(a.ville) ? slugify(a.ville) + '-' : '') + a.type + '-' + opaqueId(6) + '.html'; } while (pris.has(neuf));
  pris.add(neuf);
  const en = ['-EN-FINAL.html', '-EN.html'].map(s => f.replace(/-FINAL\.html$|\.html$/, '') + s).find(x => fs.existsSync(path.join(DIR, x)));
  const dejaCourt = !/\d{5}/.test(f.replace(/-[a-z0-9]{6}-FINAL\.html$|-FINAL\.html$/, '')) || /^(longjumeau|massy)-(maison|appartement)-/.test(f);
  return { ancien: f, nouveau: neuf, en: en || null, nouveauEn: en ? neuf.replace(/\.html$/, '-EN.html') : null, typeConnu: a.typeConnu, dejaSansAdresse: dejaCourt };
});
console.log('ANCIEN | NOUVEAU | notes');
lignes.forEach(l => console.log(l.ancien + ' | ' + l.nouveau + ' | ' + [l.en ? 'EN: ' + l.en : '', l.typeConnu ? '' : 'type inconnu', l.dejaSansAdresse ? 'déjà sans adresse' : ''].filter(Boolean).join(', ')));
console.log('\n' + lignes.length + ' fiches (hors versions EN) — dry run, aucun fichier du dépôt modifié.');
if (mapPath) { fs.writeFileSync(mapPath, JSON.stringify(lignes, null, 2)); console.log('Mapping écrit dans ' + mapPath); }
