-- Notifications agent v2 — À EXÉCUTER après supabase-notifications.sql (rejouable).
-- Objectif : moins de mails, mais que des mails utiles.
--  • Alertes instantanées réduites à 4 types : offre (toujours envoyée), acquéreur « très chaud » (une seule fois par acquéreur et par bien),
--    documents demandés, retour de visite. Plus d'alerte pour une simple simulation ou une 3e ouverture (ces signaux alimentent le niveau
--    « très chaud » et le résumé du lundi).
--  • Plafond : 3 alertes par jour et par agent (l'offre n'est jamais comptée ni bloquée), par ordre d'importance.
--  • Résumé du lundi (nouveau, désactivé par défaut) : qui rappeler, qui est en silence, ouvertures de la semaine. Rien n'est envoyé s'il n'y a rien à dire.
-- Les fonctions « notif_* » ne sont exécutables que par le rôle service_role.

alter table public.agent_notif_prefs add column if not exists resume_lundi boolean not null default false;
alter table public.agent_notif_prefs add column if not exists resume_last_at timestamptz;

-- ───── Niveau d'engagement (même formule que « Mes stats » dans l'app) ─────
create or replace function public.notif_scores(p_actif interval) returns table(
  fiche_path text, client_key text, client_nom text, score numeric, derniere timestamptz, visites int, offre boolean, detail text)
language sql security definer set search_path = public stable as $$
  with v as (
    select fiche_path, lower(btrim(client_nom)) k, max(client_nom) nom,
           count(*) filter (where evenement = 'fiche_ouverte')::int visites,
           bool_or(evenement = 'credit_simule') sim, bool_or(evenement = 'offre_soumise') offre, max(created_at) last_v
      from public.fiche_views
     where created_at > now() - interval '120 days' and nullif(btrim(client_nom), '') is not null and lower(btrim(client_nom)) not in ('inconnu', 'anonyme')
     group by 1, 2),
  s as (select fiche_path, lower(btrim(client_nom)) k, sum(duree_sec) / 60.0 minutes, max(started_at) last_t from public.fiche_sessions where started_at > now() - interval '120 days' group by 1, 2),
  q as (select fiche_path, lower(btrim(client_nom)) k, count(*) n, max(created_at) last_t from public.fiche_questions where created_at > now() - interval '120 days' group by 1, 2),
  d as (select fiche_path, lower(btrim(client_nom)) k, count(*) n, max(created_at) last_t from public.fiche_demandes_documents where created_at > now() - interval '120 days' group by 1, 2),
  r as (select fiche_path, lower(btrim(client_nom)) k, count(*) n, max(created_at) last_t from public.fiche_retours where created_at > now() - interval '120 days' group by 1, 2),
  g as (
    select v.fiche_path, v.k, v.nom, v.visites, v.offre, v.sim, coalesce(s.minutes, 0) minutes, coalesce(q.n, 0) qn, coalesce(d.n, 0) dn, coalesce(r.n, 0) rn,
           greatest(v.last_v, s.last_t, q.last_t, d.last_t, r.last_t) derniere
      from v left join s using (fiche_path, k) left join q using (fiche_path, k) left join d using (fiche_path, k) left join r using (fiche_path, k))
  select g.fiche_path, g.k, g.nom,
         (least(g.visites, 4) * 2 + least(g.minutes, 15) / 1.5 + case when g.sim then 3 else 0 end + case when g.dn > 0 then 4 else 0 end
          + case when g.qn > 0 then 2 else 0 end + case when g.offre then 6 else 0 end + case when g.rn > 0 then 3 else 0 end)::numeric,
         g.derniere, g.visites, g.offre,
         concat_ws(', ', case when g.offre then 'a transmis une offre' end,
                         case when g.visites > 1 then 'est revenu ' || g.visites || ' fois sur la fiche' end,
                         case when g.minutes >= 1 then round(g.minutes)::int || ' min de lecture' end,
                         case when g.sim then 'a simulé son financement' end,
                         case when g.dn > 0 then 'a demandé des documents' end,
                         case when g.qn > 0 then 'a posé des questions à l’assistant' end,
                         case when g.rn > 0 then 'a donné son retour de visite' end)
    from g where g.derniere > now() - p_actif $$;

-- ───── Alertes instantanées (remplace la version du lot 6) ─────
drop function if exists public.notif_alertes_dues();
create or replace function public.notif_alertes_dues() returns table(
  agent_user_id uuid, agent_email text, agent_prenom text, cle text, type text, client_nom text, bien text, at timestamptz, detail text)
language sql security definer set search_path = public stable as $$
  with ev as (
    select v.fiche_path, nullif(btrim(v.client_nom), '') as client, v.created_at as at, 'offre'::text as type, 1 as prio, 'v:' || v.id::text as cle, null::text as detail
      from public.fiche_views v where v.created_at > now() - interval '30 minutes' and v.evenement = 'offre_soumise'
    union all
    select sc.fiche_path, sc.client_nom, sc.derniere, 'tres_chaud', 2, 'chaud:' || sc.client_key || ':' || sc.fiche_path, sc.detail
      from public.notif_scores('30 minutes') sc where sc.score >= 14 and not sc.offre
    union all
    select d.fiche_path, nullif(btrim(d.client_nom), ''), d.created_at, 'documents', 3, 'doc:' || d.id::text, null
      from public.fiche_demandes_documents d where d.created_at > now() - interval '30 minutes'
    union all
    select r.fiche_path, nullif(btrim(r.client_nom), ''), r.created_at, 'retour_visite', 4, 'ret:' || r.id::text, null
      from public.fiche_retours r where r.created_at > now() - interval '30 minutes'
  ),
  cand as (
    select distinct on (af.agent_user_id, ev.cle) af.agent_user_id, ap.email, ap.prenom, ev.cle, ev.type, ev.prio, ev.client, af.label, ev.at, ev.detail
      from ev
      join public.agent_fiches af on ev.fiche_path in ('/fiches/' || af.filename, '/fiches/' || case when af.filename ~ '-FINAL\.html$' then regexp_replace(af.filename, '-FINAL\.html$', '-EN-FINAL.html') else regexp_replace(af.filename, '\.html$', '-EN.html') end)
      join public.agent_notif_prefs p on p.user_id = af.agent_user_id and p.alertes_actives
      join public.agent_profiles ap on ap.user_id = af.agent_user_id
     where ap.email is not null
       and not exists (select 1 from public.notif_alertes_envoyees e where e.agent_user_id = af.agent_user_id and e.cle = ev.cle)
     order by af.agent_user_id, ev.cle, ev.at),
  z as (select c.*, row_number() over (partition by c.agent_user_id, (c.type = 'offre') order by c.prio, c.at, c.cle) as rang from cand c)
  select z.agent_user_id, z.email, z.prenom, z.cle, z.type, z.client, z.label, z.at, z.detail
    from z
   where z.type = 'offre'
      or z.rang <= 3 - (select count(*) from public.notif_alertes_envoyees e where e.agent_user_id = z.agent_user_id and e.cle not like 'v:%' and e.sent_at > now() - interval '1 day')
   order by z.prio, z.at limit 100 $$;

-- ───── Résumé du lundi ─────
create or replace function public.notif_resume_dus() returns table(
  agent_user_id uuid, agent_email text, agent_prenom text, chauds jsonb, silences jsonb, visites int, visites_prec int, nb_fiches int)
language sql security definer set search_path = public stable as $$
  with a as (
    select p.user_id, ap.email, ap.prenom from public.agent_notif_prefs p join public.agent_profiles ap on ap.user_id = p.user_id
     where p.resume_lundi and ap.email is not null and (p.resume_last_at is null or p.resume_last_at < now() - interval '5 days')),
  fich as (
    select a.user_id, af.label, f.p as fiche_path
      from a join public.agent_fiches af on af.agent_user_id = a.user_id
      cross join lateral (values ('/fiches/' || af.filename), ('/fiches/' || case when af.filename ~ '-FINAL\.html$' then regexp_replace(af.filename, '-FINAL\.html$', '-EN-FINAL.html') else regexp_replace(af.filename, '\.html$', '-EN.html') end)) as f(p)),
  sc as (
    select fi.user_id, fi.label, s.client_nom, s.score, s.derniere
      from public.notif_scores('45 days') s join fich fi on fi.fiche_path = s.fiche_path where s.score >= 7),
  ch as (select user_id, jsonb_agg(jsonb_build_object('client', client_nom, 'bien', label, 'niveau', case when score >= 14 then 'très chaud' else 'intéressé' end) order by score desc, derniere desc) filter (where rn <= 5) j
           from (select sc.*, row_number() over (partition by user_id order by score desc, derniere desc) rn from sc where derniere > now() - interval '5 days') x group by user_id),
  si as (select user_id, jsonb_agg(jsonb_build_object('client', client_nom, 'bien', label, 'jours', floor(extract(epoch from now() - derniere) / 86400)::int) order by score desc) filter (where rn <= 5) j
           from (select sc.*, row_number() over (partition by user_id order by score desc) rn from sc where derniere <= now() - interval '5 days') x group by user_id),
  vi as (
    select fi.user_id, count(*) filter (where v.created_at > now() - interval '7 days')::int cur, count(*) filter (where v.created_at <= now() - interval '7 days')::int prec, count(distinct fi.label)::int nb
      from fich fi join public.fiche_views v on v.fiche_path = fi.fiche_path and v.evenement = 'fiche_ouverte' and v.created_at > now() - interval '14 days' group by fi.user_id)
  select a.user_id, a.email, a.prenom, coalesce(ch.j, '[]'::jsonb), coalesce(si.j, '[]'::jsonb), coalesce(vi.cur, 0), coalesce(vi.prec, 0), coalesce(vi.nb, 0)
    from a left join ch on ch.user_id = a.user_id left join si on si.user_id = a.user_id left join vi on vi.user_id = a.user_id
   where coalesce(jsonb_array_length(ch.j), 0) + coalesce(jsonb_array_length(si.j), 0) + coalesce(vi.cur, 0) > 0
   limit 500 $$;
create or replace function public.notif_resume_marque(p_agent uuid) returns void
language sql security definer set search_path = public as $$
  update public.agent_notif_prefs set resume_last_at = now() where user_id = p_agent $$;

revoke all on function public.notif_scores(interval), public.notif_alertes_dues(), public.notif_resume_dus(), public.notif_resume_marque(uuid) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.notif_scores(interval), public.notif_alertes_dues(), public.notif_resume_dus(), public.notif_resume_marque(uuid) to service_role;
  end if;
end $$;

-- Planification : résumé du lundi (le point vendeur reste à 6 h UTC, le résumé agent à 6 h 30 UTC).
select cron.unschedule('notif-resume-agent') where exists (select 1 from cron.job where jobname = 'notif-resume-agent');
select cron.schedule('notif-resume-agent', '30 6 * * 1', $$
  select net.http_post(url := 'https://hhqcumnatnslfjpsrmgb.supabase.co/functions/v1/notifications',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
    body := '{"mode":"resume"}'::jsonb) $$);
