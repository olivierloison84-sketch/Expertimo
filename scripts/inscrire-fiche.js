// Inscrit une fiche déjà présente dans fiches/ dans Supabase : agent_fiches (« Mes stats ») ET fiche_private (« Modifier »).
// À utiliser pour TOUTE fiche ajoutée au dépôt sans passer par le bouton « Publier » (copie sous lien court, renommage…).
//
//   SUPABASE_SECRET_KEY=... node scripts/inscrire-fiche.js fiches/NOUVELLE-FINAL.html --depuis fiches/ORIGINALE-FINAL.html
//   SUPABASE_SECRET_KEY=... node scripts/inscrire-fiche.js fiches/NOUVELLE-FINAL.html --sans-prive      (pas de données privées à copier)
//   SUPABASE_SECRET_KEY=... node scripts/inscrire-fiche.js --verifier                                  (liste les fiches non inscrites, ne bloque pas)
//
// Options : --depuis <fiche>  copie fiche_private depuis cette fiche (même agent) ; --label "..." libellé affiché ;
//           --agent <uuid>    agent propriétaire (sinon lu dans PRIVENCY_AGENT_ID du HTML ou déduit de --depuis) ; --dry-run  n'écrit rien.
const fs = require('fs'), path = require('path');
const SUPABASE_URL = 'https://hhqcumnatnslfjpsrmgb.supabase.co';
const ROOT = path.join(__dirname, '..');
const DIR_FICHES = path.join(ROOT, 'fiches');

const nomFichier = p => path.basename(String(p));
// Les versions anglaises (-EN) sont générées à la publication et ne sont pas inscrites séparément.
const estFicheFR = f => /\.html$/.test(f) && !/-EN-FINAL\.html$|-EN\.html$/.test(f);

function lireFiche(filename) {
  const html = fs.readFileSync(path.join(DIR_FICHES, filename), 'utf8');
  const agent = (html.match(/PRIVENCY_AGENT_ID = "([0-9a-f-]{36})"/) || [])[1] || null;
  const adr = (html.match(/<meta name="pv-adr" content="([^"]*)"/) || [])[1] || '';
  return { agent, adresse: adr.split(' · ')[0].trim() };
}

// client : client Supabase (clé service). Renvoie { ok, agentFiches, fichePrivee, avertissements[] }.
async function inscrire(client, opt) {
  const filename = nomFichier(opt.fichier), avert = [];
  if (!/^[A-Za-z0-9._-]+\.html$/.test(filename) || !estFicheFR(filename)) throw new Error('Nom de fiche invalide (fiche française attendue) : ' + filename);
  if (!fs.existsSync(path.join(DIR_FICHES, filename))) throw new Error('Fiche introuvable dans fiches/ : ' + filename);
  const info = lireFiche(filename);
  const source = opt.depuis ? nomFichier(opt.depuis) : null;

  let srcRow = null, srcPriv = null;
  if (source) {
    const r = await client.from('agent_fiches').select('agent_user_id,label').eq('filename', source).maybeSingle();
    if (r.error) throw new Error('lecture agent_fiches (source) : ' + r.error.message);
    srcRow = r.data;
    if (!srcRow) throw new Error('La fiche source n\'est pas inscrite dans agent_fiches : ' + source);
  }
  const agent = opt.agent || info.agent || (srcRow && srcRow.agent_user_id);
  if (!agent) throw new Error('Agent introuvable : passez --agent <uuid>');
  if (srcRow && srcRow.agent_user_id !== agent) throw new Error('La fiche source appartient à un autre agent');

  const ex = await client.from('agent_fiches').select('agent_user_id,label').eq('filename', filename).maybeSingle();
  if (ex.error) throw new Error('lecture agent_fiches : ' + ex.error.message);
  if (ex.data && ex.data.agent_user_id !== agent) throw new Error('Cette fiche est déjà inscrite pour un autre agent');
  const label = opt.label || (ex.data && ex.data.label) || (srcRow && srcRow.label) || info.adresse || filename;
  const ligne = { agent_user_id: agent, filename, label, published_url: 'https://espace.privency.fr/fiches/' + filename, updated_at: new Date().toISOString() };

  if (opt.dryRun) return { ok: true, dryRun: true, agentFiches: ligne, avertissements: avert };
  const up = await client.from('agent_fiches').upsert(ligne, { onConflict: 'filename' });
  if (up.error) throw new Error('écriture agent_fiches : ' + up.error.message);

  let fichePrivee = 'ignorée (--sans-prive)';
  if (!opt.sansPrive) {
    if (source) {
      const p = await client.from('fiche_private').select('data').eq('agent_user_id', agent).eq('filename', source).maybeSingle();
      if (p.error) throw new Error('lecture fiche_private (source) : ' + p.error.message);
      srcPriv = p.data;
    }
    if (srcPriv) {
      const w = await client.from('fiche_private').upsert({ agent_user_id: agent, filename, data: srcPriv.data, updated_at: new Date().toISOString() }, { onConflict: 'agent_user_id,filename' });
      if (w.error) throw new Error('écriture fiche_private : ' + w.error.message);
      fichePrivee = 'copiée depuis ' + source;
    } else {
      const e = await client.from('fiche_private').select('filename').eq('agent_user_id', agent).eq('filename', filename).maybeSingle();
      if (e.data) fichePrivee = 'déjà présente';
      else { fichePrivee = 'ABSENTE'; avert.push('Aucune ligne fiche_private pour cette fiche : « Modifier » ne restaurera pas le formulaire. Utilisez --depuis <fiche d\'origine> ou --sans-prive.'); }
    }
  }
  return { ok: avert.length === 0, agentFiches: ligne, fichePrivee, avertissements: avert };
}

// Fiches FR présentes dans fiches/ mais absentes de agent_fiches.
async function verifier(client) {
  const r = await client.from('agent_fiches').select('filename');
  if (r.error) throw new Error('lecture agent_fiches : ' + r.error.message);
  const inscrites = new Set((r.data || []).map(x => x.filename));
  // Les pages de redirection d'anciens liens (migration vers ville-type-code) ne sont pas des fiches à inscrire.
  const estRedirection = f => fs.readFileSync(path.join(DIR_FICHES, f), 'utf8').slice(0, 2000).includes('name="pv-redirect"');
  return fs.readdirSync(DIR_FICHES).filter(estFicheFR).filter(f => !inscrites.has(f)).filter(f => !estRedirection(f)).sort();
}

function lireArgs(argv) {
  const o = { fichier: null, verifier: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--verifier') o.verifier = true;
    else if (a === '--sans-prive') o.sansPrive = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--depuis') o.depuis = argv[++i];
    else if (a === '--label') o.label = argv[++i];
    else if (a === '--agent') o.agent = argv[++i];
    else if (!a.startsWith('--') && !o.fichier) o.fichier = a;
    else throw new Error('Option inconnue : ' + a);
  }
  return o;
}

async function main() {
  const o = lireArgs(process.argv.slice(2));
  if (!o.verifier && !o.fichier) { console.error('Usage : voir l\'en-tête de scripts/inscrire-fiche.js'); process.exit(2); }
  const gha = !!process.env.GITHUB_ACTIONS;
  if (!process.env.SUPABASE_SECRET_KEY) {
    const m = 'SUPABASE_SECRET_KEY absente : ' + (o.verifier ? 'vérification des inscriptions impossible.' : 'inscription impossible.');
    if (o.verifier) { console.log((gha ? '::warning::' : '') + m); return; }   // la vérification ne bloque jamais
    console.error(m); process.exit(1);
  }
  const client = require('@supabase/supabase-js').createClient(SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
  if (o.verifier) {
    try {
      const manquantes = await verifier(client);
      if (!manquantes.length) { console.log('OK : toutes les fiches de fiches/ sont inscrites dans agent_fiches.'); return; }
      manquantes.forEach(f => console.log((gha ? '::warning file=fiches/' + f + '::' : 'ATTENTION : ') + 'fiche non inscrite dans agent_fiches (invisible dans « Mes stats ») : ' + f + ' → node scripts/inscrire-fiche.js fiches/' + f + ' --depuis <fiche d\'origine>'));
    } catch (e) { console.log((gha ? '::warning::' : 'ATTENTION : ') + 'vérification impossible : ' + e.message); }
    return;
  }
  try {
    const r = await inscrire(client, o);
    console.log((r.dryRun ? '[dry-run] ' : '') + 'agent_fiches : ' + (r.dryRun ? 'à écrire ' : 'inscrite ') + JSON.stringify(r.agentFiches));
    if (!r.dryRun) console.log('fiche_private : ' + r.fichePrivee);
    r.avertissements.forEach(w => console.error('ATTENTION : ' + w));
    if (!r.ok) process.exit(1);
  } catch (e) { console.error('ÉCHEC : ' + e.message); process.exit(1); }
}

module.exports = { inscrire, verifier, estFicheFR, lireArgs };
if (require.main === module) main();
