-- Alertes « participation » — À EXÉCUTER après supabase-notifications-v2.sql (rejouable).
-- Ajoute 2 alertes instantanées, avec le même mécanisme et les mêmes réglages que les autres (Mes stats › Notifications,
-- plafond de 3 alertes par jour hors offre) :
--  • « crush »  : un acquéreur envoie son match à l'agent (événement crush_termine, bouton « Envoyer mon match à l'agent ») ;
--  • « carnet » : un acquéreur partage son carnet de visite (événement carnet_partage).
-- Un seul e-mail par acquéreur et par fiche sur 24 h pour ces deux alertes (le plus récent des deux l'emporte).
-- Aucune alerte pour les autres événements de participation, et jamais pour fiche_partagee ni ouverture_partage.
-- Ne modifie aucune table : remplace seulement la fonction notif_alertes_dues() (et ajoute un lecteur JSON tolérant).

-- Lecture tolérante des données d'un événement « nom:{...} » : JSON invalide ou trop long → objet vide (jamais d'erreur).
create or replace function public.notif_json(p text) returns jsonb
language plpgsql immutable set search_path = public as $$
declare j jsonb;
begin
  if p is null or length(p) > 4000 then return '{}'::jsonb; end if;
  j := p::jsonb;
  if jsonb_typeof(j) <> 'object' then return '{}'::jsonb; end if;
  return j;
exception when others then return '{}'::jsonb;
end $$;

drop function if exists public.notif_alertes_dues();
create or replace function public.notif_alertes_dues() returns table(
  agent_user_id uuid, agent_email text, agent_prenom text, cle text, type text, client_nom text, bien text, at timestamptz, detail text, bien_adresse text)
language sql security definer set search_path = public stable as $$
  with pv as (
    select v.id, v.fiche_path, v.bien_adresse, v.created_at, nullif(btrim(v.client_nom), '') as client,
           case when v.evenement like 'crush\_termine:%' then 'crush' else 'carnet' end as type,
           public.notif_json(substr(v.evenement, position(':' in v.evenement) + 1)) as p
      from public.fiche_views v
     where v.created_at > now() - interval '30 minutes' and (v.evenement like 'crush\_termine:{%' or v.evenement like 'carnet\_partage:{%')),
  -- Acquéreur = nom du lien personnalisé ; sans lien personnalisé, le prénom saisi dans le test (ou « anonyme »).
  pk as (
    select pv.*, 'part:' || left(pv.fiche_path, 200) || '|' || left(case when lower(coalesce(pv.client, '')) in ('', 'inconnu', 'anonyme')
             then '~' || lower(btrim(coalesce(pv.p->>'n', ''))) else lower(pv.client) end, 100) || '|' as prefixe
      from pv),
  ev as (
    select v.fiche_path, nullif(btrim(v.client_nom), '') as client, v.created_at as at, 'offre'::text as type, 1 as prio, 'v:' || v.id::text as cle, null::text as detail,
           v.bien_adresse, null::text as prefixe
      from public.fiche_views v where v.created_at > now() - interval '30 minutes' and v.evenement = 'offre_soumise'
    union all
    select sc.fiche_path, sc.client_nom, sc.derniere, 'tres_chaud', 2, 'chaud:' || sc.client_key || ':' || sc.fiche_path, sc.detail, null, null
      from public.notif_scores('30 minutes') sc where sc.score >= 14 and not sc.offre
    union all
    select d.fiche_path, nullif(btrim(d.client_nom), ''), d.created_at, 'documents', 3, 'doc:' || d.id::text, null, null, null
      from public.fiche_demandes_documents d where d.created_at > now() - interval '30 minutes'
    union all
    select r.fiche_path, nullif(btrim(r.client_nom), ''), r.created_at, 'retour_visite', 4, 'ret:' || r.id::text, null, null, null
      from public.fiche_retours r where r.created_at > now() - interval '30 minutes'
    union all
    select pk.fiche_path, pk.client, pk.created_at, pk.type, 5, pk.prefixe || pk.id::text, pk.p::text, pk.bien_adresse, pk.prefixe
      from pk
  ),
  cand as (
    select distinct on (af.agent_user_id, ev.cle) af.agent_user_id, ap.email, ap.prenom, ev.cle, ev.type, ev.prio, ev.client, af.label, ev.at, ev.detail, ev.bien_adresse, ev.prefixe
      from ev
      join public.agent_fiches af on ev.fiche_path in ('/fiches/' || af.filename, '/fiches/' || case when af.filename ~ '-FINAL\.html$' then regexp_replace(af.filename, '-FINAL\.html$', '-EN-FINAL.html') else regexp_replace(af.filename, '\.html$', '-EN.html') end)
      join public.agent_notif_prefs p on p.user_id = af.agent_user_id and p.alertes_actives
      join public.agent_profiles ap on ap.user_id = af.agent_user_id
     where ap.email is not null
       and not exists (select 1 from public.notif_alertes_envoyees e where e.agent_user_id = af.agent_user_id and e.cle = ev.cle)
       -- participation : rien si cet acquéreur a déjà valu un e-mail sur cette fiche dans les 24 dernières heures
       and (ev.prefixe is null or not exists (select 1 from public.notif_alertes_envoyees e
             where e.agent_user_id = af.agent_user_id and left(e.cle, length(ev.prefixe)) = ev.prefixe and e.sent_at > now() - interval '1 day'))
     order by af.agent_user_id, ev.cle, ev.at),
  -- participation : un seul candidat par acquéreur et par fiche (le plus récent)
  cand2 as (
    select * from cand where prefixe is null
    union all
    (select distinct on (agent_user_id, prefixe) * from cand where prefixe is not null order by agent_user_id, prefixe, at desc, cle)),
  z as (select c.*, row_number() over (partition by c.agent_user_id, (c.type = 'offre') order by c.prio, c.at, c.cle) as rang from cand2 c)
  select z.agent_user_id, z.email, z.prenom, z.cle, z.type, z.client, z.label, z.at, z.detail, z.bien_adresse
    from z
   where z.type = 'offre'
      or z.rang <= 3 - (select count(*) from public.notif_alertes_envoyees e where e.agent_user_id = z.agent_user_id and e.cle not like 'v:%' and e.sent_at > now() - interval '1 day')
   order by z.prio, z.at limit 100 $$;

revoke all on function public.notif_alertes_dues(), public.notif_json(text) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.notif_alertes_dues(), public.notif_json(text) to service_role;
  end if;
end $$;
