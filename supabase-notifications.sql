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
