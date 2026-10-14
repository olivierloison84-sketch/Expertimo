// Inscription obligatoire des fiches : api/fiche-publish.js (inscrire avant publier, annuler si GitHub échoue)
// et scripts/inscrire-fiche.js (agent_fiches + fiche_private). Supabase et GitHub simulés.
const Module = require('module'), fs = require('fs'), path = require('path');
let fail = 0; const ok = (c, m) => { console.log(c ? 'ok' : 'FAIL', m); if (!c) fail++; };

// --- Faux Supabase : tables en mémoire, option d'échec par table
const T = { agents: [{ id: 'A1', subscription_status: 'active' }], agent_fiches: [], fiche_private: [] };
const FAIL = {};
function from(t) {
  let f = [], op = 'select', row = null;
  const o = {
    select() { return o; }, eq(k, v) { f.push([k, v]); return o; },
    upsert(r) { op = 'upsert'; row = r; return o; }, delete() { op = 'delete'; return o; },
    maybeSingle() { return Promise.resolve(run(true)); },
    then(res, rej) { return Promise.resolve(run(false)).then(res, rej); }
  };
  function run(single) {
    if (FAIL[t + ':' + op]) return { data: null, error: { message: 'panne ' + t } };
    const match = r => f.every(([k, v]) => r[k] === v);
    if (op === 'upsert') { const i = T[t].findIndex(r => (t === 'agent_fiches' ? r.filename === row.filename : r.agent_user_id === row.agent_user_id && r.filename === row.filename)); if (i >= 0) T[t][i] = Object.assign({}, T[t][i], row); else T[t].push(Object.assign({}, row)); return { error: null }; }
    if (op === 'delete') { T[t] = T[t].filter(r => !match(r)); return { error: null }; }
    const d = T[t].filter(match); return { data: single ? (d[0] || null) : d, error: null };
  }
  return o;
}
const client = { auth: { getUser: async () => ({ data: { user: { id: 'A1' } } }) }, from };

let githubOk = true; const puts = [];
global.fetch = async (url, opt) => { if (opt && opt.method === 'PUT') puts.push(url); return { ok: githubOk || !(opt && opt.method === 'PUT'), status: githubOk ? 200 : 500, json: async () => (githubOk ? {} : { message: 'GitHub KO' }) }; };
const fake = { '@supabase/supabase-js': { createClient: () => client } };
const orig = Module._load; Module._load = function (r, ...a) { return fake[r] || orig.call(this, r, ...a); };
process.env.SUPABASE_SECRET_KEY = 'k'; process.env.GITHUB_TOKEN = 't';
const handler = require('../api/fiche-publish.js');

const call = async (body) => { const r = { code: 0, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; }, end() { return r; }, setHeader() {} };
  await handler({ method: 'POST', headers: { origin: 'https://app.privency.fr', authorization: 'Bearer j' }, body }, r); return r; };

(async () => {
  const body = { filename: 'x-maison-abc123-FINAL.html', html: '<html></html>', label: '1 rue X' };
  // 1) cas nominal : inscrite ET publiée
  let r = await call(body);
  ok(r.code === 200 && T.agent_fiches.length === 1 && puts.length === 1, 'publication nominale : inscrite puis publiée');
  // 2) inscription en échec : rien n'est publié, message clair
  T.agent_fiches = []; puts.length = 0; FAIL['agent_fiches:upsert'] = true;
  r = await call(body);
  ok(r.code === 500 && puts.length === 0 && /NON publiée/.test(r.body.error) && r.body.code === 'inscription_echouee', 'inscription KO : aucune publication GitHub, message « NON publiée »');
  delete FAIL['agent_fiches:upsert'];
  // 3) GitHub en échec sur une nouvelle fiche : la ligne créée est retirée
  githubOk = false; r = await call(body);
  ok(r.code === 502 && T.agent_fiches.length === 0 && /NON publiée/.test(r.body.error), 'GitHub KO (nouvelle fiche) : ligne agent_fiches annulée');
  // 4) GitHub en échec sur une fiche déjà inscrite : la ligne existante est conservée
  T.agent_fiches = [{ agent_user_id: 'A1', filename: body.filename, label: 'ancienne' }];
  r = await call(body);
  ok(r.code === 502 && T.agent_fiches.length === 1, 'GitHub KO (fiche existante) : ligne conservée');
  githubOk = true;

  // --- scripts/inscrire-fiche.js
  const S = require('../scripts/inscrire-fiche.js');
  const AG = '79e4e432-2232-4d2c-b41d-8c7c907c4dec';
  const orig1 = 'longjumeau-maison-4djdau-FINAL.html', copie = 'longjumeau-maison-n5tiuz-FINAL.html';
  T.agent_fiches = [{ agent_user_id: AG, filename: orig1, label: '41 rue du Four à Pain' }];
  T.fiche_private = [{ agent_user_id: AG, filename: orig1, data: { _rawState: { x: 1 } } }];
  let res = await S.inscrire(client, { fichier: 'fiches/' + copie, depuis: 'fiches/' + orig1 });
  ok(res.ok && T.agent_fiches.some(x => x.filename === copie && x.agent_user_id === AG && x.label === '41 rue du Four à Pain'), 'script : agent_fiches inscrite (agent lu dans le HTML, libellé de la source)');
  ok(T.fiche_private.some(x => x.filename === copie && x.data._rawState.x === 1), 'script : fiche_private copiée depuis la source');
  res = await S.inscrire(client, { fichier: 'fiches/massy-maison-yd2yh7-FINAL.html', sansPrive: true });
  ok(res.ok && T.agent_fiches.some(x => x.filename === 'massy-maison-yd2yh7-FINAL.html'), 'script : --sans-prive inscrit seulement agent_fiches');
  res = await S.inscrire(client, { fichier: 'fiches/longjumeau-appartement-b5c7sb-FINAL.html' });
  ok(!res.ok && res.avertissements.length === 1, 'script : sans --depuis ni --sans-prive, fiche_private absente est signalée (échec)');
  res = await S.inscrire(client, { fichier: 'fiches/linas-91310-FINAL.html', dryRun: true });
  ok(res.dryRun && !T.agent_fiches.some(x => x.filename === 'linas-91310-FINAL.html'), 'script : --dry-run n\'écrit rien');
  let err = null; try { await S.inscrire(client, { fichier: 'fiches/inexistante-FINAL.html' }); } catch (e) { err = e; }
  ok(err && /introuvable/.test(err.message), 'script : fiche absente du dossier refusée');
  const manq = await S.verifier(client);
  ok(manq.includes('linas-91310-FINAL.html') && !manq.includes(copie), '--verifier : liste les fiches non inscrites');
  ok(!S.estFicheFR('a-EN-FINAL.html') && S.estFicheFR('a-FINAL.html'), 'versions -EN ignorées');
  process.exit(fail ? 1 : 0);
})();
