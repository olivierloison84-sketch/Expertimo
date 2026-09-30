-- Espace vendeur (lot 4) — À EXÉCUTER après validation, dans le SQL Editor Supabase. Prérequis : lots 2 et 3 (tables
-- fiche_questions et fiche_demandes_documents) et fiche_sessions déjà en place.
-- Principe : l'agent crée un lien privé par bien (jeton aléatoire de 80 caractères). La page vendeur.html appelle
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

create or replace function public.vendeur_rapport(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_lien   public.vendeur_liens;
  v_path   text;
  v_label  text;
  v_agent  jsonb;
  v_first  timestamptz;
  v_vis_now int; v_vis_prev int; v_acq_now int; v_acq_prev int;
  v_tot_vis int; v_tot_min int; v_anon int; v_docs int; v_quest int; v_sim int;
  v_courbe jsonb; v_onglets jsonb; v_themes jsonb; v_docs_top jsonb; v_acq jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64,96}$' then return jsonb_build_object('ok', false); end if;
  select * into v_lien from public.vendeur_liens where token = p_token and revoked_at is null;
  if not found then return jsonb_build_object('ok', false); end if;
  select af.label into v_label from public.agent_fiches af where af.filename = v_lien.filename and af.agent_user_id = v_lien.agent_user_id limit 1;
  if not found then return jsonb_build_object('ok', false); end if;
  v_path := '/fiches/' || v_lien.filename;

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
    from public.fiche_views where fiche_path = v_path and evenement in ('fiche_ouverte', 'credit_simule');

  select coalesce(round(sum(duree_sec) / 60.0), 0)::int into v_tot_min from public.fiche_sessions where fiche_path = v_path;
  select coalesce(sum(cardinality(docs)), 0)::int into v_docs from public.fiche_demandes_documents where fiche_path = v_path;
  select count(*)::int into v_quest from public.fiche_questions where fiche_path = v_path;

  select coalesce(jsonb_agg(jsonb_build_object('semaine', to_char(w.d, 'YYYY-MM-DD'), 'visites', coalesce(x.v, 0), 'minutes', coalesce(s.m, 0)) order by w.d), '[]'::jsonb) into v_courbe
    from (select generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') as d) w
    left join (select date_trunc('week', created_at) as d, count(*)::int as v from public.fiche_views where fiche_path = v_path and evenement = 'fiche_ouverte' group by 1) x on x.d = w.d
    left join (select date_trunc('week', started_at) as d, round(sum(duree_sec) / 60.0)::int as m from public.fiche_sessions where fiche_path = v_path group by 1) s on s.d = w.d;

  select coalesce(jsonb_agg(jsonb_build_object('id', t.k, 'pct', round(100.0 * t.s / nullif(t.total, 0))::int) order by t.s desc), '[]'::jsonb) into v_onglets
    from (select k, s, sum(s) over () as total, row_number() over (order by s desc) as rn
            from (select e.key as k, sum((e.value)::text::numeric) as s
                    from public.fiche_sessions fs, jsonb_each(fs.onglets) e
                   where fs.fiche_path = v_path and jsonb_typeof(e.value) = 'number' group by e.key) z) t
   where t.rn <= 5;

  -- Sujets des questions : classés par mots-clés, jamais le texte des questions.
  select coalesce(jsonb_agg(jsonb_build_object('theme', th, 'n', n) order by n desc, th), '[]'::jsonb) into v_themes from (
    select case
      when q.question ~* '(charge|taxe|coût|cout|budget)' then 'Charges et coût du bien'
      when q.question ~* '(prix|négoci|negoci|offre|baisse)' then 'Prix et négociation'
      when q.question ~* '(travaux|toiture|rénov|renov|humid|fissure|plomberie|électri|electri|fenêtre|fenetre)' then 'Travaux et état du bien'
      when q.question ~* '(dpe|énerg|energ|chauffage|isolat)' then 'Performance énergétique'
      when q.question ~* '(quartier|école|ecole|transport|métro|metro|gare|commerce|bruit|voisin|sécur|secur|parking)' then 'Quartier et environnement'
      when q.question ~* '(copro|syndic|assemblée|assemblee|règlement|reglement)' then 'Copropriété'
      when q.question ~* '(crédit|credit|prêt|pret|financ|apport|taux|banque)' then 'Financement'
      when q.question ~* '(visite|disponib|libre|rendez|rdv|quand)' then 'Visite et disponibilité'
      else 'Autres questions' end as th, count(*)::int as n
    from public.fiche_questions q where q.fiche_path = v_path group by 1) z;

  select coalesce(jsonb_agg(jsonb_build_object('doc', d, 'n', n) order by n desc, d), '[]'::jsonb) into v_docs_top from (
    select x as d, count(*)::int as n from public.fiche_demandes_documents dd, unnest(dd.docs) x where dd.fiche_path = v_path group by x order by 2 desc, 1 limit 6) z;

  -- Acquéreurs anonymisés : lettre selon l'ordre de première venue ; le nom ne quitte jamais la base.
  with viewers as (
    select lower(btrim(client_nom)) as k, min(created_at) as first_at, max(created_at) as last_at,
           count(*) filter (where evenement = 'fiche_ouverte')::int as visites,
           count(*) filter (where evenement = 'credit_simule')::int as sims
      from public.fiche_views
     where fiche_path = v_path and lower(btrim(coalesce(client_nom,''))) not in ('', 'inconnu', 'anonyme')
     group by 1
  ), mins as (
    select lower(btrim(client_nom)) as k, round(sum(duree_sec) / 60.0)::int as minutes from public.fiche_sessions where fiche_path = v_path group by 1
  ), tabs as (
    select lower(btrim(fs.client_nom)) as k, array_agg(distinct e.key order by e.key) filter (where (e.value)::text::numeric >= 10) as ids
      from public.fiche_sessions fs, jsonb_each(fs.onglets) e where fs.fiche_path = v_path and jsonb_typeof(e.value) = 'number' group by 1
  ), qn as (
    select lower(btrim(client_nom)) as k, count(*)::int as n from public.fiche_questions where fiche_path = v_path group by 1
  ), dn as (
    select lower(btrim(client_nom)) as k, sum(cardinality(docs))::int as n from public.fiche_demandes_documents where fiche_path = v_path group by 1
  ), scored as (
    select v.*, coalesce(m.minutes, 0) as minutes, coalesce(t.ids, '{}') as ids, coalesce(q.n, 0) as questions, coalesce(d.n, 0) as docs,
           (least(v.visites, 4) * 2 + least(coalesce(m.minutes, 0), 15) / 1.5 + (case when v.sims > 0 then 3 else 0 end)
            + (case when coalesce(d.n, 0) > 0 then 4 else 0 end) + (case when coalesce(q.n, 0) > 0 then 2 else 0 end)) as score,
           row_number() over (order by v.first_at) as rn
      from viewers v left join mins m using (k) left join tabs t using (k) left join qn q using (k) left join dn d using (k)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'lettre', chr(65 + ((rn - 1) % 26)::int) || (case when rn > 26 then ((rn - 1) / 26 + 1)::text else '' end),
           'niveau', case when score >= 14 then 'tres' when score >= 7 then 'interesse' else 'ecoute' end,
           'visites', visites, 'minutes', minutes, 'derniere', to_char(last_at, 'YYYY-MM-DD'), 'onglets', to_jsonb(ids),
           'docs', docs, 'questions', questions, 'simulation', sims > 0
         ) order by score desc, first_at), '[]'::jsonb)
    into v_acq from scored;

  return jsonb_build_object('ok', true, 'bien', v_label, 'agent', coalesce(v_agent, '{}'::jsonb),
    'note', v_lien.note, 'note_at', v_lien.note_at, 'depuis', to_char(v_first, 'YYYY-MM-DD'), 'genere_le', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'totaux', jsonb_build_object('acquereurs', jsonb_array_length(v_acq), 'anonymes', v_anon, 'visites', v_tot_vis, 'minutes', v_tot_min, 'docs', v_docs, 'questions', v_quest, 'simulations', v_sim),
    'semaine', jsonb_build_object('visites', v_vis_now, 'visites_prec', v_vis_prev, 'acquereurs', v_acq_now, 'acquereurs_prec', v_acq_prev),
    'courbe', v_courbe, 'onglets', v_onglets, 'themes', v_themes, 'docs_top', v_docs_top, 'acquereurs', v_acq);
end $$;
revoke all on function public.vendeur_rapport(text) from public;
grant execute on function public.vendeur_rapport(text) to anon, authenticated;
