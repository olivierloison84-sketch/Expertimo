// Migration confidentialité des fiches déjà publiées (fiches/*.html).
//   node scripts/privacy-migrate-fiches.js extract   → .private-export/ (GITIGNORÉ) : JSON + migration SQL fiche_private
//   node scripts/privacy-migrate-fiches.js clean     → réécrit les fiches (blocs expertimo-data réduits à la liste blanche,
//                                                       référence de mandat remplacée par le slug) — À LANCER APRÈS l'import SQL
//   node scripts/privacy-migrate-fiches.js report    → log par fiche + recherche de chaînes sensibles résiduelles (sans écrire)
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), dir = path.join(root, 'fiches'), out = path.join(root, '.private-export');
const mode = process.argv[2] || 'report';
const app = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
const KEYS = JSON.parse('[' + app.match(/var PUBLIC_EMBED_KEYS = \[([\s\S]*?)\];/)[1].replace(/'/g, '"').replace(/\s+/g, ' ') + ']');
const SENSITIVE_IDS = ['proprio_prenom','proprio_nom','tel_mobile','tel_fixe','email_proprio','email','ref_mandat','raison_vente','prix_achat',
  'annee_achat','capital_restant','dette_montant','dette_echeance','banque','taux_pret','reloge_budget','reloge_type','reloge_delai','reloge_zone',
  'reloge_pieces','nb_offres','prix_offres','scenario_montant','scenario_reponse','q1','q2','q3','q4','q5','notes_libres','prochaines_etapes',
  'cles_chez','agences','date_r1','date_r2','vente_depuis','delai_vente','nb_visites','loyer_actuel_location','bien_fourchette_milieu','gh-token-input'];
const Q = String.fromCharCode(34);
const RE = id => new RegExp('(<script[^>]*id=' + Q + id + Q + '[^>]*>)([^]*?)(</script>)', 'i');
const pub = d => { const o = {}; KEYS.forEach(k => { if (d[k] !== undefined) o[k] = d[k]; }); if (d._rawState && d._rawState.photos) o._rawState = { photos: d._rawState.photos }; return o; };
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html')).sort();
const rows = [], log = [];
if (mode === 'extract' && !fs.existsSync(out)) fs.mkdirSync(out);
for (const f of files) {
  let html = fs.readFileSync(path.join(dir, f), 'utf8');
  const slug = f.replace(/-FINAL\.html$/, '').replace(/\.html$/, '');
  const m = html.match(RE('expertimo-data'));
  const agent = (html.match(/PRIVENCY_AGENT_ID = "([^"]+)"/) || [])[1] || null;
  if (!m) { log.push([f, 'ignorée', 'pas de bloc expertimo-data']); continue; }
  let d; try { d = JSON.parse(m[2]); } catch (e) { log.push([f, 'ignorée', 'JSON illisible']); continue; }
  const raw = d._rawState || {}, rawNoPhotos = {};
  Object.keys(raw).forEach(k => { if (k !== 'photos') rawNoPhotos[k] = raw[k]; });
  const priv = { ref: d.ref || '', fourchetBasse: d.fourchetBasse || 0, fourchetHaute: d.fourchetHaute || 0, _rawState: rawNoPhotos };
  const secrets = SENSITIVE_IDS.map(id => raw[id]).concat([d.ref]).filter(v => typeof v === 'string' && v.trim().length >= 4 && v !== 'ref-mandat');
  if (mode === 'extract') {
    fs.writeFileSync(path.join(out, f + '.private.json'), JSON.stringify({ filename: f, agent_user_id: agent, data: priv }, null, 1));
    rows.push({ f, agent, priv });
    log.push([f, 'extraite', 'agent=' + agent + ', ' + Object.keys(rawNoPhotos).length + ' champs privés']);
    continue;
  }
  // nettoyage (mode clean) ou simulation (report)
  html = html.replace(RE('expertimo-data'), (a, o, j, c) => o + JSON.stringify(pub(d)) + c);
  const me = html.match(RE('expertimo-data-en'));
  if (me) { try { const de = JSON.parse(me[2]); html = html.replace(RE('expertimo-data-en'), (a, o, j, c) => o + JSON.stringify(pub(de)) + c); } catch (e) { log.push([f, 'attention', 'bloc EN illisible']); } }
  if (d.ref && d.ref !== 'ref-mandat') html = html.split(d.ref).join(slug);
  const left = secrets.filter(s => html.includes(s));
  const before = fs.readFileSync(path.join(dir, f), 'utf8').length;
  if (left.length) { log.push([f, 'NON NETTOYÉE (chaînes résiduelles)', left.map(s => s.slice(0, 20)).join(' | ')]); continue; }
  if (mode === 'clean') fs.writeFileSync(path.join(dir, f), html);
  log.push([f, mode === 'clean' ? 'nettoyée' : 'nettoyable', before + ' → ' + html.length + ' octets, ' + secrets.length + ' valeurs sensibles absentes']);
}
if (mode === 'extract') {
  const q = s => "'" + String(s).replace(/'/g, "''") + "'";
  const sql = rows.filter(r => r.agent).map(r => 'insert into public.fiche_private (agent_user_id, filename, data) values (' + q(r.agent) + ', ' + q(r.f) + ', ' + q(JSON.stringify(r.priv)) + '::jsonb) on conflict (agent_user_id, filename) do update set data = excluded.data, updated_at = now();').join('\n');
  fs.writeFileSync(path.join(out, 'migration-fiche_private.sql'), sql + '\n');
}
log.forEach(l => console.log(l.join(' | ')));
