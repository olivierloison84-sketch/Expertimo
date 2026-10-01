// Vérifie supabase-notifications.sql sur un vrai Postgres (PGlite) : fonctions « dues », dédoublonnage, plafond, droits, désinscription.
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
const sql = rd('supabase-notifications.sql').split('-- Planification (pg_cron)')[0];
await db.exec(sql); await db.exec(sql);
let bad = 0; const ok = (c, m) => { if (!c) { console.log('ÉCHEC', m); bad++; process.exitCode = 1; } else console.log('ok', m); };
await db.exec(`insert into public.agent_profiles(user_id, prenom, email) values ('${A1}','Olivier','o@x.fr'), ('${A2}','Zoé','z@x.fr');
  grant select on public.agent_profiles to authenticated;`);
const P = '/fiches/a-FINAL.html', PB = '/fiches/b-FINAL.html';
const ev = (n, e, mins, p = P) => db.exec(`insert into public.fiche_views(client_nom, evenement, fiche_path, created_at) values ('${n}','${e}','${p}', now() - interval '${mins} minutes')`);
const due = async () => { await db.exec(`reset role; set role service_role`); const r = (await db.query(`select * from public.notif_alertes_dues()`)).rows; await db.exec(`reset role`); return r; };

// ── droits : fonctions réservées au service_role
for (const role of ['anon', 'authenticated']) for (const fn of ['notif_alertes_dues()', 'notif_digests_dues()', `notif_digest_marque('x')`, `notif_alerte_marque('${A1}','x')`]) {
  await db.exec(`reset role; set role ${role}`); let denied = false; try { await db.query(`select * from public.${fn}`); } catch (e) { denied = true; } ok(denied, `${role} ne peut pas appeler ${fn}`);
}
await db.exec(`reset role`);

// ── alertes : désactivées par défaut
await ev('Marie Dupont', 'offre_soumise', 5);
ok((await due()).length === 0, 'aucune alerte tant que l\'agent n\'a pas activé les alertes');
await db.exec(`set role authenticated; set app.uid='${A1}'`);
await db.exec(`insert into public.agent_notif_prefs(user_id, alertes_actives) values ('${A1}', true)`);
let denied = false; try { await db.exec(`insert into public.agent_notif_prefs(user_id, alertes_actives) values ('${A2}', true)`); } catch (e) { denied = true; } ok(denied, 'un agent ne peut pas activer les alertes d\'un autre');
await db.exec(`update public.agent_notif_prefs set alertes_actives = false where user_id = '${A2}'`);
await db.exec(`reset role; set role anon`); denied = false; try { await db.query('select * from public.agent_notif_prefs'); } catch (e) { denied = true; } ok(denied, 'anon : préférences illisibles');
await db.exec(`reset role`);
let d = await due(); ok(d.length === 1 && d[0].type === 'offre' && d[0].agent_email === 'o@x.fr' && d[0].client_nom === 'Marie Dupont' && d[0].bien === '12 rue des Lilas', 'offre transmise → alerte pour le bon agent : ' + JSON.stringify(d.map(x => x.type)));
// ── autres événements, fiche d'un agent sans alertes, anciens événements
await ev('Paul Martin', 'credit_simule', 10); await ev('Paul Martin', 'credit_simule', 8);
await ev('Zed', 'offre_soumise', 5, PB); await ev('Vieux', 'offre_soumise', 120);
await db.exec(`insert into public.fiche_demandes_documents(fiche_path, client_nom, docs) values ('${P}','Léa','{DPE}')`);
await db.exec(`insert into public.fiche_retours(fiche_path, client_nom, reponses) values ('${P}','Léa','{prix}')`);
d = await due(); const types = d.map(x => x.type).sort().join(',');
ok(types === 'documents,offre,retour_visite,simulation', 'offre + simulation (une par jour et par acquéreur) + documents + retour : ' + types);
ok(!d.some(x => x.client_nom === 'Zed' || x.client_nom === 'Vieux'), 'ni agent sans alertes, ni événement de plus de 30 minutes');
// ── 3e ouverture
for (const m of [1500, 600, 3]) await ev('Sam', 'fiche_ouverte', m);
d = await due(); ok(d.some(x => x.type === 'reouverture' && x.client_nom === 'Sam'), '3e ouverture en 48 h → alerte');
await ev('Tom', 'fiche_ouverte', 600); await ev('Tom', 'fiche_ouverte', 3); ok(!(await due()).some(x => x.client_nom === 'Tom'), '2 ouvertures seulement : pas d\'alerte');
await ev('inconnu', 'fiche_ouverte', 3); await ev('inconnu', 'fiche_ouverte', 2); await ev('inconnu', 'fiche_ouverte', 1); ok(!(await due()).some(x => x.client_nom === 'inconnu'), 'visiteurs anonymes jamais alertés');
// ── dédoublonnage
d = await due(); await db.exec(`reset role; set role service_role`);
for (const x of d) await db.query(`select public.notif_alerte_marque($1, $2)`, [x.agent_user_id, x.cle]);
await db.exec(`reset role`); ok((await due()).length === 0, 'chaque alerte n\'est envoyée qu\'une fois (marquage)');
// ── plafond 10 / jour
await db.exec(`reset role`);
for (let i = 0; i < 12; i++) await db.exec(`insert into public.fiche_views(client_nom, evenement, fiche_path, created_at) values ('Spam${i}','offre_soumise','${P}', now() - interval '2 minutes')`);
d = await due(); await db.exec(`reset role; set role service_role`);
for (const x of d.slice(0, 5)) await db.query(`select public.notif_alerte_marque($1, $2)`, [x.agent_user_id, x.cle]);
await db.exec(`reset role`);
const n = (await db.query(`select count(*)::int n from public.notif_alertes_envoyees where agent_user_id='${A1}'`)).rows[0].n;
ok(n + (await due()).length >= 10 && (await due()).length === 0 || n >= 10, 'plafond de 10 alertes par agent et par jour : ' + n + ' envoyées, ' + (await due()).length + ' restantes');

// ── point hebdomadaire vendeur
await db.exec(`set role authenticated; set app.uid='${A1}'`);
await db.exec(`insert into public.vendeur_liens(agent_user_id, filename) values ('${A1}','a-FINAL.html')`);
const tok = (await db.query(`select token from public.vendeur_liens`)).rows[0].token;
denied = false; try { await db.exec(`update public.vendeur_liens set digest_email = 'v@x.fr'`); } catch (e) { denied = true; } ok(denied, 'email vendeur refusé sans attestation d\'accord (CHECK)');
for (const bad of ['pas-un-email', 'a@b', 'x@y.fr, z@y.fr', 'x y@z.fr', '<a>@z.fr']) { denied = false; try { await db.exec(`update public.vendeur_liens set digest_email = '${bad}', digest_consent_at = now()`); } catch (e) { denied = true; } ok(denied, 'email invalide refusé : ' + bad); }
await db.exec(`update public.vendeur_liens set digest_email = 'vendeur@x.fr', digest_consent_at = now()`);
denied = false; try { await db.exec(`update public.vendeur_liens set digest_last_at = now()`); } catch (e) { denied = true; } ok(denied, 'l\'agent ne peut pas écrire digest_last_at');
await db.exec(`reset role; set role authenticated; set app.uid='${A2}'`);
await db.exec(`update public.vendeur_liens set digest_email = 'pirate@x.fr', digest_consent_at = now()`);
await db.exec(`reset role`); ok((await db.query(`select digest_email from public.vendeur_liens`)).rows[0].digest_email === 'vendeur@x.fr', 'un autre agent ne peut pas modifier le lien');
await db.exec(`set role service_role`);
let dd = (await db.query(`select * from public.notif_digests_dues()`)).rows; ok(dd.length === 1 && dd[0].email === 'vendeur@x.fr' && dd[0].token === tok, 'point dû (jamais envoyé)');
await db.query(`select public.notif_digest_marque($1)`, [tok]);
ok((await db.query(`select * from public.notif_digests_dues()`)).rows.length === 0, 'plus dû juste après l\'envoi');
await db.exec(`reset role; update public.vendeur_liens set digest_last_at = now() - interval '7 days'; set role service_role`);
ok((await db.query(`select * from public.notif_digests_dues()`)).rows.length === 1, 'de nouveau dû au bout de 7 jours');
// ── désinscription par le vendeur (anon + jeton)
await db.exec(`reset role; set role anon`);
ok((await db.query(`select public.vendeur_digest_statut($1) as s`, [tok])).rows[0].s === true, 'statut : abonné');
ok((await db.query(`select public.vendeur_digest_stop($1) as s`, ['a'.repeat(64)])).rows[0].s === false, 'désinscription : jeton inconnu refusé');
ok((await db.query(`select public.vendeur_digest_stop($1) as s`, [tok])).rows[0].s === true, 'désinscription par le vendeur');
await db.exec(`reset role`);
const row = (await db.query(`select digest_email, digest_consent_at from public.vendeur_liens`)).rows[0]; ok(row.digest_email === null && row.digest_consent_at === null, 'email et accord effacés');
await db.exec(`set role anon`); ok((await db.query(`select public.vendeur_digest_statut($1) as s`, [tok])).rows[0].s === false, 'statut : plus abonné');
await db.exec(`reset role; set role service_role`); ok((await db.query(`select * from public.notif_digests_dues()`)).rows.length === 0, 'plus aucun point dû après désinscription');
console.log(bad ? bad + ' échec(s)' : 'OK sql notifications');
