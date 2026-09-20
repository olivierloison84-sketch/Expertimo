// Cherche dans l'HISTORIQUE git (toutes branches) les noms / e-mails / téléphones de vendeurs présents dans les anciennes fiches.
// Les valeurs sont lues dans la sauvegarde locale (dossier passé en argument) et JAMAIS affichées : seuls les fichiers et
// le nombre de commits sont listés. Usage : node scripts/history-scan.js <dossier-sauvegarde-fiches>
const fs = require('fs'), path = require('path'), cp = require('child_process');
const backup = process.argv[2];
const root = path.join(__dirname, '..');
const KINDS = { proprio_prenom: 'prénom', proprio_nom: 'nom', tel_mobile: 'téléphone', tel_fixe: 'téléphone', email_proprio: 'e-mail', email: 'e-mail' };
const found = {};   // valeur -> {kind, source}
function add(kind, v, src) { if (typeof v === 'string' && v.trim().length >= 5) found[v.trim()] = { kind, src }; }
const Q = String.fromCharCode(34);
function block(h, id) {
  const a = h.indexOf('id=' + Q + id + Q); if (a < 0) return null;
  const s = h.indexOf('>', a) + 1, e = h.indexOf('</script>', s);
  try { return JSON.parse(h.slice(s, e)); } catch (x) { return null; }
}
const dir = path.join(backup, 'fiches');
fs.readdirSync(dir).filter(f => f.endsWith('.html')).forEach(f => {
  const d = block(fs.readFileSync(path.join(dir, f), 'utf8'), 'expertimo-data'); if (!d || !d._rawState) return;
  Object.keys(KINDS).forEach(k => add(KINDS[k], d._rawState[k], f));
});
const rdv = path.join(backup, 'fiches-rdv');
fs.existsSync(rdv) && fs.readdirSync(rdv).filter(f => f.endsWith('.json')).forEach(f => {
  const d = JSON.parse(fs.readFileSync(path.join(rdv, f), 'utf8'));
  Object.keys(KINDS).forEach(k => add(KINDS[k], d[k], f));
});
// noms de vendeurs des fiches NV
fs.readdirSync(path.join(backup, 'fiches-nv')).forEach(f => {
  const m = fs.readFileSync(path.join(backup, 'fiches-nv', f), 'utf8').match(/_nv_vendeur_nom\s*=\s*"([^"]+)"/); if (m) add('nom (fiche NV)', m[1], f);
});
// valeurs propres aux agents / génériques à ignorer
const IGNORE = /expertimo|privency|email\.com|example|loison/i;
const vals = Object.keys(found).filter(v => !IGNORE.test(v));
console.log('valeurs testées : ' + vals.length + ' (' + [...new Set(vals.map(v => found[v].kind))].join(', ') + ')');
const files = {};
vals.forEach(v => {
  let out = '';
  try { out = cp.execFileSync('git', ['log', '--all', '-S' + v, '--pretty=format:@%h', '--name-only'], { cwd: root, maxBuffer: 1 << 28 }).toString('utf8'); } catch (e) { return; }
  let commit = null;
  out.split('\n').forEach(l => { if (l.startsWith('@')) commit = l.slice(1); else if (l.trim()) { const k = l.trim(); (files[k] = files[k] || { commits: new Set(), kinds: new Set() }); files[k].commits.add(commit); files[k].kinds.add(found[v].kind); } });
});
const rows = Object.keys(files).sort();
console.log('fichiers de l\'historique contenant au moins une valeur : ' + rows.length);
rows.forEach(f => console.log('  ' + f + ' | ' + files[f].commits.size + ' commit(s) | ' + [...files[f].kinds].join(', ')));
