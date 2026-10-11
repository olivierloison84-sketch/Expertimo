// Vérifie supabase-notifications-participation.sql sur un vrai Postgres (PGlite) : alertes « match du test » et « carnet de visite »,
// un seul e-mail par acquéreur et par fiche sur 24 h, rien pour les autres événements de participation (ni pour le partage de la fiche).
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
await db.exec(v2);
const part = rd('supabase-notifications-participation.sql');
await db.exec(part); await db.exec(part);   // rejouable
let bad = 0; const ok = (c, m) => { if (!c) { console.log('ÉCHEC', m); bad++; process.exitCode = 1; } else console.log('ok', m); };
await db.exec(`insert into public.agent_profiles(user_id, prenom, email) values ('${A1}','Olivier','o@x.fr'), ('${A2}','Zoé','z@x.fr');
  insert into public.agent_notif_prefs(user_id, alertes_actives, resume_lundi) values ('${A1}', true, false), ('${A2}', false, false);`);
const P = '/fiches/a-FINAL.html', ADR = '12 rue des Lilas · Expertimo';
const ev = (n, e, mins, p = P) => db.query(`insert into public.fiche_views(client_nom, bien_adresse, evenement, fiche_path, created_at) values ($1, $2, $3, $4, now() - ($5 || ' minutes')::interval)`, [n, ADR, e, p, String(mins)]);
const asSvc = async f => { await db.exec(`reset role; set role service_role`); const r = await f(); await db.exec(`reset role`); return r; };
const due = () => asSvc(async () => (await db.query(`select * from public.notif_alertes_dues()`)).rows);
const marque = async rows => asSvc(async () => { for (const x of rows) await db.query(`select public.notif_alerte_marque($1,$2)`, [x.agent_user_id, x.cle]); });
const crush = (o = {}) => 'crush_termine:' + JSON.stringify({ v: 1, m: 'solo', s: 89, c: ['quotidien'], w: ['dpe'], a: 'AAAABBAA', ...o });

for (const role of ['anon', 'authenticated']) for (const fn of ['notif_alertes_dues()', `notif_json('{}')`]) {
  await db.exec(`reset role; set role ${role}`); let denied = false; try { await db.query(`select * from public.${fn}`); } catch (e) { denied = true; } ok(denied, `${role} ne peut pas appeler ${fn}`);
}
await db.exec(`reset role`);

// autres événements de participation, partage de la fiche : aucune alerte
for (const e of ['visite_points:{"k":["bruit"]}', 'critere_choisi:{"k":"calme"}', 'mot_vendeur_coeur', 'fiche_partagee:{"c":"whatsapp"}', 'ouverture_partage:{"s":"x"}', 'onglet_crush', 'crush_termine', 'carnet_partage'])
  await ev('Marie', e, 2);
ok((await due()).length === 0, 'visite, critère, mot du vendeur, partage de la fiche, onglet : aucune alerte');

// match envoyé : une alerte, avec les données et l'adresse de la ligne Mes stats
await ev('Marie', crush(), 3);
let d = await due();
ok(d.length === 1 && d[0].type === 'crush' && d[0].client_nom === 'Marie' && d[0].bien === '12 rue des Lilas' && d[0].bien_adresse === ADR && JSON.parse(d[0].detail).s === 89, 'match envoyé → alerte « crush » : ' + JSON.stringify(d));
// le carnet de la même personne dans la foulée : un seul e-mail (le plus récent)
await ev('Marie', 'carnet_partage:{"c":["lumiere"],"ph":0}', 1);
d = await due(); ok(d.length === 1 && d[0].type === 'carnet', 'match + carnet de la même personne : un seul e-mail, le plus récent : ' + d.map(x => x.type));
await marque(d);
ok((await due()).length === 0, 'après envoi : plus rien pour cette personne');
await ev('Marie', crush({ s: 92 }), 0);
ok((await due()).length === 0, 'nouveau match de la même personne sur la même fiche dans les 24 h : pas de nouvel e-mail');
await db.exec(`update public.notif_alertes_envoyees set sent_at = now() - interval '25 hours'`);
d = await due(); ok(d.length === 1 && d[0].type === 'crush' && JSON.parse(d[0].detail).s === 92, 'au-delà de 24 h : de nouveau une alerte');
await marque(d);

await db.exec(`delete from public.notif_alertes_envoyees`);
// acquéreurs sans lien personnalisé : distingués par le prénom saisi ; JSON invalide toléré
await ev('inconnu', crush({ n: 'Léa' }), 2); await ev('inconnu', crush({ n: 'Tom' }), 2); await ev('inconnu', 'crush_termine:{pas du json', 2);
d = await due();
ok(d.length === 3 && d.filter(x => x.type === 'crush').length === 3 && d.some(x => x.detail === '{}'), 'anonymes : Léa, Tom et un envoi illisible → 3 alertes distinctes (plafond non atteint) : ' + d.map(x => x.cle).join(' '));
ok(d.every(x => x.cle.startsWith('part:/fiches/a-FINAL.html|')), 'clé par fiche et par acquéreur');

// plafond de 3 alertes par jour (hors offre), partagé avec les autres alertes
await marque(d); await ev('Nina', crush(), 1);
d = await due(); ok(d.length === 0, 'plafond de 3 alertes par jour atteint : la 3e alerte attend (même règle que les autres alertes) : ' + d.length);

// agent sans alertes, événement de plus de 30 min
await db.exec(`delete from public.notif_alertes_envoyees`);
await db.exec(`delete from public.fiche_views`);
await ev('Paul', crush(), 2, '/fiches/b-FINAL.html'); await ev('Vieux', crush(), 120);
ok((await due()).length === 0, 'ni agent sans alertes activées, ni envoi de plus de 30 min');
// version anglaise de la fiche : rattachée à l'agent
await ev('Eva', crush(), 1, '/fiches/a-EN-FINAL.html'); d = await due();
ok(d.length === 1 && d[0].client_nom === 'Eva', 'fiche anglaise rattachée à l\'agent');
// les alertes existantes fonctionnent toujours
await ev('Léo', 'offre_soumise', 1); d = await due(); ok(d.some(x => x.type === 'offre' && x.client_nom === 'Léo'), 'offre toujours alertée');
console.log(bad ? bad + ' échec(s)' : 'OK sql notifications participation');
