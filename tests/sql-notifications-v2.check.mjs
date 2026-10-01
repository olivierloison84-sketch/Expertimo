// Vérifie supabase-notifications-v2.sql sur un vrai Postgres (PGlite) : 4 types d'alertes, « très chaud » une seule fois, plafond 3/jour, offre jamais bloquée, résumé du lundi.
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
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
await db.exec(v2); await db.exec(v2);   // rejouable
let bad = 0; const ok = (c, m) => { if (!c) { console.log('ÉCHEC', m); bad++; process.exitCode = 1; } else console.log('ok', m); };
await db.exec(`insert into public.agent_profiles(user_id, prenom, email) values ('${A1}','Olivier','o@x.fr'), ('${A2}','Zoé','z@x.fr');
  insert into public.agent_notif_prefs(user_id, alertes_actives, resume_lundi) values ('${A1}', true, true), ('${A2}', false, false);`);
const P = '/fiches/a-FINAL.html';
const ev = (n, e, mins, p = P) => db.exec(`insert into public.fiche_views(client_nom, evenement, fiche_path, created_at) values ('${n}','${e}','${p}', now() - interval '${mins} minutes')`);
const sess = (n, sec, mins, p = P) => db.exec(`insert into public.fiche_sessions(session_id, fiche_path, client_nom, duree_sec, started_at) values (gen_random_uuid()::text,'${p}','${n}',${sec}, now() - interval '${mins} minutes')`);
const asSvc = async f => { await db.exec(`reset role; set role service_role`); const r = await f(); await db.exec(`reset role`); return r; };
const due = () => asSvc(async () => (await db.query(`select * from public.notif_alertes_dues()`)).rows);
const marque = async rows => asSvc(async () => { for (const x of rows) await db.query(`select public.notif_alerte_marque($1,$2)`, [x.agent_user_id, x.cle]); });

// droits
for (const role of ['anon', 'authenticated']) for (const fn of ['notif_alertes_dues()', 'notif_resume_dus()', `notif_scores('1 day')`, `notif_resume_marque('${A1}')`]) {
  await db.exec(`reset role; set role ${role}`); let denied = false; try { await db.query(`select * from public.${fn}`); } catch (e) { denied = true; } ok(denied, `${role} ne peut pas appeler ${fn}`);
}
await db.exec(`reset role`);

// une simple simulation ou 3 ouvertures : plus d'alerte
await ev('Sam', 'fiche_ouverte', 1500); await ev('Sam', 'fiche_ouverte', 600); await ev('Sam', 'fiche_ouverte', 3);
await ev('Paul', 'credit_simule', 5);
ok((await due()).length === 0, 'simulation seule / 3e ouverture seule : aucune alerte');

// très chaud : score >= 14 (4 visites = 8, 15 min = 10 → 18) atteint par l'activité récente
for (const m of [2000, 1500, 600]) await ev('Marie', 'fiche_ouverte', m); await ev('Marie', 'fiche_ouverte', 4); await sess('Marie', 900, 4);
let d = await due(); ok(d.length === 1 && d[0].type === 'tres_chaud' && d[0].client_nom === 'Marie' && /4 fois|min de lecture/.test(d[0].detail), 'acquéreur très chaud → une alerte avec le détail : ' + JSON.stringify(d.map(x => [x.type, x.detail])));
await marque(d); await ev('Marie', 'fiche_ouverte', 1);
ok((await due()).length === 0, 'très chaud : une seule fois par acquéreur et par bien');
// offre : jamais bloquée, pas de doublon « très chaud » en plus
await ev('Léo', 'offre_soumise', 3); await sess('Léo', 900, 3); for (const m of [100, 90, 80, 2]) await ev('Léo', 'fiche_ouverte', m);
d = await due(); ok(d.length === 1 && d[0].type === 'offre', 'offre : une seule alerte (pas de « très chaud » en doublon) : ' + d.map(x => x.type));
await marque(d);
// plafond 3 par jour (hors offre), par ordre d'importance
await db.exec(`insert into public.notif_alertes_envoyees(agent_user_id, cle) values ('${A1}','doc:old1')`);   // + « très chaud » de Marie déjà envoyé = 2 sur 3 aujourd'hui
await db.exec(`insert into public.fiche_demandes_documents(fiche_path, client_nom, docs) values ('${P}','Ana','{DPE}')`);
await db.exec(`insert into public.fiche_retours(fiche_path, client_nom, reponses) values ('${P}','Bob','{prix}')`);
for (const m of [2000, 1500, 600]) await ev('Zoe', 'fiche_ouverte', m); await ev('Zoe', 'fiche_ouverte', 2); await sess('Zoe', 900, 2);
d = await due(); ok(d.length === 1 && d[0].client_nom === 'Zoe' && d[0].type === 'tres_chaud',
  'plafond 3/jour : 2 déjà envoyées, la 3e va au plus important (très chaud avant documents et retour) : ' + d.map(x => x.client_nom + ':' + x.type).join(','));
await marque(d); ok((await due()).length === 0, 'plafond atteint : plus rien (documents et retour écartés)');
await ev('Max', 'offre_soumise', 1); d = await due(); ok(d.some(x => x.client_nom === 'Max' && x.type === 'offre'), 'une offre passe même quand le plafond est atteint');
// agent sans alertes activées, événements de plus de 30 min
await ev('Vieux', 'offre_soumise', 120); await ev('Zed', 'offre_soumise', 2, '/fiches/b-FINAL.html');
ok(!(await due()).some(x => x.client_nom === 'Vieux' || x.client_nom === 'Zed'), 'ni événement ancien, ni agent sans alertes');

// résumé du lundi
const rs = () => asSvc(async () => (await db.query(`select * from public.notif_resume_dus()`)).rows);
let r = await rs(); ok(r.length === 1 && r[0].agent_user_id === A1 && r[0].visites >= 5 && r[0].chauds.length >= 1 && r[0].chauds[0].client, 'résumé dû pour l\'agent qui l\'a activé : ' + JSON.stringify(r[0] && r[0].chauds));
ok(!r.some(x => x.agent_user_id === A2), 'résumé jamais envoyé à un agent qui ne l\'a pas activé');
await asSvc(() => db.query(`select public.notif_resume_marque($1)`, [A1])); ok((await rs()).length === 0, 'plus dû juste après l\'envoi');
await db.exec(`update public.agent_notif_prefs set resume_last_at = now() - interval '6 days' where user_id='${A1}'`); ok((await rs()).length === 1, 'de nouveau dû au bout de 6 jours');
// seulement des ouvertures, personne à rappeler ni à relancer : pas de résumé
await db.exec(`delete from public.fiche_views; delete from public.fiche_sessions; delete from public.fiche_retours; delete from public.fiche_demandes_documents`);
await ev('Solo', 'fiche_ouverte', 60); ok((await rs()).length === 0, 'rien à signaler (une ouverture seulement) : pas de résumé');
// rien à dire : pas de résumé
await db.exec(`delete from public.fiche_views; delete from public.fiche_sessions; delete from public.fiche_retours; delete from public.fiche_demandes_documents`);
ok((await rs()).length === 0, 'aucune activité : aucun résumé envoyé');
// silence
await ev('Pia', 'fiche_ouverte', 60 * 24 * 10); await ev('Pia', 'fiche_ouverte', 60 * 24 * 9); await ev('Pia', 'fiche_ouverte', 60 * 24 * 8); await sess('Pia', 600, 60 * 24 * 9);
await db.exec(`insert into public.fiche_views(client_nom, evenement, fiche_path, created_at) values ('Pia','credit_simule','${P}', now() - interval '9 days')`);
r = await rs(); ok(r.length === 1 && r[0].silences.length === 1 && r[0].silences[0].client === 'Pia' && r[0].silences[0].jours >= 8 && r[0].chauds.length === 0, 'silence détecté : ' + JSON.stringify(r[0] && r[0].silences));
console.log(bad ? bad + ' échec(s)' : 'OK sql notifications v2');
