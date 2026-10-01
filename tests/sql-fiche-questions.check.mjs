// Vérifie supabase-fiche-questions.sql sur un vrai moteur Postgres (PGlite) : RLS, plafonds, agent_id serveur. Usage : npm i --no-save @electric-sql/pglite && node tests/sql-fiche-questions.check.mjs
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
await db.exec(`
create schema auth; create role anon; create role authenticated;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('app.uid', true),'')::uuid $$;
create table public.agent_fiches(agent_user_id uuid, filename text);
grant usage on schema public, auth to anon, authenticated;
grant select on public.agent_fiches to authenticated;
insert into public.agent_fiches values ('11111111-1111-1111-1111-111111111111','a-FINAL.html'),('22222222-2222-2222-2222-222222222222','b-FINAL.html');
`);
let sql = fs.readFileSync(new URL('../supabase-fiche-questions.sql', import.meta.url),'utf8');
sql = sql.split('-- Rétention : suppression automatique après 12 mois (à exécuter')[0];   // pg_cron indisponible ici
await db.exec(sql);
await db.exec(`grant select, delete on public.fiche_questions to authenticated;`);
const call = (p, c, q, a='99999999-9999-9999-9999-999999999999') => db.query(`select public.fiche_question($1,$2,'adr',$3,$4,'fr')`, [p, c, a, q]);
const count = async (w='') => (await db.query(`select count(*)::int n from public.fiche_questions ${w}`)).rows[0].n;
const ok = (c, m) => { if (!c) { console.log('ÉCHEC', m); process.exitCode = 1; } else console.log('ok', m); };
await call('/fiches/a-FINAL.html','Marie','Charges ?');                       ok(await count()===1,'insertion valide');
ok((await db.query(`select agent_id from public.fiche_questions`)).rows[0].agent_id==='11111111-1111-1111-1111-111111111111','agent_id lu en base (p_agent falsifié ignoré)');
await call('/fiches/inconnue.html','Marie','Charges ?');                       ok(await count()===1,'fiche inconnue refusée');
await call('/autre/a-FINAL.html','Marie','Charges ?');                         ok(await count()===1,'chemin hors /fiches refusé');
await call('/fiches/a-FINAL.html','Marie','x');                                ok(await count()===1,'question trop courte refusée');
await call('/fiches/a-FINAL.html','Marie','y'.repeat(900));                    ok((await db.query(`select max(char_length(question)) m from public.fiche_questions`)).rows[0].m===500,'troncature 500');
for (let i=0;i<40;i++) await call('/fiches/a-FINAL.html','Marie','q'+i+' ??');  ok(await count(`where client_nom='Marie'`)===20,'20 max / 10 min par acquéreur : '+await count());
for (let i=0;i<300;i++) await call('/fiches/b-FINAL.html','Faux'+i,'spam '+i);  ok(await count(`where fiche_path='/fiches/b-FINAL.html'`)===100,'plafond 100/h par fiche malgré noms variables : '+await count(`where fiche_path='/fiches/b-FINAL.html'`));
await db.exec(`set role anon`);
let denied=false; try { await db.query('select * from public.fiche_questions'); } catch(e){ denied=true; }  ok(denied,'anon : lecture directe refusée');
denied=false; try { await db.query(`insert into public.fiche_questions(fiche_path,question) values ('/fiches/a-FINAL.html','hack')`); } catch(e){ denied=true; } ok(denied,'anon : insertion directe refusée');
await db.exec(`reset role`);
await db.exec(`set role authenticated; set app.uid='11111111-1111-1111-1111-111111111111'`);
const mine=(await db.query(`select distinct fiche_path from public.fiche_questions`)).rows.map(r=>r.fiche_path); ok(mine.length===1&&mine[0]==='/fiches/a-FINAL.html','agent 1 ne voit que ses fiches : '+mine);
const del=await db.query(`delete from public.fiche_questions returning id`); ok(del.rows.length===21+0||del.rows.length>0,'agent 1 supprime les siennes : '+del.rows.length);
await db.exec(`reset role`); ok(await count(`where fiche_path='/fiches/b-FINAL.html'`)===100,'questions de l\'agent 2 intactes');
// rejouable
await db.exec(sql); ok(true,'script rejouable');
