-- Durée de visite des fiches (heartbeat) — DÉJÀ APPLIQUÉ sur le projet Privency-saas le 2026-09-30
-- (migrations "fiche_sessions_duree" puis "fiche_heartbeat_durcissement"). Conservé pour reconstruction.
-- Les visiteurs (anon) n'ont AUCUN accès direct à la table : uniquement la fonction fiche_heartbeat(),
-- qui n'accepte que des chemins /fiches/…, ne fait qu'augmenter la durée d'une session et ne modifie
-- jamais une session d'une autre fiche. L'agent ne lit / supprime que les sessions de ses fiches.

create table if not exists public.fiche_sessions (
  session_id   text primary key check (char_length(session_id) between 8 and 64),
  fiche_path   text not null check (char_length(fiche_path) <= 300),
  client_nom   text check (client_nom is null or char_length(client_nom) <= 200),
  bien_adresse text check (bien_adresse is null or char_length(bien_adresse) <= 300),
  agent_id     uuid,
  started_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  duree_sec    integer not null default 0 check (duree_sec >= 0),
  onglets      jsonb not null default '{}'::jsonb check (pg_column_size(onglets) < 4000)
);
create index if not exists fiche_sessions_path_idx on public.fiche_sessions (fiche_path, started_at desc);
alter table public.fiche_sessions enable row level security;

create policy "Agent voit uniquement ses propres sessions"
  on public.fiche_sessions for select to authenticated
  using (fiche_path = any (array(select '/fiches/' || af.filename from public.agent_fiches af where af.agent_user_id = auth.uid())));

create policy "Agent supprime uniquement ses propres sessions"
  on public.fiche_sessions for delete to authenticated
  using (fiche_path = any (array(select '/fiches/' || af.filename from public.agent_fiches af where af.agent_user_id = auth.uid())));

create or replace function public.fiche_heartbeat(
  p_session text, p_path text, p_client text, p_adresse text, p_agent uuid, p_duree integer, p_onglets jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare
  d integer := greatest(0, least(coalesce(p_duree,0), 14400));
  o jsonb := '{}'::jsonb;
  k text; v jsonb;
begin
  if p_session is null or char_length(p_session) not between 8 and 64 then return; end if;
  if p_path is null or p_path not like '/fiches/%' then return; end if;
  -- onglets : on ne garde que des durées numériques, nom court, 30 onglets max
  if p_onglets is not null and jsonb_typeof(p_onglets) = 'object' then
    for k, v in select * from jsonb_each(p_onglets) limit 30 loop
      if jsonb_typeof(v) = 'number' and char_length(k) <= 30 then
        o := o || jsonb_build_object(k, greatest(0, least((v)::text::numeric, 14400))::integer);
      end if;
    end loop;
  end if;
  insert into public.fiche_sessions (session_id, fiche_path, client_nom, bien_adresse, agent_id, duree_sec, onglets)
  values (p_session, left(p_path,300), left(p_client,200), left(p_adresse,300), p_agent, d, o)
  on conflict (session_id) do update
    set last_seen_at = now(),
        duree_sec = greatest(public.fiche_sessions.duree_sec, excluded.duree_sec),
        onglets = case when excluded.duree_sec >= public.fiche_sessions.duree_sec then excluded.onglets else public.fiche_sessions.onglets end
    where public.fiche_sessions.fiche_path = excluded.fiche_path;
end $$;
revoke all on function public.fiche_heartbeat(text,text,text,text,uuid,integer,jsonb) from public;
grant execute on function public.fiche_heartbeat(text,text,text,text,uuid,integer,jsonb) to anon, authenticated;
