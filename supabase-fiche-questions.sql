-- Questions posées à l'assistant des fiches (lot 2) — À EXÉCUTER après validation, dans le SQL Editor Supabase.
-- Sans danger : nouvelle table + nouvelle fonction, rien d'existant modifié.
-- Les visiteurs (anon) n'ont AUCUN accès direct à la table : uniquement fiche_question(), qui n'accepte que des
-- chemins /fiches/…, limite la taille (500 car.) et le débit (20 questions / 10 min par fiche et acquéreur).
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

create policy "Agent voit uniquement les questions de ses fiches"
  on public.fiche_questions for select to authenticated
  using (fiche_path = any (array(select '/fiches/' || af.filename from public.agent_fiches af where af.agent_user_id = auth.uid())));

create policy "Agent supprime uniquement les questions de ses fiches"
  on public.fiche_questions for delete to authenticated
  using (fiche_path = any (array(select '/fiches/' || af.filename from public.agent_fiches af where af.agent_user_id = auth.uid())));

create or replace function public.fiche_question(
  p_path text, p_client text, p_adresse text, p_agent uuid, p_question text, p_lang text
) returns void
language plpgsql security definer set search_path = public as $$
declare q text := btrim(coalesce(p_question, ''));
begin
  if p_path is null or p_path not like '/fiches/%' then return; end if;
  if char_length(q) < 2 then return; end if;
  q := left(q, 500);
  if (select count(*) from public.fiche_questions
        where fiche_path = left(p_path,300) and client_nom is not distinct from left(p_client,200)
          and created_at > now() - interval '10 minutes') >= 20 then return; end if;
  insert into public.fiche_questions (fiche_path, client_nom, bien_adresse, agent_id, question, lang)
  values (left(p_path,300), left(p_client,200), left(p_adresse,300), p_agent, q, left(p_lang,5));
end $$;
revoke all on function public.fiche_question(text,text,text,uuid,text,text) from public;
grant execute on function public.fiche_question(text,text,text,uuid,text,text) to anon, authenticated;
