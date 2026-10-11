-- Niveau d'intérêt : la participation de l'acheteur compte — À EXÉCUTER après supabase-notifications-v2.sql (rejouable).
-- Remplace notif_scores() et notif_resume_dus() ; ne modifie aucune table.
--
-- Même calcul que « Mes stats » dans l'app (_clStats), chaque action comptée une fois (présence) :
--   ouvertures (2 par ouverture, 4 au plus) + minutes de lecture (/1,5, 15 min au plus) + simulation 3 + documents 4 + questions 2
--   + offre 6 + retour de visite 3
--   + test « Crush ou crash ? » envoyé 3 + carnet de visite partagé 3 + points de visite choisis 2 + critère déterminant 1
--   + « Ça me parle » (mot du vendeur) 1.
-- Ne comptent JAMAIS : fiche_partagee, ouverture_partage (partage de la fiche).
-- Seuils inchangés (identiques à Mes stats) : « très chaud » score ≥ 14, « intéressé » ≥ 7, actif si dernier événement ≤ 5 jours,
-- « silence » de 6 à 45 jours.
-- Résumé du lundi : chaque acheteur est suivi de ce qu'il a fait lui-même (offre, documents, questions, retour de visite,
-- test, carnet, critère, points de visite, mot du vendeur) ; jamais les ouvertures, la durée, ni le partage de la fiche.

drop function if exists public.notif_scores(interval);
create or replace function public.notif_scores(p_actif interval) returns table(
  fiche_path text, client_key text, client_nom text, score numeric, derniere timestamptz, visites int, offre boolean, detail text, actions text)
language sql security definer set search_path = public stable as $$
  with v as (
    select fiche_path, lower(btrim(client_nom)) k, max(client_nom) nom,
           count(*) filter (where evenement = 'fiche_ouverte')::int visites,
           bool_or(evenement = 'credit_simule') sim, bool_or(evenement = 'offre_soumise') offre,
           bool_or(split_part(evenement, ':', 1) = 'crush_termine') crush,
           bool_or(split_part(evenement, ':', 1) = 'carnet_partage') carnet,
           bool_or(split_part(evenement, ':', 1) = 'visite_points') vpts,
           bool_or(split_part(evenement, ':', 1) = 'critere_choisi') crit,
           bool_or(split_part(evenement, ':', 1) = 'mot_vendeur_coeur') coeur,
           max(created_at) last_v
      from public.fiche_views
     where created_at > now() - interval '120 days' and nullif(btrim(client_nom), '') is not null and lower(btrim(client_nom)) not in ('inconnu', 'anonyme')
     group by 1, 2),
  s as (select fiche_path, lower(btrim(client_nom)) k, sum(duree_sec) / 60.0 minutes, max(started_at) last_t from public.fiche_sessions where started_at > now() - interval '120 days' group by 1, 2),
  q as (select fiche_path, lower(btrim(client_nom)) k, count(*) n, max(created_at) last_t from public.fiche_questions where created_at > now() - interval '120 days' group by 1, 2),
  d as (select fiche_path, lower(btrim(client_nom)) k, count(*) n, max(created_at) last_t from public.fiche_demandes_documents where created_at > now() - interval '120 days' group by 1, 2),
  r as (select fiche_path, lower(btrim(client_nom)) k, count(*) n, max(created_at) last_t from public.fiche_retours where created_at > now() - interval '120 days' group by 1, 2),
  g as (
    select v.fiche_path, v.k, v.nom, v.visites, v.offre, v.sim, v.crush, v.carnet, v.vpts, v.crit, v.coeur,
           coalesce(s.minutes, 0) minutes, coalesce(q.n, 0) qn, coalesce(d.n, 0) dn, coalesce(r.n, 0) rn,
           greatest(v.last_v, s.last_t, q.last_t, d.last_t, r.last_t) derniere
      from v left join s using (fiche_path, k) left join q using (fiche_path, k) left join d using (fiche_path, k) left join r using (fiche_path, k))
  select g.fiche_path, g.k, g.nom,
         (least(g.visites, 4) * 2 + least(g.minutes, 15) / 1.5 + case when g.sim then 3 else 0 end + case when g.dn > 0 then 4 else 0 end
          + case when g.qn > 0 then 2 else 0 end + case when g.offre then 6 else 0 end + case when g.rn > 0 then 3 else 0 end
          + case when g.crush then 3 else 0 end + case when g.carnet then 3 else 0 end + case when g.vpts then 2 else 0 end
          + case when g.crit then 1 else 0 end + case when g.coeur then 1 else 0 end)::numeric,
         g.derniere, g.visites, g.offre,
         -- détail de l'alerte « très chaud » (inchangé, complété par la participation)
         concat_ws(', ', case when g.offre then 'a transmis une offre' end,
                         case when g.visites > 1 then 'est revenu ' || g.visites || ' fois sur la fiche' end,
                         case when g.minutes >= 1 then round(g.minutes)::int || ' min de lecture' end,
                         case when g.sim then 'a simulé son financement' end,
                         case when g.dn > 0 then 'a demandé des documents' end,
                         case when g.qn > 0 then 'a posé des questions à l’assistant' end,
                         case when g.rn > 0 then 'a donné son retour de visite' end,
                         case when g.crush then 'a fait Crush ou crash ?' end,
                         case when g.carnet then 'a partagé son carnet' end,
                         case when g.vpts then 'a noté des points à vérifier en visite' end,
                         case when g.crit then 'a choisi son critère déterminant' end,
                         case when g.coeur then 'a aimé le mot du vendeur' end),
         -- résumé du lundi : uniquement ce que l'acheteur a fait ou dit lui-même
         concat_ws(', ', case when g.offre then 'a transmis une offre' end,
                         case when g.dn > 0 then 'a demandé des documents' end,
                         case when g.rn > 0 then 'a donné son retour de visite' end,
                         case when g.crush then 'a fait Crush ou crash ?' end,
                         case when g.carnet then 'a partagé son carnet' end,
                         case when g.vpts then 'a noté des points à vérifier en visite' end,
                         case when g.crit then 'a choisi son critère déterminant' end,
                         case when g.qn > 0 then 'a posé des questions à l’assistant' end,
                         case when g.coeur then 'a aimé le mot du vendeur' end)
    from g where g.derniere > now() - p_actif $$;

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
    select fi.user_id, fi.label, s.client_nom, s.score, s.derniere, s.actions
      from public.notif_scores('45 days') s join fich fi on fi.fiche_path = s.fiche_path where s.score >= 7),
  ch as (select user_id, jsonb_agg(jsonb_build_object('client', client_nom, 'bien', label, 'niveau', case when score >= 14 then 'très chaud' else 'intéressé' end, 'actions', nullif(actions, '')) order by score desc, derniere desc) filter (where rn <= 5) j
           from (select sc.*, row_number() over (partition by user_id order by score desc, derniere desc) rn from sc where derniere > now() - interval '5 days') x group by user_id),
  si as (select user_id, jsonb_agg(jsonb_build_object('client', client_nom, 'bien', label, 'jours', floor(extract(epoch from now() - derniere) / 86400)::int, 'actions', nullif(actions, '')) order by score desc) filter (where rn <= 5) j
           from (select sc.*, row_number() over (partition by user_id order by score desc) rn from sc where derniere <= now() - interval '5 days') x group by user_id),
  vi as (
    select fi.user_id, count(*) filter (where v.created_at > now() - interval '7 days')::int cur, count(*) filter (where v.created_at <= now() - interval '7 days')::int prec, count(distinct fi.label)::int nb
      from fich fi join public.fiche_views v on v.fiche_path = fi.fiche_path and v.evenement = 'fiche_ouverte' and v.created_at > now() - interval '14 days' group by fi.user_id)
  select a.user_id, a.email, a.prenom, coalesce(ch.j, '[]'::jsonb), coalesce(si.j, '[]'::jsonb), coalesce(vi.cur, 0), coalesce(vi.prec, 0), coalesce(vi.nb, 0)
    from a left join ch on ch.user_id = a.user_id left join si on si.user_id = a.user_id left join vi on vi.user_id = a.user_id
   where coalesce(jsonb_array_length(ch.j), 0) + coalesce(jsonb_array_length(si.j), 0) > 0
   limit 500 $$;

revoke all on function public.notif_scores(interval), public.notif_resume_dus() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.notif_scores(interval), public.notif_resume_dus() to service_role;
  end if;
end $$;
