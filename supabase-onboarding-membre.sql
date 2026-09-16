-- ═══════════════════════════════════════════════════════════════════════
-- Onboarding & suivi comportemental du membre (Privency)
--
-- À exécuter manuellement dans le SQL Editor du projet Supabase
-- « Privency-saas » (https://supabase.com/dashboard), après
-- supabase-agent-profiles.sql.
--
-- Colonnes ajoutées à agent_profiles :
--   - a_vu_ecran_accueil          : écran de révélation (bienvenue) déjà vu
--   - date_derniere_connexion     : mise à jour à chaque connexion à /app.html
--   - relance_j3_envoyee          : relance "aucune fiche créée" déjà envoyée
--   - relance_j7_envoyee          : relance "profil incomplet" déjà envoyée
--   - relance_inactivite_envoyee_at : date d'envoi de la dernière relance
--                                     d'inactivité (remise à NULL à la
--                                     reconnexion pour permettre une future
--                                     relance si l'agent redevient inactif)
--   - suivi_mensuel_envoye_at     : date du dernier message de suivi mensuel
--                                     envoyé aux agents actifs
--
-- Le nombre de fiches créées n'est volontairement pas stocké ici : il se
-- déduit d'un COUNT sur agent_fiches (agent_user_id), déjà utilisé par
-- api/admin-stats.js, pour éviter un compteur dupliqué qui pourrait dériver.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.agent_profiles add column if not exists a_vu_ecran_accueil boolean not null default false;
alter table public.agent_profiles add column if not exists date_derniere_connexion timestamptz;
alter table public.agent_profiles add column if not exists relance_j3_envoyee boolean not null default false;
alter table public.agent_profiles add column if not exists relance_j7_envoyee boolean not null default false;
alter table public.agent_profiles add column if not exists relance_inactivite_envoyee_at timestamptz;
alter table public.agent_profiles add column if not exists suivi_mensuel_envoye_at timestamptz;
