// Le fichier combiné « lots 1 à 5 » s'exécute d'un bloc, deux fois de suite (rejouable), sur un vrai Postgres (PGlite).
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const A1 = '11111111-1111-1111-1111-111111111111';
const db = new PGlite();
await db.exec(`create schema auth; create role anon; create role authenticated; create schema extensions;
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('app.uid', true),'')::uuid $$;
create table auth.users(id uuid primary key);
create table public.agent_fiches(agent_user_id uuid, filename text unique, label text);
create table public.fiche_views(id bigserial primary key, client_nom text, bien_adresse text, evenement text, fiche_path text, agent_id uuid, created_at timestamptz default now());
grant usage on schema public, auth to anon, authenticated; grant select on public.agent_fiches to authenticated;`);
const rd = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
await db.exec(rd('supabase-agent-profiles.sql').replace(/create policy/g, '-- create policy').replace(/^\s*on public\.agent_profiles.*$/gm, '').replace(/^\s*(to|using|with check).*$/gm, '').replace(/^-- create policy.*\n/gm, ''));
await db.exec(rd('supabase-fiche-sessions.sql'));
// pg_cron n'existe pas dans PGlite : on retire uniquement les blocs de rétention (testés par ailleurs sur Supabase)
const all = rd('supabase-appliquer-lots-1-a-5.sql').split('\n').filter(l => !/pg_cron|cron\.(un)?schedule/.test(l)).join('\n');
await db.exec(all); await db.exec(all);
const fns = (await db.query(`select proname from pg_proc where pronamespace = 'public'::regnamespace and proname in ('fiche_question','fiche_demande_documents','fiche_retour','vendeur_rapport') order by 1`)).rows.map(r => r.proname);
if (fns.length !== 4) { console.log('ÉCHEC fonctions manquantes', fns); process.exit(1); }
console.log('OK sql lots 1-5 : exécution complète, rejouable');
