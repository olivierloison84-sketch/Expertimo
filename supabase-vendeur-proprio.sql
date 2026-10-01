-- Personnalisation du compte rendu et du point du lundi avec le nom du propriétaire (saisi par l'agent dans la fiche).
-- À exécuter après supabase-vendeur.sql. Rejouable. Renvoie « Prénom Nom » ou NULL ; seul le porteur d'un lien actif y accède, et uniquement à ce nom.
create or replace function public.vendeur_proprio(p_token text) returns text
language sql security definer set search_path = public stable as $$
  select nullif(btrim(concat_ws(' ',
           nullif(btrim(left(fp.data -> '_rawState' ->> 'proprio_prenom', 40)), ''),
           nullif(btrim(left(fp.data -> '_rawState' ->> 'proprio_nom', 60)), ''))), '')
    from public.vendeur_liens l
    join public.fiche_private fp on fp.agent_user_id = l.agent_user_id and fp.filename = l.filename
   where p_token ~ '^[0-9a-f]{64,96}$' and l.token = p_token and l.revoked_at is null
   limit 1 $$;
revoke all on function public.vendeur_proprio(text) from public;
grant execute on function public.vendeur_proprio(text) to anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then grant execute on function public.vendeur_proprio(text) to service_role; end if;
end $$;
