// Vérifie supabase-notifications-score-participation.sql sur un vrai Postgres (PGlite) : la participation compte dans le niveau d'intérêt,
// avec le même calcul que « Mes stats » (_clStats de app.html) ; le partage de la fiche ne compte jamais ; le résumé du lundi dit ce que l'acheteur a fait.
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import vm from 'vm';
const A1 = '11111111-1111-1111-1111-111111111111', A2 = '22222222-2222-2222-2222-222222222222';
const db = new PGlite();
await db.exec(`
create schema auth; create role anon; create role authenticated; create role service_role;
alter default privileges in schema public grant all on tables to anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('app.uid', true),'')::uuid $$;
insert into auth.users values ('${A1}'), ('${A2}');
create table public.agent_fiches(agent_user_id uuid, filename text unique, label text);
create table public.fiche_views(id bigserial primary key, client_nom text, bien_adresse text, evenement text, fiche_path text, agent_id uuid, created_at timestamptz default now());
alter table public.fiche_views enable row level security;
grant usage on schema auth to anon, authenticated; grant select on public.agent_fiches to authenticated;
insert into public.agent_fiches values ('${A1}','a-FINAL.html','12 rue des Lilas'), ('${A2}','b-FINAL.html','1 rue B');`);
const rd = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
await db.exec(rd('supabase-agent-profiles.sql').replace(/create policy/g, '-- create policy').replace(/^\s*on public\.agent_profiles.*$/gm, '').replace(/^\s*(to|using|with check).*$/gm, '').replace(/^-- create policy.*\n/gm, ''));
for (const f of ['supabase-fiche-sessions.sql', 'supabase-fiche-questions.sql', 'supabase-fiche-documents.sql', 'supabase-fiche-retours.sql', 'supabase-vendeur.sql']) await db.exec(rd(f).split('-- Rétention : suppression automatique après 12 mois (à exécuter')[0]);
await db.exec(rd('supabase-notifications.sql').split('-- Planification (pg_cron)')[0]);
const v2 = rd('supabase-notifications-v2.sql').split('-- Planification : résumé')[0];
await db.exec(v2);
await db.exec(rd('supabase-notifications-participation.sql'));
const sc = rd('supabase-notifications-score-participation.sql');
await db.exec(sc); await db.exec(sc);   // rejouable
let bad = 0; const ok = (c, m) => { if (!c) { console.log('ÉCHEC', m); bad++; process.exitCode = 1; } else console.log('ok', m); };
await db.exec(`insert into public.agent_profiles(user_id, prenom, email) values ('${A1}','Olivier','o@x.fr'), ('${A2}','Zoé','z@x.fr');
  insert into public.agent_notif_prefs(user_id, alertes_actives, resume_lundi) values ('${A1}', true, true), ('${A2}', false, false);`);
const P = '/fiches/a-FINAL.html';
const ev = (n, e, mins, p = P) => db.query(`insert into public.fiche_views(client_nom, evenement, fiche_path, created_at) values ($1, $2, $3, now() - ($4 || ' minutes')::interval)`, [n, e, p, String(mins)]);
const sess = (n, sec, mins) => db.exec(`insert into public.fiche_sessions(session_id, fiche_path, client_nom, duree_sec, started_at) values (gen_random_uuid()::text,'${P}','${n}',${sec}, now() - interval '${mins} minutes')`);
const asSvc = async f => { await db.exec(`reset role; set role service_role`); const r = await f(); await db.exec(`reset role`); return r; };
const scores = () => asSvc(async () => (await db.query(`select * from public.notif_scores('45 days')`)).rows);
const scoreDe = async n => { const r = (await scores()).find(x => x.client_nom === n); return r ? Number(r.score) : null; };

// Calcul de Mes stats (app.html), extrait tel quel
const app = fs.readFileSync(new URL('../app.html', import.meta.url), 'utf8');
const pick = (a, b) => { const i = app.indexOf(a); const j = app.indexOf(b, i); if (i < 0 || j < 0) throw new Error('app.html : ' + a); return app.slice(i, j); };
const ctx = {}; vm.createContext(ctx);
vm.runInContext(pick('var _CRUSH_NOM', 'var _EVT_LBL') + pick('var _CRITERE_LBL', 'var _CANAL_LBL') + pick('var _RETOUR_LBL', '/* Adresse affichée') + pick('function _clStats', '// Niveau d\'engagement') + pick('function _clLast', '// Variante du test'), ctx);
const appScore = (events, extra = {}) => { const g = { events: {}, payloads: {}, last: new Date().toISOString(), ...extra };
  events.forEach(e => { const m = /^([a-z_]+):(\{.*\})$/.exec(e), k = m ? m[1] : e; g.events[k] = (g.events[k] || 0) + 1; if (m) (g.payloads[k] = g.payloads[k] || []).push({ at: '', d: JSON.parse(m[2]) }); });
  return ctx._clStats(g, Date.now()).score; };

for (const role of ['anon', 'authenticated']) for (const fn of [`notif_scores('1 day')`, 'notif_resume_dus()']) {
  await db.exec(`reset role; set role ${role}`); let denied = false; try { await db.query(`select * from public.${fn}`); } catch (e) { denied = true; } ok(denied, `${role} ne peut pas appeler ${fn}`);
}
await db.exec(`reset role`);

// 1. Chaque action de participation, seule, comme dans Mes stats
const PART = { 'crush_termine:{"v":1,"m":"solo","s":88}': 3, 'carnet_partage:{"c":["lumiere"],"ph":0}': 3, 'visite_points:{"k":["bruit"]}': 2, 'critere_choisi:{"k":"calme"}': 1, 'mot_vendeur_coeur': 1,
  'fiche_partagee:{"c":"sms","s":"abc123","t":1}': 0, 'ouverture_partage:{"s":"abc123"}': 0 };
let i = 0;
for (const [e, poids] of Object.entries(PART)) {
  const n = 'Acheteur' + (++i);
  await ev(n, 'fiche_ouverte', 30); await ev(n, e, 20);
  const s = await scoreDe(n), a = appScore(['fiche_ouverte', e]);
  ok(s === 2 + poids && a === s, `${e.split(':')[0]} : +${poids} (SQL ${s}, Mes stats ${a})`);
}
// 2. Cumul et seuil « très chaud » (≥ 14) : même valeur que Mes stats, plafonds compris
const tout = ['fiche_ouverte', 'fiche_ouverte', 'retour_visite', ...Object.keys(PART)];
for (const e of tout) await ev('Léa', e, 10);
await db.exec(`insert into public.fiche_retours(fiche_path, client_nom, reponses) values ('${P}','Léa','{prix}')`); await sess('Léa', 300, 10);
const sLea = await scoreDe('Léa'), aLea = appScore(tout.filter(e => e !== 'retour_visite'), { retours: [{ reponses: ['prix'] }], dureeTotal: 300 });
ok(Math.abs(sLea - aLea) < 1e-9 && Math.abs(sLea - (4 + 5 / 1.5 + 3 + 3 + 3 + 2 + 1 + 1)) < 1e-9, `cumul identique à Mes stats : SQL ${sLea}, Mes stats ${aLea}`);
ok(sLea >= 14, 'la participation fait passer Léa « très chaud » (≥ 14)');
// alerte « très chaud » grâce à la participation (même seuil)
const al = await asSvc(async () => (await db.query(`select * from public.notif_alertes_dues()`)).rows);
const chaud = al.find(x => x.type === 'tres_chaud' && x.client_nom === 'Léa');
ok(chaud && /a fait Crush ou crash \?/.test(chaud.detail) && /a partagé son carnet/.test(chaud.detail), 'alerte « très chaud » : détail avec la participation : ' + (chaud && chaud.detail));
ok(!al.some(x => /partag(é|e) la fiche|ouverture/i.test(x.detail || '')), 'jamais le partage de la fiche dans le détail');
// 3. Partage seul : n'apporte rien ; anonyme : jamais compté
await ev('Paul', 'fiche_ouverte', 10); for (let k = 0; k < 5; k++) { await ev('Paul', 'fiche_partagee:{"c":"sms","s":"x' + k + '","t":0}', 5); await ev('Paul', 'ouverture_partage:{"s":"x' + k + '"}', 5); }
ok(await scoreDe('Paul') === 2, 'partage de la fiche et ouvertures par lien : 0 point');
await ev('inconnu', 'crush_termine:{"s":90}', 5); ok(await scoreDe('inconnu') === null, 'acheteur anonyme : non compté');
// 4. Résumé du lundi : ce que l'acheteur a fait, sans ouvertures, durée ni partage
const rs = await asSvc(async () => (await db.query(`select * from public.notif_resume_dus()`)).rows);
const lea = rs[0] && rs[0].chauds.find(c => c.client === 'Léa');
ok(lea && lea.niveau === 'très chaud' && lea.actions === 'a donné son retour de visite, a fait Crush ou crash ?, a partagé son carnet, a noté des points à vérifier en visite, a choisi son critère déterminant, a aimé le mot du vendeur', 'résumé : ' + JSON.stringify(lea));
ok(!JSON.stringify(rs).match(/fois sur la fiche|min de lecture|partag(é|e) la fiche|ouverture/), 'résumé : ni ouvertures, ni durée, ni partage de la fiche');
// 5. Seuils inchangés : intéressé ≥ 7 et actif ≤ 5 jours ; silence au-delà
await ev('Max', 'fiche_ouverte', 60 * 24 * 8); await ev('Max', 'crush_termine:{"s":70}', 60 * 24 * 8); await ev('Max', 'carnet_partage:{"c":[]}', 60 * 24 * 8);
const rs2 = await asSvc(async () => (await db.query(`select * from public.notif_resume_dus()`)).rows);
const max = rs2[0].silences.find(c => c.client === 'Max');
ok(max && max.jours >= 8 && /a fait Crush ou crash \?/.test(max.actions), 'silence (8 jours, score 8) avec ses actions : ' + JSON.stringify(max));
console.log(bad ? bad + ' échec(s)' : 'OK sql score participation');
