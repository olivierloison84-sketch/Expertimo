-- Documents demandés par les acquéreurs (lot 3) — À EXÉCUTER après validation, dans le SQL Editor Supabase.
-- Sans danger : nouvelle table + nouvelle fonction, rien d'existant modifié. Même modèle de sécurité que fiche_questions :
-- les visiteurs (anon) n'ont AUCUN accès direct à la table ; la fonction n'accepte que des fiches publiées par un agent
-- (agent_id lu en base), limite tailles et débit ; l'agent ne lit / supprime que les demandes de ses propres fiches.
-- Aucune donnée de contact n'est stockée ici (l'email de l'acquéreur ne part que dans le mail envoyé à l'agent).
-- Rétention : suppression automatique après 12 mois (pg_cron).

create table if not exists public.fiche_demandes_documents (
  id           uuid primary key default gen_random_uuid(),
  fiche_path   text not null check (char_length(fiche_path) <= 300),
  client_nom   text check (client_nom is null or char_length(client_nom) <= 200),
  bien_adresse text check (bien_adresse is null or char_length(bien_adresse) <= 300),
  agent_id     uuid,
  docs         text[] not null check (cardinality(docs) between 1 and 40),
  note         text check (note is null or char_length(note) <= 500),
  created_at   timestamptz not null default now()
);
create index if not exists fiche_demandes_documents_path_idx on public.fiche_demandes_documents (fiche_path, created_at desc);
alter table public.fiche_demandes_documents enable row level security;

drop policy if exists "Agent voit uniquement les demandes de ses fiches" on public.fiche_demandes_documents;
create policy "Agent voit uniquement les demandes de ses fiches"
  on public.fiche_demandes_documents for select to authenticated
  using (fiche_path = any (array(select '/fiches/' || af.filename from public.agent_fiches af where af.agent_user_id = auth.uid())));

drop policy if exists "Agent supprime uniquement les demandes de ses fiches" on public.fiche_demandes_documents;
create policy "Agent supprime uniquement les demandes de ses fiches"
  on public.fiche_demandes_documents for delete to authenticated
  using (fiche_path = any (array(select '/fiches/' || af.filename from public.agent_fiches af where af.agent_user_id = auth.uid())));

create or replace function public.fiche_demande_documents(
  p_path text, p_client text, p_adresse text, p_docs text[], p_note text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_agent uuid;
  v_docs text[];
begin
  if p_path is null or p_path not like '/fiches/%' then return; end if;
  select af.agent_user_id into v_agent from public.agent_fiches af
    where '/fiches/' || af.filename = left(p_path, 300) limit 1;
  if v_agent is null then return; end if;
  -- libellés courts, non vides, dédoublonnés, 40 max
  select coalesce(array_agg(d), '{}') into v_docs from (
    select distinct left(btrim(x), 80) as d from unnest(coalesce(p_docs[1:60], '{}')) as x
    where char_length(btrim(coalesce(x, ''))) > 0 limit 40) s;
  if cardinality(v_docs) = 0 then return; end if;
  if (select count(*) from public.fiche_demandes_documents where fiche_path = left(p_path,300) and created_at > now() - interval '1 hour') >= 30 then return; end if;
  if (select count(*) from public.fiche_demandes_documents
        where fiche_path = left(p_path,300) and client_nom is not distinct from left(p_client,200)
          and created_at > now() - interval '10 minutes') >= 5 then return; end if;
  insert into public.fiche_demandes_documents (fiche_path, client_nom, bien_adresse, agent_id, docs, note)
  values (left(p_path,300), left(p_client,200), left(p_adresse,300), v_agent, v_docs, nullif(left(btrim(coalesce(p_note,'')), 500), ''));
end $$;
revoke all on function public.fiche_demande_documents(text,text,text,text[],text) from public;
grant execute on function public.fiche_demande_documents(text,text,text,text[],text) to anon, authenticated;

-- Rétention : suppression automatique après 12 mois (à exécuter une fois ; pg_cron déjà utilisé par le projet).
create extension if not exists pg_cron with schema extensions;
select cron.unschedule('purge-fiche-demandes-documents') where exists (select 1 from cron.job where jobname = 'purge-fiche-demandes-documents');
select cron.schedule('purge-fiche-demandes-documents', '40 3 * * *', $$delete from public.fiche_demandes_documents where created_at < now() - interval '12 months'$$);
