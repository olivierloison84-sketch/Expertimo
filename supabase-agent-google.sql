-- Avis Google réels de l'agent (lot 1b). À exécuter APRÈS validation, dans le SQL Editor Supabase.
-- Sans danger : uniquement des colonnes ajoutées (nullable). L'app fonctionne sans (repli localStorage).
alter table public.agent_profiles
  add column if not exists google_place_id text,
  add column if not exists google_name text,
  add column if not exists google_rating numeric(2,1),
  add column if not exists google_reviews integer,
  add column if not exists google_checked_at timestamptz;
