-- Réponses d'Olivier aux questions du chatbot — à exécuter dans Supabase > SQL Editor (après supabase-aide-faq-idees.sql).
-- Ajoute 2 colonnes (la réponse et sa date) et permet à chaque agent de LIRE ses propres questions (jamais celles des autres).
-- La réponse elle-même n'est écrite que par le serveur (page dashboard administrateur), jamais par l'agent.
alter table public.aide_questions add column if not exists reponse text;
alter table public.aide_questions add column if not exists repondu_at timestamptz;
drop policy if exists aide_questions_select_own on public.aide_questions;
create policy aide_questions_select_own on public.aide_questions for select to authenticated
  using (agent_user_id = auth.uid());
grant select on public.aide_questions to authenticated;
