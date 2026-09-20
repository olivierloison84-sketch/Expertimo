-- Données PRIVÉES des fiches (vendeur, notes internes, formulaire complet de l'étape 2).
-- Jamais publiées : le HTML de la fiche n'embarque que la liste blanche PUBLIC_EMBED_KEYS (app.html).
-- Lecture / écriture réservées à l'agent propriétaire (RLS). Clé (agent, fichier) : un agent ne peut
-- pas « squatter » le nom de fichier d'un autre.
create table if not exists public.fiche_private (
  agent_user_id uuid not null references auth.users(id) on delete cascade,
  filename      text not null,
  data          jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now(),
  primary key (agent_user_id, filename)
);

alter table public.fiche_private enable row level security;

drop policy if exists fiche_private_select on public.fiche_private;
drop policy if exists fiche_private_insert on public.fiche_private;
drop policy if exists fiche_private_update on public.fiche_private;
drop policy if exists fiche_private_delete on public.fiche_private;

create policy fiche_private_select on public.fiche_private for select to authenticated using (agent_user_id = auth.uid());
create policy fiche_private_insert on public.fiche_private for insert to authenticated with check (agent_user_id = auth.uid());
create policy fiche_private_update on public.fiche_private for update to authenticated using (agent_user_id = auth.uid()) with check (agent_user_id = auth.uid());
create policy fiche_private_delete on public.fiche_private for delete to authenticated using (agent_user_id = auth.uid());

revoke all on public.fiche_private from anon;
grant select, insert, update, delete on public.fiche_private to authenticated;
