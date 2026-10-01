-- Retour de visite en un clic (lot 5) — À EXÉCUTER après validation, dans le SQL Editor Supabase.
-- Sans danger : nouvelle table + nouvelle fonction, rien d'existant modifié. Même modèle de sécurité que fiche_questions :
-- les visiteurs (anon) n'ont AUCUN accès direct à la table ; la fonction n'accepte que des fiches publiées par un agent
-- (agent_id lu en base), uniquement des réponses d'une LISTE FERMÉE (jamais de texte libre), avec limite de débit ;
-- l'agent ne lit / supprime que les retours de ses propres fiches. Rétention : 12 mois (pg_cron).

create table if not exists public.fiche_retours (
  id           uuid primary key default gen_random_uuid(),
  fiche_path   text not null check (char_length(fiche_path) <= 300),
  client_nom   text check (client_nom is null or char_length(client_nom) <= 200),
  bien_adresse text check (bien_adresse is null or char_length(bien_adresse) <= 300),
  agent_id     uuid,
  reponses     text[] not null check (cardinality(reponses) between 1 and 4
                 and reponses <@ array['coup_coeur','prix','travaux','quartier','charges','agencement','financement','reflechir']::text[]),
  lang         text check (lang is null or lang in ('fr','en','pt','es')),
  created_at   timestamptz not null default now()
);
create index if not exists fiche_retours_path_idx on public.fiche_retours (fiche_path, created_at desc);
alter table public.fiche_retours enable row level security;

drop policy if exists "Agent voit uniquement les retours de ses fiches" on public.fiche_retours;
create policy "Agent voit uniquement les retours de ses fiches"
  on public.fiche_retours for select to authenticated
  using (fiche_path = any (array(select '/fiches/' || af.filename from public.agent_fiches af where af.agent_user_id = auth.uid())));

drop policy if exists "Agent supprime uniquement les retours de ses fiches" on public.fiche_retours;
create policy "Agent supprime uniquement les retours de ses fiches"
  on public.fiche_retours for delete to authenticated
  using (fiche_path = any (array(select '/fiches/' || af.filename from public.agent_fiches af where af.agent_user_id = auth.uid())));

create or replace function public.fiche_retour(
  p_path text, p_client text, p_adresse text, p_agent uuid, p_reponses text[], p_lang text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_agent uuid;
  v_rep text[];
begin
  if p_path is null or p_path not like '/fiches/%' then return; end if;
  select af.agent_user_id into v_agent from public.agent_fiches af
    where '/fiches/' || af.filename = left(p_path, 300) limit 1;
  if v_agent is null then return; end if;
  -- liste fermée : tout code inconnu est ignoré ; 4 réponses maximum, sans doublon
  select coalesce(array_agg(c), '{}') into v_rep from (
    select distinct x as c from unnest(coalesce(p_reponses[1:20], '{}')) as x
     where x = any (array['coup_coeur','prix','travaux','quartier','charges','agencement','financement','reflechir']) limit 4) s;
  if cardinality(v_rep) = 0 then return; end if;
  if (select count(*) from public.fiche_retours where fiche_path = left(p_path,300) and created_at > now() - interval '1 hour') >= 40 then return; end if;
  if (select count(*) from public.fiche_retours
        where fiche_path = left(p_path,300) and client_nom is not distinct from left(p_client,200)
          and created_at > now() - interval '10 minutes') >= 3 then return; end if;
  insert into public.fiche_retours (fiche_path, client_nom, bien_adresse, agent_id, reponses, lang)
  values (left(p_path,300), left(p_client,200), left(p_adresse,300), v_agent, v_rep,
          case when p_lang in ('fr','en','pt','es') then p_lang else null end);
end $$;
revoke all on function public.fiche_retour(text,text,text,uuid,text[],text) from public;
grant execute on function public.fiche_retour(text,text,text,uuid,text[],text) to anon, authenticated;

-- Rétention : suppression automatique après 12 mois (à exécuter une fois ; pg_cron déjà utilisé par le projet).
create extension if not exists pg_cron with schema extensions;
select cron.unschedule('purge-fiche-retours') where exists (select 1 from cron.job where jobname = 'purge-fiche-retours');
select cron.schedule('purge-fiche-retours', '50 3 * * *', $$delete from public.fiche_retours where created_at < now() - interval '12 months'$$);
