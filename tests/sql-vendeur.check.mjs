// Vérifie supabase-vendeur.sql (+ tables des lots précédents) sur un vrai moteur Postgres (PGlite).
// Usage : npm i --no-save @electric-sql/pglite && node tests/sql-vendeur.check.mjs
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const rd = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8').split('-- Rétention : suppression automatique après 12 mois (à exécuter')[0];
const db = new PGlite();
const A1 = '11111111-1111-1111-1111-111111111111', A2 = '22222222-2222-2222-2222-222222222222';
await db.exec(`
create schema auth; create role anon; create role authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;   -- comme Supabase : ce sont les politiques RLS qui protègent
grant usage on schema public to anon, authenticated;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('app.uid', true),'')::uuid $$;
insert into auth.users values ('${A1}'), ('${A2}');
create table public.agent_fiches(agent_user_id uuid, filename text unique, label text);
create table public.fiche_views(id bigserial primary key, client_nom text, bien_adresse text, evenement text, fiche_path text, agent_id uuid, created_at timestamptz default now());
alter table public.fiche_views enable row level security;
grant usage on schema public, auth to anon, authenticated; grant select on public.agent_fiches to authenticated;
insert into public.agent_fiches values ('${A1}','a-FINAL.html','12 rue des Lilas 91300 Massy'), ('${A2}','b-FINAL.html','1 rue B');`);
await db.exec(rd('supabase-agent-profiles.sql').replace(/create policy/g, '-- create policy').replace(/^\s*on public\.agent_profiles.*$/gm, '').replace(/^\s*(to|using|with check).*$/gm, '').replace(/^-- create policy.*\n/gm, ''));
for (const f of ['supabase-fiche-sessions.sql', 'supabase-fiche-questions.sql', 'supabase-fiche-documents.sql', 'supabase-vendeur.sql']) await db.exec(rd(f));
await db.exec(`grant select on public.agent_profiles to authenticated; insert into public.agent_profiles(user_id, prenom, nom, tel, email, photo_url, reseau, rdv_url, color_primary) values ('${A1}','Olivier','Loison','0600000000','o@x.fr','https://p/x.jpg','Expertimo','https://rdv','#123456');`);
let bad = 0; const ok = (c, m) => { if (!c) { console.log('ÉCHEC', m); bad++; process.exitCode = 1; } else console.log('ok', m); };
const P = '/fiches/a-FINAL.html', ago = d => `now() - interval '${d} days'`;
const ev = (n, e, d) => db.exec(`insert into public.fiche_views(client_nom, evenement, fiche_path, created_at) values ('${n}','${e}','${P}', ${ago(d)})`);
// Marie : 4 visites, simulation ; Paul : 1 visite ; anonymes : 2 ; visites d'une autre fiche
for (const d of [20, 9, 3, 1]) await ev('Marie Dupont', 'fiche_ouverte', d);
await ev('Marie Dupont', 'credit_simule', 1); await ev('Paul Martin', 'fiche_ouverte', 2); await ev('inconnu', 'fiche_ouverte', 2); await ev('anonyme', 'fiche_ouverte', 40);
await db.exec(`insert into public.fiche_views(client_nom, evenement, fiche_path) values ('Autre','fiche_ouverte','/fiches/b-FINAL.html')`);
await db.exec(`insert into public.fiche_sessions(session_id, fiche_path, client_nom, duree_sec, onglets, started_at) values
 ('s1aaaaaaaa','${P}','Marie Dupont', 600, '{"budget":300,"documents":200,"bien":100}', ${ago(3)}), ('s2aaaaaaaa','${P}','Marie Dupont', 420, '{"budget":400,"quartier":20}', ${ago(1)}), ('s3aaaaaaaa','${P}','Paul Martin', 60, '{"bien":60}', ${ago(2)})`);
await db.exec(`insert into public.fiche_questions(fiche_path, client_nom, question) values ('${P}','Marie Dupont','Les charges incluent le chauffage ?'), ('${P}','Marie Dupont','Quel est le prix minimum accepté ?'), ('${P}','Paul Martin','Y a-t-il une école proche du quartier ?'), ('${P}','Paul Martin','Bonjour')`);
await db.exec(`insert into public.fiche_demandes_documents(fiche_path, client_nom, docs) values ('${P}','Marie Dupont','{"DPE (diagnostic de performance énergétique)","Diagnostic amiante","Procès-verbaux des 3 dernières assemblées générales"}'), ('${P}','Paul Martin','{"DPE (diagnostic de performance énergétique)","<img src=x onerror=alert(1)>"}')`);
// liens
await db.exec(`set role authenticated; set app.uid='${A1}'`);
await db.exec(`insert into public.vendeur_liens(agent_user_id, filename, note, note_at) values ('${A1}','a-FINAL.html','Deux visites cette semaine, relance prévue.', now())`);
const tok = (await db.query(`select token from public.vendeur_liens`)).rows[0].token;
ok(/^[0-9a-f]{96}$/.test(tok), 'jeton aléatoire généré par la base (96 hex)');
let err = false; try { await db.exec(`insert into public.vendeur_liens(agent_user_id, filename) values ('${A1}','b-FINAL.html')`); } catch (e) { err = true; } ok(err, 'agent 1 ne peut pas créer un lien pour la fiche de l\'agent 2');
err = false; try { await db.exec(`insert into public.vendeur_liens(agent_user_id, filename) values ('${A2}','b-FINAL.html')`); } catch (e) { err = true; } ok(err, 'agent 1 ne peut pas créer un lien au nom de l\'agent 2');
err = false; try { await db.exec(`insert into public.vendeur_liens(token, agent_user_id, filename) values ('${'a'.repeat(64)}','${A1}','a-FINAL.html')`); } catch (e) { err = true; } ok(err, 'jeton imposé par l\'agent refusé');
err = false; try { await db.exec(`insert into public.vendeur_liens(agent_user_id, filename) values ('${A1}','a-FINAL.html')`); } catch (e) { err = true; } ok(err, 'un seul lien actif par bien');
err = false; try { await db.exec(`update public.vendeur_liens set filename='b-FINAL.html'`); } catch (e) { err = true; } ok(err, 'filename non modifiable');
await db.exec(`reset role; set role anon`);
const rap = (await db.query(`select public.vendeur_rapport($1) as r`, [tok])).rows[0].r;
const raw = JSON.stringify(rap);
ok(rap.ok === true && rap.bien === '12 rue des Lilas 91300 Massy', 'rapport valide pour anon');
ok(rap.totaux.acquereurs === 2 && rap.totaux.anonymes === 2 && rap.totaux.visites === 7 && rap.totaux.simulations === 1, 'totaux : ' + JSON.stringify(rap.totaux));
ok(rap.totaux.minutes === 18 && rap.totaux.docs === 5 && rap.totaux.questions === 4, 'minutes/docs/questions : ' + JSON.stringify(rap.totaux));
ok(rap.semaine.visites === 4 && rap.semaine.visites_prec === 1 && rap.semaine.acquereurs === 2, 'semaine : ' + JSON.stringify(rap.semaine));
ok(rap.courbe.length === 8 && rap.courbe.reduce((s, x) => s + x.visites, 0) === 7, 'courbe 8 semaines (toutes les ouvertures des 8 dernières semaines) : ' + rap.courbe.map(x => x.visites));
ok(rap.acquereurs.length === 2 && rap.acquereurs[0].niveau === 'tres' && rap.acquereurs[1].niveau === 'interesse', 'niveaux : ' + JSON.stringify(rap.acquereurs.map(a => [a.lettre, a.niveau])));
ok(rap.acquereurs.map(a => a.lettre).sort().join('') === 'AB' && rap.acquereurs.find(a => a.lettre === 'A').visites === 4, 'lettres selon l\'ordre de première venue (Marie = A)');
ok(rap.onglets[0].id === 'budget' && rap.onglets[0].pct >= 60, 'onglets : ' + JSON.stringify(rap.onglets));
const th = Object.fromEntries(rap.themes.map(t => [t.theme, t.n]));
ok(th['Charges et coût du bien'] === 1 && th['Prix et négociation'] === 1 && th['Quartier et environnement'] === 1 && th['Autres questions'] === 1, 'thèmes : ' + JSON.stringify(th));
ok(rap.docs_top[0].doc === 'DPE / audit énergétique' && rap.docs_top[0].n === 2 && rap.docs_top.every(d => !/img|onerror/.test(d.doc)), 'documents les plus demandés (libellés fixes) : ' + JSON.stringify(rap.docs_top));
ok(rap.docs_top.some(d => d.doc === 'Autres documents'), 'texte libre forgé regroupé sous « Autres documents »');
ok(Array.isArray(rap.activite) && rap.activite.length > 0 && rap.activite.every(a => /^[A-Z]$/.test(a.lettre)), 'fil d\'activité présent : ' + rap.activite.length);
const act = t => rap.activite.filter(a => a.type === t);
ok(act('documents').some(a => a.lettre === 'A' && /Diagnostic amiante/.test(a.detail)), 'activité : documents demandés par A (amiante)');
ok(act('rubrique').some(a => a.lettre === 'A' && a.detail === 'budget' && a.sec >= 60) && !act('rubrique').some(a => a.detail === 'bien' || a.detail === 'quartier'), 'activité : rubriques pertinentes ≥ 1 min uniquement (pas « bien », pas 20 s de quartier)');
ok(act('question').some(a => a.detail === 'Prix et négociation') && !/chauffage|prix minimum|école proche/.test(JSON.stringify(rap.activite)), 'activité : questions par thème, jamais le texte');
ok(act('simulation').length === 1 && act('ouverture').length >= 3, 'activité : simulation et ouvertures');
ok(rap.activite.every(a => /^\d{4}-\d\d-\d\d$/.test(a.jour) && ['matin', 'apres-midi'].includes(a.moment) && !('at' in a)), 'activité : jour + demi-journée, aucune heure exacte');
ok(rap.activite.every((a, i, t) => !i || t[i - 1].jour >= a.jour), 'activité triée du plus récent au plus ancien (par jour)');
ok(rap.note.startsWith('Deux visites') && rap.agent.nom === 'Olivier Loison' && rap.agent.tel === '0600000000', 'note et agent');
ok(!/Marie|Dupont|Paul|Martin|chauffage|prix minimum|école proche|@/.test(raw.replace('o@x.fr', '')), 'AUCUN nom ni texte de question dans le rapport');
for (const t of [null, '', 'abc', 'a'.repeat(64), tok.slice(0, 95) + 'g', tok + 'ff']) { const r = (await db.query(`select public.vendeur_rapport($1) as r`, [t])).rows[0].r; if (r.ok !== false || Object.keys(r).length !== 1) { ok(false, 'jeton invalide ' + t); } }
ok(true, 'jetons invalides / inconnus : {ok:false} sans détail');
for (const t of ['public.vendeur_liens', 'public.fiche_views', 'public.fiche_sessions', 'public.fiche_questions', 'public.fiche_demandes_documents']) { err = false; let n = -1; try { n = (await db.query(`select * from ${t}`)).rows.length; } catch (e) { err = true; } ok(err || n === 0, 'anon : lecture directe impossible (RLS) sur ' + t); }
err = false; try { await db.exec(`insert into public.vendeur_liens(agent_user_id, filename) values ('${A1}','b-FINAL.html')`); } catch (e) { err = true; } ok(err, 'anon : insertion directe refusée');
await db.exec(`reset role; set role authenticated; set app.uid='${A2}'`);
ok((await db.query(`select * from public.vendeur_liens`)).rows.length === 0, 'agent 2 ne voit pas les liens de l\'agent 1');
await db.exec(`update public.vendeur_liens set revoked_at = now()`); await db.exec(`reset role; set role authenticated; set app.uid='${A1}'`);
ok((await db.query(`select revoked_at from public.vendeur_liens`)).rows[0].revoked_at === null, 'agent 2 ne peut pas révoquer le lien de l\'agent 1');
await db.exec(`update public.vendeur_liens set revoked_at = now(), note = 'x'`);
await db.exec(`reset role; set role anon`);
const rev = (await db.query(`select public.vendeur_rapport($1) as r`, [tok])).rows[0].r; ok(rev.ok === false && Object.keys(rev).length === 1, 'lien révoqué : {ok:false}');
await db.exec(`reset role; set role authenticated; set app.uid='${A1}'`);
await db.exec(`insert into public.vendeur_liens(agent_user_id, filename) values ('${A1}','a-FINAL.html')`); ok(true, 'nouveau lien possible après révocation');
await db.exec(`reset role`);
await db.exec(`insert into public.fiche_views(client_nom, evenement, fiche_path) values ('Zoé','fiche_ouverte','/fiches/a-EN-FINAL.html')`);
await db.exec(`set role anon`);
const tok2 = (await db.query(`select token from public.vendeur_liens where revoked_at is null`)).rows;
await db.exec(`reset role; set role authenticated; set app.uid='${A1}'`);
const tk = (await db.query(`select token from public.vendeur_liens where revoked_at is null`)).rows[0].token; await db.exec(`reset role; set role anon`);
const r2 = (await db.query(`select public.vendeur_rapport($1) as r`, [tk])).rows[0].r;
ok(r2.totaux.visites === 8 && r2.totaux.acquereurs === 3, 'les visites de la version anglaise (-EN-FINAL) comptent : ' + JSON.stringify(r2.totaux));
console.log(bad ? bad + ' échec(s)' : 'OK sql vendeur');
