-- ═══════════════════════════════════════════════════════════════════════════════════════
-- PRIVENCY — lots 1 à 6 en UNE seule exécution (Supabase → SQL Editor → coller → Run).
-- Ordre : notes Google · questions assistant · documents · retours de visite · espace vendeur · notifications.
-- Sans danger : uniquement de nouvelles colonnes / tables / fonctions, rien d'existant supprimé ;
-- tout est rejouable. Prérequis déjà en place : agent_profiles, agent_fiches, fiche_views, fiche_sessions.
-- PARTIE 2 (à la fin) : purges à 12 mois et envois planifiés via pg_cron / pg_net. Si pg_cron n'est pas activé, exécutez
-- d'abord la partie 1 seule, puis activez pg_cron (Database → Extensions) et exécutez la partie 2.
-- Les notifications exigent en plus : l'Edge Function « notifications » déployée et le secret Vault « service_role_key ».
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- PARTIE 1 — tables, droits, fonctions


-- ───────────── supabase-agent-google.sql ─────────────
-- Avis Google réels de l'agent (lot 1b). À exécuter APRÈS validation, dans le SQL Editor Supabase.
-- Sans danger : uniquement des colonnes ajoutées (nullable). L'app fonctionne sans (repli localStorage).
alter table public.agent_profiles
  add column if not exists google_place_id text,
  add column if not exists google_name text,
  add column if not exists google_rating numeric(2,1),
  add column if not exists google_reviews integer,
  add column if not exists google_checked_at timestamptz;


-- ───────────── supabase-fiche-questions.sql ─────────────
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



-- ───────────── supabase-fiche-documents.sql ─────────────
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



-- ───────────── supabase-fiche-retours.sql ─────────────
-- Retour de visite en un clic (lot 5) — À EXÉCUTER après validation, dans le SQL Editor Supabase.
-- Sans danger : nouvelle table + nouvelle fonction, rien d'existant modifié. Même modèle de sécurité que fiche_questions :
-- les visiteurs (anon) n'ont AUCUN accès direct à la table ; la fonction n'accepte que des fiches publiées par un agent
-- (agent_id lu en base), uniquement des réponses d'une LISTE FERMÉE (jamais de texte libre), avec limite de débit ;
-- l'agent ne lit / supprime que les retours de ses propres fiches. Rétention : 12 mois (pg_cron).

create table if not exists public.fiche_retours (
  id           uuid primary key default gen_random_uuid(),
  fiche_path   text not null check (char_length(fiche_path) <= 300),
  client_nom   text check (client_nom is null or char_length(client_nom) <= 200),
  bien_adresse text check (bien_adresse is null or char_length(bien_adresse) <= 300),
  agent_id     uuid,
  reponses     text[] not null check (cardinality(reponses) between 1 and 4
                 and reponses <@ array['coup_coeur','prix','travaux','quartier','charges','agencement','financement','reflechir']::text[]),
  lang         text check (lang is null or lang in ('fr','en','pt','es')),
  created_at   timestamptz not null default now()
);
create index if not exists fiche_retours_path_idx on public.fiche_retours (fiche_path, created_at desc);
alter table public.fiche_retours enable row level security;

drop policy if exists "Agent voit uniquement les retours de ses fiches" on public.fiche_retours;
create policy "Agent voit uniquement les retours de ses fiches"
  on public.fiche_retours for select to authenticated
  using (fiche_path = any (array(select '/fiches/' || af.filename from public.agent_fiches af where af.agent_user_id = auth.uid())));

drop policy if exists "Agent supprime uniquement les retours de ses fiches" on public.fiche_retours;
create policy "Agent supprime uniquement les retours de ses fiches"
  on public.fiche_retours for delete to authenticated
  using (fiche_path = any (array(select '/fiches/' || af.filename from public.agent_fiches af where af.agent_user_id = auth.uid())));

-- Renvoie true seulement si le retour a bien été enregistré (la fiche voit ainsi un vrai accusé de réception).
drop function if exists public.fiche_retour(text,text,text,uuid,text[],text);
create or replace function public.fiche_retour(
  p_path text, p_client text, p_adresse text, p_agent uuid, p_reponses text[], p_lang text
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_agent uuid;
  v_rep text[];
begin
  if p_path is null or p_path not like '/fiches/%' then return false; end if;
  select af.agent_user_id into v_agent from public.agent_fiches af
    where '/fiches/' || af.filename = left(p_path, 300) limit 1;
  if v_agent is null then return false; end if;
  -- liste fermée : tout code inconnu est ignoré ; 4 réponses maximum, sans doublon
  select coalesce(array_agg(c), '{}') into v_rep from (
    select distinct x as c from unnest(coalesce(p_reponses[1:20], '{}')) as x
     where x = any (array['coup_coeur','prix','travaux','quartier','charges','agencement','financement','reflechir']) limit 4) s;
  if cardinality(v_rep) = 0 then return false; end if;
  if (select count(*) from public.fiche_retours where fiche_path = left(p_path,300) and created_at > now() - interval '1 hour') >= 40 then return false; end if;
  if (select count(*) from public.fiche_retours
        where fiche_path = left(p_path,300) and client_nom is not distinct from left(p_client,200)
          and created_at > now() - interval '10 minutes') >= 3 then return false; end if;
  insert into public.fiche_retours (fiche_path, client_nom, bien_adresse, agent_id, reponses, lang)
  values (left(p_path,300), left(p_client,200), left(p_adresse,300), v_agent, v_rep,
          case when p_lang in ('fr','en','pt','es') then p_lang else null end);
  return true;
end $$;
revoke all on function public.fiche_retour(text,text,text,uuid,text[],text) from public;
grant execute on function public.fiche_retour(text,text,text,uuid,text[],text) to anon, authenticated;



-- ───────────── supabase-vendeur.sql ─────────────
-- Espace vendeur (lots 4 et 5) — À EXÉCUTER après validation, dans le SQL Editor Supabase. Prérequis : lots 2, 3 et 5 (tables
-- fiche_questions, fiche_demandes_documents et fiche_retours) et fiche_sessions déjà en place. Rejouable.
-- Principe : l'agent crée un lien privé par bien (jeton aléatoire de 96 caractères). La page vendeur.html appelle
-- vendeur_rapport(jeton), fonction SECURITY DEFINER qui ne renvoie que des CHIFFRES AGRÉGÉS et des acquéreurs
-- ANONYMISÉS (« Acquéreur A/B/C ») : jamais de nom, d'email, ni de texte de question. Les visiteurs (anon) n'ont
-- aucun accès direct aux tables. Un lien révoqué ou inconnu renvoie la même réponse (aucune information sur l'existence du jeton).

create table if not exists public.vendeur_liens (
  token         text primary key default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')) check (token ~ '^[0-9a-f]{64,96}$'),
  agent_user_id uuid not null,
  filename      text not null check (char_length(filename) <= 300),
  note          text check (note is null or char_length(note) <= 600),
  note_at       timestamptz,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz
);
create unique index if not exists vendeur_liens_actif_idx on public.vendeur_liens (filename) where revoked_at is null;
alter table public.vendeur_liens enable row level security;
-- Le rapport lit surtout par fiche : sans index, chaque ouverture balaierait toute la table.
create index if not exists fiche_views_path_created_idx on public.fiche_views (fiche_path, created_at);
create index if not exists fiche_sessions_path_started_idx on public.fiche_sessions (fiche_path, started_at);


drop policy if exists "Agent voit ses liens vendeur" on public.vendeur_liens;
create policy "Agent voit ses liens vendeur" on public.vendeur_liens for select to authenticated using (agent_user_id = auth.uid());

drop policy if exists "Agent crée un lien pour ses fiches" on public.vendeur_liens;
create policy "Agent crée un lien pour ses fiches" on public.vendeur_liens for insert to authenticated
  with check (agent_user_id = auth.uid()
    and exists (select 1 from public.agent_fiches af where af.agent_user_id = auth.uid() and af.filename = vendeur_liens.filename));

drop policy if exists "Agent modifie ses liens vendeur" on public.vendeur_liens;
create policy "Agent modifie ses liens vendeur" on public.vendeur_liens for update to authenticated
  using (agent_user_id = auth.uid()) with check (agent_user_id = auth.uid());

drop policy if exists "Agent supprime ses liens vendeur" on public.vendeur_liens;
create policy "Agent supprime ses liens vendeur" on public.vendeur_liens for delete to authenticated using (agent_user_id = auth.uid());

-- Le jeton est généré par la base : l'agent ne peut ni le choisir ni le rejouer sur la fiche d'un autre.
revoke insert, update on public.vendeur_liens from authenticated;
grant insert (agent_user_id, filename, note, note_at) on public.vendeur_liens to authenticated;
grant update (note, note_at, revoked_at) on public.vendeur_liens to authenticated;

-- Classements à libellés FIXES : le vendeur ne voit jamais un texte saisi par un visiteur.
create or replace function public.vendeur_theme(q text) returns text language sql immutable set search_path = public as $$
  select case
      when q ~* '(charge|taxe|coût|cout|budget)' then 'Charges et coût du bien'
      when q ~* '(prix|négoci|negoci|offre|baisse)' then 'Prix et négociation'
      when q ~* '(travaux|toiture|rénov|renov|humid|fissure|plomberie|électri|electri|fenêtre|fenetre)' then 'Travaux et état du bien'
      when q ~* '(dpe|énerg|energ|chauffage|isolat)' then 'Performance énergétique'
      when q ~* '(quartier|école|ecole|transport|métro|metro|gare|commerce|bruit|voisin|sécur|secur|parking)' then 'Quartier et environnement'
      when q ~* '(copro|syndic|assemblée|assemblee|règlement|reglement)' then 'Copropriété'
      when q ~* '(crédit|credit|prêt|pret|financ|apport|taux|banque)' then 'Financement'
      when q ~* '(visite|disponib|libre|rendez|rdv|quand)' then 'Visite et disponibilité'
      else 'Autres questions' end $$;

create or replace function public.vendeur_doc_cat(d text) returns text language sql immutable set search_path = public as $$
  select case
      when d ~* 'amiante' then 'Diagnostic amiante'
      when d ~* 'plomb' then 'Diagnostic plomb'
      when d ~* '(dpe|audit énerg)' then 'DPE / audit énergétique'
      when d ~* 'termite' then 'Diagnostic termites'
      when d ~* 'installation électrique' then 'Diagnostic électricité'
      when d ~* 'installation de gaz' then 'Diagnostic gaz'
      when d ~* 'assainissement' then 'Assainissement'
      when d ~* '(risques|pollution)' then 'État des risques et pollutions'
      when d ~* 'carrez' then 'Mesurage loi Carrez'
      when d ~* 'règlement de copropriété' then 'Règlement de copropriété'
      when d ~* 'assemblées générales' then 'Procès-verbaux d''assemblées générales'
      when d ~* '(plan pluriannuel|diagnostic technique global)' then 'Plan de travaux de la copropriété'
      when d ~* '(charges|budget prévisionnel|fonds de travaux|pré-état|copropriété|immeuble)' then 'Charges et vie de la copropriété'
      when d ~* 'taxe foncière' then 'Taxe foncière'
      when d ~* '(plan)' then 'Plans'
      when d ~* '(factures|garanties|entretien)' then 'Factures et travaux'
      when d ~* '(permis|urbanisme|lotissement|bornage|sol|viabilisation)' then 'Urbanisme et terrain'
      when d ~* 'titre de propriété' then 'Titre de propriété'
      else 'Autres documents' end $$;
revoke all on function public.vendeur_theme(text), public.vendeur_doc_cat(text) from public;

create or replace function public.vendeur_retour_label(c text) returns text language sql immutable set search_path = public as $$
  select case c when 'coup_coeur' then 'un coup de cœur' when 'prix' then 'le prix' when 'travaux' then 'les travaux à prévoir'
    when 'quartier' then 'le quartier' when 'charges' then 'les charges' when 'agencement' then 'l''agencement'
    when 'financement' then 'son financement' when 'reflechir' then 'un temps de réflexion' else null end $$;
revoke all on function public.vendeur_retour_label(text) from public;

create or replace function public.vendeur_rapport(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_lien   public.vendeur_liens;
  v_path   text;
  v_paths  text[];
  v_label  text;
  v_agent  jsonb;
  v_first  timestamptz;
  v_vis_now int; v_vis_prev int; v_acq_now int; v_acq_prev int;
  v_tot_vis int; v_tot_min int; v_anon int; v_docs int; v_quest int; v_sim int;
  v_courbe jsonb; v_onglets jsonb; v_themes jsonb; v_docs_top jsonb; v_acq jsonb; v_activite jsonb; v_retours jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64,96}$' then return jsonb_build_object('ok', false); end if;
  select * into v_lien from public.vendeur_liens where token = p_token and revoked_at is null;
  if not found then return jsonb_build_object('ok', false); end if;
  select af.label into v_label from public.agent_fiches af where af.filename = v_lien.filename and af.agent_user_id = v_lien.agent_user_id limit 1;
  if not found then return jsonb_build_object('ok', false); end if;
  v_path := '/fiches/' || v_lien.filename;
  -- La version anglaise est publiée sous un autre nom : ses visites comptent aussi.
  v_paths := array[v_path, '/fiches/' || case when v_lien.filename ~ '-FINAL\.html$' then regexp_replace(v_lien.filename, '-FINAL\.html$', '-EN-FINAL.html') else regexp_replace(v_lien.filename, '\.html$', '-EN.html') end];

  select jsonb_build_object('nom', btrim(coalesce(ap.prenom,'') || ' ' || coalesce(ap.nom,'')), 'tel', ap.tel, 'email', ap.email,
           'photo', ap.photo_url, 'reseau', ap.reseau, 'rdv', ap.rdv_url, 'couleur', ap.color_primary, 'accent', ap.color_accent)
    into v_agent from public.agent_profiles ap where ap.user_id = v_lien.agent_user_id;

  -- Visites = ouvertures de la fiche ; « acquéreur identifié » = nom présent dans le lien (?client=…)
  select min(created_at),
         count(*) filter (where evenement = 'fiche_ouverte' and created_at >= now() - interval '7 days'),
         count(*) filter (where evenement = 'fiche_ouverte' and created_at >= now() - interval '14 days' and created_at < now() - interval '7 days'),
         count(*) filter (where evenement = 'fiche_ouverte'),
         count(*) filter (where evenement = 'fiche_ouverte' and lower(btrim(coalesce(client_nom,''))) in ('', 'inconnu', 'anonyme')),
         count(*) filter (where evenement = 'credit_simule'),
         count(distinct lower(btrim(client_nom))) filter (where evenement = 'fiche_ouverte' and created_at >= now() - interval '7 days' and lower(btrim(coalesce(client_nom,''))) not in ('', 'inconnu', 'anonyme')),
         count(distinct lower(btrim(client_nom))) filter (where evenement = 'fiche_ouverte' and created_at >= now() - interval '14 days' and created_at < now() - interval '7 days' and lower(btrim(coalesce(client_nom,''))) not in ('', 'inconnu', 'anonyme'))
    into v_first, v_vis_now, v_vis_prev, v_tot_vis, v_anon, v_sim, v_acq_now, v_acq_prev
    from public.fiche_views where fiche_path = any(v_paths) and evenement in ('fiche_ouverte', 'credit_simule');

  select coalesce(round(sum(duree_sec) / 60.0), 0)::int into v_tot_min from public.fiche_sessions where fiche_path = any(v_paths);
  select coalesce(sum(cardinality(docs)), 0)::int into v_docs from public.fiche_demandes_documents where fiche_path = any(v_paths);
  select count(*)::int into v_quest from public.fiche_questions where fiche_path = any(v_paths);

  select coalesce(jsonb_agg(jsonb_build_object('semaine', to_char(w.d, 'YYYY-MM-DD'), 'visites', coalesce(x.v, 0), 'minutes', coalesce(s.m, 0)) order by w.d), '[]'::jsonb) into v_courbe
    from (select generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') as d) w
    left join (select date_trunc('week', created_at) as d, count(*)::int as v from public.fiche_views where fiche_path = any(v_paths) and evenement = 'fiche_ouverte' group by 1) x on x.d = w.d
    left join (select date_trunc('week', started_at) as d, round(sum(duree_sec) / 60.0)::int as m from public.fiche_sessions where fiche_path = any(v_paths) group by 1) s on s.d = w.d;

  select coalesce(jsonb_agg(jsonb_build_object('id', t.k, 'pct', round(100.0 * t.s / nullif(t.total, 0))::int) order by t.s desc), '[]'::jsonb) into v_onglets
    from (select k, s, sum(s) over () as total, row_number() over (order by s desc) as rn
            from (select e.key as k, sum((e.value)::text::numeric) as s
                    from public.fiche_sessions fs, jsonb_each(fs.onglets) e
                   where fs.fiche_path = any(v_paths) and jsonb_typeof(e.value) = 'number' group by e.key) z) t
   where t.rn <= 5;

  -- Sujets des questions : classés par mots-clés, jamais le texte des questions.
  select coalesce(jsonb_agg(jsonb_build_object('theme', th, 'n', n) order by n desc, th), '[]'::jsonb) into v_themes from (
    select public.vendeur_theme(q.question) as th, count(*)::int as n
    from public.fiche_questions q where q.fiche_path = any(v_paths) group by 1) z;

  select coalesce(jsonb_agg(jsonb_build_object('doc', d, 'n', n) order by n desc, d), '[]'::jsonb) into v_docs_top from (
    select public.vendeur_doc_cat(x) as d, count(*)::int as n from public.fiche_demandes_documents dd, unnest(dd.docs) x
     where dd.fiche_path = any(v_paths) group by 1 order by 2 desc, 1 limit 6) z;

  -- Acquéreurs anonymisés : lettre selon l'ordre de première venue ; le nom ne quitte jamais la base.
  with viewers as (
    select lower(btrim(client_nom)) as k, min(created_at) as first_at, max(created_at) as last_at,
           count(*) filter (where evenement = 'fiche_ouverte')::int as visites,
           count(*) filter (where evenement = 'credit_simule')::int as sims
      from public.fiche_views
     where fiche_path = any(v_paths) and lower(btrim(coalesce(client_nom,''))) not in ('', 'inconnu', 'anonyme')
     group by 1
  ), mins as (
    select lower(btrim(client_nom)) as k, round(sum(duree_sec) / 60.0)::int as minutes from public.fiche_sessions where fiche_path = any(v_paths) group by 1
  ), tabs as (
    select lower(btrim(fs.client_nom)) as k, array_agg(distinct e.key order by e.key) filter (where (e.value)::text::numeric >= 10) as ids
      from public.fiche_sessions fs, jsonb_each(fs.onglets) e where fs.fiche_path = any(v_paths) and jsonb_typeof(e.value) = 'number' group by 1
  ), qn as (
    select lower(btrim(client_nom)) as k, count(*)::int as n from public.fiche_questions where fiche_path = any(v_paths) group by 1
  ), dn as (
    select lower(btrim(client_nom)) as k, sum(cardinality(docs))::int as n from public.fiche_demandes_documents where fiche_path = any(v_paths) group by 1
  ), scored as (
    select v.*, coalesce(m.minutes, 0) as minutes, coalesce(t.ids, '{}') as ids, coalesce(q.n, 0) as questions, coalesce(d.n, 0) as docs,
           (least(v.visites, 4) * 2 + least(coalesce(m.minutes, 0), 15) / 1.5 + (case when v.sims > 0 then 3 else 0 end)
            + (case when coalesce(d.n, 0) > 0 then 4 else 0 end) + (case when coalesce(q.n, 0) > 0 then 2 else 0 end)) as score,
           row_number() over (order by v.first_at, v.k) as rn
      from viewers v left join mins m using (k) left join tabs t using (k) left join qn q using (k) left join dn d using (k)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'lettre', chr(65 + ((rn - 1) % 26)::int) || (case when rn > 26 then ((rn - 1) / 26 + 1)::text else '' end),
           'niveau', case when score >= 14 then 'tres' when score >= 7 then 'interesse' else 'ecoute' end,
           'visites', visites, 'minutes', minutes, 'derniere', to_char(last_at, 'YYYY-MM-DD'), 'onglets', to_jsonb(ids),
           'docs', docs, 'questions', questions, 'simulation', sims > 0
         ) order by score desc, first_at), '[]'::jsonb)
    into v_acq from scored;

  -- Retours de visite : ce que disent les acquéreurs, en comptes par réponse (liste fermée), sans lien avec un nom.
  select coalesce(jsonb_agg(jsonb_build_object('code', c, 'label', public.vendeur_retour_label(c), 'n', n) order by n desc, c), '[]'::jsonb) into v_retours
    from (select x as c, count(*)::int as n from public.fiche_retours r, unnest(r.reponses) x where r.fiche_path = any(v_paths) group by x) z
   where public.vendeur_retour_label(c) is not null;

  -- Fil d'activité : événements récents, acquéreurs désignés par leur lettre, libellés fixes uniquement.
  -- Rubriques pertinentes seulement, et seulement au-delà d'une minute de lecture.
  with lettres as (
    select k, row_number() over (order by first_at, k) as rn from (
      select lower(btrim(client_nom)) as k, min(created_at) as first_at from public.fiche_views
       where fiche_path = any(v_paths) and lower(btrim(coalesce(client_nom,''))) not in ('', 'inconnu', 'anonyme') group by 1) z
  ), ev as (
    select lower(btrim(client_nom)) as k, min(created_at) as at, 'ouverture'::text as type, null::text as detail, 0 as sec
      from public.fiche_views where fiche_path = any(v_paths) and evenement = 'fiche_ouverte' and created_at >= now() - interval '30 days'
     group by lower(btrim(client_nom)), date_trunc('day', created_at)
    union all
    select lower(btrim(client_nom)), created_at, 'simulation', null, 0
      from public.fiche_views where fiche_path = any(v_paths) and evenement = 'credit_simule' and created_at >= now() - interval '30 days'
    union all
    select lower(btrim(dd.client_nom)), dd.created_at, 'documents',
           (select string_agg(c, ', ' order by c) from (select distinct public.vendeur_doc_cat(x) as c from unnest(dd.docs) x limit 3) q), 0
      from public.fiche_demandes_documents dd where dd.fiche_path = any(v_paths) and dd.created_at >= now() - interval '30 days'
    union all
    select lower(btrim(r.client_nom)), r.created_at, 'retour',
           (select string_agg(public.vendeur_retour_label(c), ', ' order by c) from unnest(r.reponses) c), 0
      from public.fiche_retours r where r.fiche_path = any(v_paths) and r.created_at >= now() - interval '30 days'
    union all
    select lower(btrim(client_nom)), created_at, 'question', public.vendeur_theme(question), 0
      from public.fiche_questions where fiche_path = any(v_paths) and created_at >= now() - interval '30 days'
    union all
    select k, at, 'rubrique', key, sec from (
      select lower(btrim(fs.client_nom)) as k, fs.started_at as at, e.key, round((e.value)::text::numeric)::int as sec,
             row_number() over (partition by fs.session_id order by (e.value)::text::numeric desc) as rn
        from public.fiche_sessions fs, jsonb_each(fs.onglets) e
       where fs.fiche_path = any(v_paths) and fs.started_at >= now() - interval '30 days' and jsonb_typeof(e.value) = 'number'
         and e.key in ('marche', 'rentabilite', 'historique', 'diagnostics', 'budget', 'quartier', 'documents') and (e.value)::text::numeric >= 60) t
     where rn <= 2
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'lettre', chr(65 + ((l.rn - 1) % 26)::int) || (case when l.rn > 26 then ((l.rn - 1) / 26 + 1)::text else '' end),
           'type', z.type,
           -- Heure volontairement arrondie à la demi-journée (heure de Paris) : le vendeur ne peut pas recouper une minute précise avec une visite.
           'jour', to_char(z.at at time zone 'Europe/Paris', 'YYYY-MM-DD'),
           'moment', case when extract(hour from z.at at time zone 'Europe/Paris') < 12 then 'matin' else 'apres-midi' end,
           'detail', z.detail, 'sec', z.sec) order by z.at desc), '[]'::jsonb)
    into v_activite
    from (select ev.* from ev join lettres l2 on l2.k = ev.k order by ev.at desc limit 15) z join lettres l on l.k = z.k;

  return jsonb_build_object('ok', true, 'bien', v_label, 'agent', coalesce(v_agent, '{}'::jsonb),
    'note', v_lien.note, 'note_at', v_lien.note_at, 'depuis', to_char(v_first, 'YYYY-MM-DD'), 'genere_le', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'totaux', jsonb_build_object('acquereurs', jsonb_array_length(v_acq), 'anonymes', v_anon, 'visites', v_tot_vis, 'minutes', v_tot_min, 'docs', v_docs, 'questions', v_quest, 'simulations', v_sim),
    'semaine', jsonb_build_object('visites', v_vis_now, 'visites_prec', v_vis_prev, 'acquereurs', v_acq_now, 'acquereurs_prec', v_acq_prev),
    'courbe', v_courbe, 'onglets', v_onglets, 'themes', v_themes, 'docs_top', v_docs_top, 'acquereurs', v_acq, 'activite', v_activite, 'retours', v_retours);
end $$;
revoke all on function public.vendeur_rapport(text) from public;
grant execute on function public.vendeur_rapport(text) to anon, authenticated;


-- ───────────── supabase-notifications.sql ─────────────
-- Notifications (lot 6) — À EXÉCUTER après validation, dans le SQL Editor Supabase (après supabase-vendeur.sql).
-- 1) Point hebdomadaire par email au VENDEUR : seulement si l'agent a saisi l'email du vendeur ET attesté son accord ;
--    le vendeur peut se désinscrire d'un clic depuis sa page (vendeur_digest_stop).
-- 2) Alertes instantanées à l'AGENT (opt-in) : offre transmise, documents demandés, simulation de financement,
--    retour de visite, 3e ouverture en 48 h. Une alerte par événement (dédoublonnage), 10 par agent et par jour.
-- Les fonctions « notif_* » ne sont exécutables que par le rôle service_role (Edge Function « notifications ») :
-- ni anon ni authenticated ne peuvent les appeler. Rejouable.

-- ───── 1. Point hebdomadaire vendeur ─────
alter table public.vendeur_liens add column if not exists digest_email text;
alter table public.vendeur_liens add column if not exists digest_consent_at timestamptz;
alter table public.vendeur_liens add column if not exists digest_last_at timestamptz;
alter table public.vendeur_liens drop constraint if exists vendeur_liens_digest_chk;
alter table public.vendeur_liens add constraint vendeur_liens_digest_chk check (
  digest_email is null
  or (char_length(digest_email) <= 254 and digest_email ~ '^[^[:space:]@<>"'',;]+@[^[:space:]@<>"'',;]+\.[^[:space:]@<>"'',;]+$' and digest_consent_at is not null));
-- l'agent renseigne l'email et son attestation ; digest_last_at n'est écrit que par le serveur
alter table public.vendeur_liens add column if not exists digest_optout_at timestamptz;
-- Un vendeur désinscrit ne peut pas être réinscrit par l'agent (digest_optout_at n'est écrit que par vendeur_digest_stop).
alter table public.vendeur_liens drop constraint if exists vendeur_liens_digest_optout_chk;
alter table public.vendeur_liens add constraint vendeur_liens_digest_optout_chk check (digest_optout_at is null or digest_email is null);
grant insert (digest_email, digest_consent_at) on public.vendeur_liens to authenticated;
grant update (digest_email, digest_consent_at) on public.vendeur_liens to authenticated;

-- Le vendeur (porteur du lien) sait s'il reçoit le point par email et peut s'en désinscrire.
create or replace function public.vendeur_digest_statut(p_token text) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.vendeur_liens where token = p_token and revoked_at is null and digest_email is not null) $$;
create or replace function public.vendeur_digest_stop(p_token text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64,96}$' then return false; end if;
  update public.vendeur_liens set digest_email = null, digest_consent_at = null, digest_optout_at = now() where token = p_token and revoked_at is null and digest_email is not null;
  return found;
end $$;
revoke all on function public.vendeur_digest_statut(text), public.vendeur_digest_stop(text) from public;
grant execute on function public.vendeur_digest_statut(text), public.vendeur_digest_stop(text) to anon, authenticated;

-- Liens dont le point est dû (au plus un par 6 jours) — service_role uniquement.
create or replace function public.notif_digests_dues() returns table(token text, email text)
language sql security definer set search_path = public stable as $$
  select l.token, l.digest_email from public.vendeur_liens l
   where l.revoked_at is null and l.digest_email is not null and l.digest_consent_at is not null
     and (l.digest_last_at is null or l.digest_last_at < now() - interval '6 days')
   order by l.digest_last_at nulls first limit 200 $$;
create or replace function public.notif_digest_marque(p_token text) returns void
language sql security definer set search_path = public as $$
  update public.vendeur_liens set digest_last_at = now() where token = p_token $$;

-- ───── 2. Alertes instantanées agent ─────
create table if not exists public.agent_notif_prefs (
  user_id         uuid primary key,
  alertes_actives boolean not null default false,
  updated_at      timestamptz not null default now()
);
alter table public.agent_notif_prefs enable row level security;
drop policy if exists "Agent lit ses préférences" on public.agent_notif_prefs;
create policy "Agent lit ses préférences" on public.agent_notif_prefs for select to authenticated using (user_id = auth.uid());
drop policy if exists "Agent crée ses préférences" on public.agent_notif_prefs;
create policy "Agent crée ses préférences" on public.agent_notif_prefs for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "Agent modifie ses préférences" on public.agent_notif_prefs;
create policy "Agent modifie ses préférences" on public.agent_notif_prefs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.agent_notif_prefs from anon;

create table if not exists public.notif_alertes_envoyees (
  agent_user_id uuid not null,
  cle           text not null,
  sent_at       timestamptz not null default now(),
  primary key (agent_user_id, cle)
);
alter table public.notif_alertes_envoyees enable row level security;   -- aucune politique : réservé au service_role
revoke all on public.notif_alertes_envoyees from anon, authenticated;

-- Événements marquants des 30 dernières minutes, pour les agents qui ont activé les alertes.
create or replace function public.notif_alertes_dues() returns table(
  agent_user_id uuid, agent_email text, agent_prenom text, cle text, type text, client_nom text, bien text, at timestamptz)
language sql security definer set search_path = public stable as $$
  with ev as (
    select v.fiche_path, nullif(btrim(v.client_nom), '') as client, v.created_at as at,
           case v.evenement when 'offre_soumise' then 'offre' when 'credit_simule' then 'simulation' when 'retour_visite' then 'retour_visite' end as type,
           case v.evenement when 'credit_simule' then 'sim:' || lower(btrim(coalesce(v.client_nom,''))) || ':' || v.fiche_path || ':' || to_char(v.created_at at time zone 'Europe/Paris', 'YYYY-MM-DD')
                            else 'v:' || v.id::text end as cle
      from public.fiche_views v
     where v.created_at > now() - interval '30 minutes' and v.evenement in ('offre_soumise', 'credit_simule')
    union all
    select d.fiche_path, nullif(btrim(d.client_nom), ''), d.created_at, 'documents', 'doc:' || d.id::text
      from public.fiche_demandes_documents d where d.created_at > now() - interval '30 minutes'
    union all
    select r.fiche_path, nullif(btrim(r.client_nom), ''), r.created_at, 'retour_visite', 'ret:' || r.id::text
      from public.fiche_retours r where r.created_at > now() - interval '30 minutes'
    union all
    -- 3e ouverture (ou plus) de la fiche par le même acquéreur nommé en 48 h : une alerte par jour et par acquéreur
    select o.fiche_path, nullif(btrim(o.client_nom), ''), max(o.created_at), 'reouverture',
           'reopen:' || lower(btrim(o.client_nom)) || ':' || o.fiche_path || ':' || to_char(now() at time zone 'Europe/Paris', 'YYYY-MM-DD')
      from public.fiche_views o
     where o.evenement = 'fiche_ouverte' and o.created_at > now() - interval '48 hours'
       and lower(btrim(coalesce(o.client_nom,''))) not in ('', 'inconnu', 'anonyme')
     group by o.fiche_path, o.client_nom
    having count(*) >= 3 and max(o.created_at) > now() - interval '30 minutes'
  )
  select z.agent_user_id, z.email, z.prenom, z.cle, z.type, z.client, z.label, z.at from (select *, row_number() over (partition by agent_user_id order by at, cle) as rang from (select distinct on (af.agent_user_id, ev.cle) af.agent_user_id, ap.email, ap.prenom, ev.cle, ev.type, ev.client, af.label, ev.at
    from ev
    join public.agent_fiches af on ev.fiche_path in ('/fiches/' || af.filename, '/fiches/' || case when af.filename ~ '-FINAL\.html$' then regexp_replace(af.filename, '-FINAL\.html$', '-EN-FINAL.html') else regexp_replace(af.filename, '\.html$', '-EN.html') end)
    join public.agent_notif_prefs p on p.user_id = af.agent_user_id and p.alertes_actives
    join public.agent_profiles ap on ap.user_id = af.agent_user_id
   where ev.type is not null and ap.email is not null
     and not exists (select 1 from public.notif_alertes_envoyees e where e.agent_user_id = af.agent_user_id and e.cle = ev.cle)
   order by af.agent_user_id, ev.cle, ev.at) y) z
  where z.rang <= 10 - (select count(*) from public.notif_alertes_envoyees e where e.agent_user_id = z.agent_user_id and e.sent_at > now() - interval '1 day')
  order by z.at limit 100 $$;
create or replace function public.notif_alerte_marque(p_agent uuid, p_cle text) returns void
language sql security definer set search_path = public as $$
  insert into public.notif_alertes_envoyees(agent_user_id, cle) values (p_agent, left(p_cle, 400)) on conflict do nothing $$;

revoke all on function public.notif_digests_dues(), public.notif_digest_marque(text), public.notif_alertes_dues(), public.notif_alerte_marque(uuid, text) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.notif_digests_dues(), public.notif_digest_marque(text), public.notif_alertes_dues(), public.notif_alerte_marque(uuid, text) to service_role;
  end if;
end $$;


-- ═══════════════ PARTIE 2 — planifications (pg_cron) ═══════════════

-- supabase-fiche-questions.sql
-- Rétention : suppression automatique après 12 mois (à exécuter une fois ; pg_cron déjà utilisé par le projet).
create extension if not exists pg_cron with schema extensions;
select cron.unschedule('purge-fiche-questions') where exists (select 1 from cron.job where jobname = 'purge-fiche-questions');
select cron.schedule('purge-fiche-questions', '30 3 * * *', $$delete from public.fiche_questions where created_at < now() - interval '12 months'$$);

-- supabase-fiche-documents.sql
-- Rétention : suppression automatique après 12 mois (à exécuter une fois ; pg_cron déjà utilisé par le projet).
create extension if not exists pg_cron with schema extensions;
select cron.unschedule('purge-fiche-demandes-documents') where exists (select 1 from cron.job where jobname = 'purge-fiche-demandes-documents');
select cron.schedule('purge-fiche-demandes-documents', '40 3 * * *', $$delete from public.fiche_demandes_documents where created_at < now() - interval '12 months'$$);

-- supabase-fiche-retours.sql
-- Rétention : suppression automatique après 12 mois (à exécuter une fois ; pg_cron déjà utilisé par le projet).
create extension if not exists pg_cron with schema extensions;
select cron.unschedule('purge-fiche-retours') where exists (select 1 from cron.job where jobname = 'purge-fiche-retours');
select cron.schedule('purge-fiche-retours', '50 3 * * *', $$delete from public.fiche_retours where created_at < now() - interval '12 months'$$);

-- supabase-notifications.sql
-- Planification (pg_cron) : à exécuter une fois. Prérequis : Edge Function « notifications » déployée, secret Vault
-- « service_role_key » déjà créé (même mécanisme que supabase-cron-relances.sql).
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
select cron.unschedule('notif-alertes') where exists (select 1 from cron.job where jobname = 'notif-alertes');
select cron.schedule('notif-alertes', '*/10 * * * *', $$
  select net.http_post(url := 'https://hhqcumnatnslfjpsrmgb.supabase.co/functions/v1/notifications',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
    body := '{"mode":"alertes"}'::jsonb) $$);
select cron.unschedule('notif-digest-vendeur') where exists (select 1 from cron.job where jobname = 'notif-digest-vendeur');
select cron.schedule('notif-digest-vendeur', '0 6 * * 1', $$
  select net.http_post(url := 'https://hhqcumnatnslfjpsrmgb.supabase.co/functions/v1/notifications',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
    body := '{"mode":"digest"}'::jsonb) $$);
