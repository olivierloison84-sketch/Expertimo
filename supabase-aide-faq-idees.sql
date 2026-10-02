-- Aide (chatbot FAQ) + boîte à idées — à exécuter par Olivier dans Supabase > SQL Editor.
-- Crée 2 tables. Chaque agent ne peut qu'ajouter ses propres lignes (pas lire celles des autres).
create table if not exists public.aide_questions (
  id uuid primary key default gen_random_uuid(),
  agent_user_id uuid not null default auth.uid(),
  question text not null check (char_length(question) between 3 and 1000),
  created_at timestamptz not null default now()
);
create table if not exists public.agent_idees (
  id uuid primary key default gen_random_uuid(),
  agent_user_id uuid not null default auth.uid(),
  categorie text not null check (categorie in ('idee','bug','remarque')),
  message text not null check (char_length(message) between 3 and 3000),
  created_at timestamptz not null default now()
);
alter table public.aide_questions enable row level security;
alter table public.agent_idees enable row level security;
drop policy if exists aide_questions_insert on public.aide_questions;
create policy aide_questions_insert on public.aide_questions for insert to authenticated
  with check (agent_user_id = auth.uid());
drop policy if exists agent_idees_insert on public.agent_idees;
create policy agent_idees_insert on public.agent_idees for insert to authenticated
  with check (agent_user_id = auth.uid());
grant insert on public.aide_questions to authenticated;
grant insert on public.agent_idees to authenticated;
