// Migration des liens de fiches déjà publiées vers ville-type-code6.html (même logique que shortSlug() dans app.html).
// Usage : node scripts/migrer-liens-fiches.js --dry-run [--mapping chemin.json]   (tableau seul)
//         node scripts/migrer-liens-fiches.js --appliquer --mapping chemin.json  (copies + redirections + SQL)
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
const SQL_OUT = path.join(__dirname, '..', 'supabase-migrer-liens-fiches.sql');
// Périmètre validé : nom de fichier commençant par un numéro de rue ; fiches fictives / de test exclues.
const EXCLUES = ['12-rue-des-lilas-91300-massy-d58321-FINAL.html', '12-rue-de-test-91160-longjumeau-FINAL.html'];
const dansPerimetre = f => /^\d+-/.test(f) && !EXCLUES.includes(f);

function pageRedirection(nouveau) {
  return '<!doctype html>\n<html lang="fr"><head><meta charset="utf-8"><meta name="pv-redirect" content="' + nouveau + '">\n'
    + '<title>Redirection…</title><meta name="robots" content="noindex">\n'
    + '<script>location.replace(' + JSON.stringify(nouveau) + ' + location.search + location.hash);</script>\n'
    + '<noscript><meta http-equiv="refresh" content="0;url=' + nouveau + '"></noscript>\n'
    + '</head><body><p>Cette fiche a changé d\'adresse : <a href="' + nouveau + '">ouvrir la fiche</a>.</p>\n'
    + '<script>document.querySelector("a").href += location.search + location.hash;</script></body></html>\n';
}
const q = s => "'" + String(s).replace(/'/g, "''") + "'";
function genererSql(lignes) {
  const vals = lignes.map(l => '  (' + q(l.ancien) + ', ' + q(l.nouveau) + ')').join(',\n');
  return `-- Migration des liens de fiches vers ville-type-code6.html (${lignes.length} fiches).
-- À exécuter par Olivier dans l'éditeur SQL Supabase. Claude n'exécute rien.
-- Ordre : 1) fusionner la PR (les nouveaux fichiers et les redirections sont en ligne)  2) étape 1 (SELECT)  3) étape 2 (UPDATE).
-- Les anciens fichiers restent en ligne comme pages de redirection : les liens déjà envoyés continuent de fonctionner.

-- ── Étape 1 : vérification (lecture seule) — fiches concernées, propriétaire, ancien -> nouveau nom ──
with mig(ancien, nouveau) as (values
${vals}
)
select af.agent_user_id, m.ancien, m.nouveau,
       (select count(*) from fiche_views v where v.fiche_path = '/fiches/' || m.ancien) as vues,
       (select count(*) from fiche_private p where p.agent_user_id = af.agent_user_id and p.filename = m.ancien) as fiche_privee
from mig m left join agent_fiches af on af.filename = m.ancien
order by af.agent_user_id nulls first, m.ancien;
-- Attendu : ${lignes.length} lignes, aucun agent_user_id vide. Une ligne sans agent_user_id = fiche absente de agent_fiches (rien ne sera mis à jour pour elle).

-- ── Étape 2 : migration (tout ou rien). Ne lancer qu'après avoir vérifié l'étape 1 ──
begin;
create temp table mig(ancien text primary key, nouveau text not null unique) on commit drop;
insert into mig(ancien, nouveau) values
${vals};

-- Nom de fichier : « Partager », « Modifier », suppression, liste « Mes fiches »
update agent_fiches af set filename = m.nouveau, published_url = 'https://espace.privency.fr/fiches/' || m.nouveau, updated_at = now()
  from mig m where af.filename = m.ancien;
update fiche_private p set filename = m.nouveau from mig m where p.filename = m.ancien;
update vendeur_liens v set filename = m.nouveau from mig m where v.filename = m.ancien;

-- Historique des statistiques : fiche_path = '/fiches/' || nom de fichier
update fiche_views t set fiche_path = '/fiches/' || m.nouveau from mig m where t.fiche_path = '/fiches/' || m.ancien;
update fiche_sessions t set fiche_path = '/fiches/' || m.nouveau from mig m where t.fiche_path = '/fiches/' || m.ancien;
update fiche_questions t set fiche_path = '/fiches/' || m.nouveau from mig m where t.fiche_path = '/fiches/' || m.ancien;
update fiche_demandes_documents t set fiche_path = '/fiches/' || m.nouveau from mig m where t.fiche_path = '/fiches/' || m.ancien;
update fiche_retours t set fiche_path = '/fiches/' || m.nouveau from mig m where t.fiche_path = '/fiches/' || m.ancien;

-- Contrôle : doit renvoyer 0 ligne (aucune référence à un ancien nom)
select 'agent_fiches' as t, count(*) from agent_fiches where filename in (select ancien from mig)
union all select 'fiche_private', count(*) from fiche_private where filename in (select ancien from mig)
union all select 'fiche_views', count(*) from fiche_views where fiche_path in (select '/fiches/' || ancien from mig);
commit;
-- Retour arrière : relancer l'étape 2 en inversant ancien/nouveau (les anciens fichiers de redirection restent en place).
`;
}
const mapPath = args.includes('--mapping') ? args[args.indexOf('--mapping') + 1] : null;
const fichiers = fs.readdirSync(DIR).filter(f => f.endsWith('.html') && !estEN(f) && dansPerimetre(f)).sort();
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
if (args.includes('--appliquer')) {
  // Réutilise les codes du dry run validé (--mapping) pour que fichiers et SQL correspondent à ce qui a été montré.
  const valide = JSON.parse(fs.readFileSync(mapPath, 'utf8')).filter(l => dansPerimetre(l.ancien));
  if (valide.length !== lignes.length) { console.error('Mapping incohérent avec le périmètre : ' + valide.length + ' vs ' + lignes.length); process.exit(1); }
  valide.forEach(l => {
    const src = path.join(DIR, l.ancien), dst = path.join(DIR, l.nouveau);
    if (fs.existsSync(dst)) throw new Error('Existe déjà : ' + l.nouveau);
    const base = l.ancien.replace(/-FINAL\.html$/, '');
    // Copie : la référence publique (offre, etc.) reprend le nouveau nom au lieu de l'ancien (qui contient l'adresse).
    fs.writeFileSync(dst, fs.readFileSync(src, 'utf8').split(base).join(l.nouveau.replace(/\.html$/, '')));
    fs.writeFileSync(src, pageRedirection(l.nouveau));
  });
  fs.writeFileSync(SQL_OUT, genererSql(valide));
  console.log(valide.length + ' fiches copiées, anciens fichiers remplacés par des redirections, SQL écrit : ' + path.relative(process.cwd(), SQL_OUT));
  process.exit(0);
}
console.log('ANCIEN | NOUVEAU | notes');
lignes.forEach(l => console.log(l.ancien + ' | ' + l.nouveau + ' | ' + [l.en ? 'EN: ' + l.en : '', l.typeConnu ? '' : 'type inconnu', l.dejaSansAdresse ? 'déjà sans adresse' : ''].filter(Boolean).join(', ')));
console.log('\n' + lignes.length + ' fiches (hors versions EN) — dry run, aucun fichier du dépôt modifié.');
if (mapPath && !args.includes('--appliquer')) { fs.writeFileSync(mapPath, JSON.stringify(lignes, null, 2)); console.log('Mapping écrit dans ' + mapPath); }
