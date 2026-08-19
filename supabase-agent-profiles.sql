-- ═══════════════════════════════════════════════════════════════════════
-- Table de synchronisation du profil agent (Privency)
--
-- À exécuter manuellement dans le SQL Editor du projet Supabase
-- « Privency-saas » (https://supabase.com/dashboard) AVANT que la
-- synchronisation du profil agent depuis app.html ne puisse fonctionner.
--
-- Tant que ce script n'a pas été exécuté, saveProfile()/loadProfile()
-- continuent de fonctionner normalement en mode localStorage uniquement
-- (les appels Supabase échouent proprement et sont ignorés en console).
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.agent_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  prenom text,
  nom text,
  reseau text,
  tel text,
  email text,
  secteur text,
  rdv_url text,
  photo_url text,
  color_primary text,
  color_accent text,
  siret text,
  denomination text,
  forme_juridique text,
  adresse_siege text,
  tva_intra text,
  code_naf text,
  updated_at timestamptz default now()
);

alter table public.agent_profiles enable row level security;

create policy "Agent lit son propre profil"
  on public.agent_profiles for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Agent modifie son propre profil"
  on public.agent_profiles for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Agent met à jour son propre profil"
  on public.agent_profiles for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
