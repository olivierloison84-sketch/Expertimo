-- Questions posées à l'assistant des fiches (lot 2) — À EXÉCUTER après validation, dans le SQL Editor Supabase.
-- Sans danger : nouvelle table + nouvelle fonction, rien d'existant modifié.
-- Les visiteurs (anon) n'ont AUCUN accès direct à la table : uniquement fiche_question(), qui n'accepte que des
-- fiches publiées par un agent (agent_id lu en base, jamais fourni par le visiteur), limite la taille (500 car.) et le débit
-- (20 / 10 min par acquéreur, 100 / heure et 500 / jour par fiche, quel que soit le nom d'acquéreur envoyé).
-- Rétention : suppression automatique après 12 mois (pg_cron, voir bas de fichier).
-- L'agent ne lit / supprime que les questions de ses propres fiches.

create table if not exists public.fiche_questions (
  id           uuid primary key default gen_random_uuid(),
  fiche_path   text not null check (char_length(fiche_path) <= 300),
  client_nom   text check (client_nom is null or char_length(client_nom) <= 200),
  bien_adresse text check (bien_adresse is null or char_length(bien_adresse) <= 300),
  agent_id     uuid,
  question     text not null check (char_length(question) between 2 and 500),
  lang         text check (lang is null or char_length(lang) <= 5),
  created_at   timestamptz not null default now()
);
create index if not exists fiche_questions_path_idx on public.fiche_questions (fiche_path, created_at desc);
alter table public.fiche_questions enable row level security;

drop policy if exists "Agent voit uniquement les questions de ses fiches" on public.fiche_questions;
create policy "Agent voit uniquement les questions de ses fiches"
  on public.fiche_questions for select to authenticated
  using (fiche_path = any (array(select '/fiches/' || af.filename from public.agent_fiches af where af.agent_user_id = auth.uid())));

drop policy if exists "Agent supprime uniquement les questions de ses fiches" on public.fiche_questions;
create policy "Agent supprime uniquement les questions de ses fiches"
  on public.fiche_questions for delete to authenticated
  using (fiche_path = any (array(select '/fiches/' || af.filename from public.agent_fiches af where af.agent_user_id = auth.uid())));

create or replace function public.fiche_question(
  p_path text, p_client text, p_adresse text, p_agent uuid, p_question text, p_lang text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  q text := btrim(coalesce(p_question, ''));
  v_agent uuid;
begin
  if p_path is null or p_path not like '/fiches/%' then return; end if;
  if char_length(q) < 2 then return; end if;
  q := left(q, 500);
  -- la fiche doit exister ; l'agent est celui qui l'a publiée (le paramètre p_agent du visiteur est ignoré)
  select af.agent_user_id into v_agent from public.agent_fiches af
    where '/fiches/' || af.filename = left(p_path, 300) limit 1;
  if v_agent is null then return; end if;
  -- plafonds par fiche, indépendants du nom d'acquéreur fourni par le visiteur
  if (select count(*) from public.fiche_questions where fiche_path = left(p_path,300) and created_at > now() - interval '1 hour') >= 100 then return; end if;
  if (select count(*) from public.fiche_questions where fiche_path = left(p_path,300) and created_at > now() - interval '1 day') >= 500 then return; end if;
  if (select count(*) from public.fiche_questions
        where fiche_path = left(p_path,300) and client_nom is not distinct from left(p_client,200)
          and created_at > now() - interval '10 minutes') >= 20 then return; end if;
  insert into public.fiche_questions (fiche_path, client_nom, bien_adresse, agent_id, question, lang)
  values (left(p_path,300), left(p_client,200), left(p_adresse,300), v_agent, q, left(p_lang,5));
end $$;
revoke all on function public.fiche_question(text,text,text,uuid,text,text) from public;
grant execute on function public.fiche_question(text,text,text,uuid,text,text) to anon, authenticated;

-- Rétention : suppression automatique après 12 mois (à exécuter une fois ; pg_cron déjà utilisé par le projet).
create extension if not exists pg_cron with schema extensions;
select cron.unschedule('purge-fiche-questions') where exists (select 1 from cron.job where jobname = 'purge-fiche-questions');
select cron.schedule('purge-fiche-questions', '30 3 * * *', $$delete from public.fiche_questions where created_at < now() - interval '12 months'$$);
